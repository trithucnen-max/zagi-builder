# Changelog - Zagi

Tất cả các thay đổi lớn và cập nhật sửa lỗi của dự án Zagi sẽ được ghi lại tại đây.

---

## [v27.2.4] - 2026-07-04

### Thay đổi & Tính năng mới

- **Hệ thống Icon SVG đơn giản cho Dự án ERP (Project SVG Icon System):**
  - Thay thế hoàn toàn bộ chọn emoji cũ (`📁`, `🚀`, `🎯`...) trong hộp thoại **Tạo project mới** bằng bộ **12 icon SVG tối giản** lấy cảm hứng từ Lucide Icons: `folder`, `rocket`, `target`, `code`, `palette`, `chart`, `home`, `fire`, `bulb`, `sparkles`, `phone`, `bag`.
  - Tên project được lưu theo định dạng chuẩn `[slug] Tên dự án` (ví dụ: `[rocket] Q3 Campaign`) thay vì dán emoji vào chuỗi tên.
  - Hàm `getProjectDisplay(name)` được nâng cấp nhận dạng cả 2 định dạng: `[slug]` mới và emoji cũ (tương thích ngược 100%).
  - Hàm `renderProjectIcon(iconKey)` mới được tạo và đồng bộ trên 3 components: `TaskBoardPage`, `TaskCreateModal`, `TaskEditorDrawer`.

- **Giao diện Sidebar Dự án ERP được hiển thị màu sắc dự án liên tục (Always-colored Project Sidebar):**
  - Mỗi dự án trong thanh sidebar bên trái **luôn hiển thị màu nền** tương ứng màu được chọn khi tạo (thay vì chỉ hiện khi chọn).
  - Trạng thái **được chọn (active):** `opacity: 1`, viền highlight, chữ đậm.
  - Trạng thái **không chọn:** `opacity: 0.6`, nhẹ nhàng, không gây rối thị giác.
  - Toàn bộ chữ và icon SVG trong sidebar dự án được cưỡng bức màu **trắng tinh** (`color: #ffffff`) để đảm bảo tương phản tốt nhất trên mọi màu nền.

- **Cải tiến ErrorBoundary khi crash ERP:**
  - Hiển thị thông báo lỗi nổi bật trong hộp đỏ ở trên cùng.
  - Thêm nút **Sao chép mã lỗi** để dễ dàng copy stack trace gửi hỗ trợ.

### Sửa lỗi & Phòng ngừa (Bug Fixes & Prevention)

- **Sửa lỗi màn hình trắng khi vào ERP Tasks (`useMemo is not defined`):**
  - Bổ sung import thiếu `useMemo` từ `'react'` trong [TaskBoardPage.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/features/erp/tasks/TaskBoardPage.tsx).

