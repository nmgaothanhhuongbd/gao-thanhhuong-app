/*
 * store.js — Lưu trữ dữ liệu đơn giản bằng file JSON (không cần cài database).
 * Phù hợp quy mô 1 nhà máy. Muốn nhiều nơi cùng ghi -> có thể thay bằng SQLite/Postgres sau.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowWall() {
  // Giờ treo tường theo múi giờ Việt Nam (UTC+7), dạng "YYYY-MM-DDTHH:mm"
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function defaultDb() {
  return {
    company: {
      name: 'Cty TNHH TM DV XNK Thành Hưng',
      mill: 'Nhà máy Xay xát Gạo Thạnh Hương',
      taxCode: '4101525674'
    },
    settings: {
      windows: [
        { start: '06:00', end: '10:30' },
        { start: '12:00', end: '16:30' }
      ],
      overtime: { start: '16:30', end: '17:30', enabled: false },
      rateMin: 1.5,
      rateMax: 1.8,
      changeoverMin: 30,
      changeoverMax: 45,
      workDays: [0, 1, 2, 3, 4, 5, 6],
      deliveryBufferMin: 0
    },
    machineCurrentType: 'Gạo tròn mới',
    scheduleStart: nowWall(),
    riceTypes: ['Gạo tròn mới', 'Gạo sang dân', 'Gạo dẻo BC', 'Gạo gãy', 'Gạo ải'],
    orders: [
      {
        id: 'o1', code: 'Đơn 1', customer: 'Khách A', priority: 0, urgent: false,
        requestedDelivery: null, note: 'Đang chạy dở dang',
        items: [
          { riceType: 'Gạo tròn mới', tons: 10, tonsDone: 9 },
          { riceType: 'Gạo sang dân', tons: 9, tonsDone: 0 }
        ]
      },
      {
        id: 'o2', code: 'Đơn 2', customer: 'Khách B', priority: 1, urgent: false,
        requestedDelivery: null, note: '',
        items: [
          { riceType: 'Gạo dẻo BC', tons: 21, tonsDone: 0 },
          { riceType: 'Gạo gãy', tons: 13, tonsDone: 0 }
        ]
      },
      {
        id: 'o3', code: 'Đơn 3', customer: 'Khách C', priority: 2, urgent: false,
        requestedDelivery: null, note: '',
        items: [
          { riceType: 'Gạo ải', tons: 19, tonsDone: 0 }
        ]
      }
    ],
    changeHistory: [],   // lịch sử điều chỉnh của giám đốc
    subscribers: {}      // { "<chatId>": { name, role, username } }
  };
}

let cache = null;

function load() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    cache = defaultDb();
    save(cache);
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('Lỗi đọc db.json, khởi tạo lại mặc định:', e.message);
    cache = defaultDb();
    save(cache);
  }
  return cache;
}

function save(db) {
  ensureDir();
  cache = db;
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  return db;
}

function getDb() {
  return cache || load();
}

function genId(prefix) {
  return (prefix || 'o') + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}

// Chuẩn hoá lại priority thành 0,1,2,... theo thứ tự hiện tại.
function renumber(db) {
  db.orders
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .forEach((o, i) => { o.priority = i; });
  return db;
}

function logChange(db, entry) {
  db.changeHistory = db.changeHistory || [];
  db.changeHistory.unshift(Object.assign({ at: nowWall() }, entry));
  if (db.changeHistory.length > 200) db.changeHistory.length = 200;
}

module.exports = {
  DB_FILE, DATA_DIR,
  load, save, getDb, genId, renumber, logChange, defaultDb, nowWall
};
