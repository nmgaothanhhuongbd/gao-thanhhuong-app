/* app.js — Mini App điều phối sản xuất (giao diện bảng 4 cột, gọn) */
(function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor && tg.setHeaderColor('#1b5e20'); } catch (e) {} }
  var INIT_DATA = tg ? tg.initData : '';

  var state = null, me = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtDT(w) { if (!w) return '—'; var p = w.split('T'); if (p.length < 2) return w; var d = p[0].split('-'); return p[1] + ' ' + d[2] + '/' + d[1]; }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  function roleLabel(r) { return ({ giam_doc: 'Giám đốc', to_sx: 'Tổ sản xuất', ban_hang: 'NV bán hàng', thu_mua: 'NV thu mua' })[r] || 'Chưa đăng ký'; }

  function api(path, method, body) {
    return fetch(path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Init-Data': INIT_DATA },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('Lỗi ' + r.status)); return j; }); });
  }

  function loadState(silentToast) {
    return api('/api/state').then(function (s) {
      state = s; me = s.me || {};
      document.body.classList.toggle('readonly', !me.isAdmin);
      $('#readonlyNote').style.display = me.isAdmin ? 'none' : 'block';
      $('#whoami').innerHTML = esc((me.user && (me.user.first_name || me.user.username)) || 'Khách') + '<br>' + esc(me.role ? roleLabel(me.role) : 'Chưa đăng ký');
      render();
    }).catch(function (e) {
      $('#ordersBody').innerHTML = '<tr><td colspan="4">Không tải được dữ liệu: ' + esc(e.message) + '</td></tr>';
    });
  }

  function render() { renderTop(); renderTable(); renderAccordion(); }

  function renderTop() {
    var sch = state.schedule;
    var sel = $('#machineType'); sel.innerHTML = '<option value="">(chưa chạy)</option>';
    (state.riceTypes || []).forEach(function (t) { var o = el('option'); o.value = t; o.textContent = t; if (t === state.machineCurrentType) o.selected = true; sel.appendChild(o); });
    $('#machineTypeRO').textContent = state.machineCurrentType || '(chưa chạy)';
    $('#scheduleStart').value = (state.scheduleStart || '').slice(0, 16);
    $('#scheduleStartRO').textContent = fmtDT(state.scheduleStart);
    var b = $('#overtimeBadge'); b.textContent = sch.overtimeOn ? 'ĐANG BẬT' : 'Tắt'; b.className = 'badge' + (sch.overtimeOn ? ' on' : '');
  }

  function renderTable() {
    var body = $('#ordersBody'); body.innerHTML = '';
    var orders = state.schedule.orders;
    if (!orders.length) { body.innerHTML = '<tr><td colspan="4">Chưa có đơn hàng nào.</td></tr>'; return; }

    orders.forEach(function (o, idx) {
      // ---- Dòng chính: STT | Khách | Mặt hàng | Tiến độ ----
      var tr = el('tr', 'row-main' + (o.urgent ? ' urgent' : ''));

      var cStt = el('td', 'stt-cell');
      cStt.innerHTML = '<span class="stt-num">' + o.priority + '</span>' +
        (o.urgent ? '<div class="pill pill-urgent">GẤP</div>' : '') +
        (o.lateVsRequested ? '<div class="pill pill-late">TRỄ</div>' : '');
      tr.appendChild(cStt);

      var cCus = el('td');
      cCus.innerHTML = '<div class="cus-name">' + esc(o.customer || '(chưa có)') + '</div><div class="cus-code">' + esc(o.code) + '</div>';
      tr.appendChild(cCus);

      var cItem = el('td');
      cItem.innerHTML = o.items.map(function (it) {
        return '<div class="item-line"><span class="t">' + esc(it.riceType) + '</span> — <span class="q">' + it.tons + 't</span>' +
          (it.fromStock > 0 ? ' <span class="from-stock">(kho ' + it.fromStock + 't)</span>' : '') + '</div>';
      }).join('');
      tr.appendChild(cItem);

      var cProg = el('td');
      o.items.forEach(function (it, i) {
        var pct = it.tons > 0 ? Math.min(100, Math.round((it.tonsDone / it.tons) * 100)) : 0;
        var pi = el('div', 'prog-item' + (pct >= 100 ? ' done' : ''));
        pi.innerHTML =
          '<div class="prog-head"><input type="number" step="0.1" min="0" max="' + it.tons + '" value="' + it.tonsDone + '" ' + (me.isAdmin ? '' : 'disabled') + '>' +
          '<span class="slash">/ ' + it.tons + 't</span></div>' +
          '<div class="prog-bar"><i style="width:' + pct + '%"></i></div>';
        var input = pi.querySelector('input');
        input.addEventListener('input', function () {
          var v = Math.min(it.tons, Math.max(0, parseFloat(this.value) || 0));
          pi.querySelector('.prog-bar > i').style.width = (it.tons > 0 ? (v / it.tons) * 100 : 0) + '%';
        });
        input.addEventListener('change', function () { saveProgress(o.id, i, parseFloat(this.value) || 0); });
        cProg.appendChild(pi);
      });
      tr.appendChild(cProg);
      body.appendChild(tr);

      // ---- Dòng chi tiết: giao hàng + nút ----
      var trd = el('tr', 'row-detail');
      var td = el('td'); td.colSpan = 4;
      var deliv = o.readyFromStock
        ? '<span class="deliv ready">✅ <b>Giao ngay được từ kho</b></span>'
        : '<span class="deliv">🚚 Giao: <b>' + fmtDT(o.deliveryEarly) + '</b> → <b>' + fmtDT(o.deliveryLate) + '</b></span>';
      var meta = '<span class="detail-meta">cần SX ' + o.toProduceTons + 't' +
        (o.fromStockTons > 0 ? ' · từ kho ' + o.fromStockTons + 't' : '') +
        (o.changeoverMinLate > 0 ? ' · chuyển đổi +' + o.changeoverMinEarly + '–' + o.changeoverMinLate + '′' : '') +
        (o.requestedDelivery ? ' · hẹn KH ' + fmtDT(o.requestedDelivery) : '') + '</span>';

      var wrap = el('div', 'detail-wrap');
      wrap.innerHTML = deliv + meta;
      var act = el('div', 'row-actions admin-only');
      act.appendChild(iconBtn('▲', function () { move(idx, -1); }, idx === 0));
      act.appendChild(iconBtn('▼', function () { move(idx, 1); }, idx === orders.length - 1));
      act.appendChild(iconBtn(o.urgent ? 'Bỏ gấp' : '🔴 Gấp', function () { o.urgent ? unpromote(o.id) : promote(o.id); }));
      act.appendChild(iconBtn('✎', function () { openOrderModal(o.id); }));
      act.appendChild(iconBtn('🗑', function () { removeOrder(o.id, o.code); }));
      wrap.appendChild(act);
      td.appendChild(wrap); trd.appendChild(td); body.appendChild(trd);
    });
  }

  function iconBtn(label, fn, disabled) { var b = el('button', 'icon-btn', label); if (disabled) b.disabled = true; else b.onclick = fn; return b; }

  function renderAccordion() {
    var sch = state.schedule;
    $('#totalChange').textContent = sch.totalChangeoverMinEarly + '–' + sch.totalChangeoverMinLate + ' phút';
    var box = $('#changeEvents'); box.innerHTML = '';
    if (!sch.changeEvents.length) box.appendChild(el('div', 'event', 'Không có lần đổi loại gạo nào.'));
    else sch.changeEvents.forEach(function (e) {
      box.appendChild(el('div', 'event', '<b>' + esc(e.orderCode) + '</b>: ' + esc(e.fromType) + ' → ' + esc(e.toType) + ' <b>(+' + e.minutes + '′)</b><div class="when">≈ ' + fmtDT(e.at) + '</div>'));
    });
    var h = $('#historyList'); h.innerHTML = '';
    (state.changeHistory || []).forEach(function (e) {
      h.appendChild(el('div', 'event hist', esc(e.reason || '') + '<div class="when">' + fmtDT(e.at) + ' • ' + esc(e.actor || '') + '</div>'));
    });
  }

  // ---- Hành động ----
  function afterChange(msg, res) { if (res && res.schedule) state.schedule = res.schedule; return loadState().then(function () { if (msg) toast(msg); if (tg && tg.HapticFeedback) try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {} }); }
  function err(e) { toast('Lỗi: ' + e.message); }

  function saveProgress(orderId, itemIndex, tonsDone) {
    api('/api/progress', 'POST', { updates: [{ orderId: orderId, itemIndex: itemIndex, tonsDone: tonsDone }], silent: true })
      .then(function (res) { state.schedule = res.schedule; renderTable(); toast('Đã lưu tiến độ'); }).catch(err);
  }
  function move(idx, dir) {
    var orders = state.schedule.orders.slice(); var j = idx + dir; if (j < 0 || j >= orders.length) return;
    var t = orders[idx]; orders[idx] = orders[j]; orders[j] = t;
    api('/api/reorder', 'POST', { order: orders.map(function (o) { return o.id; }) }).then(function (r) { afterChange('Đã đổi thứ tự', r); }).catch(err);
  }
  function promote(id) { api('/api/orders/' + id + '/promote', 'POST', { urgent: true }).then(function (r) { afterChange('Đã đưa lên ưu tiên #1', r); }).catch(err); }
  function unpromote(id) { api('/api/orders/' + id + '/promote', 'POST', { urgent: false }).then(function (r) { afterChange('Đã bỏ gấp', r); }).catch(err); }
  function removeOrder(id, code) { if (!confirm('Xoá ' + code + '?')) return; api('/api/orders/' + id, 'DELETE').then(function (r) { afterChange('Đã xoá', r); }).catch(err); }

  $('#machineType').addEventListener('change', function () {
    api('/api/progress', 'POST', { machineCurrentType: this.value, reason: 'Đổi loại gạo đang chạy: ' + (this.value || '(chưa chạy)') }).then(function (r) { afterChange('Đã cập nhật loại đang chạy', r); }).catch(err);
  });
  $('#scheduleStart').addEventListener('change', function () {
    api('/api/progress', 'POST', { scheduleStart: this.value, silent: true }).then(function (r) { state.schedule = r.schedule; renderTable(); renderTop(); toast('Đã cập nhật giờ bắt đầu'); }).catch(err);
  });
  $('#btnBroadcast').addEventListener('click', function () { api('/api/broadcast', 'POST', {}).then(function (r) { toast('Đã gửi thông báo tới ' + (r.sent || 0) + ' người'); }).catch(err); });

  // ---- Modal chung ----
  var saveFn = null;
  function openModal(title, bodyEl, fn) { $('#modalTitle').textContent = title; var b = $('#modalBody'); b.innerHTML = ''; b.appendChild(bodyEl); saveFn = fn; $('#modal').style.display = 'flex'; }
  function closeModal() { $('#modal').style.display = 'none'; saveFn = null; }
  $('#modalClose').onclick = closeModal; $('#modalCancel').onclick = closeModal;
  $('#modalSave').onclick = function () { if (saveFn) saveFn(); };

  function riceOptions(sel) { return (state.riceTypes || []).map(function (t) { return '<option value="' + esc(t) + '"' + (t === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '<option value="__new">+ Loại khác…</option>'; }
  function buildItemRow(it) {
    it = it || { riceType: (state.riceTypes || [])[0] || '', tons: '', tonsDone: 0 };
    var row = el('div', 'item-row');
    row.innerHTML = '<select class="i-type">' + riceOptions(it.riceType) + '</select>' +
      '<input class="i-tons" type="number" step="0.1" placeholder="Tấn" value="' + (it.tons || '') + '">' +
      '<input class="i-done" type="number" step="0.1" placeholder="Đã xong" value="' + (it.tonsDone || 0) + '">' +
      '<button class="icon-btn i-del">✕</button>';
    row.querySelector('.i-del').onclick = function () { row.remove(); };
    row.querySelector('.i-type').onchange = function () {
      if (this.value === '__new') { var nv = prompt('Tên loại gạo mới:'); if (nv) { var op = el('option'); op.value = nv; op.textContent = nv; op.selected = true; this.insertBefore(op, this.lastChild); } else this.selectedIndex = 0; }
    };
    return row;
  }

  function openOrderModal(id) {
    var o = id ? state.orders.find(function (x) { return x.id === id; }) : null;
    var wrap = el('div');
    wrap.innerHTML =
      '<div class="row2"><div class="field"><label>Khách hàng</label><input id="f-customer" value="' + esc(o ? o.customer : '') + '" placeholder="Tên khách"></div>' +
      '<div class="field"><label>Mã đơn</label><input id="f-code" value="' + esc(o ? o.code : '') + '" placeholder="Tự đặt nếu trống"></div></div>' +
      '<label style="font-size:12px;color:#7a8794">Mặt hàng &amp; số lượng</label><div id="f-items"></div>' +
      '<button class="add-item" id="f-additem">＋ Thêm loại gạo</button>' +
      '<div class="field" style="margin-top:12px"><label>Hẹn giao khách (không bắt buộc)</label><input id="f-req" type="datetime-local" value="' + (o && o.requestedDelivery ? o.requestedDelivery.slice(0, 16) : '') + '"></div>';
    var itemsBox = wrap.querySelector('#f-items');
    ((o && o.items) || [null]).forEach(function (it) { itemsBox.appendChild(buildItemRow(it)); });
    wrap.querySelector('#f-additem').onclick = function () { itemsBox.appendChild(buildItemRow()); };
    openModal(o ? ('Sửa ' + o.code) : 'Thêm đơn hàng', wrap, function () {
      var items = $all('.item-row', itemsBox).map(function (r) {
        return { riceType: r.querySelector('.i-type').value, tons: parseFloat(r.querySelector('.i-tons').value) || 0, tonsDone: parseFloat(r.querySelector('.i-done').value) || 0 };
      }).filter(function (it) { return it.riceType && it.riceType !== '__new' && it.tons > 0; });
      if (!items.length) { toast('Cần ít nhất 1 loại gạo có số tấn > 0'); return; }
      var payload = { code: $('#f-code', wrap).value.trim(), customer: $('#f-customer', wrap).value.trim(), requestedDelivery: $('#f-req', wrap).value || null, items: items };
      var p = o ? api('/api/orders/' + o.id, 'PUT', payload) : api('/api/orders', 'POST', payload);
      p.then(function (r) { closeModal(); afterChange(o ? 'Đã lưu đơn' : 'Đã thêm đơn', r); }).catch(err);
    });
  }
  $('#btnAdd').addEventListener('click', function () { openOrderModal(null); });

  // ---- Tồn kho ----
  $('#btnInv').addEventListener('click', function () {
    var inv = state.inventory || {};
    var wrap = el('div');
    wrap.innerHTML = '<p class="hint">Nhập số tấn thành phẩm đang có trong kho. Hệ thống tự trừ vào các đơn cùng loại (theo ưu tiên) để tính lại giờ giao.</p>';
    var box = el('div'); wrap.appendChild(box);
    var refs = [];
    (state.riceTypes || []).forEach(function (t) {
      var row = el('div', 'inv-row');
      row.innerHTML = '<span class="name">' + esc(t) + '</span><input type="number" step="0.1" min="0" value="' + (inv[t] || 0) + '">';
      box.appendChild(row); refs.push({ type: t, input: row.querySelector('input') });
    });
    openModal('📦 Hàng tồn kho (tấn)', wrap, function () {
      var out = {}; refs.forEach(function (r) { var v = parseFloat(r.input.value) || 0; if (v > 0) out[r.type] = v; });
      api('/api/inventory', 'PUT', { inventory: out }).then(function (r) { closeModal(); afterChange('Đã cập nhật tồn kho', r); }).catch(err);
    });
  });

  // ---- Cấu hình năng suất / ca ----
  $('#btnSettings').addEventListener('click', function () {
    var s = state.settings, w = s.windows || [], ot = s.overtime || {};
    var wrap = el('div');
    wrap.innerHTML =
      '<h4>Năng suất thực tế (tấn/giờ)</h4><p class="hint">Chỉnh theo thực tế nhà máy để tính giờ giao chính xác.</p>' +
      '<div class="row2"><div class="field"><label>Thấp nhất</label><input id="s-rmin" type="number" step="0.1" value="' + s.rateMin + '"></div>' +
      '<div class="field"><label>Cao nhất</label><input id="s-rmax" type="number" step="0.1" value="' + s.rateMax + '"></div></div>' +
      '<h4>Chuyển đổi loại gạo (phút)</h4>' +
      '<div class="row2"><div class="field"><label>Tối thiểu</label><input id="s-cmin" type="number" value="' + s.changeoverMin + '"></div>' +
      '<div class="field"><label>Tối đa</label><input id="s-cmax" type="number" value="' + s.changeoverMax + '"></div></div>' +
      '<h4>Ca sản xuất</h4>' +
      '<div class="row2"><div class="field"><label>Sáng từ</label><input id="s-w1s" type="time" value="' + (w[0] ? w[0].start : '06:00') + '"></div>' +
      '<div class="field"><label>đến</label><input id="s-w1e" type="time" value="' + (w[0] ? w[0].end : '10:30') + '"></div></div>' +
      '<div class="row2"><div class="field"><label>Chiều từ</label><input id="s-w2s" type="time" value="' + (w[1] ? w[1].start : '12:00') + '"></div>' +
      '<div class="field"><label>đến</label><input id="s-w2e" type="time" value="' + (w[1] ? w[1].end : '16:30') + '"></div></div>' +
      '<label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="s-ot" ' + (ot.enabled ? 'checked' : '') + ' style="width:auto"> Luôn bật tăng ca (' + (ot.start || '16:30') + '–' + (ot.end || '17:30') + ')</label>';
    openModal('⚙️ Năng suất & Ca sản xuất', wrap, function () {
      var payload = {
        rateMin: parseFloat($('#s-rmin', wrap).value), rateMax: parseFloat($('#s-rmax', wrap).value),
        changeoverMin: parseInt($('#s-cmin', wrap).value, 10), changeoverMax: parseInt($('#s-cmax', wrap).value, 10),
        windows: [{ start: $('#s-w1s', wrap).value, end: $('#s-w1e', wrap).value }, { start: $('#s-w2s', wrap).value, end: $('#s-w2e', wrap).value }],
        overtime: { start: ot.start || '16:30', end: ot.end || '17:30', enabled: $('#s-ot', wrap).checked }
      };
      api('/api/settings', 'PUT', payload).then(function (r) { closeModal(); afterChange('Đã lưu cấu hình', r); }).catch(err);
    });
  });

  loadState();
})();
