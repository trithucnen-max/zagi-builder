# Changelog - Zagi

Tất cả các thay đổi lớn và cập nhật sửa lỗi của dự án Zagi sẽ được ghi lại tại đây.

---

## [v27.2.2] - 2026-07-01

### Thay đổi & Tính năng mới

- **Mở rộng bộ lọc ngày sinh trong Workflow CRM (Birthday Filter Expansion):**
  - Tích hợp thêm hai tùy chọn **"Sinh nhật tuần này"** (lọc tự động theo các ngày từ Thứ Hai đến Chủ Nhật của tuần hiện tại theo giờ Việt Nam UTC+7) và **"Sinh nhật tháng này"** (lọc theo tháng hiện tại) cho node `crm.getContacts` trong Workflow.
  - Thay thế trường Switch cấu hình `birthdayToday` cũ bằng trường Select `birthdayFilter` trong [NodeConfigPanel.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/NodeConfigPanel.tsx) trực quan hơn.
  - Hỗ trợ tương thích ngược (fallback) tự động ánh xạ cấu hình `birthdayToday: true` cũ thành `birthdayFilter: 'today'` tại cả Renderer và Backend.
- **Tính năng Hoàn tác / Làm lại (Undo/Redo Support):**
  - Tích hợp phím nóng `Ctrl + Z` / `Ctrl + Y` (hoặc `Cmd + Z` / `Cmd + Y`) và hai nút bấm ↩️ / ↪️ trên thanh công cụ đầu trang giúp dễ dàng quay lại các thao tác kéo thả node, nối dây, hoặc xóa.
- **Tự động sắp xếp sơ đồ kịch bản (Auto Align Nodes):**
  - Phát triển thuật toán duyệt cây theo chiều rộng (BFS Level-by-Level Layout) giúp tự động căn chỉnh các Node kịch bản cân đối, thẳng hàng chỉ bằng một click qua nút bấm **✨ Căn chỉnh** mới trên thanh công cụ.
- **Kiểm tra vòng lặp vô hạn (Cycle Detection):**
  - Tự động phát hiện và chặn các kết nối tạo thành vòng lặp vô tận, hiển thị cảnh báo đỏ thân thiện ngăn ngừa lỗi cấu hình.
- **Tự động lưu ngầm (Silent Auto-save):**
  - Tự động lưu ngầm dữ liệu kịch bản xuống DB SQLite sau mỗi lần kéo thả kết thúc hoặc thay đổi kết nối mà không hiển thị popup gây gián đoạn công việc của người dùng.
- **Xem chi tiết biến tại chỗ (Tooltip preview):**
  - Di chuột qua các tag biến động trong ô soạn tin để xem chi tiết cú pháp gốc (VD: `{{ $item.salutation }}`) và mô tả chi tiết của biến động đó.
- **Tối ưu hóa & Mở rộng kho mẫu kịch bản (Templates Library):**
  - Đổi biến chào CRM cũ trong kịch bản mẫu sang dạng Zalo-native lịch sự hơn là `{{ $item.salutation }} {{ $item.display_name }}`.
  - Bổ sung 3 mẫu kịch bản nâng cao mới: *AI Phân loại & Chăm sóc KH Tiềm năng* (`tpl-ai-lead-scoring`), *Chăm sóc sau sự kiện Mở bán BĐS* (`tpl-re-event-followup`), và *Nhắc lịch hẹn dịch vụ từ POS (KiotViet/Sapo)* (`tpl-pos-appointment-reminder`).

### Sửa lỗi (Bug Fixes)

- **Kết nối thông minh & Gợi ý tạo Node nhanh (Smart Connect):**
  - Sửa lỗi Menu gợi ý không hiển thị khi kéo nối ra khoảng không trống bằng cách áp dụng `document.elementFromPoint(clientX, clientY)` để định vị chuẩn xác phần tử dưới con trỏ chuột tại thời điểm nhả chuột.
- **Khắc phục lỗi khởi tạo cơ sở dữ liệu (Database is not initialized) & Đồng bộ SSE:**
  - Thêm cơ chế tự động thử lại (retry sau 500ms) nếu Database Service khởi tạo thất bại lần đầu tiên trong [main.ts](file:///Users/kimtrungduong/Downloads/deplao/electron/main.ts).
  - Sửa đổi IPC `sync:getStatus` trong [syncIpc.ts](file:///Users/kimtrungduong/Downloads/deplao/electron/ipc/syncIpc.ts) để đọc `lastSyncTs` từ [workspaces.json](file:///Users/kimtrungduong/Library/Application Support/zagi/workspaces.json) (qua `WorkspaceManager`) làm nguồn dữ liệu chính thay vì truy cập DB trực tiếp, giải quyết triệt để vòng lặp Full-Sync vô hạn khi DB có độ trễ khởi tạo.
  - Bổ sung phương thức kiểm tra công khai `getIsInitialized()` cùng logs giám sát 8 bước chi tiết và health check tự động (1s, 5s, 15s) cho `global.db`.
- **Sửa lỗi hiển thị ký tự ô vuông / dấu hỏi chấm (UTF-8 Encoding & Font Fixes):**
  - Khắc phục lỗi ranh giới byte (chunk boundary bug) khi nhận luồng dữ liệu SSE bằng cách áp dụng `StringDecoder` của Node.js vào [HttpClientService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/http/HttpClientService.ts).
  - Chuẩn hóa toàn bộ accumulator nhận phản hồi HTTP từ dạng chuỗi sang mảng Buffer (`Buffer.concat`) trên toàn bộ ứng dụng ([HttpClientService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/http/HttpClientService.ts), [HttpRelayService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/http/HttpRelayService.ts), [workspaceIpc.ts](file:///Users/kimtrungduong/Downloads/deplao/electron/ipc/workspaceIpc.ts)) để triệt tiêu vĩnh viễn lỗi vỡ font tiếng Việt.
  - Nhúng liên kết Google Fonts `Inter` vào `index.html` và cập nhật CSS `font-family` trong `index.css` để đồng bộ font chữ tiếng Việt hiển thị đẹp mắt, sắc nét trên toàn giao diện ứng dụng.
- **Tối ưu hóa hiển thị Toolbar chèn biến:**
  - Giới hạn thanh công cụ chèn biến chỉ xuất hiện trên các trường nhập liệu văn bản lớn tin nhắn (`textarea`, `multiline`), loại bỏ khỏi các trường một dòng không phù hợp (như Số điện thoại, Zalo ID).

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
