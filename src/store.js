/*
 * store.js — Lưu trữ dữ liệu.
 *  - Nếu có cấu hình Firebase (biến FIREBASE_SERVICE_ACCOUNT hoặc GOOGLE_APPLICATION_CREDENTIALS)
 *    => lưu BỀN trên Google Firestore (không mất khi Render deploy lại / ngủ dậy).
 *  - Nếu không => lưu file data/db.json (chỉ dùng khi chạy máy cục bộ; trên Render Free sẽ mất).
 *
 * Toàn bộ dữ liệu là 1 cục JSON, được lưu dưới dạng chuỗi trong 1 document Firestore
 * (collection "thanhhuong", document "main") để đơn giản và tránh giới hạn tên trường.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

function nowWall() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function defaultDb() {
  return {
    company: { name: 'Cty TNHH TM DV XNK Thành Hưng', mill: 'Nhà máy Xay xát Gạo Thạnh Hương', taxCode: '4101525674' },
    settings: {
      windows: [{ start: '06:00', end: '10:30' }, { start: '12:00', end: '16:30' }],
      overtime: { start: '16:30', end: '17:30', enabled: false },
      rateMin: 1.5, rateMax: 1.8, changeoverMin: 30, changeoverMax: 45,
      workDays: [0, 1, 2, 3, 4, 5, 6], deliveryBufferMin: 0
    },
    machineCurrentType: 'Gạo tròn mới',
    scheduleStart: nowWall(),
    riceTypes: ['Gạo tròn mới', 'Gạo sang dân', 'Gạo dẻo BC', 'Gạo gãy', 'Gạo ải'],
    inventory: { 'Gạo tròn mới': 3, 'Gạo ải': 2 },
    orders: [
      { id: 'o1', code: 'Đơn 1', customer: 'Khách A', priority: 0, urgent: false, requestedDelivery: null, note: 'Đang chạy dở dang',
        items: [{ riceType: 'Gạo tròn mới', tons: 10, tonsDone: 9 }, { riceType: 'Gạo sang dân', tons: 9, tonsDone: 0 }] },
      { id: 'o2', code: 'Đơn 2', customer: 'Khách B', priority: 1, urgent: false, requestedDelivery: null, note: '',
        items: [{ riceType: 'Gạo dẻo BC', tons: 21, tonsDone: 0 }, { riceType: 'Gạo gãy', tons: 13, tonsDone: 0 }] },
      { id: 'o3', code: 'Đơn 3', customer: 'Khách C', priority: 2, urgent: false, requestedDelivery: null, note: '',
        items: [{ riceType: 'Gạo ải', tons: 19, tonsDone: 0 }] }
    ],
    changeHistory: [],
    subscribers: {}
  };
}

let cache = null;
let mode = 'file';        // 'firestore' | 'file'
let fsDocRef = null;      // Firestore document reference

// ---- File backend ----
function loadFromFile() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) { const d = defaultDb(); fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2)); return d; }
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { const d = defaultDb(); fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2)); return d; }
}
function writeFile(db) { ensureDir(); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// ---- Firebase backend ----
function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  const hasFileCred = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw && !hasFileCred) return null;
  let admin;
  try { admin = require('firebase-admin'); }
  catch (e) { console.error('Thiếu thư viện firebase-admin, chuyển sang lưu file. (' + e.message + ')'); return null; }

  let credential;
  if (raw) {
    let jsonStr = raw.trim();
    if (jsonStr[0] !== '{') { jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8'); } // hỗ trợ base64
    const svc = JSON.parse(jsonStr);
    if (svc.private_key && svc.private_key.indexOf('\\n') !== -1) svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    credential = admin.credential.cert(svc);
  } else {
    credential = admin.credential.applicationDefault();
  }
  if (!admin.apps.length) admin.initializeApp({ credential: credential });
  const dbFs = admin.firestore();
  return dbFs.collection('thanhhuong').doc('main');
}

// ---- Khởi tạo (gọi 1 lần khi server chạy) ----
async function init() {
  try {
    fsDocRef = initFirebase();
  } catch (e) {
    console.error('Cấu hình Firebase lỗi, chuyển sang lưu file:', e.message);
    fsDocRef = null;
  }
  if (fsDocRef) {
    mode = 'firestore';
    const snap = await fsDocRef.get();
    if (snap.exists && snap.data() && snap.data().json) {
      cache = JSON.parse(snap.data().json);
    } else {
      cache = defaultDb();
      await fsDocRef.set({ json: JSON.stringify(cache), updatedAt: new Date().toISOString() });
    }
    console.log('💾 Lưu trữ: Google Firestore (bền lâu).');
  } else {
    mode = 'file';
    cache = loadFromFile();
    console.log('💾 Lưu trữ: file cục bộ (KHÔNG bền trên Render Free — hãy cấu hình Firebase).');
  }
  return cache;
}

function persist() {
  if (mode === 'firestore' && fsDocRef) {
    fsDocRef.set({ json: JSON.stringify(cache), updatedAt: new Date().toISOString() })
      .catch((e) => console.error('Lỗi ghi Firestore:', e.message));
  } else {
    writeFile(cache);
  }
}

function load() { if (!cache) cache = loadFromFile(); return cache; }   // fallback đồng bộ
function getDb() { return cache || load(); }
function save(db) { cache = db; persist(); return db; }

function genId(prefix) { return (prefix || 'o') + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
function renumber(db) { db.orders.slice().sort((a, b) => a.priority - b.priority).forEach((o, i) => { o.priority = i; }); return db; }
function logChange(db, entry) {
  db.changeHistory = db.changeHistory || [];
  db.changeHistory.unshift(Object.assign({ at: nowWall() }, entry));
  if (db.changeHistory.length > 200) db.changeHistory.length = 200;
}

module.exports = { DB_FILE, DATA_DIR, init, load, save, getDb, genId, renumber, logChange, defaultDb, nowWall };
