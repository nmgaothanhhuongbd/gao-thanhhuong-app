# 🏭 HƯỚNG DẪN TỪ ĐẦU ĐẾN CUỐI
## App Điều Phối Sản Xuất — Nhà máy Xay xát Gạo Thạnh Hương

> Làm đúng thứ tự từ trên xuống. Tổng thời gian ~25 phút. **Chi phí: 0đ.**
> Chỗ nào kẹt cứ chụp màn hình gửi lại hỏi.

---

## 🧩 Hiểu nhanh 3 phần (đọc 30 giây)

| Nơi | Vai trò | Bro đụng tới khi nào |
|---|---|---|
| **GitHub** | Chứa CODE (bộ não app) | Chỉ khi đổi code (hiếm) |
| **Render** | CHẠY code, bật 24/7 | Cài 1 lần lúc đầu |
| **Firebase** | Chứa DỮ LIỆU (đơn, tồn kho) | Cài 1 lần, sau đó tự chạy |

Dùng hằng ngày (thêm đơn, đổi ưu tiên, tồn kho) → chỉ mở **Telegram**, không đụng 3 chỗ trên.

---

# PHẦN 1 — CHUẨN BỊ FILE (2 phút)

**1.1.** Tải file `thanh-huong-sanxuat-goi-cai-dat-v3.zip`

**1.2.** Bấm đúp để giải nén → được thư mục `thanh-huong-sanxuat`

**1.3.** Mở thư mục đó, kiểm tra bên trong có đủ:
- `server.js`
- `package.json`
- `README.md`
- `test-scheduler.js`
- thư mục **`src`**
- thư mục **`public`**

✅ Đủ 6 thứ trên là được. (2 file ẩn `.env.example`, `.gitignore` không thấy cũng không sao.)

---

# PHẦN 2 — ĐƯA CODE LÊN GITHUB (5 phút)

**2.1.** Vào **github.com** → mở repo **`gao-thanhhuong-app`**

**2.2.** Bấm nút **`Add file`** (góc phải, cạnh nút Code xanh) → chọn **`Upload files`**

**2.3.** Mở thư mục `thanh-huong-sanxuat` → **chọn tất cả bên trong** (bao gồm 2 thư mục `src`, `public`) → **kéo thả** vào khung upload

> ⚠️ **QUAN TRỌNG:** Kéo *các thứ BÊN TRONG* thư mục.
> Đúng: `server.js` nằm ở gốc repo.
> Sai: kéo cả thư mục cha vào (sẽ thành `thanh-huong-sanxuat/server.js` → Render không chạy được).

**2.4.** Chờ nạp xong, thấy danh sách file hiện ra

**2.5.** Kéo xuống cuối → bấm nút xanh **`Commit changes`**

✅ **Kiểm tra:** Repo phải thấy `server.js`, `package.json`, `src/`, `public/`

---

# PHẦN 3 — TẠO KHO DỮ LIỆU FIREBASE (8 phút)

**3.1.** Vào **console.firebase.google.com** → đăng nhập bằng **Gmail**

**3.2.** Bấm **`Add project`** (hoặc `Tạo dự án`)

**3.3.** Đặt tên: `gao-thanhhuong` → **Continue**

**3.4.** Màn hình Google Analytics → **TẮT** (gạt nút off cho gọn) → **Create project**

**3.5.** Chờ ~30 giây → **Continue**

**3.6.** Menu bên trái: **`Build`** → **`Firestore Database`**

**3.7.** Bấm **`Create database`**

**3.8.** Chọn **`Production mode`** → **Next**

**3.9.** Chọn vùng: **`asia-southeast1 (Singapore)`** → **Enable**

**3.10.** Chờ tạo xong (~1 phút)

### Lấy chìa khoá kết nối

**3.11.** Bấm **⚙️ (bánh răng, góc trên trái)** → **`Project settings`**

**3.12.** Chọn tab **`Service accounts`**

**3.13.** Bấm **`Generate new private key`** → hộp thoại hiện ra → **`Generate key`**

**3.14.** Máy tải về **1 file JSON** (tên dạng `gao-thanhhuong-xxxxx.json`)

> 🔒 **File này là CHÌA KHOÁ BÍ MẬT.**
> - KHÔNG gửi cho ai
> - KHÔNG đưa lên GitHub
> - Chỉ dán vào Render ở bước sau

---

# PHẦN 4 — NỐI FIREBASE VÀO RENDER (3 phút)

**4.1.** Mở file JSON vừa tải bằng **TextEdit** (Mac) hoặc **Notepad** (Windows)

**4.2.** **Chọn hết** (Cmd+A / Ctrl+A) → **Copy** (Cmd+C / Ctrl+C)

**4.3.** Vào **dashboard.render.com** → mở service **`gao-thanhhuong`**

**4.4.** Menu trái → **`Environment`**

**4.5.** Bấm **`Add Environment Variable`**, điền:

| Ô | Điền |
|---|---|
| **Key** | `FIREBASE_SERVICE_ACCOUNT` |
| **Value** | Dán toàn bộ nội dung JSON vừa copy (cả dấu `{` và `}`) |

