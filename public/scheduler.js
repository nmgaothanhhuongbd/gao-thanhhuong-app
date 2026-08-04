/*
 * scheduler.js — Bộ máy xếp lịch sản xuất Nhà máy Xay xát Gạo Thạnh Hương
 * Dùng chung cho cả backend (Node.js) và Mini App (trình duyệt) qua UMD.
 *
 * Nguyên tắc:
 *  - Ca sản xuất mỗi ngày: các cửa sổ làm việc (mặc định 06:00-10:30 và 12:00-16:30),
 *    có thể bật thêm tăng ca (mặc định 16:30-17:30).
 *  - Năng suất: rateMin..rateMax tấn thành phẩm / giờ (mặc định 1.5 - 1.8).
 *  - Mỗi khi máy đổi sang LOẠI GẠO KHÁC -> cộng thời gian chuyển đổi
 *    (mặc định 30 - 45 phút) và ghi lại "delta" (chênh lệch) đó.
 *  - Hỗ trợ đơn đang sản xuất dở dang (tonsDone) và loại gạo đang trên máy
 *    (machineCurrentType).
 *  - Tất cả thời gian được xử lý theo "giờ treo tường" của nhà máy (UTC+7),
 *    lưu dạng chuỗi "YYYY-MM-DDTHH:mm".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Scheduler = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MS_PER_MIN = 60000;

  // ---- Tiện ích thời gian (xử lý theo giờ treo tường, bỏ qua timezone máy chủ) ----
  function parseWall(str) {
    // "2026-07-31T09:00" -> Date (dùng getUTC* để đọc lại đúng giờ treo tường)
    if (str instanceof Date) return new Date(str.getTime());
    if (!str) return null;
    var s = String(str).slice(0, 16);
    if (s.length === 10) s += 'T00:00';
    return new Date(s + ':00Z');
  }
  function fmtWall(date) {
    return date.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
  }
  function hmToMin(hm) {
    var p = String(hm).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function minuteOfDay(date) {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
  function startOfDay(date) {
    var d = new Date(date.getTime());
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  function addMinutes(date, mins) {
    return new Date(date.getTime() + mins * MS_PER_MIN);
  }
  function dayOfWeek(date) {
    return date.getUTCDay(); // 0=CN, 1=T2, ... 6=T7
  }

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
      // Ngày làm việc trong tuần: mặc định chạy cả 7 ngày. 0=CN..6=T7.
      workDays: s.workDays && s.workDays.length ? s.workDays : [0, 1, 2, 3, 4, 5, 6],
      deliveryBufferMin: num(s.deliveryBufferMin, 0) // đệm thêm sau khi xong hàng (phút)
    };
  }
  function num(v, d) {
    v = parseFloat(v);
    return isNaN(v) ? d : v;
  }

  // Danh sách cửa sổ làm việc trong ngày (đơn vị: phút-trong-ngày), có sắp xếp.
  function dayWindows(settings, overtimeOn) {
    var ws = settings.windows.map(function (w) {
      return { start: hmToMin(w.start), end: hmToMin(w.end) };
    });
    // overtimeOn là cờ quyết định lúc chạy (đã xét .enabled và đơn gấp ở detectOvertime).
    if (overtimeOn && settings.overtime && settings.overtime.start && settings.overtime.end) {
      ws.push({ start: hmToMin(settings.overtime.start), end: hmToMin(settings.overtime.end) });
    }
    ws.sort(function (a, b) { return a.start - b.start; });
    return ws;
  }

  function isWorkDay(settings, date) {
    return settings.workDays.indexOf(dayOfWeek(date)) !== -1;
  }

  // Đẩy con trỏ thời gian tới thời điểm làm việc gần nhất >= cursor.
  function moveToWorkTime(cursor, settings, overtimeOn) {
    var guard = 0;
    while (guard++ < 4000) {
      if (!isWorkDay(settings, cursor)) {
        cursor = startOfDay(addMinutes(cursor, 24 * 60));
        continue;
      }
      var ws = dayWindows(settings, overtimeOn);
      var mod = minuteOfDay(cursor);
      var placed = null;
      for (var i = 0; i < ws.length; i++) {
        if (mod < ws[i].start) { placed = ws[i].start; break; }
        if (mod < ws[i].end) { placed = mod; break; }
      }
      if (placed === null) {
        // đã qua cửa sổ cuối cùng trong ngày -> sang ngày kế tiếp
        cursor = startOfDay(addMinutes(cursor, 24 * 60));
        continue;
      }
      return addMinutes(startOfDay(cursor), placed);
    }
    return cursor;
  }

  // Tiêu tốn `minutesNeeded` phút LÀM VIỆC bắt đầu từ cursor, trả về Date kết thúc.
  function consumeWork(cursor, minutesNeeded, settings, overtimeOn) {
    var guard = 0;
    while (minutesNeeded > 1e-9 && guard++ < 20000) {
      cursor = moveToWorkTime(cursor, settings, overtimeOn);
      var ws = dayWindows(settings, overtimeOn);
      var mod = minuteOfDay(cursor);
      var win = null;
      for (var i = 0; i < ws.length; i++) {
        if (mod >= ws[i].start && mod < ws[i].end) { win = ws[i]; break; }
      }
      if (!win) { cursor = addMinutes(cursor, 1); continue; }
      var available = win.end - mod;
      var use = Math.min(available, minutesNeeded);
      cursor = addMinutes(cursor, use);
      minutesNeeded -= use;
    }
    return cursor;
  }

  // Xây hàng đợi các "đoạn" sản xuất theo thứ tự ưu tiên.
  function buildQueue(orders) {
    var sorted = orders.slice().sort(function (a, b) {
      return (a.priority - b.priority);
    });
    var queue = [];
    sorted.forEach(function (o) {
      (o.items || []).forEach(function (it, idx) {
        var remaining = Math.max(0, num(it.tons, 0) - num(it.tonsDone, 0));
        if (remaining > 1e-9) {
          queue.push({
            orderId: o.id,
            orderCode: o.code,
            customer: o.customer,
            itemIndex: idx,
            riceType: it.riceType,
            tons: remaining
          });
        }
      });
    });
    return queue;
  }

  // Mô phỏng 1 kịch bản (một mức năng suất & một mức chuyển đổi).
  function simulate(db, opts) {
    var settings = normalizeSettings(db.settings);
    var rate = opts.rate;                 // tấn/h
    var changeover = opts.changeover;     // phút mỗi lần đổi loại
    var overtimeOn = !!opts.overtimeOn;

    var cursor = parseWall(db.scheduleStart) || new Date(Date.now());
    var currentType = db.machineCurrentType || null;

    var queue = buildQueue(db.orders || []);
    var orderFinish = {};        // orderId -> Date kết thúc
    var orderChangeMin = {};     // orderId -> tổng phút chuyển đổi cộng vào
    var changeEvents = [];       // các lần đổi loại
    var totalChangeMin = 0;

    queue.forEach(function (seg) {
      // 1) Chuyển đổi loại gạo nếu khác loại đang trên máy
      if (currentType !== null && currentType !== seg.riceType) {
        cursor = consumeWork(cursor, changeover, settings, overtimeOn);
        orderChangeMin[seg.orderId] = (orderChangeMin[seg.orderId] || 0) + changeover;
        totalChangeMin += changeover;
        changeEvents.push({
          orderCode: seg.orderCode,
          fromType: currentType,
          toType: seg.riceType,
          minutes: changeover,
          at: fmtWall(cursor)
        });
      }
      currentType = seg.riceType;
      // 2) Sản xuất
      var prodMin = (seg.tons / rate) * 60;
      cursor = consumeWork(cursor, prodMin, settings, overtimeOn);
      orderFinish[seg.orderId] = cursor;
    });

    return {
      orderFinish: orderFinish,
      orderChangeMin: orderChangeMin,
      changeEvents: changeEvents,
      totalChangeMin: totalChangeMin,
      endType: currentType
    };
  }

  // API chính: trả về lịch cho toàn bộ đơn với khoảng thời gian (sớm nhất - muộn nhất).
  function computeSchedule(db) {
    var settings = normalizeSettings(db.settings);
    var overtimeOn = detectOvertime(db);

    // Kịch bản nhanh nhất: năng suất cao + chuyển đổi ngắn
    var fast = simulate(db, {
      rate: settings.rateMax, changeover: settings.changeoverMin, overtimeOn: overtimeOn
    });
    // Kịch bản chậm nhất: năng suất thấp + chuyển đổi dài
    var slow = simulate(db, {
      rate: settings.rateMin, changeover: settings.changeoverMax, overtimeOn: overtimeOn
    });

    var sortedOrders = (db.orders || []).slice().sort(function (a, b) {
      return a.priority - b.priority;
    });

    var buffer = settings.deliveryBufferMin || 0;

    var orders = sortedOrders.map(function (o, idx) {
      var fFast = fast.orderFinish[o.id];
      var fSlow = slow.orderFinish[o.id];
      var totalTons = (o.items || []).reduce(function (s, it) {
        return s + Math.max(0, num(it.tons, 0) - num(it.tonsDone, 0));
      }, 0);
      var fullTons = (o.items || []).reduce(function (s, it) { return s + num(it.tons, 0); }, 0);

      return {
        id: o.id,
        code: o.code,
        customer: o.customer,
        priority: idx + 1,
        urgent: !!o.urgent,
        items: o.items || [],
        note: o.note || '',
        requestedDelivery: o.requestedDelivery || null,
        remainingTons: round1(totalTons),
        totalTons: round1(fullTons),
        estStartToDone: null,
        deliveryEarly: fFast ? fmtWall(addMinutes(fFast, buffer)) : null,
        deliveryLate: fSlow ? fmtWall(addMinutes(fSlow, buffer)) : null,
        changeoverMinEarly: fast.orderChangeMin[o.id] || 0,
        changeoverMinLate: slow.orderChangeMin[o.id] || 0,
        lateVsRequested: lateFlag(o.requestedDelivery, fSlow ? addMinutes(fSlow, buffer) : null)
      };
    });

    return {
      generatedAt: fmtWall(parseWall(db.scheduleStart) || new Date()),
      overtimeOn: overtimeOn,
      settings: settings,
      orders: orders,
      changeEvents: slow.changeEvents,      // dùng kịch bản chậm để hiển thị mốc & delta
      totalChangeoverMinEarly: fast.totalChangeMin,
      totalChangeoverMinLate: slow.totalChangeMin
    };
  }

  function detectOvertime(db) {
    if (db.settings && db.settings.overtime && db.settings.overtime.enabled) return true;
    // Tự bật tăng ca nếu có đơn gấp
    return (db.orders || []).some(function (o) { return o.urgent; });
  }

  function lateFlag(requested, finishDate) {
    if (!requested || !finishDate) return false;
    var req = parseWall(requested);
    return finishDate.getTime() > req.getTime();
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  // ---- Diễn giải khoảng thời gian dạng chữ (giờ:phút) ----
  function humanDuration(mins) {
    mins = Math.round(mins);
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + 'h' + (m < 10 ? '0' + m : m);
    if (h) return h + 'h';
    return m + '’';
  }

  return {
    computeSchedule: computeSchedule,
    simulate: simulate,
    buildQueue: buildQueue,
    normalizeSettings: normalizeSettings,
    parseWall: parseWall,
    fmtWall: fmtWall,
    humanDuration: humanDuration
  };
});
