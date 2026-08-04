/* Kiểm thử scheduler với kịch bản trong đề bài */
const S = require('./public/scheduler.js');

function show(title, res) {
  console.log('\n===== ' + title + ' =====');
  console.log('Bắt đầu tính từ:', res.generatedAt, '| Tăng ca:', res.overtimeOn);
  res.orders.forEach(o => {
    console.log(
      `#${o.priority} ${o.code} (${o.customer})` +
      ` | còn ${o.remainingTons}/${o.totalTons} tấn` +
      ` | giao dự kiến: ${o.deliveryEarly} → ${o.deliveryLate}` +
      ` | chuyển đổi cộng: ${o.changeoverMinEarly}-${o.changeoverMinLate}'` +
      (o.urgent ? ' | GẤP' : '') +
      (o.lateVsRequested ? ' | ⚠ TRỄ hẹn' : '')
    );
  });
  console.log('Tổng thời gian chuyển đổi loại gạo:', res.totalChangeoverMinEarly + '-' + res.totalChangeoverMinLate + ' phút');
  console.log('Các lần đổi loại (kịch bản chậm):');
  res.changeEvents.forEach(e => {
    console.log(`  • ${e.orderCode}: ${e.fromType} → ${e.toType} (+${e.minutes}') lúc ${e.at}`);
  });
}

// Trạng thái: đang sản xuất gạo tròn mới của Đơn 1, đã xong 9/10 tấn.
const base = {
  scheduleStart: '2026-07-31T09:00',        // 9h sáng
  machineCurrentType: 'Gạo tròn mới',
  settings: {
    rateMin: 1.5, rateMax: 1.8,
    changeoverMin: 30, changeoverMax: 45,
    overtime: { start: '16:30', end: '17:30', enabled: false }
  },
  orders: [
    { id: 'o1', code: 'Đơn 1', customer: 'KH A', priority: 0, urgent: false, requestedDelivery: null,
      items: [ { riceType: 'Gạo tròn mới', tons: 10, tonsDone: 9 }, { riceType: 'Gạo sang dân', tons: 9, tonsDone: 0 } ] },
    { id: 'o2', code: 'Đơn 2', customer: 'KH B', priority: 1, urgent: false, requestedDelivery: null,
      items: [ { riceType: 'Gạo dẻo BC', tons: 21, tonsDone: 0 }, { riceType: 'Gạo gãy', tons: 13, tonsDone: 0 } ] },
    { id: 'o3', code: 'Đơn 3', customer: 'KH C', priority: 2, urgent: false, requestedDelivery: '2026-08-01T12:00',
      items: [ { riceType: 'Gạo ải', tons: 19, tonsDone: 0 } ] }
  ]
};

show('TRƯỚC điều chỉnh (thứ tự 1 → 2 → 3)', S.computeSchedule(base));

// Khách Đơn 3 cần gấp -> đẩy Đơn 3 lên ưu tiên số 1, bật gấp.
const adjusted = JSON.parse(JSON.stringify(base));
adjusted.orders.find(o => o.id === 'o3').priority = -1;
adjusted.orders.find(o => o.id === 'o3').urgent = true;

show('SAU điều chỉnh (Đơn 3 GẤP lên đầu, bật tăng ca)', S.computeSchedule(adjusted));

// Kiểm tra logic cơ bản (sanity checks)
const r = S.computeSchedule(adjusted);
const o3 = r.orders.find(o => o.code === 'Đơn 3');
console.log('\n[CHECK] Đơn 3 lên ưu tiên #' + o3.priority + ' (mong đợi 1):', o3.priority === 1 ? 'OK' : 'FAIL');
console.log('[CHECK] Có lần đổi loại tròn mới → gạo ải:',
  r.changeEvents.some(e => e.fromType === 'Gạo tròn mới' && e.toType === 'Gạo ải') ? 'OK' : 'FAIL');
