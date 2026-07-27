# 🔑 Hệ thống Quản lý Bản quyền & Đại Lý Affiliate (License & Affiliate System) - Zagi v3.0.7

Tài liệu này mô tả chi tiết kiến trúc, luồng hoạt động, cấu trúc dữ liệu CSDL Supabase và cơ chế Đại Lý & Hoa Hồng (Affiliate System) Win-Win trên ứng dụng **Zagi v3.0.7**.

---

## 1. Tổng quan Kiến trúc (Architecture Overview)

Hệ thống quản lý bản quyền & đại lý của Zagi v3.0.7 hoạt động theo mô hình **Local-first kết hợp Supabase Native REST API, Edge Functions & Affiliate Engine**, bao gồm bốn thành phần chính:

1. **Client-side (Electron Main Process):** Được điều khiển bởi [LicenseManager.ts](file:///Users/kimtrungduong/Downloads/zagi/src/services/license/LicenseManager.ts). Chịu trách nhiệm mã hóa `safeStorage`, lưu trữ thông tin bản quyền cục bộ (`license.dat`), khóa thiết bị phần cứng `boss_machine_id`, thực thi giới hạn `max_employees` / `max_zalo_accounts`, và kiểm soát quyền truy cập.
2. **Supabase Database & Dynamic Pricing:** Toàn bộ bản quyền được lưu trữ tại bảng `licenses`. Bảng giá động lưu tại bảng `plans`. Hệ thống đại lý & hoa hồng lưu tại 4 bảng (`partner_tiers`, `partners`, `commissions`, `payout_cycles`). Tốc độ phản hồi API cực nhanh (**~0.05 giây**).
3. **SePay Webhook & Auto Activation (Edge Function 24/7):** Edge Function `sepay-webhook` nhận dữ liệu chuyển khoản MB Bank `422777999` từ SePay.vn 24/7/365, tự động đổi `status = 'active'` cho khách hàng trong 1-2 giây ngay sau khi thanh toán và tự động tính hoa hồng cho Đại lý.
4. **Affiliate & Referral Engine (Win-Win):** Sử dụng **Số điện thoại** làm Mã giới thiệu. Người mua nhập mã được **TẶNG THÊM 1 THÁNG** sử dụng; Đại lý nhận hoa hồng trọn đời từ **15% đến 45%** (Trần ngân sách 60%), thanh toán định kỳ vào **ngày 10 hàng tháng**.

```mermaid
graph TD
    A[Zagi Client App / Landing Page] -->|1. REST API Verify / Register (0.05s)| B[Supabase Cloud Database]
    A -->|2. Encrypt safeStorage| C[(license.dat)]
    D[Khách quét VietQR MB Bank 422777999] -->|3. Tiền vào MB Bank| E[SePay.vn Gateway]
    E -->|4. HTTP POST Webhook (24/7)| F[Supabase Edge Function: sepay-webhook]
    F -->|5. Auto PATCH status='active'| B
    F -->|6. Calculate Commission & Insert| H[Supabase Commissions Table]
    F -->|7. Trigger Mail Notice info@zagi.vn| G[Google Mail Service]
```

---

## 2. Cấu hình & Kết nối API (API Configuration)

Thông tin kết nối Supabase Cloud & Support Email được quản lý động qua `LicenseManager.ts`:

*   **Supabase URL:** `https://paxejunvgfhjdyulzutb.supabase.co`
*   **Supabase Key:** `sb_publishable_lBfBOFuvMYCFxWl2X-yA3g_deMkL9Yo`
*   **Email Hỗ Trợ Chính Thức:** `info@zagi.vn`
*   **Edge Function Webhook:** `https://paxejunvgfhjdyulzutb.supabase.co/functions/v1/sepay-webhook`
*   **Ngân hàng nhận thanh toán:**
    *   **Ngân hàng:** MB Bank (Ngân hàng Quân Đội)
    *   **Số tài khoản:** `422777999`
    *   **Tên tài khoản:** `CONG TY CO PHAN BASAN`

---

## 3. Danh Sách Gói Cước & Chính Sách Đại Lý (Plans & Affiliate Policy)

### 3.1. Các Gói Dịch Vụ Chuẩn (v3.0.7)
*   **Gói Dùng Thử 14 Ngày (`trial_14d`):** 0đ (Đầy đủ tính năng, 1 Máy Sếp + 1 Máy Nhân viên).
*   **Gói Solo 6 Tháng (`solo_6m`):** 990.000đ.
*   **Gói Solo 12 Tháng (`solo_12m`):** 1.690.000đ.
*   **Gói Solo 5 Năm (`solo_5y`):** 4.900.000đ — Sử dụng trọn vẹn 5 năm (1.825 ngày).
*   **Gói Team 6 Tháng (`team_6m`):** 4.900.000đ (1 Máy Sếp + 5 Máy Nhân viên).
*   **Gói Team 12 Tháng (`team_12m`):** 8.900.000đ.
*   **Gói Team 5 Năm (`team_5y`):** 14.900.000đ.

### 3.2. Cấp Bậc Đại Lý & Tỷ Lệ Hoa Hồng (`partner_tiers`)
*   **Cộng Tác Viên (`ctv`):** 15% Hoa hồng trực tiếp | Doanh số tích lũy: 0đ.
*   **Đại Lý (`dl`):** 25% Hoa hồng trực tiếp | 5% Hoa hồng đè F2 | Doanh số tích lũy: 5.000.000đ.
*   **Tổng Đại Lý (`tdl`):** 35% Hoa hồng trực tiếp | 10% Hoa hồng đè F2 | Doanh số tích lũy: 30.000.000đ.
*   **Nhà Phân Phối (`npp`):** 45% Hoa hồng trực tiếp | 15% Hoa hồng đè F2 | Doanh số tích lũy: 100.000.000đ.
*   **Chu Kỳ Đối Soát & Thanh Toán:** Ngày **10 hàng tháng** (qua view `view_partner_payout_summary`).
*   Khách chọn gói trả phí ➔ Nhập Email, Họ tên, SĐT.
*   System tạo key `ZAGI-XXXX-YYYY-ZZZZ` trên Supabase với `status = 'pending'`.
*   Hiển thị mã VietQR MB Bank `422777999` với số tiền tương ứng và nội dung chuyển khoản `ZAGI <SHORT_KEY>`.
*   Đồng thời gửi 1 Email thông báo ngầm chứa thông tin chuyển khoản tới Email khách hàng.

### 3.3. Tự Động Kích Hoạt Thanh Toán SePay 24/7 (`sepay-webhook`)
*   Khách hàng quét mã VietQR MB Bank chuyển khoản ➔ SePay nhận biến động số dư trong **2 giây**.
*   SePay bắn Webhook tới Supabase Edge Function `sepay-webhook`.
*   Edge Function đối soát nội dung `ZAGI <KEY>` ➔ Tự động cập nhật `status = 'active'`, tính ngày hết hạn dựa theo bảng giá `plans`, và gửi Email xác nhận kích hoạt cho khách hàng.

---

## 4. Bảng Giá Động (Supabase `plans` Table)

Bảng giá được quản lý trực tiếp trên Supabase database (Bảng `plans`):

| Plan Code | Tên Gói | Giá Niêm Yết | Loại Gói | Giới Hạn Máy Nhân Viên |
| :--- | :--- | :--- | :--- | :--- |
| `solo_6m` | Gói Solo 6 tháng | 990.000đ | `solo` | 0 máy (Chỉ máy BOSS) |
| `solo_12m` | Gói Solo 12 tháng | 1.690.000đ | `solo` | 0 máy (Chỉ máy BOSS) |
| `solo_lifetime` | Gói Solo Vĩnh viễn | 4.900.000đ | `solo` | 0 máy (Chỉ máy BOSS) |
| `team_6m` | Gói Team 6 tháng | 4.900.000đ | `team` | Tối đa 5 máy Nhân viên |
| `team_12m` | Gói Team 12 tháng | 8.900.000đ | `team` | Tối đa 5 máy Nhân viên |
| `team_lifetime` | Gói Team Vĩnh viễn | 14.900.000đ | `team` | Tối đa 20 máy Nhân viên |

*Quản trị viên có thể thay đổi số tiền hoặc ẩn/bật gói bất cứ lúc nào trên Supabase Dashboard mà không cần build lại App Zagi.*

---

## 5. Cơ chế Bộ nhớ đệm & Ngoại tuyến (Caching & Offline Logic)

| Tham số | Giá trị | Ý nghĩa |
| :--- | :--- | :--- |
| **`CACHE_DAYS`** | 3 ngày | Thời gian cho phép sử dụng bản quyền offline từ cache `license.dat`. |
| **`GRACE_PERIOD_DAYS`** | 7 ngày | Thời gian ân hạn sau khi hết hạn. Trong thời gian này, app hiển thị cảnh báo nhưng không khóa hoàn toàn. |
| **`EXPIRY_WARN_DAYS`** | 7 ngày | Bắt đầu hiển thị banner cảnh báo khi bản quyền còn $\le$ 7 ngày. |
| **`TRIAL_DAYS`** | 14 ngày | Thời hạn mặc định cho gói dùng thử Miễn phí. |

---

## 6. Bảo mật Mã hóa Phần cứng (`boss_machine_id` & `safeStorage`)

- Mã hóa chuỗi License bằng `electron.safeStorage` khóa chặt theo hệ điều hành người dùng.
- Khóa phần cứng `boss_machine_id`: Giới hạn mỗi mã Key chỉ được kích hoạt trên 1 máy Sếp duy nhất. 
- Giới hạn số tài khoản Zalo & Số máy Nhân viên kết nối dựa trên thuộc tính `max_employees` và `max_zalo_accounts`.
