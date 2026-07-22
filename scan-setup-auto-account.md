# Kế hoạch Thực hiện: Option C cho Lô quét SĐT & Tự động chọn Tài khoản Zalo duy nhất

> **Mục tiêu:** 
> 1. Triển khai **Phương án C** cho phần Quét SĐT (Xem lại Cấu hình Setup ban đầu + Báo cáo Nhãn đã gán trên giao diện & bảng kết quả).
> 2. Cải tiến cơ chế chọn tài khoản: Khi Zagi chỉ kết nối **1 tài khoản Zalo**, hệ thống sẽ **mặc định chọn tự động** tài khoản đó ở Workflow, CRM, Quét SĐT, Báo cáo... tránh phải chọn thủ công.

---

## 📋 Chi tiết các hạng mục thay đổi

### Hạng mục 1: Triển khai Phương án C - Chi tiết Setup & Nhãn Lô Quét (`PhoneScanPanel.tsx`)

#### 1.1 Header Info Banner (Cấu hình Setup ban đầu & Báo cáo)
- Tạo Card thông tin cố định ở đầu màn hình Chi tiết Lô quét bên phải (Sticky Header Banner):
  - **Tài khoản phụ trách:** Hiển thị Avatar + Tên tài khoản Zalo đã gán (`assigned_account_id`), hoặc "Tất cả tài khoản".
  - **Giới hạn quét:** `daily_limit` (Số/ngày) & `hourly_limit` (Số/giờ).
  - **Nhãn tự động gán:** Render các Badge Nhãn (CRM Tag Badges) lấy từ `auto_tag_ids` (chuyển đổi ID nhãn thành Tên + Màu sắc hiển thị).
  - **Tùy chọn nâng cao:** Bỏ qua SĐT đã có trong CRM (`skip_crm_existing`), Auto Workflow kích hoạt (`auto_workflow_id`).
  - **Thống kê Báo cáo:** Hiển thị tổng số SĐT đã gán nhãn thành công & Tỷ lệ tìm thấy.

#### 1.2 Bảng danh sách kết quả SĐT & Nhãn đã gán
- Thêm cột **"Nhãn CRM đã gán"** trong bảng `ScanItem`:
  - Với mỗi SĐT có trạng thái `found` (Tìm thấy), hiển thị các Badge Nhãn tương ứng đã được gán vào CRM.
- Thêm thông tin Nhãn vào tính năng **Xuất báo cáo (CSV/Excel)** khi lô quét hoàn thành.

---

### Hạng mục 2: Tự động chọn Tài khoản Zalo duy nhất (Auto-Select Single Account)

#### 2.1 Workflow Editor (`WorkflowEditor.tsx`)
- **Hiện trạng:** Khi chỉ có 1 tài khoản Zalo, dropdown hiển thị `Tất cả tài khoản Zalo (1)` kèm cảnh báo `⚠ Chưa chọn tài khoản`.
- **Cải tiến:** 
  - Khi khởi tạo/mở Workflow Editor, nếu danh sách tài khoản `filteredAccounts.length === 1` và `pageIds` đang rỗng, tự động add ID tài khoản đó vào `workflowMeta.pageIds`.
  - Hiển thị badge xanh: `✓ Đã chọn tài khoản: [Tên tài khoản]`.

#### 2.2 Account Store & Hooks (`accountStore.ts`, `useVisibleAccounts.ts`)
- Trong `setAccounts` của `accountStore`: Nếu danh sách tài khoản Zalo active chỉ có 1 tài khoản và `activeAccountId` chưa được chọn, tự động set `activeAccountId` = ID tài khoản duy nhất đó.

#### 2.3 CRM & Quét SĐT (`PhoneScanPanel.tsx`, `TargetSelector.tsx`, `CRMSearchTab.tsx`)
- Khi mở modal **Tạo lô quét mới** hoặc chọn Target Selector trong CRM/Campaign:
  - Kiểm tra số lượng tài khoản Zalo khả dụng. Nếu `accounts.length === 1`, mặc định gán `formAccountId` = ID tài khoản đó thay vì giữ giá trị `null` (Tất cả).

#### 2.4 Báo cáo & TopBar Account Selector
- Kiểm tra các bộ lọc tài khoản trong các tab Báo cáo / Analytics, tự động đặt mặc định là tài khoản duy nhất khi chỉ có 1 kết nối.

---

## 🧪 Kế hoạch Kiểm tra & Xác minh (Verification Plan)

### 1. Kiểm tra Lô Quét (Option C)
- Chọn 1 Lô quét ở danh sách bên trái.
- Đảm bảo Info Banner trên cùng hiển thị chính xác các thông số setup ban đầu (Tài khoản, Giới hạn, Danh sách Nhãn gán).
- Kiểm tra bảng danh sách SĐT bên phải: Các SĐT `Tìm thấy` hiển thị đầy đủ Badge Nhãn đã gán.

### 2. Kiểm tra Auto-Select Single Account
- **Testcase 1 (1 Tài khoản Zalo):** Mở Workflow Editor -> Đảm bảo tài khoản duy nhất đã được tick chọn tự động, không còn cảnh báo vàng.
- **Testcase 2 (1 Tài khoản Zalo):** Mở "Tạo lô quét mới" -> Đảm bảo ô chọn Tài khoản đã tự động điền tên tài khoản duy nhất.
- **Testcase 3 (Nhiều Tài khoản Zalo):** Đảm bảo tính năng chọn nhiều/tất cả vẫn hoạt động bình thường như cũ không bị ảnh hưởng.
