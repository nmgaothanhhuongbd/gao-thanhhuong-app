/*
 * telegramAuth.js — Xác thực initData của Telegram Web App (theo tài liệu chính thức).
 * Đảm bảo yêu cầu tới API thực sự đến từ Mini App mở trong Telegram, không phải giả mạo.
 */
const crypto = require('crypto');

function parseInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const data = {};
  for (const [k, v] of params.entries()) data[k] = v;
  return data;
}

// Trả về { ok, user, reason }
function validateInitData(initData, botToken, maxAgeSec) {
  if (!initData) return { ok: false, reason: 'thiếu initData' };
  const data = parseInitData(initData);
  const hash = data.hash;
  if (!hash) return { ok: false, reason: 'thiếu hash' };

  const pairs = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`);
  const checkString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  if (computed !== hash) return { ok: false, reason: 'hash không khớp' };

  // Kiểm tra hạn (mặc định 24h) để chống dùng lại initData cũ
  if (maxAgeSec && data.auth_date) {
    const age = Math.floor(Date.now() / 1000) - parseInt(data.auth_date, 10);
    if (age > maxAgeSec) return { ok: false, reason: 'initData quá hạn' };
  }

  let user = null;
  try { user = data.user ? JSON.parse(data.user) : null; } catch (e) { /* ignore */ }
  return { ok: true, user, raw: data };
}

module.exports = { validateInitData, parseInitData };