- **Sửa lỗi tạo project bị nhân đôi (Double Project Creation Race Condition):**
  - Thêm kiểm tra trùng lặp trong `createProject` của [erpTaskStore.ts](file:///Users/kimtrungduong/Downloads/deplao/src/ui/store/erp/erpTaskStore.ts) trước khi thêm dự án vào state, ngăn race condition giữa client-side optimistic add và sự kiện realtime `erp:event:projectCreated`.

- **Thêm thông báo lỗi cho các thao tác dự án & nhiệm vụ ERP:**
  - `createProject`, `updateProject`, `deleteProject`, `deleteTask` nay hiển thị toast notification khi thất bại (thay vì fail âm thầm).

---

## [v27.2.3] - 2026-07-03


### Thay đổi & Tính năng mới

- **Ẩn danh Ghost Mode (Online & Read Privacy):**
  - **Ẩn trạng thái hoạt động (Ghost Mode Online)**: Thêm toggle cho phép ẩn chấm xanh online khỏi mắt bạn bè, tự động gửi yêu cầu deactive và duy trì trạng thái ẩn qua bộ định thời (ping) mỗi 5 phút.
  - **Đọc ngầm tin nhắn (Ghost Mode Read / Silent Reading)**: Khi mở hội thoại hoặc tiêu điểm ứng dụng quay lại, Zagi sẽ xóa thông báo/badge cục bộ nhưng chặn gửi tín hiệu đã xem lên server Zalo. Khách hàng sẽ chỉ nhìn thấy trạng thái "Đã nhận", giúp nhân viên có thời gian chuẩn bị câu trả lời chu đáo nhất.
- **Tin nhắn đa phương tiện nâng cao (Rich Message Actions):**
  - Bổ sung nút thao tác nhanh (icon sấm sét ⚡) bên cạnh nút Ghi âm, hỗ trợ gửi nhanh:
    - **Voice Note từ file**: Tải lên và gửi file âm thanh (.m4a, .mp3, .wav) dưới dạng tin nhắn thoại native.
    - **Thẻ ngân hàng (Bank Card)**: Tự động tạo thẻ thông tin tài khoản chuyên nghiệp hỗ trợ 30+ ngân hàng lớn tại Việt Nam dựa trên mã BIN Napas.
    - **Danh thiếp liên hệ (Contact Card)**: Gửi danh thiếp Zalo của bất kỳ ai thông qua User ID hoặc tra cứu nhanh bằng Số điện thoại.
- **Tối ưu hóa Nhập số điện thoại hàng loạt (Batch Phone Lookup):**
  - Tích hợp API `zalo:getMultiUsersByPhones` cho phép gửi truy vấn nhóm lên tới 100 số điện thoại trong một lần gọi duy nhất.
  - Nâng cấp [CRMImportModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/contacts/CRMImportModal.tsx) sử dụng truy vấn hàng loạt thay thế cơ chế vòng lặp `findUser` tuần tự có độ trễ 500ms, rút ngắn thời gian xử lý tệp CSV hàng trăm SĐT từ ~50 giây xuống dưới 5 giây.
- **Đồng bộ trạng thái bạn bè trực tuyến trên CRM (Zalo Online Status Sync):**
  - Tích hợp cổng IPC `zalo:getFriendOnlines` gọi API từ thư viện `zca-js` để tải danh sách bạn bè đang online trực tiếp từ server Zalo.
  - Bổ sung bộ lọc **"🟢 Online"** và chỉ báo chấm xanh lá hoạt động (Active green dot) ở avatar của khách hàng trong trang CRM.
  - Thay đổi ký hiệu trạng thái đã kết bạn cũ (`●` tròn xanh lá) thành **Dấu tick V xanh dương** thân thiện để tránh nhầm lẫn với chấm online.
  - Tự động gửi yêu cầu thăm dò (polling) danh sách online định kỳ mỗi 60 giây.
- **Tự động gộp Album ảnh hàng loạt (Multi-Image Album):**
  - Khi dán hoặc kéo thả nhiều ảnh cùng lúc, Zagi tự động đóng gói các tệp đính kèm và gửi thông qua định dạng tin nhắn Album duy nhất (nhờ thuộc tính `groupLayoutId` của thư viện `zca-js`), tối ưu hóa giao diện hiển thị trong hộp chat.
- **Tự động nhận diện Video trong Gửi file (Rich Video Auto-detect):**
  - Nâng cấp bộ chọn file trong `MessageInput.tsx` tự động kiểm tra định dạng đuôi tệp. Nếu tệp chọn là video (`.mp4`, `.mov`, `.avi`,...), hệ thống sẽ tự động chuyển hướng qua luồng Rich Video: trích xuất metadata bằng ffmpeg, tạo ảnh bìa (thumbnail) và gửi tin nhắn video có thể phát trực tiếp.
- **4 Node kịch bản tự động hóa mới trong Workflow:**
  - Bổ sung các node: `zalo.sendVideo`, `zalo.sendVoice`, `zalo.sendBankCard`, và `zalo.sendCard` hỗ trợ chèn biến động, cấu hình thời gian tự hủy (TTL), và tích hợp đầy đủ cơ chế định tuyến proxy từ Nhân viên lên máy Boss.
- **Nâng cấp công nghệ Quét bóng thụ động (Passive Shadow Scanning - PSS) cho nhóm ẩn Zalo:**
  - Tích hợp thêm 3 luồng quét sâu lịch sử tin nhắn trong [GroupMembersTab.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/groups/GroupMembersTab.tsx) khi nhóm khóa thành viên (`lockViewMember = 1`):
    - **Inline Reactions**: Quét lượt thả cảm xúc tim/like trực tiếp trên 100 tin nhắn chat gần nhất.
    - **Message Mentions**: Quét danh sách thành viên được tag nhắc tên.
    - **System Messages**: Quét siêu dữ liệu (metadata) của tin nhắn hệ thống để tự động thu thập UIDs của thành viên mới tham gia, người mời, hoặc admin/phó nhóm mới được bổ nhiệm.

### Sửa lỗi & Phòng ngừa (Bug Fixes & Prevention)

- **Sửa lỗi và nâng cấp đồng bộ ERP & Nhãn 2 chiều thời gian thực (2-way ERP & Label Sync):**
  - Khắc phục triệt để lỗi đứt gãy đồng bộ ERP từ Nhân viên lên máy Boss bằng cách áp dụng bộ chuyển tiếp proxy tự động `proxyToBossAsync` trong Electron IPC Middleware.
  - Giải quyết lỗi mất dữ liệu tạm thời khi Nhân viên tải lại trang (reload) thông qua cơ chế tự động ghi nhận (SQLite upsert) cho toàn bộ 19 kênh sự kiện `erp:event:*` thời gian thực nhận được từ SSE vào database local.
  - Xây dựng cơ chế phòng ngừa lỗi ghi dữ liệu động thông qua lệnh truy vấn cấu trúc bảng `PRAGMA table_info` của SQLite để lọc và loại bỏ thuộc tính ảo trước khi ghi đè dữ liệu.

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
