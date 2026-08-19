/*
 * scheduler.js — Bộ máy xếp lịch sản xuất Nhà máy Xay xát Gạo Thạnh Hương
 * Dùng chung cho backend (Node.js) và Mini App (trình duyệt) qua UMD.
 *
 * Nguyên tắc:
 *  - Ca sản xuất mỗi ngày: các cửa sổ làm việc (mặc định 06:00-10:30 và 12:00-16:30),
 *    có thể bật thêm tăng ca (mặc định 16:30-17:30).
 *  - Năng suất thực tế: rateMin..rateMax tấn thành phẩm / giờ (mặc định 1.5 - 1.8, CHỈNH ĐƯỢC).
 *  - Mỗi khi đổi sang LOẠI GẠO KHÁC -> cộng thời gian chuyển đổi (mặc định 30-45'),
 *    và ghi lại "delta" (chênh lệch) đó.
 *  - HÀNG TỒN KHO theo loại gạo được tự động cấn trừ vào các đơn cùng loại theo
 *    thứ tự ưu tiên -> phần đã có sẵn trong kho KHÔNG cần sản xuất, giao nhanh hơn.
 *  - Hỗ trợ đơn đang chạy dở dang (tonsDone) và loại gạo đang trên máy (machineCurrentType).
 *  - Thời gian xử lý theo "giờ treo tường" (UTC+7), lưu dạng "YYYY-MM-DDTHH:mm".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scheduler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MS_PER_MIN = 60000;

  // ---- Tiện ích thời gian ----
  function parseWall(str) {
    if (str instanceof Date) return new Date(str.getTime());
    if (!str) return null;
    var s = String(str).slice(0, 16);
    if (s.length === 10) s += 'T00:00';
    return new Date(s + ':00Z');
  }
  function fmtWall(date) { return date.toISOString().slice(0, 16); }
  function hmToMin(hm) { var p = String(hm).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function minuteOfDay(date) { return date.getUTCHours() * 60 + date.getUTCMinutes(); }
  function startOfDay(date) { var d = new Date(date.getTime()); d.setUTCHours(0, 0, 0, 0); return d; }
  function addMinutes(date, mins) { return new Date(date.getTime() + mins * MS_PER_MIN); }
  function dayOfWeek(date) { return date.getUTCDay(); }
  function num(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }
  function round1(x) { return Math.round(x * 10) / 10; }

  function normalizeSettings(s) {
    s = s || {};
    var windows = (s.windows && s.windows.length)
      ? s.windows
      : [{ start: '06:00', end: '10:30' }, { start: '12:00', end: '16:30' }];
    var overtime = s.overtime || { start: '16:30', end: '17:30', enabled: false };
    return {
      windows: windows,
      overtime: overtime,
      rateMin: num(s.rateMin, 1.5),
      rateMax: num(s.rateMax, 1.8),
      changeoverMin: num(s.changeoverMin, 30),
      changeoverMax: num(s.changeoverMax, 45),
      workDays: s.workDays && s.workDays.length ? s.workDays : [0, 1, 2, 3, 4, 5, 6],
      deliveryBufferMin: num(s.deliveryBufferMin, 0)
    };
  }

  function dayWindows(settings, overtimeOn) {
    var ws = settings.windows.map(function (w) { return { start: hmToMin(w.start), end: hmToMin(w.end) }; });
    if (overtimeOn && settings.overtime && settings.overtime.start && settings.overtime.end) {
      ws.push({ start: hmToMin(settings.overtime.start), end: hmToMin(settings.overtime.end) });
    }
    ws.sort(function (a, b) { return a.start - b.start; });
    return ws;
  }
  function isWorkDay(settings, date) { return settings.workDays.indexOf(dayOfWeek(date)) !== -1; }

  function moveToWorkTime(cursor, settings, overtimeOn) {
    var guard = 0;
    while (guard++ < 4000) {
      if (!isWorkDay(settings, cursor)) { cursor = startOfDay(addMinutes(cursor, 24 * 60)); continue; }
      var ws = dayWindows(settings, overtimeOn);
      var mod = minuteOfDay(cursor);
      var placed = null;
      for (var i = 0; i < ws.length; i++) {
        if (mod < ws[i].start) { placed = ws[i].start; break; }
        if (mod < ws[i].end) { placed = mod; break; }
      }
      if (placed === null) { cursor = startOfDay(addMinutes(cursor, 24 * 60)); continue; }
      return addMinutes(startOfDay(cursor), placed);
    }
    return cursor;
  }

  function consumeWork(cursor, minutesNeeded, settings, overtimeOn) {
    var guard = 0;
    while (minutesNeeded > 1e-9 && guard++ < 20000) {
      cursor = moveToWorkTime(cursor, settings, overtimeOn);
      var ws = dayWindows(settings, overtimeOn);
      var mod = minuteOfDay(cursor);
      var win = null;
      for (var i = 0; i < ws.length; i++) { if (mod >= ws[i].start && mod < ws[i].end) { win = ws[i]; break; } }
      if (!win) { cursor = addMinutes(cursor, 1); continue; }
      var use = Math.min(win.end - mod, minutesNeeded);
      cursor = addMinutes(cursor, use);
      minutesNeeded -= use;
    }
    return cursor;
  }

  // ---- Cấn trừ HÀNG TỒN KHO vào các đơn theo thứ tự ưu tiên ----
  // Trả về: alloc[orderId] = { fromStock, toProduce, items:[{itemIndex,riceType,need,fromStock,toProduce}] }
  //         queue = danh sách đoạn cần SẢN XUẤT (toProduce>0) theo thứ tự ưu tiên
  //         leftoverInv = tồn kho còn dư sau khi cấn trừ
  function allocate(db) {
    var inv = {};
    var srcInv = db.inventory || {};
    Object.keys(srcInv).forEach(function (k) { inv[k] = num(srcInv[k], 0); });

    var sorted = (db.orders || []).slice().sort(function (a, b) { return a.priority - b.priority; });
    var alloc = {};
    var queue = [];

    sorted.forEach(function (o) {
      var oInfo = { fromStock: 0, toProduce: 0, items: [] };
      (o.items || []).forEach(function (it, idx) {
        var need = Math.max(0, num(it.tons, 0) - num(it.tonsDone, 0));
        var avail = num(inv[it.riceType], 0);
        var fromStock = Math.min(need, avail);
        inv[it.riceType] = avail - fromStock;
        var toProduce = need - fromStock;
        oInfo.fromStock += fromStock;
        oInfo.toProduce += toProduce;
        oInfo.items.push({ itemIndex: idx, riceType: it.riceType, need: need, fromStock: fromStock, toProduce: toProduce });
        if (toProduce > 1e-9) {
          queue.push({ orderId: o.id, orderCode: o.code, customer: o.customer, riceType: it.riceType, tons: toProduce });
        }
      });
      alloc[o.id] = oInfo;
    });
    return { alloc: alloc, queue: queue, leftoverInv: inv };
  }

  // Mô phỏng 1 kịch bản trên hàng đợi đã cấn trừ tồn kho.
  function simulate(db, queue, opts) {
    var settings = normalizeSettings(db.settings);
    var rate = opts.rate, changeover = opts.changeover, overtimeOn = !!opts.overtimeOn;
    var cursor = parseWall(db.scheduleStart) || new Date(Date.now());
    var currentType = db.machineCurrentType || null;

    var orderFinish = {}, orderChangeMin = {}, changeEvents = [], totalChangeMin = 0;

    queue.forEach(function (seg) {
      if (currentType !== null && currentType !== seg.riceType) {
        cursor = consumeWork(cursor, changeover, settings, overtimeOn);
        orderChangeMin[seg.orderId] = (orderChangeMin[seg.orderId] || 0) + changeover;
        totalChangeMin += changeover;
        changeEvents.push({ orderCode: seg.orderCode, fromType: currentType, toType: seg.riceType, minutes: changeover, at: fmtWall(cursor) });
      }
      currentType = seg.riceType;
      cursor = consumeWork(cursor, (seg.tons / rate) * 60, settings, overtimeOn);
      orderFinish[seg.orderId] = cursor;
    });
    return { orderFinish: orderFinish, orderChangeMin: orderChangeMin, changeEvents: changeEvents, totalChangeMin: totalChangeMin };
  }

  function detectOvertime(db) {
    if (db.settings && db.settings.overtime && db.settings.overtime.enabled) return true;
    return (db.orders || []).some(function (o) { return o.urgent; });
  }
  function lateFlag(requested, finishDate) {
    if (!requested || !finishDate) return false;
    return finishDate.getTime() > parseWall(requested).getTime();
  }

  // ---- API chính ----
  function computeSchedule(db) {
    var settings = normalizeSettings(db.settings);
    var overtimeOn = detectOvertime(db);
    var A = allocate(db);
    var start = parseWall(db.scheduleStart) || new Date();
    var buffer = settings.deliveryBufferMin || 0;

    var fast = simulate(db, A.queue, { rate: settings.rateMax, changeover: settings.changeoverMin, overtimeOn: overtimeOn });
    var slow = simulate(db, A.queue, { rate: settings.rateMin, changeover: settings.changeoverMax, overtimeOn: overtimeOn });

    var sortedOrders = (db.orders || []).slice().sort(function (a, b) { return a.priority - b.priority; });

    var orders = sortedOrders.map(function (o, idx) {
      var info = A.alloc[o.id] || { fromStock: 0, toProduce: 0, items: [] };
      var fFast = fast.orderFinish[o.id];
      var fSlow = slow.orderFinish[o.id];
      // Nếu đơn được phủ hoàn toàn bằng tồn kho -> giao được ngay (chỉ đóng bao).
      var readyFromStock = info.toProduce <= 1e-9;
      var early = readyFromStock ? start : (fFast || null);
      var late = readyFromStock ? start : (fSlow || null);
      var fullTons = (o.items || []).reduce(function (s, it) { return s + num(it.tons, 0); }, 0);
      var doneTons = (o.items || []).reduce(function (s, it) { return s + num(it.tonsDone, 0); }, 0);

      // gộp mặt hàng & số lượng cho cột 3
      var itemsSummary = (o.items || []).map(function (it, i) {
        var ai = info.items[i] || {};
        return {
          riceType: it.riceType,
          tons: num(it.tons, 0),
          tonsDone: num(it.tonsDone, 0),
          fromStock: round1(ai.fromStock || 0),
          toProduce: round1(ai.toProduce || 0)
        };
      });

      return {
        id: o.id, code: o.code, customer: o.customer, priority: idx + 1,
        urgent: !!o.urgent, note: o.note || '', requestedDelivery: o.requestedDelivery || null,
        items: itemsSummary,
        totalTons: round1(fullTons),
        doneTons: round1(doneTons),
        remainingTons: round1(Math.max(0, fullTons - doneTons)),
        fromStockTons: round1(info.fromStock),
        toProduceTons: round1(info.toProduce),
        readyFromStock: readyFromStock,
        deliveryEarly: early ? fmtWall(addMinutes(early, buffer)) : null,
        deliveryLate: late ? fmtWall(addMinutes(late, buffer)) : null,
        changeoverMinEarly: fast.orderChangeMin[o.id] || 0,
        changeoverMinLate: slow.orderChangeMin[o.id] || 0,
        lateVsRequested: lateFlag(o.requestedDelivery, late ? addMinutes(late, buffer) : (readyFromStock ? start : null))
      };
    });

    return {
      generatedAt: fmtWall(start),
      overtimeOn: overtimeOn,
      settings: settings,
      inventoryLeft: A.leftoverInv,
      orders: orders,
      changeEvents: slow.changeEvents,
      totalChangeoverMinEarly: fast.totalChangeMin,
      totalChangeoverMinLate: slow.totalChangeMin
    };
  }

  function humanDuration(mins) {
    mins = Math.round(mins);
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + 'h' + (m < 10 ? '0' + m : m);
    if (h) return h + 'h';
    return m + '’';
  }

  return {
    computeSchedule: computeSchedule, simulate: simulate, allocate: allocate,
    normalizeSettings: normalizeSettings, parseWall: parseWall, fmtWall: fmtWall, humanDuration: humanDuration
  };
});
