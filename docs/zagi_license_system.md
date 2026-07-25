# 🔑 Hệ thống Quản lý Bản quyền (License Management System) - Zagi v3.0.6

Tài liệu này mô tả chi tiết kiến trúc, luồng hoạt động, cấu trúc dữ liệu và cơ chế bảo mật của hệ thống quản lý bản quyền **Supabase Hybrid Cloud Engine** trên ứng dụng **Zagi v3.0.6**.

---

## 1. Tổng quan Kiến trúc (Architecture Overview)

Hệ thống quản lý bản quyền của Zagi v3.0.6 hoạt động theo mô hình **Local-first kết hợp Supabase Native REST API & Edge Functions**, bao gồm ba thành phần chính:

1. **Client-side (Electron Main Process):** Được điều khiển bởi [LicenseManager.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/license/LicenseManager.ts). Chịu trách nhiệm mã hóa `safeStorage`, lưu trữ thông tin bản quyền cục bộ (`license.dat`), khóa thiết bị phần cứng `boss_machine_id`, thực thi giới hạn `max_employees` / `max_zalo_accounts`, và kiểm soát quyền truy cập.
2. **Supabase Database & Dynamic Pricing:** Toàn bộ bản quyền (188+ khách hàng) được lưu trữ tại bảng `licenses`. Bảng giá động được lưu tại bảng `plans` của Supabase Project `paxejunvgfhjdyulzutb.supabase.co`. Tốc độ phản hồi API cực nhanh (**~0.05 giây**).
3. **SePay Webhook & Auto Activation (Edge Function 24/7):** Edge Function `sepay-webhook` nhận dữ liệu chuyển khoản MB Bank `422777999` từ SePay.vn 24/7/365, tự động đổi `status = 'active'` cho khách hàng trong 1-2 giây ngay sau khi thanh toán.

```mermaid
graph TD
    A[Zagi Client App] -->|1. REST API Verify / Register (0.05s)| B[Supabase Cloud Database]
    A -->|2. Encrypt safeStorage| C[(license.dat)]
    D[Khách quét VietQR MB Bank 422777999] -->|3. Tiền vào MB Bank| E[SePay.vn Gateway]
    E -->|4. HTTP POST Webhook (24/7)| F[Supabase Edge Function: sepay-webhook]
    F -->|5. Auto PATCH status='active'| B
    F -->|6. Trigger Mail Notice| G[Google Mail Service]
```

---

## 2. Cấu hình & Kết nối API (API Configuration)

Thông tin kết nối Supabase Cloud được quản lý động qua `LicenseManager.ts`:

*   **Supabase URL:** `https://paxejunvgfhjdyulzutb.supabase.co`
*   **Supabase Key:** `sb_publishable_lBfBOFuvMYCFxWl2X-yA3g_deMkL9Yo`
*   **Edge Function Webhook:** `https://paxejunvgfhjdyulzutb.supabase.co/functions/v1/sepay-webhook`
*   **Ngân hàng nhận thanh toán:**
    *   **Ngân hàng:** MB Bank (Ngân hàng Quân Đội)
    *   **Số tài khoản:** `422777999`
    *   **Tên tài khoản:** `CONG TY CO PHAN BASAN`
    *   **VietQR Format:** `https://img.vietqr.io/image/MB-422777999-compact2.png...`

---

## 3. Các Luồng Nghiệp Vụ Chính (Core Workflows)

### 3.1. Đăng ký Dùng Thử 14 Ngày (`trial`)
*   Khách chọn gói dùng thử 14 ngày (`trial`).
*   System tự động sinh key `ZAGI-TRIAL-XXXX-YYYY`.
*   Tự động tính ngày hết hạn: `Expiry Date = NOW() + 14 ngày`.
*   Lưu dòng mới lên Supabase với `status = 'active'`, tự động gán `boss_machine_id` máy Sếp.

### 3.2. Đăng ký Gói Trả Phí (`solo_6m`, `solo_12m`, `solo_lifetime`, `team_6m`, `team_12m`, `team_lifetime`)
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
| `solo_6m` | Gói Solo 6 tháng | 2.450.000đ | `solo` | 0 máy (Chỉ máy BOSS) |
| `solo_12m` | Gói Solo 12 tháng | 4.450.000đ | `solo` | 0 máy (Chỉ máy BOSS) |
| `solo_lifetime` | Gói Solo Vĩnh viễn | 7.450.000đ | `solo` | 0 máy (Chỉ máy BOSS) |
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
