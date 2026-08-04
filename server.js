/*
 * server.js — Máy chủ Mini App + API điều phối sản xuất + Bot Telegram.
 *
 * Chạy:  npm install  &&  npm start
 * Biến môi trường (file .env):
 *   TELEGRAM_BOT_TOKEN=...        (bắt buộc khi chạy thật; bỏ trống = chế độ DEV không cần Telegram)
 *   WEBAPP_URL=https://.../       (URL HTTPS công khai của Mini App)
 *   ADMIN_IDS=123,456             (các Telegram user id là giám đốc/được sửa)
 *   PORT=3000
 *   ALLOW_INSECURE=1              (chỉ để test cục bộ, bỏ qua xác thực initData)
 */
require('dotenv').config();
const express = require('express');
const path = require('path');

const store = require('./src/store');
const Scheduler = require('./public/scheduler.js');
const { validateInitData } = require('./src/telegramAuth');
const { EDIT_ROLES, roleLabel } = require('./src/roles');
const { createNotifier } = require('./src/notify');
// Lưu ý: bot (node-telegram-bot-api) chỉ được nạp khi có TOKEN, để chạy được
// ở chế độ DEV/cục bộ mà không cần thư viện Telegram.

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || '';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const DEV = !TOKEN || process.env.ALLOW_INSECURE === '1';

store.load();

// ---- Bot + Notifier ----
let bot = null;
if (TOKEN) {
  try {
    const { createBot } = require('./src/bot');
    bot = createBot(TOKEN, store, WEBAPP_URL);
  } catch (e) { console.error('Không khởi động được bot:', e.message); }
} else {
  console.log('⚠️  Chưa có TELEGRAM_BOT_TOKEN — chạy CHẾ ĐỘ DEV (không gửi Telegram, bỏ qua xác thực).');
}
const notifier = createNotifier(bot, store);

// ---- Express ----
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware xác thực Telegram Web App.
function auth(req, res, next) {
  const initData = req.get('X-Init-Data') || (req.body && req.body._initData) || '';
  if (DEV) {
    req.tgUser = { id: 'dev', first_name: 'DEV', last_name: 'Giám đốc' };
    req.role = 'giam_doc';
    req.isAdmin = true;
    return next();
  }
  const v = validateInitData(initData, TOKEN, 24 * 3600);
  if (!v.ok) return res.status(401).json({ error: 'Xác thực Telegram thất bại: ' + v.reason });
  req.tgUser = v.user || {};
  const db = store.getDb();
  const sub = (db.subscribers || {})[String(req.tgUser.id)];
  req.role = sub ? sub.role : null;
  req.isAdmin = EDIT_ROLES.indexOf(req.role) !== -1 || ADMIN_IDS.indexOf(String(req.tgUser.id)) !== -1;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Chỉ Giám đốc / Tổ sản xuất mới được điều chỉnh.' });
  }
  next();
}

function actorName(req) {
  const u = req.tgUser || {};
  const nm = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Người dùng';
  return `${nm} (${roleLabel(req.role)})`;
}

function stateResponse(req) {
  const db = store.getDb();
  return {
    company: db.company,
    settings: db.settings,
    riceTypes: db.riceTypes,
    machineCurrentType: db.machineCurrentType,
    scheduleStart: db.scheduleStart,
    orders: db.orders,
    changeHistory: (db.changeHistory || []).slice(0, 30),
    schedule: Scheduler.computeSchedule(db),
    me: req ? { user: req.tgUser, role: req.role, isAdmin: req.isAdmin } : null
  };
}

// Sau khi thay đổi: lưu, tính lại lịch, ghi lịch sử, gửi thông báo.
async function commitAndNotify(req, reason, extraLog) {
  const db = store.getDb();
  store.renumber(db);
  store.logChange(db, Object.assign({ actor: actorName(req), reason }, extraLog || {}));
  store.save(db);
  const schedule = Scheduler.computeSchedule(db);
  await notifier.notifyScheduleChange(schedule, { actor: actorName(req), reason });
  return schedule;
}

// ---------------- API ----------------
app.post('/api/auth', auth, (req, res) => {
  res.json({ user: req.tgUser, role: req.role, roleLabel: roleLabel(req.role), isAdmin: req.isAdmin });
});

app.get('/api/state', auth, (req, res) => res.json(stateResponse(req)));

