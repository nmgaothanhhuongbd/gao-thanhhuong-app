/*
 * notify.js — Soạn & gửi thông báo Telegram cho các vai trò đã đăng ký.
 */
const { roleLabel } = require('./roles');

function fmtDMY(wall) {
  // "2026-08-01T13:55" -> "13:55 01/08"
  if (!wall) return '—';
  const [d, t] = wall.split('T');
  const [y, mo, da] = d.split('-');
  return `${t} ${da}/${mo}`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Soạn nội dung tóm tắt lịch giao hàng.
function buildScheduleMessage(schedule, opts) {
  opts = opts || {};
  const lines = [];
  lines.push('🏭 <b>CẬP NHẬT LỊCH SẢN XUẤT — Gạo Thạnh Hương</b>');
  if (opts.actor) lines.push(`✍️ Điều chỉnh bởi: <b>${esc(opts.actor)}</b>`);
  if (opts.reason) lines.push(`📌 ${esc(opts.reason)}`);
  lines.push(schedule.overtimeOn ? '⏱ Chế độ: <b>CÓ tăng ca</b> (16:30–17:30)' : '⏱ Chế độ: ca thường');
  lines.push('');
  lines.push('<b>Thứ tự ưu tiên & giờ giao dự kiến:</b>');
  schedule.orders.forEach((o) => {
    const tag = o.urgent ? ' 🔴GẤP' : '';
    const late = o.lateVsRequested ? ' ⚠️TRỄ HẸN' : '';
    lines.push(
      `#${o.priority} <b>${esc(o.code)}</b> — ${esc(o.customer)}${tag}${late}`
    );
    lines.push(
      `   • Còn ${o.remainingTons}/${o.totalTons} tấn` +
      `  • Giao: <b>${fmtDMY(o.deliveryEarly)}</b> → <b>${fmtDMY(o.deliveryLate)}</b>`
    );
    if (o.changeoverMinLate > 0) {
      lines.push(`   • ⏳ Cộng chuyển đổi loại gạo: ${o.changeoverMinEarly}–${o.changeoverMinLate} phút`);
    }
  });
  lines.push('');
  lines.push(
    `Tổng thời gian chuyển đổi loại gạo (chênh lệch): ` +
    `<b>${schedule.totalChangeoverMinEarly}–${schedule.totalChangeoverMinLate} phút</b>`
  );
  if (schedule.changeEvents && schedule.changeEvents.length) {
    lines.push('');
    lines.push('<b>Các lần đổi loại gạo:</b>');
    schedule.changeEvents.forEach((e) => {
      lines.push(`   • ${esc(e.orderCode)}: ${esc(e.fromType)} → ${esc(e.toType)} (+${e.minutes}′)`);
    });
  }
  return lines.join('\n');
}

function createNotifier(bot, store) {
  async function broadcast(text, roles) {
    if (!bot) { console.log('[notify:dev]\n' + text.replace(/<[^>]+>/g, '')); return { sent: 0 }; }
    const db = store.getDb();
    const subs = db.subscribers || {};
    let sent = 0;
    for (const chatId of Object.keys(subs)) {
      const s = subs[chatId];
      if (roles && roles.length && roles.indexOf(s.role) === -1) continue;
      try {
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
        sent++;
      } catch (e) {
        console.error('Không gửi được tới', chatId, '-', e.message);
      }
    }
    return { sent };
  }

  async function notifyScheduleChange(schedule, opts) {
    const text = buildScheduleMessage(schedule, opts);
    // Gửi cho tất cả vai trò (bán hàng + thu mua + giám đốc + tổ sản xuất)
    return broadcast(text, null);
  }

  return { broadcast, notifyScheduleChange, buildScheduleMessage };
}

module.exports = { createNotifier, buildScheduleMessage, fmtDMY };
