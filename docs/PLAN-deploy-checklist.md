# 🚀 PLAN: Kiểm tra trước khi Deploy — Zagi License System

> Mục tiêu: Xác nhận toàn bộ hệ thống license hoạt động đúng trước khi build production.

---

## 📋 Checklist tổng quan

### 1. Google Apps Script (Code.gs)
- [ ] Đã copy code mới vào script.google.com
- [ ] Đã cập nhật `SPREADSHEET_ID` đúng
- [ ] Đã deploy **New Version** (không phải save lại version cũ)
- [ ] Test thủ công: Gọi `doGet` → trả về "Zagi License API v3.0 — OK"
- [ ] Test thủ công: Đăng ký trial → nhận email xác nhận

### 2. .env (secrets)
- [ ] `LICENSE_API_SECRET` khớp với `API_SECRET` trong Code.gs
- [ ] Không có secret nào bị hardcode trong source code

### 3. Electron Build
- [ ] `tsc -p tsconfig.electron.json` → 0 lỗi ✅
- [ ] `tsc -p tsconfig.json` → 0 lỗi (Vite/React side)

### 4. License Gate Flow
- [ ] Không có license.dat → popup xuất hiện
- [ ] Trial → tự động kích hoạt, vào app được
- [ ] License hết hạn > 7 ngày → bị chặn, popup xuất hiện
- [ ] License hết hạn 1-7 ngày → vào app, banner đỏ + chat disabled
- [ ] License còn ≤ 7 ngày → vào app, banner vàng
- [ ] License vĩnh viễn → vào app bình thường, không banner

### 5. Email System
- [ ] Đăng ký trial → user nhận email với license key
- [ ] Đăng ký trial → admin (info@itngon.com) nhận thông báo
- [ ] Đăng ký paid → user nhận email với hướng dẫn thanh toán + QR code
- [ ] Đăng ký paid → admin nhận thông báo "Cần xác nhận thanh toán"

---

## 🔍 Kết quả kiểm tra code (thực hiện bởi agent)

### Electron Process
| File | Trạng thái | Ghi chú |
|------|-----------|---------|
| `LicenseManager.ts` | ✅ OK | Grace period, expiry, no-override bug fixed |
| `LicenseGate.ts` | ✅ OK | 2 IPC mới: `isInGracePeriod`, `isExpiringSoon` |
| `preload.ts` L620-628 | ✅ OK | `licenseAPI` expose đầy đủ 7 methods |

### Renderer (React)
| File | Trạng thái | Ghi chú |
|------|-----------|---------|
| `LicenseWarningBanner.tsx` | ✅ OK | Banner grace (đỏ) + expiring (vàng), dismiss button |
| `App.tsx` L71, L87-91 | ✅ OK | `isInGracePeriod` state, banner render |
| `MessageInput.tsx` L112, L419 | ✅ OK | Chat input disabled trong grace period |

### Google Apps Script
| Tính năng | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `validateEmail()` | ✅ OK | Regex + 30 blocked domains |
| `sendUserConfirmationEmail()` | ✅ OK | HTML email + QR code nếu paid |
| `sendAdminEmail()` (sendNotificationEmail) | ✅ OK | Giữ nguyên từ file cũ |
| Tính ngày hết hạn theo gói | ✅ OK | 6m/12m/lifetime/trial |
| Không gửi expiryDate cho lifetime | ✅ OK | `expiryDate = ''` khi lifetime |

---

## ⚠️ Điểm cần chú ý khi deploy

### isCacheValid vs Grace Period
```
Vấn đề tiềm ẩn: isCacheValid() trả về false khi license expired.
→ Điều này trigger reVerifyInBackground() ngay cả trong grace period.
→ Server verify sẽ check lại và trả về expired → OK, sẽ bị block đúng.
✅ Logic đúng.
```

### expiryDate format trong Apps Script vs LicenseManager
```
Apps Script xuất ra: "dd/MM/yyyy" (e.g. "29/05/2026")
LicenseManager parse: new Date(license.expiryDate)
→ "29/05/2026" → Date parse không chuẩn trên mọi browser/Node.

🔴 CẦN FIX: parseDate trong LicenseManager.ts để hỗ trợ dd/MM/yyyy
```

### Email validation timing
```
validateEmail() chạy trên server (Apps Script) trước khi lưu DB.
→ Nếu email format sai → trả về error ngay, không tạo license.
✅ Đúng flow.
```

---

## 🔴 BUG CẦN FIX TRƯỚC DEPLOY

### Bug #1: expiryDate parse format mismatch

**Vị trí:** `LicenseManager.ts` → `getCurrentLicense()` L244 và `verifyEmail()` L151

**Nguyên nhân:**
- Apps Script ghi `expiryDate` dạng `"29/05/2026"` (dd/MM/yyyy)
- `new Date("29/05/2026")` → Invalid Date trên Node.js
- Kết quả: `daysLeft = NaN` → `status` tính sai

**Fix cần thiết:** Thêm helper `parseDateDDMMYYYY()` và dùng nó thay cho `new Date(license.expiryDate)`.

---

## 🏁 Bước tiếp theo

1. **Fix Bug #1** (expiryDate parse) — quan trọng nhất
2. **Deploy Code.gs** lên Google Apps Script
3. **Build production**: `npm run build`
4. **Test end-to-end** với email thật

