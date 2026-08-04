/*
 * bot.js — Bot Telegram: đăng ký vai trò, mở Mini App, gửi lịch nhanh.
 */
const TelegramBot = require('node-telegram-bot-api');
const { ROLES, roleLabel } = require('./roles');
const Scheduler = require('../public/scheduler.js');
const { buildScheduleMessage } = require('./notify');

function createBot(token, store, webAppUrl) {
  const bot = new TelegramBot(token, { polling: true });

  function saveSubscriber(chatId, user, role) {
    const db = store.getDb();
    db.subscribers = db.subscribers || {};
    db.subscribers[String(chatId)] = {
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(chatId),
      username: user.username || '',
      role: role || (db.subscribers[String(chatId)] && db.subscribers[String(chatId)].role) || null
    };
    store.save(db);
  }

  const roleKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👔 Giám đốc', callback_data: 'role:giam_doc' }],
        [{ text: '⚙️ Tổ sản xuất', callback_data: 'role:to_sx' }],
        [{ text: '🧾 Nhân viên bán hàng', callback_data: 'role:ban_hang' }],
        [{ text: '🌾 Nhân viên thu mua', callback_data: 'role:thu_mua' }]
      ]
    }
  };

  function openAppKeyboard() {
    if (!webAppUrl) return undefined;
    return {
      reply_markup: {
        inline_keyboard: [[{ text: '📲 Mở App Điều Phối Sản Xuất', web_app: { url: webAppUrl } }]]
      }
    };
  }

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    saveSubscriber(chatId, msg.from, null);
    bot.sendMessage(
      chatId,
      '🏭 <b>Điều Phối Sản Xuất — Gạo Thạnh Hương</b>\n\n' +
      'Chào bạn! Vui lòng chọn <b>vai trò</b> để nhận đúng thông báo khi có điều chỉnh đơn hàng:',
      Object.assign({ parse_mode: 'HTML' }, roleKeyboard)
    );
  });

  bot.onText(/\/vaitro/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Chọn lại vai trò của bạn:',
      Object.assign({ parse_mode: 'HTML' }, roleKeyboard));
  });

  bot.onText(/\/app/, (msg) => {
    const kb = openAppKeyboard();
    if (!kb) {
      bot.sendMessage(msg.chat.id, '⚠️ Chưa cấu hình WEBAPP_URL. Xem README để đặt địa chỉ Mini App.');
      return;
    }
    bot.sendMessage(msg.chat.id, 'Nhấn nút bên dưới để mở app:', kb);
  });

  bot.onText(/\/lich/, (msg) => {
    const db = store.getDb();
    const schedule = Scheduler.computeSchedule(db);
    bot.sendMessage(msg.chat.id, buildScheduleMessage(schedule, { reason: 'Lịch hiện tại' }),
      { parse_mode: 'HTML', disable_web_page_preview: true });
  });

  bot.on('callback_query', (q) => {
    const m = /^role:(\w+)$/.exec(q.data || '');
    if (!m) return;
    const role = m[1];
    if (!ROLES[role]) return;
    saveSubscriber(q.message.chat.id, q.from, role);
    bot.answerCallbackQuery(q.id, { text: 'Đã lưu vai trò: ' + roleLabel(role) });
    const kb = openAppKeyboard();
    bot.sendMessage(
      q.message.chat.id,
      `✅ Bạn đã đăng ký vai trò: <b>${roleLabel(role)}</b>.\n` +
      'Bạn sẽ nhận thông báo mỗi khi giám đốc điều chỉnh ưu tiên hoặc giờ giao.',
      Object.assign({ parse_mode: 'HTML' }, kb || {})
    );
  });

  bot.on('polling_error', (e) => console.error('polling_error:', e.code || e.message));

  console.log('🤖 Bot Telegram đã chạy (polling).');
  return bot;
}

module.exports = { createBot };
