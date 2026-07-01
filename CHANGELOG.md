# Changelog - Zagi

Tất cả các thay đổi lớn và cập nhật sửa lỗi của dự án Zagi sẽ được ghi lại tại đây.

---

## [v27.2.1] - 2026-07-01

### Thay đổi & Tính năng mới

- **Bộ lọc CRM Nâng cao & Xem trước đối tượng trong Workflow (CRM Filters & Preview Modal):**
  - Bổ sung trường tìm kiếm tự do theo Tên/SĐT/Biệt danh/ID Zalo (`searchQuery`), lọc theo xưng hô (`salutation`), và lọc nhãn Zalo (`zaloLabelIds`) trong schema cấu hình của node `crm.getContacts` ở frontend.
  - Tích hợp nút **"Xem trước danh sách liên hệ lọc được"** ở cuối form cấu hình node, kết nối qua IPC handler `crm:previewWorkflowContacts` để truy vấn danh sách liên hệ thực tế thỏa mãn bộ lọc.
  - Thiết kế modal xem trước đối tượng lọc được, tự động hiển thị avatar nhóm (`GroupAvatar` composite) và việt hóa các nhãn, icon giới tính (`Nam`, `Nữ`, `Nhóm`), kênh liên lạc (`Zalo`, `Facebook`), mối quan hệ (`Bạn bè`, `Chưa kết bạn`).
- **Tích hợp tính năng Giải tán nhóm hàng loạt (Bulk Disperse Group):**
  - Hỗ trợ thêm tùy chọn **Giải tán nhóm** ngay trong modal dọn dẹp nhóm hàng loạt (`SmartGroupModal.tsx`) đối với các nhóm mà tài khoản của người dùng là Trưởng nhóm (Owner).
  - Tách biệt rõ ràng giao diện nhượng quyền/giải tán bằng các nút Selector chuyển đổi trực quan, hiển thị cảnh báo đỏ chi tiết để phòng tránh rủi ro thao tác sai và tự động dọn dẹp sạch cơ sở dữ liệu local sau khi giải tán thành công.
- **Tối ưu hóa cấu hình Node Chờ (Wait Node Upgrades):**
  - Cho phép người dùng nhập thời gian chờ linh hoạt theo số Ngày (`days`), Giờ (`hours`), Phút (`minutes`), và Giây (`seconds`) trên giao diện cấu hình của node `logic.wait`, thay vì chỉ cho phép nhập số giây thô như trước.
  - Tích hợp logic tính toán thời gian trễ cộng dồn ở cả backend và bộ Sandbox dry-run, đồng thời hỗ trợ tương thích ngược hoàn hảo với các workflow cũ đã cấu hình trường `delaySeconds` hoặc `delayMs`.
- **Cải tiến & Dọn dẹp tính năng Lịch sử Nhóm (Zalo Group History Cleanup):**
  - Loại bỏ hoàn toàn nút **"Tải lại tin nhắn nhóm"** trên thanh tiêu đề hội thoại (`ChatHeader.tsx`) và cấu hình năng lực kênh (`channelConfig.ts`), do API tải lịch sử nhóm cũ đã bị Zalo chính thức ngưng hỗ trợ (trả về lỗi 404).
  - Tối ưu hóa dọn dẹp mã nguồn: Gỡ bỏ state `loadingGroupMsgs` và callback `handleReloadGroupMessages` thừa trong UI component giúp mã nguồn gọn nhẹ và sạch sẽ hơn.
  - Vẫn duy trì cơ chế đồng bộ lũy tiến thông minh ngầm (20 tin/lần, tối đa 100 tin, tự động dừng khi khớp dữ liệu cũ) khi khởi động ứng dụng giúp tự động lấp đầy khoảng trống dữ liệu khi offline mà không cần người dùng thao tác thủ công.

### Sửa lỗi (Bug Fixes)

- **Sửa lỗi Layout Scroll của Node Config Panel:**
  - Khắc phục lỗi flexbox item phình to làm che khuất các trường cấu hình ở chân panel bằng cách thêm class `min-h-0` vào container Form, khôi phục lại cơ chế cuộn dọc `overflow-y-auto` hoàn hảo khi form cấu hình node quá dài.
- **Đồng bộ hóa dữ liệu CRM từ Nhân viên lên Boss:**
  - Cấu hình proxy đồng bộ qua `proxyToBossAsync` cho 5 IPC handlers quan trọng (`db:updateContactProfile`, `db:updateContactPipelineStage`, `db:updateContactAIProfile`, `db:updateContactAIConfig`, `db:updateContactExtraData`).
  - Giờ đây mọi hành động cập nhật thông tin liên hệ, đổi bước phễu khách hàng, AI config của nhân viên sẽ được ghi nhận trực tiếp vào cơ sở dữ liệu gốc của máy Boss và đồng bộ ngược lại các máy khách qua luồng sự kiện SSE, khắc phục lỗi mất/ghi đè dữ liệu khi đồng bộ lại từ Boss.
- **Ẩn thiết lập Webhooks ở chế độ Nhân viên:**
  - Ẩn hoàn toàn tab cấu hình Webhooks khỏi danh sách hiển thị (`Settings.tsx`) đối với tài khoản nhân viên.
  - Kích hoạt cơ chế bảo vệ tự động chuyển hướng người dùng nhân viên ra khỏi URL Webhooks để bảo mật cấu hình của Boss.
- **Sửa giao diện Workflow ở chế độ Sáng (System Theme):**
  - Khắc phục lỗi các hộp Node công việc và bản đồ thu nhỏ (Minimap) hiển thị tông màu tối (Dark Mode) khi người dùng chọn theme Hệ thống (System) chạy trên hệ điều hành đang ở chế độ Sáng.
- **Tối ưu Sandbox Mode và Kiểm định Kho Workflow Mẫu:**
  - Mock node `logic.wait` (bỏ qua delay) và mock Zalo/Casso API trong sandbox mode giúp chạy thử sandbox in-memory tức thời không bị nghẽn.
  - Tạo script kiểm định `scratch/test_all_templates.ts` và kiểm định thành công 100% kho 86 workflow mẫu của hệ thống.
