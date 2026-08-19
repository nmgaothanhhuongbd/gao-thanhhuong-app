# 🏭 Mini App Telegram — Điều Phối Sản Xuất Theo Ưu Tiên
### Nhà máy Xay xát Gạo Thạnh Hương — Cty TNHH TM DV XNK Thành Hưng (MST 4101525674)

Ứng dụng giúp **giám đốc nhà máy** điều chỉnh thứ tự ưu tiên các đơn hàng ngay trên Telegram.
Khi có đơn gấp, chỉ cần bấm một nút — hệ thống **tự tính lại giờ giao dự kiến** cho tất cả đơn còn lại
và **gửi thông báo** cho nhân viên bán hàng, thu mua, giám đốc và tổ sản xuất.

---

## 1. Tính năng chính

- **Danh sách đơn theo thứ tự ưu tiên**, kéo lên/xuống hoặc bấm **🔴 Gấp** để đưa một đơn lên số 1.
- **Tự tính giờ giao dự kiến** (khoảng *sớm nhất → muộn nhất*) dựa trên:
  - Ca sản xuất: **06:00–10:30**, nghỉ trưa, **12:00–16:30**, tăng ca **16:30–17:30** (khi gấp).
  - Năng suất **1,5–1,8 tấn/giờ** thành phẩm.
  - **Thời gian chuyển đổi loại gạo 30–45 phút**, cộng thêm mỗi lần đổi loại và **ghi lại phần chênh lệch**.
- **Hỗ trợ đơn đang chạy dở dang** (ví dụ đã xay 9/10 tấn thì chuyển sang đơn khác).
- **Cảnh báo ⚠ TRỄ HẸN** nếu giờ giao dự kiến vượt hẹn của khách.
- **Thông báo tự động** tới đúng vai trò khi giám đốc điều chỉnh.
- **Nhật ký điều chỉnh** lưu lại ai đã đổi gì, lúc nào.
- **Phân quyền**: chỉ *Giám đốc / Tổ sản xuất* được chỉnh; bán hàng & thu mua chỉ xem và nhận thông báo.

---

## 2. Bài toán mẫu (giống đề bài)

> Đơn 1: 10 tấn gạo tròn mới + 9 tấn gạo sang dân · Đơn 2: 21 tấn gạo dẻo BC + 13 tấn gạo gãy · Đơn 3: 19 tấn gạo ải.
> Đang chạy dở **9/10 tấn** gạo tròn mới của Đơn 1 thì **khách Đơn 3 cần gấp** → đưa Đơn 3 lên ưu tiên số 1.

App sẽ: chèn thời gian chuyển đổi tròn mới → gạo ải, bật tăng ca, rồi tính lại giờ giao cho cả 3 đơn và
báo cho mọi người. Dữ liệu mẫu này **đã có sẵn** khi bạn chạy lần đầu (xem `src/store.js`).
Chạy thử nhanh logic: `npm test`.

---

## 3. Yêu cầu