**4.6.** Kiểm tra lại đủ 3 biến này (có sẵn từ trước):
- `TELEGRAM_BOT_TOKEN` = token từ BotFather
- `ADMIN_IDS` = id Telegram giám đốc
- `WEBAPP_URL` = địa chỉ https của app
- `FIREBASE_SERVICE_ACCOUNT` = vừa thêm

> ❌ KHÔNG thêm biến `PORT` (Render tự cấp)
> ❌ KHÔNG thêm `ALLOW_INSECURE`

**4.7.** Bấm **`Save changes`** → Render tự deploy lại (~3 phút)

---

# PHẦN 5 — KIỂM TRA (2 phút)

**5.1.** Trong Render, mở tab **`Logs`**

**5.2.** Tìm dòng này:

```
💾 Lưu trữ: Google Firestore (bền lâu).
🚀 Server chạy tại ...
```

✅ Thấy chữ **"Google Firestore (bền lâu)"** = THÀNH CÔNG! Dữ liệu không mất nữa.

❌ Nếu thấy **"file cục bộ"** = biến `FIREBASE_SERVICE_ACCOUNT` dán chưa đúng → xem mục Xử lý lỗi bên dưới.

**5.3.** Mở bot trên Telegram → bấm nút mở app → phải thấy **bảng 4 cột** và nút **📦 Tồn kho**

**5.4. Thử nghiệm quan trọng nhất:**
1. Thêm 1 đơn hàng bất kỳ trong app
2. Vào Render bấm **`Manual Deploy`** → **`Deploy latest commit`**
3. Chờ Live → mở lại app
4. **Đơn hàng vẫn còn** = Firestore hoạt động hoàn hảo 🎉

---

# PHẦN 6 — THÊM NHÂN VIÊN (mỗi người 1 phút)

**6.1.** Gửi link bot cho nhân viên: `https://t.me/<tên_bot_của_bạn>`

**6.2.** Nhân viên mở link → bấm **`Start`**

**6.3.** Chọn đúng vai trò của mình:
- 👔 Giám đốc — *được sửa*
- ⚙️ Tổ sản xuất — *được sửa*
- 🧾 Nhân viên bán hàng — *chỉ xem + nhận thông báo*
- 🌾 Nhân viên thu mua — *chỉ xem + nhận thông báo*

Xong. Từ đó mỗi khi giám đốc điều chỉnh, họ tự nhận thông báo.

---

# PHẦN 7 — GIỮ APP LUÔN TỈNH (tuỳ chọn, 3 phút)

Render Free ngủ sau 15 phút không dùng → lần bấm sau chờ ~1 phút. Khắc phục miễn phí:

**7.1.** Vào **uptimerobot.com** → đăng ký free

**7.2.** **`Add New Monitor`**:
- Monitor Type: **HTTP(s)**
- Friendly Name: `Gao Thanh Huong`
- URL: `https://<địa-chỉ-app>/api/health`
- Monitoring Interval: **5 minutes**

**7.3.** **`Create Monitor`** → xong, app luôn sẵn sàng.

---

# 🛠 XỬ LÝ LỖI THƯỜNG GẶP

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| Logs vẫn báo **"file cục bộ"** | Biến Firebase dán thiếu/sai | Dán lại **toàn bộ** JSON, đủ cả `{` `}`, không thừa dấu cách |
| Build **Failed** | Repo lộn code khác / thiếu package.json | Kiểm tra repo có `package.json` ở gốc |
| Bot không trả lời `/start` | App đang ngủ hoặc sai token | Mở URL app cho nó dậy; kiểm tra `TELEGRAM_BOT_TOKEN` |
| Mở app báo lỗi xác thực | Thiếu `WEBAPP_URL` | Thêm biến `WEBAPP_URL` = URL app, có `https://` |
| Nút app không hiện trong bot | Chưa gắn menu | BotFather → `/setmenubutton` → dán URL |

---

# 📋 GHI NHỚ NHANH

**Giới hạn Firebase miễn phí (gói Spark):**
- Dung lượng **1 GB** — app này dùng vài chục KB → **xài nhiều năm không hết 1%**
- 50.000 lượt đọc + 20.000 lượt ghi **mỗi ngày** → dùng thực tế còn xa mới tới
- **Không giới hạn thời gian, không tự xoá** dữ liệu
- **Không cần thẻ tín dụng** (chỉ Cloud Storage mới cần — app này không dùng)

**Dùng hằng ngày:**
- Đầu ca: chỉnh **"Loại gạo đang chạy"** + **"Bắt đầu tính"** cho khớp thực tế
- Nhập **📦 Tồn kho** → hệ thống tự trừ vào đơn cùng loại → giờ giao tính lại
- Có đơn gấp → bấm **🔴 Gấp** → tự lên số 1, bật tăng ca, báo cả nhóm
- Sửa tiến độ ngay trên bảng (cột 4) → lưu im lặng, không làm phiền ai
- Chỉnh **⚙️ Năng suất/Ca** khi sản lượng thực tế thay đổi

---

*Tài liệu kèm gói cài đặt `thanh-huong-sanxuat-goi-cai-dat-v3.zip`*