// Thêm đơn hàng
app.post('/api/orders', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const b = req.body || {};
  const maxP = db.orders.reduce((m, o) => Math.max(m, o.priority), -1);
  const order = {
    id: store.genId('o'),
    code: b.code || ('Đơn ' + (db.orders.length + 1)),
    customer: b.customer || '',
    priority: maxP + 1,
    urgent: !!b.urgent,
    requestedDelivery: b.requestedDelivery || null,
    note: b.note || '',
    items: (b.items || []).map((it) => ({
      riceType: it.riceType, tons: Number(it.tons) || 0, tonsDone: Number(it.tonsDone) || 0
    }))
  };
  db.orders.push(order);
  store.save(db);
  const schedule = await commitAndNotify(req, `Thêm đơn ${order.code} (${order.customer})`);
  res.json({ ok: true, schedule, orderId: order.id });
});

// Sửa đơn hàng
app.put('/api/orders/:id', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const b = req.body || {};
  ['code', 'customer', 'note'].forEach((k) => { if (b[k] != null) o[k] = b[k]; });
  if (b.requestedDelivery !== undefined) o.requestedDelivery = b.requestedDelivery || null;
  if (b.urgent !== undefined) o.urgent = !!b.urgent;
  if (Array.isArray(b.items)) {
    o.items = b.items.map((it) => ({
      riceType: it.riceType, tons: Number(it.tons) || 0, tonsDone: Number(it.tonsDone) || 0
    }));
  }
  store.save(db);
  const schedule = await commitAndNotify(req, `Sửa đơn ${o.code}`);
  res.json({ ok: true, schedule });
});

// Xoá đơn hàng
app.delete('/api/orders/:id', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const o = db.orders.find((x) => x.id === req.params.id);
  db.orders = db.orders.filter((x) => x.id !== req.params.id);
  store.save(db);
  const schedule = await commitAndNotify(req, o ? `Xoá đơn ${o.code}` : 'Xoá đơn');
  res.json({ ok: true, schedule });
});

// Đẩy 1 đơn thành GẤP + lên ưu tiên số 1
app.post('/api/orders/:id/promote', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const minP = db.orders.reduce((m, x) => Math.min(m, x.priority), 0);
  o.priority = minP - 1;
  o.urgent = req.body && req.body.urgent === false ? false : true;
  if (o.urgent && db.settings.overtime) db.settings.overtime.enabled = db.settings.overtime.enabled || false;
  store.save(db);
  const schedule = await commitAndNotify(req, `🔴 GẤP: đưa ${o.code} (${o.customer}) lên ưu tiên số 1`);
  res.json({ ok: true, schedule });
});

// Đổi thứ tự ưu tiên: body { order: [id1, id2, ...] }
app.post('/api/reorder', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const ids = (req.body && req.body.order) || [];
  ids.forEach((id, i) => {
    const o = db.orders.find((x) => x.id === id);
    if (o) o.priority = i;
  });
  store.save(db);
  const schedule = await commitAndNotify(req, 'Sắp xếp lại thứ tự ưu tiên sản xuất');
  res.json({ ok: true, schedule });
});

// Cập nhật tiến độ + loại gạo đang chạy: body { machineCurrentType, updates:[{orderId,itemIndex,tonsDone}] }
app.post('/api/progress', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const b = req.body || {};
  if (b.machineCurrentType !== undefined) db.machineCurrentType = b.machineCurrentType || null;
  (b.updates || []).forEach((u) => {
    const o = db.orders.find((x) => x.id === u.orderId);
    if (o && o.items[u.itemIndex]) o.items[u.itemIndex].tonsDone = Number(u.tonsDone) || 0;
  });
  if (b.scheduleStart) db.scheduleStart = b.scheduleStart;
  store.save(db);
  const schedule = await commitAndNotify(req, b.reason || 'Cập nhật tiến độ sản xuất');
  res.json({ ok: true, schedule });
});

// Cập nhật cấu hình ca/năng suất/chuyển đổi
app.put('/api/settings', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  db.settings = Object.assign({}, db.settings, req.body || {});
  if (Array.isArray(req.body.riceTypes)) db.riceTypes = req.body.riceTypes;
  store.save(db);
  const schedule = await commitAndNotify(req, 'Cập nhật cấu hình ca sản xuất / năng suất');
  res.json({ ok: true, schedule });
});

// Gửi lại thông báo lịch hiện tại
app.post('/api/broadcast', auth, requireAdmin, async (req, res) => {
  const db = store.getDb();
  const schedule = Scheduler.computeSchedule(db);
  const r = await notifier.notifyScheduleChange(schedule, {
    actor: actorName(req), reason: (req.body && req.body.reason) || 'Gửi lại lịch sản xuất hiện tại'
  });
  res.json({ ok: true, sent: r.sent });
});

app.get('/api/health', (req, res) => res.json({ ok: true, dev: DEV, hasBot: !!bot }));

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}  (DEV=${DEV})`);
  if (WEBAPP_URL) console.log('   WEBAPP_URL =', WEBAPP_URL);
});