- **Node.js 18 trở lên** (tải tại https://nodejs.org).
- Một tài khoản Telegram.
- (Khi chạy thật) một chỗ đặt máy chủ có **HTTPS** — Telegram bắt buộc Mini App phải là `https://`.

---

## 4. Chạy thử trên máy (không cần Telegram)

```bash
cd thanh-huong-sanxuat
npm install
# Mở chế độ DEV để test bằng trình duyệt:
ALLOW_INSECURE=1 npm start
```
Mở trình duyệt vào **http://localhost:3000** — bạn vào với quyền Giám đốc (DEV) để thử mọi chức năng.

> Ở chế độ DEV, app không gửi Telegram; nội dung thông báo được in ra màn hình console để bạn xem thử.

---

## 5. Tạo Bot Telegram (BotFather)

1. Mở Telegram, tìm **@BotFather** → gõ `/newbot`.
2. Đặt tên (VD *Gạo Thạnh Hương*) và username kết thúc bằng `bot` (VD `gao_thanhhuong_bot`).
3. BotFather trả về một **TOKEN** dạng `123456:ABC-...` → copy lại.
4. Lấy **Telegram id của giám đốc**: nhắn cho **@userinfobot**, nó trả về con số id.

Tạo file cấu hình:
```bash
cp .env.example .env
```
Mở `.env` và điền:
```
TELEGRAM_BOT_TOKEN=123456:ABC-...        # token vừa lấy
WEBAPP_URL=https://<địa-chỉ-của-bạn>/    # điền sau khi deploy ở bước 6
ADMIN_IDS=<id_giám_đốc>                   # có thể thêm nhiều id, cách nhau dấu phẩy
PORT=3000
```

---

## 6. Đưa app lên Internet (có HTTPS)

Chọn **một** trong các cách sau.

### Cách A — Render.com (miễn phí, dễ nhất)
1. Đẩy thư mục này lên một repo GitHub.
2. Vào https://render.com → **New → Web Service** → chọn repo.
3. Build Command: `npm install` · Start Command: `npm start`.
4. Thêm biến môi trường (Environment) đúng như file `.env` (trừ `ALLOW_INSECURE`).
5. Render cấp cho bạn URL dạng `https://gao-thanhhuong.onrender.com` → dán vào `WEBAPP_URL`, lưu và deploy lại.

### Cách B — Railway.app
Tương tự Render: New Project → Deploy from repo → thêm biến môi trường → lấy URL HTTPS.

### Cách C — VPS của bạn (đã có tên miền + SSL)
```bash
npm install
node server.js        # nên chạy nền bằng pm2:  npm i -g pm2 && pm2 start server.js
```
Đặt Nginx/Caddy làm HTTPS reverse proxy trỏ về cổng 3000.

### Cách D — Test nhanh bằng tunnel (không cần deploy)
```bash
npm start
# cửa sổ khác:
npx cloudflared tunnel --url http://localhost:3000
```
Lấy URL `https://...trycloudflare.com` mà lệnh in ra, dán vào `WEBAPP_URL`, khởi động lại server.

---

## 7. Gắn Mini App vào Bot

Sau khi có `WEBAPP_URL` chạy được, vào **@BotFather**:

- `/setmenubutton` → chọn bot của bạn → dán `WEBAPP_URL` → đặt nhãn nút, VD **"Điều phối sản xuất"**.

Từ đó, mở bot trong Telegram sẽ thấy nút mở app ngay cạnh ô nhập tin nhắn.
Ngoài ra bot còn các lệnh: `/start` (đăng ký vai trò), `/app` (mở app), `/lich` (xem lịch nhanh), `/vaitro` (đổi vai trò).

---

## 8. Cách dùng hằng ngày

1. **Mỗi nhân viên** mở bot → `/start` → chọn đúng **vai trò** (giám đốc / tổ sản xuất / bán hàng / thu mua). Chỉ cần làm một lần.
2. **Giám đốc** mở Mini App:
   - Đặt **"Loại gạo đang chạy"** và **"Bắt đầu tính từ"** cho khớp thực tế đầu ca.
   - Thêm/sửa đơn ở tab **📋 Đơn hàng**; nhập số tấn và số tấn đã xong.
   - Có đơn gấp → bấm **🔴 Gấp** (hoặc mũi tên ▲▼ để sắp lại).
   - Bấm **📥 Cập nhật tiến độ** trong ca để nhập số tấn đã chạy xong.
3. Mỗi lần điều chỉnh, hệ thống **tự tính lại giờ giao** và **gửi thông báo** cho tất cả mọi người.
   Xem chi tiết các lần đổi loại gạo ở tab **🔄 Chuyển đổi**, và ai đã đổi gì ở tab **🕘 Lịch sử**.

---

## 9. Cấu trúc dự án

```
thanh-huong-sanxuat/
├── server.js              # Máy chủ web + API + khởi động bot
├── package.json
├── .env.example           # Mẫu cấu hình
├── test-scheduler.js      # Kiểm thử logic xếp lịch (npm test)
├── src/
│   ├── store.js           # Lưu dữ liệu vào data/db.json (kèm dữ liệu mẫu)
│   ├── bot.js             # Bot Telegram: đăng ký vai trò, mở app, /lich
│   ├── notify.js          # Soạn & gửi thông báo theo vai trò
│   ├── telegramAuth.js    # Xác thực initData của Telegram Web App
│   └── roles.js           # Danh mục vai trò & quyền
└── public/
    ├── index.html         # Giao diện Mini App
    ├── styles.css
    ├── app.js             # Logic phía người dùng
    └── scheduler.js       # ⭐ Bộ máy xếp lịch (dùng chung server + client)
```

---

## 10. Cách hệ thống tính giờ (tóm tắt)

- Sắp các đơn theo ưu tiên → duyệt từng loại gạo còn phải sản xuất.
- Mỗi khi **đổi loại gạo khác** loại đang trên máy → cộng **30–45 phút** và ghi lại "delta".
- Sản xuất `số tấn ÷ năng suất × 60` phút, "chạy" qua các khung giờ ca (bỏ giờ nghỉ, sang ngày mới nếu cần).
- **Giờ sớm nhất** = năng suất 1,8 t/h + đổi loại 30′; **giờ muộn nhất** = 1,5 t/h + đổi loại 45′.
- Có đơn **Gấp** → tự bật tăng ca 16:30–17:30 để tính.

Muốn đổi ca, năng suất, thời gian chuyển đổi: vào tab **⚙️ Cấu hình** trong app (quyền giám đốc).

---

## 11. Ghi chú bảo mật

- Không commit file `.env` (đã có trong `.gitignore`).
- Chỉ Telegram id trong `ADMIN_IDS` hoặc vai trò *Giám đốc / Tổ sản xuất* mới sửa được dữ liệu.
- Mọi yêu cầu sửa đều được xác thực chữ ký `initData` của Telegram ở phía máy chủ.
- **Không** đặt `ALLOW_INSECURE=1` khi chạy thật.

---

## 12. Lưu dữ liệu BỀN bằng Google Firestore (miễn phí)

Render Free xoá ổ đĩa mỗi lần deploy nên dữ liệu file sẽ mất. Cấu hình Firestore để lưu bền:

1. Vào https://console.firebase.google.com (đăng nhập Google) → **Add project** → đặt tên → tạo (tắt Analytics cho gọn).
2. Menu trái **Build → Firestore Database** → **Create database** → chọn **Production mode** → vùng gần (asia-southeast1).
3. Vào **Project settings (⚙️) → Service accounts** → **Generate new private key** → tải về file JSON.
4. Trên Render, mở service → **Environment** → **Add Environment Variable**:
   - Key: `FIREBASE_SERVICE_ACCOUNT`
   - Value: dán **toàn bộ nội dung** file JSON vừa tải (mở bằng Notepad, copy hết).
   - **Save changes** → Render deploy lại.
5. Xem **Logs**, thấy dòng `💾 Lưu trữ: Google Firestore (bền lâu).` là xong — dữ liệu giờ không mất khi deploy/ngủ dậy.

Không có biến này thì app vẫn chạy nhưng lưu file (mất khi Render Free restart).
