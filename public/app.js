/* app.js — Mini App điều phối sản xuất (client) */
(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor && tg.setHeaderColor('#1b5e20'); } catch (e) {} }
  var INIT_DATA = tg ? tg.initData : '';

  var state = null;   // dữ liệu /api/state
  var me = null;      // { user, role, isAdmin }

  // ---------- Tiện ích ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDT(wall) {
    if (!wall) return '—';
    var p = wall.split('T'); if (p.length < 2) return wall;
    var d = p[0].split('-');
    return p[1] + ' ' + d[2] + '/' + d[1];
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function api(path, method, body) {
    return fetch(path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Init-Data': INIT_DATA },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('Lỗi ' + r.status));
        return j;
      });
    });
  }

  // ---------- Tải & hiển thị ----------
  function loadState() {
    return api('/api/state').then(function (s) {
      state = s; me = s.me || {};
      document.body.classList.toggle('readonly', !me.isAdmin);
      $('#readonlyNote').style.display = me.isAdmin ? 'none' : 'block';
      var roleTxt = (me.role ? roleLabel(me.role) : 'Chưa đăng ký');
      $('#whoami').innerHTML = esc((me.user && (me.user.first_name || me.user.username)) || 'Khách') + '<br>' + esc(roleTxt);
      render();
    }).catch(function (e) {
      $('#ordersList').innerHTML = '<div class="card">Không tải được dữ liệu: ' + esc(e.message) +
        '<br><small>Nếu mở ngoài Telegram, hãy chạy chế độ DEV (ALLOW_INSECURE=1).</small></div>';
    });
  }

  function roleLabel(r) {
    return ({ giam_doc: 'Giám đốc', to_sx: 'Tổ sản xuất', ban_hang: 'NV bán hàng', thu_mua: 'NV thu mua' })[r] || 'Chưa đăng ký';
  }

  function render() {
    renderStatus();
    renderOrders();
    renderChanges();
    renderHistory();
    fillSettings();
  }

  function renderStatus() {
    var sch = state.schedule;
    // Loại gạo đang chạy
    var sel = $('#machineType'); sel.innerHTML = '';
    var none = el('option'); none.value = ''; none.textContent = '(chưa chạy)'; sel.appendChild(none);
    (state.riceTypes || []).forEach(function (t) {
      var o = el('option'); o.value = t; o.textContent = t;
      if (t === state.machineCurrentType) o.selected = true;
      sel.appendChild(o);
    });
    $('#machineTypeRO').textContent = state.machineCurrentType || '(chưa chạy)';
    $('#scheduleStart').value = (state.scheduleStart || '').slice(0, 16);
    $('#scheduleStartRO').textContent = fmtDT(state.scheduleStart);
    var b = $('#overtimeBadge');
    b.textContent = sch.overtimeOn ? 'ĐANG BẬT' : 'Tắt';
    b.className = 'badge' + (sch.overtimeOn ? ' on' : '');
  }

  function renderOrders() {
    var list = $('#ordersList'); list.innerHTML = '';
    var orders = state.schedule.orders;
    if (!orders.length) { list.appendChild(el('div', 'card', 'Chưa có đơn hàng nào.')); return; }
    orders.forEach(function (o, idx) {
      var full = state.orders.find(function (x) { return x.id === o.id; }) || { items: o.items };
      var card = el('div', 'order-card' + (o.urgent ? ' urgent' : ''));

      var top = el('div', 'oc-top');
      top.appendChild(el('div', 'prio', String(o.priority)));
      var title = el('div', 'oc-title');
      title.innerHTML = '<div class="oc-code">' + esc(o.code) + '</div><div class="oc-customer">' + esc(o.customer || '') + '</div>';
      top.appendChild(title);
      if (o.urgent) top.appendChild(el('span', 'pill pill-urgent', '🔴 GẤP'));
      if (o.lateVsRequested) top.appendChild(el('span', 'pill pill-late', '⚠ TRỄ HẸN'));
      card.appendChild(top);

      var deliv = el('div', 'oc-delivery');
      deliv.innerHTML = 'Giao dự kiến: <b>' + fmtDT(o.deliveryEarly) + '</b> → <b>' + fmtDT(o.deliveryLate) + '</b>';
      var meta = el('div', 'oc-meta');
      meta.innerHTML =
        '<span>Còn ' + o.remainingTons + '/' + o.totalTons + ' tấn</span>' +
        (o.changeoverMinLate > 0 ? '<span>⏳ Chuyển đổi +' + o.changeoverMinEarly + '–' + o.changeoverMinLate + '′</span>' : '') +
        (o.requestedDelivery ? '<span>Hẹn KH: ' + fmtDT(o.requestedDelivery) + '</span>' : '');
      deliv.appendChild(meta);
      card.appendChild(deliv);

      var items = el('div', 'items');
      (full.items || []).forEach(function (it) {
        var pct = it.tons > 0 ? Math.min(100, Math.round((it.tonsDone / it.tons) * 100)) : 0;
        var row = el('div', 'item');
        row.innerHTML =
          '<span>' + esc(it.riceType) + '</span>' +
          '<span class="' + (pct >= 100 ? 'done' : '') + '">' + it.tonsDone + '/' + it.tons + ' tấn (' + pct + '%)</span>' +
          '<div class="prog-wrap"><div class="prog" style="width:' + pct + '%"></div></div>';
        items.appendChild(row);
      });
      card.appendChild(items);

      var actions = el('div', 'oc-actions admin-only');
      actions.appendChild(iconBtn('▲', function () { move(idx, -1); }, idx === 0));
      actions.appendChild(iconBtn('▼', function () { move(idx, 1); }, idx === orders.length - 1));
      if (!o.urgent) actions.appendChild(iconBtn('🔴 Gấp', function () { promote(o.id); }));
      else actions.appendChild(iconBtn('Bỏ gấp', function () { unpromote(o.id); }));
      actions.appendChild(iconBtn('✏️ Sửa', function () { openOrderModal(o.id); }));
      actions.appendChild(iconBtn('🗑', function () { removeOrder(o.id, o.code); }));
      card.appendChild(actions);

      list.appendChild(card);
    });
  }

  function iconBtn(label, fn, disabled) {
    var b = el('button', 'icon-btn', label);
    if (disabled) { b.disabled = true; b.style.opacity = .35; }
    else b.onclick = fn;
    return b;
  }

  function renderChanges() {
    var sch = state.schedule;
    $('#totalChange').textContent = sch.totalChangeoverMinEarly + '–' + sch.totalChangeoverMinLate + ' phút';
    var box = $('#changeEvents'); box.innerHTML = '';
    if (!sch.changeEvents.length) { box.appendChild(el('div', 'card', 'Không có lần đổi loại gạo nào trong lịch hiện tại.')); return; }
    sch.changeEvents.forEach(function (e) {
      var d = el('div', 'event');
      d.innerHTML = '<b>' + esc(e.orderCode) + '</b>: ' + esc(e.fromType) + ' → ' + esc(e.toType) +
        ' <b>(+' + e.minutes + '′)</b><div class="when">Khoảng lúc ' + fmtDT(e.at) + '</div>';
      box.appendChild(d);
    });
  }

  function renderHistory() {
    var box = $('#historyList'); box.innerHTML = '';
    var h = state.changeHistory || [];
    if (!h.length) { box.appendChild(el('div', 'card', 'Chưa có điều chỉnh nào.')); return; }
    h.forEach(function (e) {
      var d = el('div', 'event hist');
      d.innerHTML = esc(e.reason || '') + '<div class="when">' + fmtDT(e.at) + ' • ' + esc(e.actor || '') + '</div>';
      box.appendChild(d);
    });
  }

  // ---------- Hành động ----------
  function move(idx, dir) {
    var orders = state.schedule.orders.slice();
    var j = idx + dir;
    if (j < 0 || j >= orders.length) return;
    var tmp = orders[idx]; orders[idx] = orders[j]; orders[j] = tmp;
    var ids = orders.map(function (o) { return o.id; });
    api('/api/reorder', 'POST', { order: ids }).then(afterChange('Đã đổi thứ tự ưu tiên')).catch(err);
  }
  function promote(id) { api('/api/orders/' + id + '/promote', 'POST', { urgent: true }).then(afterChange('Đã đưa lên ưu tiên số 1 (GẤP)')).catch(err); }
  function unpromote(id) { api('/api/orders/' + id + '/promote', 'POST', { urgent: false }).then(afterChange('Đã bỏ đánh dấu gấp')).catch(err); }
  function removeOrder(id, code) {
    if (!confirm('Xoá ' + code + '?')) return;
    api('/api/orders/' + id, 'DELETE').then(afterChange('Đã xoá đơn')).catch(err);
  }
  function afterChange(msg) {
    return function (res) {
      if (res && res.schedule) { state.schedule = res.schedule; }
      loadState().then(function () { toast(msg); });
      if (tg && tg.HapticFeedback) try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
    };
  }
  function err(e) { toast('Lỗi: ' + e.message); }

  // Đổi loại gạo đang chạy
  $('#machineType').addEventListener('change', function () {
    api('/api/progress', 'POST', { machineCurrentType: this.value, reason: 'Đổi loại gạo đang chạy: ' + (this.value || '(chưa chạy)') })
      .then(afterChange('Đã cập nhật loại gạo đang chạy')).catch(err);
  });
  $('#scheduleStart').addEventListener('change', function () {
    api('/api/progress', 'POST', { scheduleStart: this.value, reason: 'Đặt lại thời điểm bắt đầu tính lịch' })
      .then(afterChange('Đã cập nhật thời điểm bắt đầu')).catch(err);
  });
  $('#btnBroadcast').addEventListener('click', function () {
    api('/api/broadcast', 'POST', {}).then(function (r) { toast('Đã gửi thông báo tới ' + (r.sent || 0) + ' người'); }).catch(err);
  });

  // ---------- Modal đơn hàng ----------
  var modalSaveFn = null;
  function openModal(title, bodyEl, saveFn) {
    $('#modalTitle').textContent = title;
    var body = $('#modalBody'); body.innerHTML = ''; body.appendChild(bodyEl);
    modalSaveFn = saveFn;
    $('#modal').style.display = 'flex';
  }
  function closeModal() { $('#modal').style.display = 'none'; modalSaveFn = null; }
  $('#modalClose').onclick = closeModal;
  $('#modalCancel').onclick = closeModal;
  $('#modalSave').onclick = function () { if (modalSaveFn) modalSaveFn(); };

  function riceOptions(selected) {
    return (state.riceTypes || []).map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === selected ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('') + '<option value="__new">+ Loại khác…</option>';
  }

  function buildItemRow(it) {
    it = it || { riceType: (state.riceTypes || [])[0] || '', tons: '', tonsDone: 0 };
    var row = el('div', 'item-row');
    row.innerHTML =
      '<select class="i-type">' + riceOptions(it.riceType) + '</select>' +
      '<input class="i-tons" type="number" step="0.1" placeholder="Tấn" value="' + (it.tons || '') + '">' +
      '<input class="i-done" type="number" step="0.1" placeholder="Đã xong" value="' + (it.tonsDone || 0) + '">' +
      '<button class="icon-btn i-del">✕</button>';
    row.querySelector('.i-del').onclick = function () { row.remove(); };
    row.querySelector('.i-type').onchange = function () {
      if (this.value === '__new') {
        var nv = prompt('Nhập tên loại gạo mới:');
        if (nv) { var o = el('option'); o.value = nv; o.textContent = nv; o.selected = true; this.insertBefore(o, this.lastChild); }
        else this.selectedIndex = 0;
      }
    };
    return row;
  }

  function openOrderModal(id) {
    var o = id ? state.orders.find(function (x) { return x.id === id; }) : null;
    var wrap = el('div');
    wrap.innerHTML =
      '<div class="field"><label>Mã đơn</label><input id="f-code" value="' + esc(o ? o.code : '') + '" placeholder="VD: Đơn 4"></div>' +
      '<div class="field"><label>Khách hàng</label><input id="f-customer" value="' + esc(o ? o.customer : '') + '"></div>' +
      '<div class="field"><label>Hẹn giao khách (không bắt buộc)</label><input id="f-req" type="datetime-local" value="' + (o && o.requestedDelivery ? o.requestedDelivery.slice(0, 16) : '') + '"></div>' +
      '<div class="field"><label>Ghi chú</label><input id="f-note" value="' + esc(o ? o.note : '') + '"></div>' +
      '<label style="font-size:12px;color:#7a8794">Các loại gạo trong đơn</label><div id="f-items"></div>' +
      '<button class="add-item" id="f-additem">＋ Thêm loại gạo</button>';
    var itemsBox = wrap.querySelector('#f-items');
    ((o && o.items) || [null]).forEach(function (it) { itemsBox.appendChild(buildItemRow(it)); });
    wrap.querySelector('#f-additem').onclick = function () { itemsBox.appendChild(buildItemRow()); };

    openModal(o ? ('Sửa ' + o.code) : 'Thêm đơn hàng', wrap, function () {
      var items = $all('.item-row', itemsBox).map(function (r) {
        return {
          riceType: r.querySelector('.i-type').value,
          tons: parseFloat(r.querySelector('.i-tons').value) || 0,
          tonsDone: parseFloat(r.querySelector('.i-done').value) || 0
        };
      }).filter(function (it) { return it.riceType && it.riceType !== '__new' && it.tons > 0; });
      if (!items.length) { toast('Cần ít nhất 1 loại gạo có số tấn > 0'); return; }
      var payload = {
        code: $('#f-code', wrap).value.trim(),
        customer: $('#f-customer', wrap).value.trim(),
        requestedDelivery: $('#f-req', wrap).value || null,
        note: $('#f-note', wrap).value.trim(),
        items: items
      };
      var p = o ? api('/api/orders/' + o.id, 'PUT', payload) : api('/api/orders', 'POST', payload);
      p.then(function (res) { closeModal(); afterChange(o ? 'Đã lưu đơn' : 'Đã thêm đơn')(res); }).catch(err);
    });
  }
  $('#btnAdd').addEventListener('click', function () { openOrderModal(null); });

  // ---------- Modal cập nhật tiến độ ----------
  $('#btnProgress').addEventListener('click', function () {
    var wrap = el('div');
    wrap.innerHTML =
      '<div class="field"><label>Loại gạo đang chạy trên máy</label><select id="p-machine">' +
      '<option value="">(chưa chạy)</option>' +
      (state.riceTypes || []).map(function (t) { return '<option value="' + esc(t) + '"' + (t === state.machineCurrentType ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Thời điểm bắt đầu tính lịch</label><input id="p-start" type="datetime-local" value="' + (state.scheduleStart || '').slice(0, 16) + '"></div>' +
      '<label style="font-size:12px;color:#7a8794">Số tấn đã sản xuất xong theo từng loại</label><div id="p-items"></div>';
    var box = wrap.querySelector('#p-items');
    var refs = [];
    state.orders.slice().sort(function (a, b) { return a.priority - b.priority; }).forEach(function (o) {
      (o.items || []).forEach(function (it, i) {
        var row = el('div', 'item-row');
        row.innerHTML = '<span style="font-size:12px">' + esc(o.code) + ' · ' + esc(it.riceType) + '</span>' +
          '<input type="number" step="0.1" value="' + (it.tonsDone || 0) + '">' +
          '<span style="font-size:12px;color:#7a8794">/ ' + it.tons + ' tấn</span><span></span>';
        box.appendChild(row);
        refs.push({ orderId: o.id, itemIndex: i, input: row.querySelector('input') });
      });
    });
    openModal('Cập nhật tiến độ sản xuất', wrap, function () {
      var updates = refs.map(function (r) { return { orderId: r.orderId, itemIndex: r.itemIndex, tonsDone: parseFloat(r.input.value) || 0 }; });
      api('/api/progress', 'POST', {
        machineCurrentType: $('#p-machine', wrap).value,
        scheduleStart: $('#p-start', wrap).value || undefined,
        updates: updates,
        reason: 'Cập nhật tiến độ sản xuất'
      }).then(function (res) { closeModal(); afterChange('Đã cập nhật tiến độ')(res); }).catch(err);
    });
  });

  // ---------- Cấu hình ----------
  function fillSettings() {
    var s = state.settings;
    $('#rateMin').value = s.rateMin; $('#rateMax').value = s.rateMax;
    $('#changeoverMin').value = s.changeoverMin; $('#changeoverMax').value = s.changeoverMax;
    var w = s.windows || [];
    if (w[0]) { $('#w1s').value = w[0].start; $('#w1e').value = w[0].end; }
    if (w[1]) { $('#w2s').value = w[1].start; $('#w2e').value = w[1].end; }
    var ot = s.overtime || {};
    $('#ots').value = ot.start || '16:30'; $('#ote').value = ot.end || '17:30';
    $('#otEnabled').checked = !!ot.enabled;
  }
  $('#btnSaveSettings').addEventListener('click', function () {
    var payload = {
      rateMin: parseFloat($('#rateMin').value), rateMax: parseFloat($('#rateMax').value),
      changeoverMin: parseInt($('#changeoverMin').value, 10), changeoverMax: parseInt($('#changeoverMax').value, 10),
      windows: [
        { start: $('#w1s').value, end: $('#w1e').value },
        { start: $('#w2s').value, end: $('#w2e').value }
      ],
      overtime: { start: $('#ots').value, end: $('#ote').value, enabled: $('#otEnabled').checked }
    };
    api('/api/settings', 'PUT', payload).then(afterChange('Đã lưu cấu hình')).catch(err);
  });

  // ---------- Tabs ----------
  $all('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $all('.tab').forEach(function (x) { x.classList.remove('active'); });
      $all('.tab-panel').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      $('#tab-' + t.dataset.tab).classList.add('active');
    });
  });

  // ---------- Khởi động ----------
  loadState();
})();
