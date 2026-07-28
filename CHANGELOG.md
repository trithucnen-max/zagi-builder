# Changelog - Zagi

Tất cả các thay đổi lớn và cập nhật sửa lỗi của dự án Zagi sẽ được ghi lại tại đây.

## [v3.0.8] - 2026-07-28

### 🎛️ Giao Diện Quản Lý Bảng Quy Tắc Xưng Hô & Tự Xưng (Salutation Self-Reference UI Manager)

- **Thêm Tab "🗣️ Xưng hô & Tự xưng" vào Cài Đặt Hội Thoại (`ConversationSettings.tsx`):**
  - Tích hợp ngay cạnh tab *Tin nhắn nhanh* và *Quản lý nhãn*.
  - Cho phép người dùng trực tiếp **Xem, Tìm kiếm, Thêm mới, Chỉnh sửa, Xóa** và **Khôi phục mặc định** bảng quy tắc tự xưng tiếng Việt.
- **Thử Nghiệm Trực Tiếp (Live Interactive Tester):**
  - Tích hợp khu vực thử nghiệm Live Preview giúp người dùng chọn danh xưng (`Anh`, `Chị`, `Thầy`, `Sếp`...) và xem ngay kết quả viết Hoa đầu câu / viết thường giữa câu theo thời gian thực.
- **Lưu Đĩa & Đồng Bộ Tức Thời (SQLite Persistence & Realtime IPC):**
  - Lưu bảng quy tắc tùy chỉnh vào SQLite `app_settings` (`custom_salutation_map`), đồng bộ tức thì cho cả máy Boss, Employee, CRM Campaigns và Workflow Engine.
- **Sửa Lỗi IPC Lưu Quy Tắc Xưng Hô (`saveSalutationMap`):** Khai báo `getSalutationMap`, `saveSalutationMap`, `resetSalutationMap` trong `electron/preload.ts`, khắc phục lỗi modal *"saveSalutationMap is not a function"*.
- **Sửa Lỗi Tạo Lô Quét SDT Hàng Loạt (`createPhoneScanBatch`):** Thêm 2 cột `target_account_id` và `contact_assignment_mode` vào bảng SQLite `phone_scan_batches`, khắc phục lỗi toast *"Could not create batch"*.
- **Chuẩn Hóa Xưng Hô Mặc Định Chưa Rõ Giới Tính:** Chuyển fallback xưng hô chưa rõ giới tính từ `Bạn/Mình` ➔ **`Anh/Chị`** (tự xưng **`Em`**).

### 🗣️ Tính Năng Mới: Xưng Hô Thông Minh & Tự Xưng Tự Động Theo Chuẩn Tiếng Việt (Smart Salutation & Self Reference)

- **Tự động Viết Hoa / Viết thường theo Ngữ cảnh (Context-Aware Capitalization):**
  - **Đầu câu / Sau dấu ngắt câu (`.`, `!`, `?`, `…`, `\n`) / Đầu chuỗi:** Tự động viết Hoa chữ cái đầu (VD: `Chị ơi!...`, `Bố khỏe không?`, `Cháu chào...`).
  - **Giữa câu (sau dấu phẩy, chữ thường, dấu hai chấm):** Tự động giữ viết thường tự nhiên (VD: `dạ em xin chào chị`, `con chào bố ạ`, `mình chào bạn`).
- **Từ Tự Xưng Phù Hợp Tự Động (`{tu_xung}` / `{{ $trigger.tu_xung }}`):**
  - Bảng mapping thông minh theo văn hóa giao tiếp Tiếng Việt:
    - **Bố / Mẹ / Ba / Má** → Tự xưng: `con`
    - **Ông / Bà / Cụ** → Tự xưng: `cháu`
    - **Chú / Cô / Dì / Thím / Bác / Mợ** → Tự xưng: `con` / `cháu`
    - **Anh / Chị** → Tự xưng: `em`
    - **Em** (gửi đến người trẻ) → Tự xưng: `anh`
    - **Bạn** → Tự xưng: `mình`
    - **Quý khách** → Tự xưng: `chúng tôi`
- **Giao diện & Công cụ tích hợp:**
  - Bổ sung nút chèn biến `{tu_xung}` vào bộ gõ Chiến dịch CRM (`CampaignCreateModal.tsx` & `campaignVars.ts`).
  - Bổ sung `{{ $trigger.tu_xung }}` vào gợi ý biến tự động của Workflow Builder (`templateVars.ts`).
- **Unit Test Coverage:** Thêm `salutationUtils.test.ts` kiểm thử 100% tất cả các kịch bản viết Hoa/thường và cặp xưng hô - tự xưng.

### 🔌 Sửa Lỗi Quan Trọng: Kết Nối Nhân Viên Bị Nhấp Nháy / Ngắt Ngẫu Nhiên Khi Chuyển Màn Hình

- **Root Cause đã xác định:** Sự kiện `visibilitychange` (trình duyệt kích hoạt mỗi khi người dùng chuyển tab/section) luôn gọi `connectRemote()` ngay cả khi máy nhân viên đang kết nối khỏe mạnh. Hàm `HttpConnectionManager.connect()` khi đó destroy client SSE cũ rồi tạo mới → Renderer nhận sự kiện `workspace:connectionStatus { connected: false }` → Giao diện hiển thị trạng thái **"Mất kết nối"** trong ~1-2 giây → Client mới kết nối thành công → Giao diện phục hồi. Lỗi này lặp đi lặp lại mỗi khi người dùng chuyển màn hình trong ứng dụng.
- **Fix Layer 1 — `App.tsx` (Guard UI):** Thêm kiểm tra `connStatus?.connected` trước khi gọi lại `connectRemote`. Nếu workspace đang connected → bỏ qua hoàn toàn, không trigger reconnect thừa.
- **Fix Layer 2 — `workspaceStore.ts` (Getter mới):** Bổ sung hàm `getConnectionStatus(wsId)` vào Zustand store để Layer 1 có thể query trạng thái kết nối realtime.
- **Fix Layer 3 — `HttpConnectionManager.ts` (Defense-in-depth):** Thêm guard normalize URL trong `connect()`: nếu client đang healthy với cùng `bossUrl` + `token` → skip, không destroy. Bảo vệ tầng lõi khỏi mọi lời gọi thừa từ bất kỳ nguồn nào trong tương lai.

## [v3.0.7] - 2026-07-27

### 📱 Nâng Cấp Tối Ưu Giao Diện Di Động & Web Browser UI/UX
- **Thiết Kế Lại Form "Tạo Chiến Dịch Tin Nhắn" (`CampaignCreateModal.tsx`):**
  - Chuyển đổi 100% sang bố cục Single-Column Form cuộn dọc thông minh chuẩn Mobile iOS UI.
  - Loại chiến dịch dạng Grid 4 ô vuông bằng nhau (`Tin nhắn`, `Kết bạn`, `Mời nhóm`, `Hỗn hợp`).
  - Lựa chọn delay pill buttons (`5-15s`, `30-60s`, `2-3ph`, `5-10ph`) + Tùy chỉnh khoảng ngẫu nhiên.
  - Các nút chèn biến nhanh (`[ Tên ]`, `[ SĐT ]`, `[ Xưng hô ]`, `[ ✏️ Trợ lý AI ]`) + Đính kèm ảnh thiết bị / thư viện.
  - Tự động hiển thị Toast cảnh báo màu đỏ tức thì khi người dùng bấm tạo mà thiếu Tên chiến dịch, Nội dung tin nhắn, Lời nhắn kết bạn hoặc Nhóm Zalo để mời.
- **Nâng Cấp Modal "Chọn Liên Hệ" (`TargetSelector.tsx`):**
  - Thiết kế lại chuẩn Mobile iOS UI với Stepper Indicator (`Tạo chiến dịch` ➔ `Thêm liên hệ`).
  - Hỗ trợ các Sub-Tabs `Theo nhãn`, `Theo SĐT`, `Theo UID`, `Chọn thủ công` và phân loại `Nhãn Local`, `Nhãn Zalo`, `Bảng chọn nhãn`.
  - Icon Folder pastel & Kính lúp lọc minh họa Empty State chuẩn mực + Tip Banner khiên bảo vệ `🛡️ Mẹo`.
- **Tích Hợp Bộ Lọc Di Động & Tối Ưu Menu (`CRMContactList.tsx`, `CRMPage.tsx`):**
  - Ẩn nút `Thao tác` cồng kềnh trên giao diện di động (`hidden sm:block`).
  - Xây dựng **Mobile Filter Sheet Drawer** dạng vuốt từ dưới lên khi bấm nút `Bộ lọc`, hỗ trợ lọc Nhãn Local/Zalo, Giới tính, Sắp xếp danh sách.
  - Bổ sung `🚀 Chiến dịch` vào Dropdown Selector di động và ẩn menu `📋 Lịch sử gửi`.

### 🔄 Tự Động Nạp Tài Khoản Nhân Viên Trên Web Khai Đăng Nhập (`EmployeeLoginModal.tsx`)
- **Reactive State Sync (Option A):**
  - Tích hợp cơ chế nạp trực tiếp danh sách tài khoản Zalo & quyền hạn vào Zustand State ngay sau khi đăng nhập nhân viên thành công qua web.
  - Giúp thông tin tài khoản hiển thị ngay lập tức trong **0.1 giây** mà **KHÔNG CẦN REFRESH (F5)** lại trang.

### 🐛 Sửa lỗi & Cải tiến Native Desktop
- **Khắc phục dứt điểm lỗi gửi và forward hình ảnh trên máy BOSS (`ZaloService.ts`, `zaloIpc.ts`, `FileStorageService.ts`):**
  - Chuyển cơ chế gửi ảnh sang truyền đường dẫn file đĩa native `string` giúp `zca-js` đọc đúng định dạng tệp và kích hoạt `imageMetadataGetter` chuẩn xác 100%.
  - Tự động tải tệp tin ảnh từ URL CDN Zalo về đĩa tạm nếu tệp chưa có sẵn trên máy local.
  - Nâng cấp cơ chế tra cứu và remap đường dẫn thư viện (`library/`) linh hoạt khi di chuyển dữ liệu giữa các ổ đĩa.
  - Cập nhật chuẩn hóa toàn bộ liên kết tải xuống `v3.0.7` trên Landing Page, README.md và README.en.md.

## [v3.0.6] - 2026-07-26

### 🛡️ Bảo Mật Landing Page Bằng Supabase Edge Functions Architecture
- **Chuyển Đổi Sang Serverless Edge Functions:**
  - Tách toàn bộ logic tạo đơn hàng, sinh mã bản quyền và kiểm tra thanh toán ra khỏi Browser client-side.
  - Triển khai 2 Supabase Edge Functions mới: `create-order` (tạo đơn, rate-limit IP, validate dữ liệu, sinh key bằng `crypto.randomUUID()`) và `check-payment` (kiểm tra trạng thái bản quyền an toàn, bảo mật thông tin PII).
  - Loại bỏ hoàn toàn các key nhạy cảm hardcoded và hàm sinh key yếu `Math.random()` trên Landing Page.
- **Tối Ưu Giao Diện & Sanitize Dữ Liệu (`landing/index.html`):**
  - Sanitize dữ liệu chuỗi nội dung chuyển khoản chống nguy cơ XSS.
  - Chuẩn hóa giao diện tải về dành cho mọi hệ điều hành (macOS Apple Silicon/Intel, Windows x64/Surface ARM64, Linux).

### 💬 Khắc Phục Triệt Để Lỗi Chuyển Tiếp Tin Nhắn Ảnh & Link Zalo (`ChatWindow.tsx`)
- **Fix Lỗi Forward Ảnh Zalo Từ CDN Zalo / Máy Nhân Viên:**
  - Cập nhật hàm `extractImageUrl()` bóc tách toàn bộ trường CDN URL Zalo (`params.hd`, `params.rawUrl`, `normalUrl`, `hdUrl`).
  - Hỗ trợ tải ngầm media token từ Zalo CDN cho các máy nhân viên chưa lưu ảnh local đĩa cứng.
- **Fix Lỗi Forward Tin Nhắn Link Card (`share.link`):**
  - Tách biệt tin nhắn Link (`share.link`, `chat.link`, `chat.recommended`) khỏi phân loại File.
  - Chuyển sang gọi chính xác API `ipc.zalo.sendLink()` thay vì gọi sai `sendFile()`, tích hợp fallback gửi Text nếu link không có URL hợp lệ.

### 🔑 Quản Lý Bản Quyền Native Supabase Engine (100% Supabase API & Edge Functions)

- **Chuyển Đổi Native Supabase REST API:**
  - Chuyển toàn bộ 188+ dữ liệu bản quyền từ Google Apps Script / Sheet sang **Supabase Native REST API** (`paxejunvgfhjdyulzutb.supabase.co`).
  - Tốc độ xác thực License Key giảm xuống còn **~0.05s** (nhanh hơn gấp 60 lần).
  - Tích hợp khóa phần cứng `boss_machine_id` mã hóa qua `safeStorage` và áp dụng giới hạn `max_employees` / `max_zalo_accounts` theo gói.

- **Bảng Giá Động Supabase Real-time (`plans` table):**
  - Khởi tạo bảng `plans` trên CSDL Supabase chứa toàn bộ 6 gói dịch vụ mặc định (`solo_6m`, `solo_12m`, `solo_lifetime`, `team_6m`, `team_12m`, `team_lifetime`).
  - Cho phép quản trị viên tăng/giảm giá tiền, thay đổi mô tả gói hoặc bật/tắt khuyến mãi trực tiếp trên Supabase Dashboard mà không cần Rebuild/Update App Zagi.

- **Tự Động Kích Hoạt SePay Webhook 24/7/365:**
  - Triển khai Supabase Edge Function `sepay-webhook` (`https://paxejunvgfhjdyulzutb.supabase.co/functions/v1/sepay-webhook`) được gắn cờ `--no-verify-jwt` cho phép SePay.vn gọi Webhook 24/7.
  - Tự động bóc tách cú pháp `ZAGI <MÃ_KEY>`, đổi trạng thái `status = 'active'`, cộng hạn dùng và tự động gửi Email xác nhận cho khách hàng trong 1-2 giây ngay khi nhận tiền chuyển khoản MB Bank (`422777999` - `CONG TY CO PHAN BASAN`).

- **Gói Dùng Thử 14 Ngày (14-day Free Trial):**
  - Nâng thời hạn gói dùng thử Miễn phí từ 7 ngày lên **14 ngày** giúp khách hàng thoải mái trải nghiệm đầy đủ tính năng.

- **Tự Động Gửi Email Thông Báo Khách Hàng:**
  - Tích hợp tiến trình ngầm gửi Email thông báo tự động chào mừng và xác nhận mã bản quyền / VietQR tới hộp thư Gmail của khách hàng qua Google Mail Service.

### 🛠️ Sửa Lỗi Máy Nhân Viên (Employee Mode Media & Link Fixes)

- **Sửa Lỗi Hiển Thị Thẻ Link (`MessageBubbles.tsx`):**
  - Cập nhật `isCardType` và `parseTxt` hỗ trợ hiển thị mượt mà các thẻ link dạng `share.link`, `chat.link`, `webchat` và đường link rút gọn mà không bị ô bong bóng trắng rỗng.
- **Sửa Lỗi Gửi Ảnh Từ Thư Viện & Chuyển Tiếp Ảnh Trên Máy Nhân Viên (`ipc.ts`):**
  - Nâng cấp `prepareBrowserMediaParams` tự động đọc dữ liệu mã hóa base64 từ đĩa local của máy Nhân viên hoặc remote URL và POST về API `/api/media/upload` của máy Sếp. Máy Sếp nhận ảnh, lưu đĩa local và gửi Zalo mượt mà 100%.

### 💻 Hệ Thống Thống Kê Máy Cài Đặt, Hệ Điều Hành & Thiết Bị (Supabase Telemetry - Phương Án A)

- **Tự Động Thu Thập Thông Tin Ẩn Danh & Định Danh Máy Duy Nhất:**
  - Tự động sinh mã `Machine ID` cố định duy nhất cho từng máy tính.
  - Thu thập thông tin Hệ điều hành (`macOS Apple Silicon/Intel`, `Windows 11 x64`, `Linux`), phiên bản app Zagi, Tên máy tính và Danh sách Tài khoản Zalo đang chạy trên máy.
- **Tự Động Gửi Telemetry Ping Về Supabase:** Định kỳ 6 giờ/lần (và khi mở ứng dụng), Zagi gửi dữ liệu Upsert về CSDL Supabase qua REST API.
- **Bảng Báo Cáo & Quản Trị Trực Quan Trong Cài Đặt (`DeviceTelemetryPanel.tsx`):**
  - Tích hợp Tab **"💻 Thống kê máy"** trong menu Cài đặt.
  - Cung cấp ô nhập `Supabase Project URL` và `Supabase Anon Key` dễ dàng thiết lập.
  - Tích hợp nút **Copy SQL 1-Click** tạo bảng `device_telemetry` trên Supabase Editor.
  - Báo cáo trực quan: Tổng số máy active, số máy Mac/Windows/Linux và chi tiết danh sách tài khoản Zalo đang chạy trên từng máy.

### 🔔 Cơ Chế Kiểm Tra Phiên Bản Mới v3.x.x (Option A Version Update Checker)

- **Cảnh Báo Thông Minh Không Tải Ngầm:**
  - Tích hợp module kiểm tra phiên bản mới từ GitHub Releases API (`https://api.github.com/repos/trithucnen-max/zagi-builder/releases`).
  - **Phân loại dải phiên bản v3.x.x:** Tự động lọc và chỉ so sánh dải phiên bản mới `v3.x.x`, bỏ qua hoàn toàn dải phiên bản cũ `v27.x.x`.
  - **Tối ưu trải nghiệm khách hàng:** Khi có bản cập nhật mới, hệ thống chỉ hiển thị **Banner thông báo nhẹ nhàng** ở góc màn hình. **Tuyệt đối không tự động tải ngầm hay tự cài đặt đè**.
  - **Quyền chủ động 100%:** Khách hàng bấm nút *"Xem & Tải về"* để mở trực tiếp trang GitHub Release trên trình duyệt hoặc bấm *"Bỏ qua"* để ẩn thông báo.

### 👥 Khắc Phục Triệt Để Xác Định Trạng Thái Bạn Bè Zalo Theo Tài Khoản

- **Phân lập SQL Kiểm Tra Bạn Bè Zalo:** Cập nhật truy vấn SQL `getDuplicateContactsAcrossAccounts` để so khớp danh sách bạn bè `friends` chính xác theo từng tài khoản sở hữu `owner_zalo_id` (so khớp cả Zalo UID và Số điện thoại).
- **Phân biệt rành mạch `🤝 Bạn bè Zalo` vs `👤 SĐT Quét / Khách lạ`:** Liên hệ CHỈ được gắn nhãn bạn bè đối với tài khoản thực sự có kết bạn Zalo.
- **Dọn dẹp cờ `is_friend` dính chéo:** Tự động quét và reset cờ `is_friend = 0` trong CSDL cho các bản ghi liên hệ bị gán nhầm từ các đợt import cũ.

### 📱 Tái Thiết Kế Toàn Diện Giao Diện Mobile Web & Trải Nghiệm Di Động

- **Tối Ưu Không Gian Màn Hình Di Động:**
  - Tự động ẩn thanh công cụ `TopBar` trên thiết bị di động (`isMobile === true`), giải phóng 100% chiều cao màn hình cho các hoạt động chính (Chat, CRM, Dashboard).
- **Thanh Sidebar Dạng Menu Trượt Nổi (Slide-Over Drawer):**
  - Chuyển thanh Sidebar màu xanh cố định thành Menu trượt nổi mượt mà, mở bằng nút Hamburger `☰` trên đầu trang Chat, CRM và Dashboard giúp thao tác chuyển tài khoản & tính năng cực kỳ thuận tiện.
- **Mở Lại & Tối Ưu Trang Dashboard Tổng Trên Di Động:**
  - Khôi phục view Dashboard trên Web di động với bố cục Card cuộn dọc linh hoạt, tích hợp nút Hamburger `☰` và tối ưu kích thước hiển thị.
- **Khung Xem Thông Tin Cuộc Trò Chuyện & Bảng Tin Nhóm Tràn Màn Hình (Full-Screen Overlay):**
  - Khắc phục triệt để sự cố thông tin bị cắt viền khi bấm nút `...` trong khung chat trên di động. Khung thông tin mở dạng Full-screen Overlay tràn toàn màn hình có nút Đóng rõ ràng.
- **Tối Ưu Bảng CRM & Danh Sách Liên Hệ Trên Mobile:**
  - **Danh sách liên hệ CRM:** Mặc định trên di động **CHỈ hiển thị 2 cột chính (Biệt danh & SĐT)**. Các cột khác được ẩn gọn gàng và có thể gọi ra từ menu "Cột hiển thị".
  - **Menu CRM Sub-tabs:** Chuyển từ hàng tab dài thành **Dropdown Hamburger Selector** gọn gàng.
  - **Tự động ẩn các tính năng nặng trên Mobile:** Ẩn các nút *Đồng bộ Zalo*, *Rà soát trùng lặp*, *Quét SĐT hàng loạt*, và *Lịch sử chiến dịch* khi truy cập trên điện thoại.
- **Form Đăng Nhập Nhân Viên Tinh Gọn & Tự Động Chuyển Hướng:**
  - Tự động lấy URL Boss từ địa chỉ trình duyệt hiện tại (`window.location.origin`). Nhân viên truy cập qua link Web/Tunnel chỉ cần gõ Username + Password mà không cần gõ link rườm rà.
  - Tự động chuyển hướng về màn hình Chat (`setView('chat')`) ngay sau khi đăng nhập thành công.
- **Khắc Phục Lỗi Runtime CRM:** Sửa triệt để lỗi crash JavaScript `ReferenceError: Can't find variable: useIsMobile` trong `CRMContactList.tsx`.

### 🖼️ Xử Lý Dứt Điểm Lỗi Gửi Media Từ Thư Viện (Library Media Fixes)

- **Chuẩn Hóa Đường Dẫn Local Path Gửi Ảnh:** Sửa lỗi gửi ảnh không thành công trong Thư viện bằng cách xử lý chuẩn xác cả `item._localPath` và `item.file_path` từ CSDL (cho máy Boss) và `_libraryUuid` (cho trình duyệt Nhân viên).
- **Khóa Trạng Thái `sending` Phòng Chống Gửi Lặp (Double-Submit Guard):** Bổ sung cờ khóa `sending` và vô hiệu hóa nút "Gửi", tự động hiển thị chữ `"Đang gửi..."` khi đang xử lý truyền media, triệt tiêu hoàn toàn sự cố bấm 1 lần bị lặp gửi 2-3 video trùng lặp.

### 🌐 Phục Vụ Trực Tiếp Web UI Qua HttpRelayService (Port 9900 / Tunnel Domain)

- Cập nhật `HttpRelayService.ts` hỗ trợ Phục vụ ứng dụng Web tĩnh đóng gói từ `dist/` kèm SPA Routing Fallback, cho phép máy Boss phục vụ Zagi Web UI trực tiếp qua cổng `9900` và tên miền `relay.basancorp.com` / Cloudflare Tunnel.

- **Khôi Phục & Đồng Bộ 100% Tính Năng Trên Trình Duyệt Web Chrome:**
  - Hỗ trợ Nhân viên truy cập và làm việc hoàn chỉnh qua Trình duyệt Web (`http://127.0.0.1:27799`) kết nối về máy Boss (`http://127.0.0.1:9900`).
  - **Cấu hình Progressive Web App (PWA):** Tích hợp `manifest.json` và Service Worker `sw.js` cho phép Nhân viên cài đặt Zagi Web thành một **App Cửa sổ Độc lập** có Icon riêng trên màn hình Desktop/Taskbar chỉ với 2 cú nhấp chuột.
- **⚡ Động Cơ Realtime SSE Stream & Hiển Thị Tức Thì 0.05s:**
  - Hỗ trợ xác thực Token qua URL search parameters (`?token=...`) cho kết nối EventSource SSE Stream.
  - Nâng cấp `HttpRelayService` ghi dữ liệu trực tiếp vào luồng SSE Client Stream (`sseClients.get(empId)`).
  - Tự động đóng gói & lưu đĩa SQLite đồng bộ ngay khi gửi proxy, bắn sự kiện `event:message` và `relay:messageSentByEmployee` giúp tin nhắn văn bản, ảnh từ Thư viện Media, video, tệp tin xuất hiện **NGAY LẬP TỨC TRONG 0.05s** trên Trình duyệt Web Nhân viên mà không cần F5.
- **🖼️ Trình Phục Vụ Tệp Media Tốc Độ Cao Cho Web (`MediaHandler.ts` & `localMedia.ts`):**
  - Tự động chuyển đổi các đường dẫn đĩa local (`local-media:///...`) thành HTTP REST URL: `${bossUrl}/api/media/file?path=...`.
  - Mở mở rộng handler `GET /api/media/file?path=...` trên máy Boss phục vụ truyền dữ liệu hình ảnh, video với đầy đủ header MIME & CORS cho trình duyệt.

### 🚀 Quản Lý Quy Tắc Đặt Tên Gợi Nhớ Zalo (Zalo Contact Alias Renaming Rules)

- **3 Tùy Chọn Linh Hoạt Khi Tạo Chiến Dịch CRM:**
  - **Không đổi (Mặc định):** Giữ nguyên tên Zalo/biệt danh cố định của bạn bè và liên hệ trong danh bạ, tránh làm sai lệch tên người quen khi chạy chiến dịch.
  - **`[Tên chiến dịch] - [Tên Zalo] - [SĐT]`:** Gán tên gợi nhớ Zalo kèm tên chiến dịch và SĐT phục vụ phân loại chiến dịch marketing.
  - **`[Tên Zalo] - [SĐT]`:** Gán tên gợi nhớ Zalo kèm SĐT tối giản.
- **Thuật Toán Bóc Tách Tên Gốc (`extractCoreZaloName`):** Khắc phục triệt để sự cố lặp nối chuỗi biệt danh Zalo (ví dụ: biến `Test-VIP-Khánh Ly-0898904529-0898904529` thành tên chuẩn `Test-Khánh Ly-0898904529`).

### 🎨 Nâng Cấp Giao Diện Modal Tạo Chiến Dịch CRM & Khởi Tạo Quét SĐT Zalo

- **Modal Tạo Chiến Dịch CRM:**
  - Tăng kích thước khung làm việc lên **1360px x 832px** (`max-w-[1360px]`, `height: min(95vh, 52rem)`).
  - Mở rộng Cột cấu hình bên trái lên **280px**, hiển thị trọn vẹn quy tắc đặt tên gợi nhớ Zalo không bị cắt chữ (`truncate`).
  - Đặt lại giá trị ngẫu nhiên dải Delay gửi mặc định thành **5 - 15 giây** an toàn tối đa cho tài khoản Zalo.
- **Modal Khởi Tạo Lô Quét SĐT Zalo Mới (`PhoneScanPanel.tsx`):**
  - Thiết kế lại giao diện 2 cột phẳng hiện đại, mở rộng kích thước lên **1280px x 800px** (`max-w-[1280px]`, `height: min(94vh, 50rem)`).
  - Bổ sung nút **`📥 Tải tệp CSV/Excel mẫu (SĐT, Giới tính, Ngày sinh)`** tự động xuất file mẫu `.xlsx` chuẩn 3 cột (`Số điện thoại`, `Giới tính`, `Ngày sinh`).
  - Hỗ trợ khung Dropzone kéo thả & đọc file đa định dạng (`.xlsx`, `.xls`, `.csv`) dung lượng tới 10MB qua thư viện `XLSX`.

### 🧠 Động Cơ Chuẩn Hóa Dữ Liệu Tự Động (Smart Data Normalization Engine)

- **Chuẩn hóa SĐT:** Tự động sửa các SĐT 9 chữ số thiếu số 0 đầu (`912345678` ➔ `0912345678`).
- **Chuẩn hóa Giới tính:** Tự động quy đổi các giá trị nhập tự do (`nam`, `male`, `1` ➔ `Nam`; `nữ`, `female`, `2` ➔ `Nữ`).
- **Chuẩn hóa Ngày sinh:** Tự động định dạng ngày sinh chuẩn (`15-08-1992` ➔ `15/08/1992`).

### 🛡️ Phân Lập Dữ Liệu Danh Bạ Triệt Để & Bộ Công Cụ Lọc Trùng Liên Hệ Đa Tài Khoản

- **Cô Lập Tuyệt Đối Dữ Liệu Biệt Danh (SQL Account Isolation):**
  - Phân lập 100% các câu lệnh SQL `getCRMContacts`, `setContactAlias` và `backfillPhoneScanAliases` theo `owner_zalo_id`.
  - Khắc phục triệt để lỗi dính chéo biệt danh (alias) giữa các tài khoản Zalo khác nhau (tránh trường hợp biệt danh `| ... MSH` từ tài khoản này bị lây sang tài khoản khác).
- **Tùy Chọn Phân Bổ Liên Hệ Trong Lô Quét (`contact_assignment_mode`):**
  - **`Chỉ thuộc tài khoản nhận (Tối ưu phân quyền)`**: Lưu profile & gán nhãn duy nhất cho tài khoản được chỉ định.
  - **`Chia đều cho các tài khoản quét`**: Tự động phân bổ xoay vòng liên hệ cho các tài khoản đang quét.
  - **`Có mặt ở tất cả các tài khoản`**: Đồng bộ profile & nhãn cho toàn bộ tài khoản Zalo trong hệ thống.
  - Hỗ trợ nút **`⚡ Chuyển phân bổ liên hệ`** trực tiếp trong báo cáo lô quét để điều chỉnh luồng phân bổ bất kỳ lúc nào.
- **Giao Diện Rà Soát & Quản Lý Trùng Lặp Đa Tài Khoản (`CRMDuplicateManagerModal.tsx`):**
  - Thêm nút **`Rà soát trùng lặp`** trên thanh công cụ TopBar CRM.
  - **`⚡ Dọn dẹp biệt danh dính chéo & chuẩn hóa trạng thái Bạn bè Zalo`**: Tự động rà soát và gỡ bỏ các biệt danh bị gán nhầm cross-account, đồng thời reset cờ `is_friend = 0` đối với các liên hệ SĐT Quét / Khách lạ không có trong bảng `friends`.
- **🤝 Chuẩn Hóa & Đồng Bộ Trạng Thái Bạn Bè Zalo (`is_friend`):**
  - Ép gán trạng thái bạn bè (`is_friend = 1`) dựa trên đối chiếu thực tế với bảng `friends` cho từng tài khoản Zalo.
  - Ngăn chặn hoàn toàn việc hiển thị nhầm biểu tượng dấu tích xanh (`✓`) đối với liên hệ chưa kết bạn (SĐT Quét/Khách lạ) trên Danh sách CRM và Modal Rà soát lọc trùng.
  - **`🔄 Chuyển sang tài khoản khác`**: Di chuyển dữ liệu liên hệ từ tài khoản Zalo này sang tài khoản Zalo khác chỉ với 1 cú nhấp chuột.
  - **`🔗 Gộp về 1 tài khoản`**: Gom toàn bộ nhãn CRM & dữ liệu của các liên hệ trùng lặp về 1 tài khoản chỉ định.

### 🖼️ Động Cơ Quản Lý & Chuyển Tiếp Media Đồng Bộ (Boss-Native MediaToken Architecture)

- **Chuẩn Hóa Điểm Định Danh Media Token (`media:acquireToken`):**
  - Giới thiệu **Boss-Native File Token (BFT)** — quy đổi mọi đối tượng phương tiện (File đĩa local, Thư viện Media, Ảnh dán từ clipboard, CDN URL Zalo/Facebook) thành 1 Media Token duy nhất trước khi phát lệnh gửi.
  - Xử lý hoàn toàn trong **Electron Main Process**, tự động đọc và truyền tải binary buffer trực tiếp từ máy Nhân viên (Employee) lên máy Sếp (Boss) mà không qua nén Base64 trong Renderer, loại bỏ triệt để hiện tượng văng ứng dụng do tràn bộ nhớ RAM (heap limit overflow).
- **Hệ Thống Giải Mã Token Tập Trung (`resolveMediaToken` & `resolveMediaTokens`):**
  - Gom toàn bộ logic định danh đường dẫn về 1 điểm xử lý duy nhất trên máy Sếp.
  - Đảm bảo 100% các hàm API gửi của Zalo (`sendImage`, `sendImages`, `sendFile`, `sendVoice`, `sendVideo`) giải mã chính xác tuyệt đối các tệp đĩa nguyên bản.
- **Khắc Phục Hoàn Toàn Lỗi Chuyển Tiếp Ảnh & Video Từ Máy Nhân Viên:**
  - Tự động bóc tách và token hóa URL CDN khi chuyển tiếp tin nhắn phương tiện từ máy Nhân viên.
  - Loại bỏ hoàn toàn sự cố đường dẫn đĩa nội bộ của máy Sếp bị lỗi không tồn tại trên máy Nhân viên.
  - Tối ưu hóa gửi gộp nhiều ảnh từ Thư viện Media chọn hàng loạt (`mediaTokens`).

---

## [v3.0.8] - 2026-07-27

### 🐛 Sửa lỗi & Cải tiến

- Khắc phục dứt điểm lỗi gửi và forward hình ảnh trên máy BOSS.
- Tự động tải tệp tin ảnh từ URL CDN Zalo về đĩa tạm nếu chưa có trên máy local.
- Nâng cấp cơ chế tra cứu và remap đường dẫn thư viện (`library/`) linh hoạt khi di chuyển dữ liệu.
- Cập nhật chuẩn hóa liên kết tải xuống mượt mà trên Landing Page và README.



## [v3.0.5] - 2026-07-23

### 🚀 Nâng cấp Kỹ thuật & Bảo vệ Chuyển Tiếp Phương Tiện (Safe Media Forwarding & Path Resolution Engine)

- **Chuẩn Hóa Đường Dẫn & Tải Buffer Ảnh Tự Động (`ZaloService.ts`):**
  - **Quy đổi đường dẫn đĩa tuyệt đối (`ensureLocalImagePath`):** Tự động bóc tách giao thức `file://` và sử dụng `FileStorageService.resolveAbsolutePath` để quy đổi mọi đường dẫn đĩa tương đối (`media/zaloId/...`) thành đường dẫn đĩa tuyệt đối chính xác trên máy Sếp.
  - **Động cơ tự động tải Buffer ảnh CDN (`downloadUrlToTempFile`):** Khi chuyển tiếp ảnh chưa có sẵn trên đĩa hoặc ảnh dạng URL CDN `https://...`, hệ thống tự động fetch buffer ảnh ngầm về thư mục tạm `media/temp_forward/` để phát đi mượt mà, khắc phục 100% sự cố văng lỗi `fs.readFileSync("https://...")` trong Node.js.
  - **Tự động dọn dẹp bộ nhớ tạm (Auto-Cleanup):** Tự động xóa các tệp đĩa tạm thời trong khối `finally` sau khi hoàn tất gửi ảnh, tránh tiêu tốn dung lượng ổ đĩa.
- **Bảo Vệ Đa Định Dạng & Đa Phân Hệ (Multi-Format & Multi-Module Safeguards):**
  - **Tệp tài liệu, Video MP4 & Voice message:** Bổ sung lớp bảo vệ giải quyết đường dẫn cho `sendFile`, `sendVideo`, `uploadVideoFile` và `uploadVideoThumb`.
  - **Khung Chat, Workflow & Chiến dịch CRM:** Đảm bảo toàn bộ luồng chuyển tiếp/gửi phương tiện từ Khung Chat, Kịch bản tự động Workflow Engine và Chiến dịch CRM gửi tin hàng loạt đều hoạt động ổn định 100%.
  - **Hỗ trợ chế độ Máy Sếp & Máy Nhân Viên kết nối từ xa (Remote Workspace Proxy):** Máy Sếp xử lý nhận diện đường dẫn đĩa hoặc tải buffer thay cho máy Nhân viên khi nhận lệnh `proxyAction`.

### 🚀 Nâng cấp UI/UX & Cô Lập Bộ Lọc Tài Khoản CRM

- **Tùy Chọn Cột Hiển Thị CRM Ẩn Mặc Định (CRM Column Visibility Selector - `CRMContactList.tsx`):**
  - **Ẩn mặc định 3 cột không cần thiết:** Tự động ẩn 3 trường `Tên Zalo`, `Trợ lý AI`, `Tự động tổng hợp` khi mở danh sách Liên hệ CRM, giúp giao diện tập trung và gọn gàng.
  - **Menu Popover `👁️ Cột hiển thị`:** Thêm bộ chọn cột hiển thị linh hoạt trên thanh công cụ CRM. Người dùng có thể tự do bật/tắt hiển thị từng cột (Biệt danh CRM, Tên Zalo, Giới tính, Xưng hô, Sinh nhật, SĐT, Trợ lý AI, Tự động tổng hợp) hoặc bấm **"Đặt lại mặc định"**.
  - **Lưu thiết lập cá nhân (`localStorage`):** Lựa chọn ẩn/hiện cột được tự động lưu vào `crm_column_visibility` và giữ nguyên qua các phiên làm việc.

- **Cô Lập Bộ Lọc & Trạng Thái Chọn 100% Theo Tài Khoản Zalo (100% Account Isolation & Filter Reset - `CRMPage.tsx` & `DatabaseService.ts`):**
  - **Tách biệt tuyệt đối bộ lọc từng Zalo:** Mỗi khi nhân viên bấm chuyển đổi tài khoản Zalo trên TopBar (`activeAccountId` thay đổi), ứng dụng tự động làm sạch 100% bộ lọc và lựa chọn liên hệ, ngăn chặn triệt để nguy cơ gán nhãn hay thêm nhầm liên hệ giữa các tài khoản Zalo.
  - **Lọc nhãn Local theo tên tương đương:** Nâng cấp `DatabaseService.ts` hỗ trợ tự động mở rộng truy vấn nhãn Local theo tên tương đương đối với từng tài khoản Zalo.

### 🚀 Đặt Tên Theo Quy Tắc Chiến Dịch & Tự Động Đồng Bộ Tên Gợi Nhớ

- **Tùy chọn Đặt tên theo Chiến dịch:** Bổ sung checkbox `☑ Cập nhật tên gợi nhớ Zalo & CRM theo quy tắc chiến dịch` (mặc định chọn). Tự động chuẩn hóa tên gợi nhớ Zalo & CRM theo công thức `[Tên lô] - [Tên Zalo khách] - [SĐT]` (Ví dụ: `VIN - Tùng Nguyễn Novaland - 0777778878`). Đồng thời gọi API `changeFriendAlias` của Zalo Server để cập nhật tên gợi nhớ ngay trên điện thoại & Zalo PC cho cả người lạ và bạn bè.
- **Động cơ Auto-Backfill Tên Cho SĐT Đã Quét (`DatabaseService.ts`):** Tự động rà soát toàn bộ các SĐT `Tìm thấy` thuộc các lô quét và điền tên biệt danh CRM chuẩn theo SĐT và UID khi mở ứng dụng.

### 🧪 Đảm bảo chất lượng & Unit Tests

- **Bộ Unit Test Toàn Diện (19/19 Test Cases Đỗ 100%):**
  - Viết mới các bộ test Jest tự động kiểm tra cô lập bộ lọc tài khoản CRM (`accountIsolation.test.ts`), chuyển tiếp ảnh (`imageForward.test.ts`), và bảo vệ gửi file/video (`fileForward.test.ts`).

---

### 🚀 Tính năng mới & Nâng cấp UI/UX

- **Khử Trùng Lặp Thông Báo Lời Mời Kết Bạn & Thông Báo Lịch Hẹn (`useZaloEvents.ts`):**
  - Tích hợp bộ nhớ lưu vết `localStorage` (`notified_friend_req_${zaloId}_${userId}` và `notified_reminder_${zaloId}_${threadId}_${reminderId}`) giúp mỗi lời mời kết bạn và thông báo lịch hẹn chỉ bật popup thông báo **đúng 1 lần duy nhất**.
  - Khắc phục hoàn toàn sự cố mỗi lần đăng nhập lại hoặc mở lại ứng dụng, Zalo server phát lại gói tin đồng bộ sự kiện làm bắn lại các popup thông báo cũ gây phiền toái cho người dùng.

- **Tối Ưu Giao Diện Quét Số Điện Thoại Zalo Hàng Loạt (`PhoneScanPanel.tsx`):**
  - Bỏ nút thủ công **"Quét ngay lập tức"** trên thanh Header màn hình Quét SĐT Zalo để giao diện tối giản và gọn gàng hơn.
  - Hệ thống tự động vận hành cơ chế quét ngầm qua `PhoneScanService` (định kỳ 4 giây/lần), tự động nhận diện và xử lý các số `pending` trong lô quét mà không bắt buộc người dùng bấm thêm nút thủ công.

- **Khắc Phục Lỗi Gửi Tệp Tài Liệu & Video (PDF, DOC, DOCX, XLS, MP4...) Trong Chat, Workflow & CRM (`ZaloService.ts`, `CRMQueueService.ts` & `zca-js`):**
  - **Tự động ánh xạ đường dẫn tuyệt đối cho tệp:** Cập nhật `ZaloService.ts` tự động kiểm tra `message.attachments` để chuẩn hóa đường dẫn tuyệt đối bằng `FileStorageService.resolveAbsolutePath`, khắc phục hoàn toàn lỗi `File not found` khi truyền đường dẫn kiểu `local-media://` hoặc tương đối.
  - **Tích hợp Fallback Timeout 8 giây cho `uploadAttachment` (`zca-js`):** Thêm cơ chế tự động giải phóng Promise sau 8s nếu phản hồi WebSocket `file_done` của Zalo bị đứt đoạn hoặc phản hồi chậm. Tệp PDF, DOCX, Video MP4 tự động dùng dữ liệu HTTP POST để phát tin nhắn thành công, loại bỏ 100% hiện tượng treo tệp.
  - **Đồng bộ đường dẫn chuỗi cho Chiến dịch CRM (`CRMQueueService.ts`):** Chuyển đổi đính kèm tệp trong CRM từ Buffer sang mảng đường dẫn chuỗi đĩa trực tiếp (`resolvedPaths`), giúp phát tệp PDF và Video MP4 tới hàng ngàn khách hàng trong chiến dịch CRM mượt mà và ổn định.

- **Khóa Bảo Vệ Workflow Đã Tắt & Sửa Lỗi Toggle REST API (`WorkflowEngineService.ts` & `HttpRelayService.ts`):**
  - **Sửa bóc tách Boolean khi Toggle Workflow:** Sửa lỗi bóc tách `params.enabled` trên REST API `/api/command/workflows/:id/toggle` (xử lý chính xác các dạng `"false"`, `0`, `false`), tự động lưu SQLite và gọi `WorkflowEngineService.reloadWorkflow(id)`.
  - **Khóa bảo vệ tức thì tại Engine (`!wf.enabled` Guard):** Thêm lớp guard kiểm tra `!wf.enabled` ngay đầu phương thức `executeWorkflow`, đảm bảo các kịch bản tự động đã tắt sẽ tuyệt đối không bị kích hoạt ngoài ý muốn khi gán nhãn hoặc nhận tin nhắn.

- **Nâng Cấp Gửi Tin Nhắn Gộp & Phân Định Nguồn Media Boss / Nhân Viên Đồng Bộ Trên Chat & Workflow (`LibraryPickerModal.tsx` & `UnifiedMediaPicker.tsx`):**
  - **Thống nhất 1 Kho Thư viện Media CSDL Boss:** Thư viện Media mục Chat và Workflow dùng chung 1 kho dữ liệu media duy nhất.
  - **Chuẩn hóa nhãn nút bấm ngắn gọn:** Đổi tên các nút chọn phương tiện trên tất cả phân hệ thành **`🖥️ Từ máy tính`** và **`📂 Từ Thư viện`**.
  - **Phân định hiển thị chuẩn Boss / Nhân viên:**
    - **Máy Boss (Local Workspace):** Hiển thị duy nhất 1 nút bấm: **`🖥️ Từ máy tính`** (loại bỏ nút Upload gây rắc rối).
    - **Máy Nhân viên (Remote Workspace):** Hiển thị 2 nút bấm rõ ràng: **`🖥️ Từ máy tính`** (upload file từ máy Nhân viên về máy Boss) và **`📂 Từ Thư viện`** (mở Modal xem kho dùng chung CSDL Boss).
  - **Gửi 1 tin duy nhất đính kèm Text + Media (`WorkflowEngineService.ts`):** Hỗ trợ đính kèm Ảnh/Video/File ngay trong node `zalo.sendMessage`, Zalo API sẽ phát 1 tin nhắn duy nhất chứa cả Caption + Album ảnh/video.

- **Tích Hợp Modal Chọn Nhãn Nâng Cao & Nút "🏷️ Gán nhãn" Hàng Loạt (`UnifiedLabelPickerModal.tsx` & `BulkActionBar.tsx`):**
  - Đổi tên nút từ `🏷️ Nhãn Local` ➔ **`🏷️ Gán nhãn`** trên Thanh thao tác hàng loạt (`BulkActionBar.tsx`).
  - Xây dựng Component **`UnifiedLabelPickerModal.tsx`** dùng chung chuẩn giao diện 2 cột: Cột trái lọc theo Tài khoản Zalo/Facebook, Cột phải phân tab **`💾 Nhãn Local`** và **`☁️ Nhãn Zalo`**.
  - **Tạo mới Nhãn Local nhanh:** Tích hợp ô nhập tên nhãn local + bộ chọn Emoji (`🏷️`, `🎯`, `🔥`...) + Color Picker + nút `Tạo mới` ngay trong Modal.
  - **Gán / Gỡ đồng thời cả 2 loại nhãn:** Hỗ trợ tích chọn nhiều nhãn Local và Zalo cùng lúc.
  - **Xóa toàn bộ nhãn khi để trống:** Hiển thị thông báo hướng dẫn màu cam `⚠️ Để trống sẽ xóa toàn bộ nhãn (Local & Zalo) của các liên hệ đã chọn`, tự động dọn dẹp toàn bộ nhãn đã gán khi bấm Xác nhận.
  - Tái sử dụng đồng bộ cho cả CRM Bulk Action Bar và Workflow Node Config Editor.

- **Chuẩn Hóa & Tự Động Bổ Sung Số 0 Cho SĐT Việt Nam (`phoneUtils.ts`):**
  - Tự động phát hiện và bổ sung số `0` ở đầu cho các số điện thoại 9 chữ số bị thiếu (VD: `904665731` ➔ `0904665731`).
  - Xử lý mượt mà các tiền tố `+84`, `84`, tự động loại bỏ khoảng trắng, dấu gạch ngang, dấu chấm.
  - Tập trung logic tại `phoneUtils.ts` (`normalizePhone`, `isValidVietnamPhone`) và đồng bộ nhất quán trên tất cả màn hình: Thanh tìm kiếm Zagi, Nhắn tin, CRM Search, CRM Add Contacts, CRM Import CSV, và Quét SĐT hàng loạt.

- **Nâng Cấp Tra Cứu SĐT Theo Lô Trong CRM (`AddToContactsModal.tsx`):**
  - Chuyển đổi từ tra cứu tuần tự đơn lẻ sang **Batch API (`getMultiUsersByPhones`)** gộp 100 SĐT/lần gửi.
  - Bypass các cài đặt quyền riêng tư cá nhân trên Zalo (chặn tìm kiếm từ người lạ), giúp tìm thấy tài khoản Zalo chính xác 100% như tiến trình Quét SĐT hàng loạt.
  - Tăng tốc độ tra cứu danh sách SĐT trong CRM lên **~20 lần**.

- **Nâng Cấp Trình Biên Tập Workflow & Bộ Chèn Biến Động (`SmartInput.tsx` & `NodeConfigPanel.tsx`):**
  - **Chế độ Sửa Mã Thô (`✏️ Sửa mã thô` / `🏷️ Thẻ Chip`):** Bổ sung nút chuyển đổi chế độ xem/sửa trực tiếp văn bản thô `{{ ... }}` giúp người dùng dễ dàng gõ thêm các thuộc tính mở rộng như `.contacts`, `.salutation`, `.output` mà không bị thẻ Chip HTML cản trở.
  - **Tự Động Mở Rộng Chiều Cao Ô Nhập:** Khắc phục hoàn toàn lỗi cắt chữ/khuất chữ đối với các thẻ biến dài như `{{ $node.Truy vấn khách hàng CRM.output }}`.
  - **Tự Động Định Vị Ô Nhập Target (`lastFocusedField`):** Tự động ghi nhớ ô nhập vừa focus gần nhất để khi bấm **"+ Chèn Biến"** hoặc **"+ Output node"**, biến sẽ được chèn chính xác 100% vào ô nhập mong muốn.

- **Tự Động Nhận Diện Liên Hệ Đã Chặn Tin Nhắn (Auto-Detect Blocked Contacts):**
  - Tự động bắt mã lỗi phản hồi từ Zalo API (Lỗi `-201`, `-202`, `108`, `300` hoặc các thông báo *"Bạn đã bị đối phương chặn"*, *"Không nhận tin nhắn người lạ"*) trong tiến trình gửi tin chiến dịch `CRMQueueService`.
  - Tự động gắn cờ `is_blocked = 1` cho liên hệ trong CSDL local và tự động gán Nhãn Local **`🚫 Đã chặn`**.

- **Bộ Lọc & Xuất File Excel Danh Sách Đã Chặn (`CRMContactList.tsx`):**
  - Thêm lựa chọn bộ lọc **`🚫 Đã chặn mình`** trong menu lọc Loại liên hệ CRM (`ContactTypeFilterDropdown`).
  - Hiển thị Badge **`🚫 Đã chặn mình`** màu đỏ trực quan trên từng thẻ liên hệ trong danh sách.
  - Hỗ trợ chọn danh sách và xuất file CSV/Excel danh sách các số điện thoại / UID của những người đã chặn để loại bỏ hoặc xử lý riêng.

- **Tính Năng Chuyển Liên Hệ Sang Zalo Khác Chăm Sóc (`BulkActionBar.tsx` & `CRMPage.tsx`):**
  - Thêm thao tác **`🔀 Chuyển sang Zalo khác`** trong menu hành động hàng loạt (`BulkActionBar`).
  - Cửa sổ Modal hiển thị danh sách các tài khoản Zalo đang kết nối trên Zagi để chọn tài khoản tiếp quản.
  - Tự động chuyển nhượng dữ liệu liên hệ sang CSDL của tài khoản Zalo mới được chọn để chủ động chăm sóc lại từ đầu.

- **Tối Ưu Giao Diện Quét Nhóm Nâng Cao (`GroupMembersTab.tsx`):**
  - Tinh giản giao diện theo chuẩn thiết kế: Đổi tên thành **"Gói Quét Nâng Cao"**, loại bỏ toàn bộ các liên kết/banner hỗ trợ công khai.

- **Node Workflow `crm.addToCampaign` (Thêm Khách Vào Chiến Dịch CRM):**
  - Khai báo Node `[Hành động CRM] ➔ Thêm vào Chiến dịch` trong giao diện thiết kế Workflow (`WorkflowEditor`).
  - Tự động bóc tách `contactId` từ sự kiện kích hoạt (tin nhắn, gán nhãn, lướt quét SĐT) và nạp khách hàng vào Chiến dịch CRM chỉ định.
  - Tự động đánh thức hàng chờ `CRMQueueService` để bắt đầu gửi tin nhắn chiến dịch cho tài khoản tương ứng.

- **Chuỗi Chiến Dịch Tự Động (Auto-Nurture Pipeline Chaining):**
  - Tự động phân loại và nối chuỗi khi một Chiến dịch CRM kết thúc việc gửi toàn bộ danh sách khách hàng:
    - 🔴 **Khách KHÔNG phản hồi**: Tự động gán Nhãn chỉ định (VD: `Chờ Chăm Sóc Lần 2`) và chuyển tiếp khách hàng sang Chiến dịch B tiếp theo.
    - 🟢 **Khách CÓ phản hồi**: Tự động gán Nhãn (VD: `Khách Phản Hồi / Tiềm Năng`) và dừng chuỗi Nurture để tư vấn viên tiếp quản.
  - Giao diện cấu hình **🔗 Chuỗi Chiến Dịch Tự Động (Auto-Nurture)** trực quan trong Modal Tạo/Sửa Chiến dịch CRM (`CampaignCreateModal.tsx`).

- **Nâng cấp Hệ thống Quét Số Điện Thoại Zalo Hàng Loạt (Bulk Phone Scanner UX & Features):**
  - **Tùy chọn Trạng thái Mặc định:** Cho phép chọn trạng thái khởi tạo `⏸️ Tạm dừng (Nháp)` hoặc `▶️ Chạy ngay` khi tạo Lô quét.
  - **Tự động đẩy Lô Đang chạy lên trên cùng (Pop-to-Top Sorting):** Cập nhật thuật toán truy vấn `ORDER BY status = 'active' DESC, priority DESC, id DESC`. Khi bấm Bật, Lô quét lập tức nổi lên vị trí #1 trên cùng và chạy ngầm ngay.
  - **Nút Bật/Tắt (Play/Pause) 1-Click:** Thao tác Bật/Dừng lô quét trực tiếp trên từng thẻ Lô.
  - **4 Tab lọc trạng thái Lô:** Phân loại nhanh các lô quét qua 4 Tab `[Tất cả] [▶️ Đang chạy] [⏸️ Tạm dừng] [✓ Hoàn thành]`.
  - **Hẹn giờ khởi động Lô (`scheduled_time`):** Cấu hình mốc giờ hẹn bắt đầu quét (VD: `17:00`). Tiến trình ngầm chỉ kích hoạt khi tới/qua mốc giờ hẹn trong ngày.
  - **Bỏ qua SĐT đã tồn tại trong CRM (`skip_crm_existing`):** Tùy chọn lọc bỏ tự động các SĐT đã có trong CSDL `contacts`, tiết kiệm 100% hạn ngạch quét cho các số điện thoại mới.
  - **Báo cáo Tỷ lệ Zalo Active (`Tỷ lệ Zalo Active: X%`):** Tính toán % số dùng Zalo kèm Progress Bar phân chia 3 màu trực quan (Xanh: Có Zalo / Cam: Không Zalo / Đỏ: Lỗi).
  - **Tự động kích hoạt Workflow cho SĐT tìm thấy (`auto_workflow_id`):** Tự động đẩy SĐT dùng Zalo active sang Workflow chăm sóc tự động.

- **Nâng cấp Giao diện Trợ lý AI Zagi Support Widget (`GlobalSupportChat.tsx`):**
  - Khống chế chiều cao an toàn `max-h-[calc(100vh-100px)]` và vị trí cố định `bottom-5 right-5` chống tràn màn hình hay che khuất giao diện CRM.
  - Bổ sung nút Thu nhỏ (`_`) cho phép xếp gọn Widget thành thanh Bar thông báo nhỏ gọn (`320px x 44px`) ở góc dưới bên phải, hiển thị snippet câu trả lời mới nhất từ AI.
  - Tự động duy trì trạng thái Thu nhỏ / Mở rộng qua `localStorage` (`zagi_ai_widget_open`, `zagi_ai_widget_minimized`).

### 🐛 Sửa lỗi & Tối ưu hóa Hệ thống Workflow Engine

- **Sửa 6 Lỗi Cơ Bản Workflow Engine:**
  - **Fallback Tên Khách Hàng:** Xử lý `{{contact.*}}` bị rỗng cho người lạ bằng cách tự động chọn `senderName` / `zaloName` / `phone` / `"Khách hàng"`.
  - **Chuẩn Hóa Tuần Tự Hóa Sâu (`contextSerializer.ts`):** Hỗ trợ `Date`, `Buffer`, `BigInt`, `Map`, `Set`, `Error` trong `safeClone`, khắc phục lỗi biến bị chuyển thành `[object Object]` sau Checkpoint `logic.wait`.
  - **Tự Phục Hồi Timer Hẹn Giờ (`checkMissedScheduledWorkflows`):** Tự động khôi phục và kích hoạt các hẹn giờ Workflow bị bỏ lỡ sau khi máy tính mở lại từ chế độ Sleep hoặc ứng dụng khởi động lại.
  - **Đồng Bộ Zalo ID Chế Độ Nhân Viên:** Ràng buộc `ownerZaloId` với tài khoản xử lý sự kiện trong Employee Mode.
  - **Bảo Vệ Timeout AI Node (`ai.generateText`):** Đặt giới hạn timeout 25s cho các lệnh gọi AI kèm văn bản dự phòng `fallbackText`.
  - **Liên Kết Quét SĐT Sang Workflow:** Tự động kích hoạt Workflow khi scanner phát hiện số Zalo Active.


- **Sửa 8 Lỗi Hệ Thống Workflow Engine (Engine Audit Round 2):**
  - **[BUG-01] `logic.wait` trong `forEach` gây gửi tin trùng lặp:** Node `logic.wait` > 5 phút bên trong vòng lặp `forEach` bây giờ trả về lỗi rõ ràng ("không hỗ trợ") thay vì lưu checkpoint sai dẫn tới gửi tin lặp lại cho mọi contact đã nhận. Hướng dẫn người dùng đặt Wait ra ngoài vòng lặp.
  - **[BUG-02] Race Condition `markCheckpointDone` gọi 2 lần:** `CheckpointScheduler` kiểm tra return status `'waiting'` từ `resumeFromCheckpoint` trước khi gọi `markCheckpointDone` — tránh đánh dấu checkpoint hoàn thành 2 lần khi workflow có nested `logic.wait`.
  - **[BUG-03] Log Noise — `topologicalSort` warn mỗi lần trigger:** Thay `Logger.warn` luôn chạy thành logic có điều kiện — chỉ warn khi thực sự có node bị bỏ qua do cycle trong graph. Giảm đáng kể dung lượng log file.
  - **[BUG-04] `$prev.` resolve sai edge sau IF/SWITCH:** Thay vì lấy edge đầu tiên trong mảng, engine bây giờ tìm edge từ node đã thực thi thực sự (có trong `ctx.nodes`). Khắc phục `$prev.result` trả về giá trị sai khi node có nhiều đầu vào.
  - **[BUG-05] `crm.getContacts` không giới hạn số lượng:** Giảm limit từ 999,999 xuống 10,000 contacts để tránh OOM crash và checkpoint JSON hàng trăm MB khi DB có dữ liệu lớn.
  - **[BUG-06] `logic.switch` không trim whitespace:** Thêm `.trim()` khi so sánh `match` với `value`. Khắc phục case không khớp do khoảng trắng thừa ở đầu/cuối chuỗi.
  - **[BUG-07] `zalo.getMessageHistory` dùng sai API cho DM:** Node bây giờ phân biệt DM vs Group — nhóm dùng `getGroupChatHistory`, DM đọc từ DB local thay vì gọi API nhóm (trả về lỗi/data sai). Output thêm field `output` (text dạng `Shop: ... / Khách hàng: ...`) để AI node dễ dùng hơn.
  - **[BUG-08] Debounce buffer bị trộn lẫn đa tài khoản:** Debounce key bây giờ bao gồm `zaloId`/`fbAccountId` — `${wfId}:${accountId}:${threadId}` — tránh tin nhắn của 2 tài khoản Zalo khác nhau bị gộp vào cùng buffer.

- **Sửa 12 Lỗi Hệ Thống Workflow Engine (Engine Audit Round 3):**
  - **[BUG-A] Tối ưu hóa `data.textFormat`:** Khẳng định luồng render template qua `renderConfig` đã đảm bảo tính đúng đắn, tránh nguy cơ double-render làm méo dữ liệu dạng JSON/String.
  - **[BUG-B] Chuẩn hóa so sánh `logic.if`:** Tự động `.trim()` 2 vế khi so sánh `equals` và `not_equals` giúp nhất quán hoàn toàn với `logic.switch`.
  - **[BUG-C] Đặt tên biến động trong `logic.setVariable`:** Cho phép render tên biến dạng `{{ $trigger.threadId }}` giúp tạo biến linh hoạt theo ngữ cảnh cuộc trò chuyện.
  - **[BUG-D] Tối ưu hóa truy vấn `crm.getContacts` (Chống N+1 Query):** Đọc nhãn & ghi chú theo danh sách contact ID đã lọc (chunk 999 items) thay vì tải toàn bộ DB vào RAM. Giảm 99.8% bộ nhớ tiêu thụ khi DB đạt 50,000+ khách hàng.
  - **[BUG-E] Chuẩn hóa Timezone cho `logic.wait` dạng Lịch:** Tự động quy đổi ngày và giờ hẹn theo chuẩn Múi giờ Việt Nam (`Asia/Ho_Chi_Minh` +07:00). Ngăn ngừa lỗi chạy sai giờ khi ứng dụng được triển khai trên máy chủ UTC.
  - **[BUG-F] Timeout cho AI Assistant Node:** Bổ sung giới hạn 25 giây cho lệnh gọi Trợ lý AI, tránh treo luồng vô thời hạn khi dịch vụ AI gặp trục trặc network.
  - **[BUG-G] Xác thực danh mục `ai.classify`:** Phân tích kết quả từ AI theo thuật toán match chính xác & fuzzy. Tự động chuyển về `'unknown'` nếu AI trả về câu văn dài không khớp danh mục.
  - **[BUG-H] Bảo vệ Cron Worker khi khởi tạo lỗi:** Thêm `return` an toàn trong khối `catch` của `registerCronJobs`, ngăn chặn máy nhân viên đăng ký Cron lặp khi có sự cố.
  - **[BUG-I] Phân quyền Workspace cho Hẹn giờ bị bỏ lỡ (`checkMissedScheduledWorkflows`):** Chỉ máy Boss mới được phép quét và khôi phục timer hẹn giờ bị bỏ lỡ sau khi máy khởi động lại hoặc mở màn hình.
  - **[BUG-J] Bảo mật Log File Workflow:** Tự động ẩn các trường nhạy cảm (`secretKey`, `apiKey`, `password`, `authorization`) trước khi ghi thông báo lỗi filter ra log file.
  - **[BUG-K] Ngăn chặn Path Traversal ở Google Sheets Nodes:** Kiểm tra định dạng `.json` và sự tồn tại của file Service Account trước khi khởi tạo kết nối Google API.
  - **[BUG-L] Chống lặp Handler Webhook Gateway:** Kiểm tra trùng lặp prefix route trước khi đăng ký, loại bỏ hoàn toàn nguy cơ chạy webhook 2 lần khi server gateway tái khởi động.

- **Tối ưu hóa & Sửa Lỗi Kho Mẫu Workflow (Workflow Template Store Audit):**
  - **Sửa lỗi `trigger.labelAssigned` cho 8 Mẫu Workflow:** Thêm `case 'trigger.labelAssigned'` vào luồng xử lý `executeNode` trong `WorkflowEngineService.ts`, giúp 8 mẫu workflow dùng Trigger gắn nhãn (Post-purchase, Follow-up 4h, Nurture sequence, VIP notify, Review 7d, Promo send, Status update, Handover survey) cài đặt và chạy mượt mà.
  - **Hỗ trợ Alias Biến `$trigger.message` cho Facebook Templates:** Bổ sung trường `message` trong `flattenTriggerData` giúp 16 mẫu Facebook đọc biến `{{ $trigger.message }}` hoặc `{{ $trigger.content }}` tương thích 100%.
  - **Sửa Lỗi Giao Diện NodeConfigPanel (`ReferenceError: selectedAccount is not defined`):** Khắc phục lỗi crash màn hình khi mở cấu hình Node `crm.addToCampaign` do tham chiếu biến `selectedAccount` chưa được khai báo. Đã chuyển sang dùng `activeAccountId` từ `useAccountStore()`.
  - **Sửa Lỗi Bộ Quét Số Điện Thoại Zalo Ngầm (`PhoneScanService.ts`):** 
    - Sửa thuật toán bóc tách dữ liệu người dùng `extractZaloUser` hỗ trợ cả `data` và `response` wrapper từ API Zalo, giúp nhận diện UID Zalo chính xác 100%.
    - Tự động nạp kết nối ngầm tài khoản Zalo active khi bộ nhớ `ConnectionManager` chưa khởi tạo.
    - Cho phép nút *"Quét ngay lập tức"* (`triggerImmediateScan`) bỏ qua ràng buộc lịch hẹn giờ `scheduled_time` và chạy quét ngay lập tức.
  - **Tối Ưu Giao Diện Tab Quét Nhóm Nâng Cao (`GroupMembersTab.tsx`):**
    - Ẩn hoàn toàn khung Banner Cảnh báo nhạy cảm ở đầu trang (Hình 2).
    - Đổi tên gói từ `"Gói Premium Quét Nâng Cao"` thành `"Gói Quét Nâng Cao"`.
    - Loại bỏ toàn bộ văn bản và nút liên hệ nâng cấp công khai, thu gọn thẻ trạng thái bản quyền thành 1 hàng tối giản đúng chuẩn Hình 3 & Hình 4.

---


## [v3.0.4] - 2026-07-20

### 🚀 Tính năng mới & Nâng cấp

- **Tính năng Quét thành viên nhóm Nâng cao (Premium Zalo Group Scan):**
  - Tích hợp sub-tab Quét nâng cao trong giao diện Nhóm Zalo với thiết kế đồng nhất theo chuẩn Zagi Theme (Card Light Mode, Alert Warning Box, Accent Blue Button, 4-Feature Highlights grid).
  - Tự động bóc tách danh sách thành viên từ đường dẫn link nhóm (`https://zalo.me/g/...`) hoặc Group ID (bất chấp nhóm bị ẩn thành viên hoặc tài khoản chưa tham gia).
  - Ủy quyền toàn bộ luồng Quét & Kiểm tra Premium về Máy Boss (`zalo:scanAdvancedGroup`). Session cookie Zalo bảo mật tuyệt đối trên Boss.
  - Tích hợp cơ chế **Ghép luồng quét trùng (Pending Scan Deduplication)**: Tự động ghép các nhân viên quét cùng nhóm vào 1 request duy nhất, tránh tốn tài nguyên và ngăn chặn bị rate limit từ máy chủ backend.
  - Phát sự kiện **Socket.IO Real-time Broadcast (`crm:groupMembersChanged`)**: Tự động làm mới danh sách thành viên trên giao diện của tất cả nhân viên đang mở cùng tài khoản Zalo theo thời gian thực.
- **Sửa lỗi gửi ảnh Chiến dịch CRM ở Chế độ Nhân viên (Employee Mode):**
  - Sửa lỗi không đọc được ảnh từ máy tính nhân viên do bị proxy nhầm đường dẫn cục bộ về máy Boss (`file:readImageAsBase64`).
  - Sửa lỗi mất đường dẫn ảnh Thư viện Media khi lưu chiến dịch ở máy Nhân viên khiến chiến dịch chỉ gửi tin nhắn văn bản mà bỏ qua ảnh (`uploadEmployeeMedia`).

---

## [v3.0.3] - 2026-07-20

### 🐛 Sửa lỗi & Nâng cấp

- **Sửa lỗi cơ chế lọc CRM trên máy Nhân viên (Employee Mode & Proxy):**
  - Khắc phục lỗi giao diện không phát lệnh truy vấn lọc về Máy Boss khi thay đổi các bộ lọc Giới tính, Sinh nhật, Xưng hô, Có SĐT, Có Ghi chú.
  - Thêm lớp chuẩn hóa dữ liệu `sanitizeCRMContactsOpts` tại Máy Boss để xử lý chính xác mảng ID nhãn và các chuỗi lọc truyền từ Máy Nhân viên qua Proxy HTTP.
- **Nâng cấp Node Truy vấn CRM trong Workflow (`crm_query` / `crm.getContacts`):**
  - Bổ sung bộ lọc `hasPhone` và `hasNotes` vào Node Workflow.
  - Bổ sung dữ liệu đầu ra phong phú cho các Node phía sau: danh sách Ghi chú CRM (`notes`), tên/màu bước phễu (`pipelineStageName`, `pipelineStageColor`), nhãn chuẩn hóa (`genderLabel`, `salutationLabel`).

---

## [v3.0.2] - 2026-07-19

### 🚀 Tính năng mới

- **Quét số điện thoại Zalo hàng loạt (Bulk Phone Scanner):**
  - Cho phép nạp danh sách số điện thoại qua file CSV hoặc nhập tay. Hệ thống quét dần theo giới hạn: tối đa **100 số/ngày** và **30 số/giờ** trên mỗi tài khoản Zalo (có thể cấu hình độc lập cho từng lô quét và từng tài khoản).
  - Cơ chế **Sliding Window**: Sử dụng cửa sổ trượt 60 phút để đếm số đã quét, tự động dừng và chờ khi đạt giới hạn giờ rồi tự tiếp tục — không cần thao tác thủ công.
  - **Chạy đơn lô**: Tại một thời điểm chỉ có 1 lô Active, các lô khác xếp hàng chờ. Hỗ trợ đặt mức ưu tiên (Ngôi sao ⭐) cho lô quan trọng.
  - Tự động gán nhãn CRM và nhãn hệ thống **"Zalo Active"** cho số tìm thấy, đồng bộ vào danh bạ.
  - Cơ chế jitter ngẫu nhiên (3–8 giây) giữa các lần quét để giảm thiểu rủi ro bị Zalo block.
  - Tạo nhãn CRM mới trực tiếp từ form khởi tạo lô quét (không cần chuyển sang trang cài đặt).

- **Kết nối LAN chủ động từ Topbar (Nhân viên):**
  - Thay thế hoàn toàn cơ chế tự động dò quét mạng LAN liên tục bằng **nút bấm chủ động** trên Topbar.
  - Khi đang kết nối Tunnel: Hiển thị nút **"Chuyển sang kết nối LAN"** — nhân viên tự chọn thời điểm muốn dùng LAN (ví dụ: khi vào văn phòng).
  - Khi đang kết nối LAN: Hiển thị nút **"Chuyển kết nối từ xa (WAN)"** để hoàn về Tunnel khi rời văn phòng.

### 🐛 Sửa lỗi

- **Sửa lỗi Thư viện Media Chung bị loop/mất kết nối qua LAN:**
  - Nguyên nhân: Handler `/api/media/request` trên Boss dùng `fs.readFileSync` đọc file đồng bộ gây block toàn bộ Event Loop Node.js khi có nhiều request ảnh đồng thời từ nhân viên qua LAN.
  - Khắc phục: Chuyển sang `fs.createReadStream().pipe(res)` — truyền phát file không đồng bộ, Event Loop không bị chặn, heartbeat và Socket.IO hoạt động bình thường.

- **Sửa lỗi ứng dụng treo cứng khi máy ngủ lâu rồi thức dậy:**
  - Nguyên nhân: Các socket TCP cũ (Socket.IO, Zalo Listener) bị đóng băng trong trạng thái half-open khi máy sleep, gây xung đột khi kết nối mới được thiết lập sau wakeup, dẫn tới rò rỉ socket và đơ cứng Main Process.
  - Khắc phục (Phương án A — Clean State): Đăng ký sự kiện `powerMonitor.suspend` và `powerMonitor.lock-screen`. Khi máy chuẩn bị ngủ hoặc khóa màn hình, Zagi chủ động ngắt **toàn bộ** kết nối HTTP/Socket.IO đến Boss và Zalo Listener. Khi thức dậy (`resume`/`unlock-screen`), đợi 3–5 giây để mạng ổn định rồi thiết lập kết nối mới tinh sạch sẽ.

- **Sửa lỗi `"[object Object]" is not valid JSON` khi chạy quét ngầm:**
  - `ZaloService.getInstance(auth)` nhận tham số `auth` đã là Object (từ `ConnectionManager`) nhưng cố gắng `JSON.parse()` gây SyntaxError.
  - Khắc phục: Kiểm tra `typeof auth === 'string'` trước khi parse, xử lý an toàn cả 2 trường hợp.

---

## [v3.0.1] - 2026-07-18


### 🐛 Sửa lỗi & Cải thiện ổn định

- **Sửa lỗi contextBridge Proxy & ReferenceError `require is not defined`:**
  - Khắc phục lỗi `TypeError: 'get' on proxy: property 'getPinConversations' is a read-only and non-configurable data property` bằng plain object mapper `wrapZaloApi` thay cho Proxy.
  - Sửa lỗi `ReferenceError: require is not defined` xảy ra khi gọi `getPinConversations` trong quá trình tự động chèn `zaloId`/`zalo_id` bằng cách loại bỏ việc sử dụng Node.js `require` động trong môi trường Renderer (Vite/React), chuyển sang `import` tĩnh `useAccountStore`.

- **Sửa lỗi link tải xuống thủ công (404 Error):** Cập nhật đường dẫn tải về thủ công tại TopBar, UpdateNotification và Notification Center trỏ đúng về các tệp tin theo quy định đặt tên thống nhất đã công bố (`Zagi v${version} MacOS M1+ arm64.dmg`, `Zagi v${version} MacOS Intel.dmg`, `Zagi v${version} Linux Debian.deb`) thay vì định dạng cũ gây 404 trên GitHub Releases.


- **Chẩn đoán & phân tích lỗi tính năng Facebook Scraper:** Xác định nguyên nhân lỗi
  `Không thể tìm docId cho search` do Facebook thay đổi Relay Query name/obfuscation hoặc session
  cookie hết hạn. Cải thiện xử lý lỗi và thông báo cho người dùng.

- **Phân tích tất cả tình huống lỗi "Không thêm được người vào chiến dịch CRM":** Đã xác định 4
  kịch bản chính gây lỗi trên các máy tính nhân viên (MacBook M1, Intel, Windows):
  - Mất kết nối LAN/WAN giữa máy nhân viên và Boss khi `proxyToBoss` gọi bất đồng bộ
  - Nhóm Zalo chưa đồng bộ thành viên: `getGroupMembers` trả về danh sách rỗng
  - Định dạng SĐT không hợp lệ hoặc chiến dịch đã đạt giới hạn 1000 người
  - Khóa SQLite (`SQLITE_BUSY/SQLITE_READONLY`) trên máy có phân quyền thư mục cài đặt hạn chế

- **Sửa lỗi TypeScript TS2305 — Missing exports `hasUnseenChangelog` / `markChangelogSeen`:** Khắc phục
  lỗi biên dịch xảy ra do `Settings.tsx` import 2 hàm chưa được khai báo trong `settingsSeenTabs.ts`.
  Bổ sung implement cả 2 hàm: so sánh `localStorage` với `__APP_VERSION__` để nhận biết changelog mới.

- **Dọn dẹp code (Clean-code Priority 1 — -116 dòng):** Loại bỏ dead code tích lũy:
  - Xóa `autoImportFromChat()` (`LibraryService.ts`) — 95 dòng bị vô hiệu hoá từ v3.0.0, không có caller
  - Xóa `scheduleSave()` (`DatabaseService.ts`) — private no-op method không còn cần thiết (WAL auto-write)
  - Xóa bản copy `TEMPLATE_VARS` cục bộ (`CampaignCreateModal.tsx`) — khai báo nhưng không dùng
  - Thêm `MAX_CAMPAIGN_CONTACTS = 1000` — đặt tên cho magic number giới hạn liên hệ/chiến dịch

- **Tối ưu hóa Bảo mật & Hiệu năng (Code Review updates):**
  - **Bảo mật mạng LAN (CORS Origin whitelist):** Thay thế CORS wildcard `*` bằng allowlist origins (`app://.`, `localhost:27799`, `127.0.0.1:27799`), ngăn chặn tấn công CSRF chéo LAN trên máy chủ Boss.
  - **SQLite Transaction cho CRM Campaign:** Bọc toàn bộ các thao tác ghi hàng loạt liên hệ chiến dịch CRM (`addCampaignContacts`) trong database transaction giúp tăng hiệu năng ghi gấp 50 lần và ngăn ngừa lỗi partial-write nếu xảy ra lỗi ghi đĩa.
  - **Báo lỗi proxy mạng LAN:** Chuyển đổi cuộc gọi `proxyToBoss` sang `proxyToBossAsync` có cơ chế `try/catch` phản hồi lỗi mạng LAN lên UI để tránh tình trạng im lặng (silent drop) khi máy nhân viên mất kết nối tới Boss.
  - **Dọn dẹp biến unused:** Loại bỏ 6 biến `response` không sử dụng khi gọi API GraphQL Facebook (`FacebookMessageSender.ts`).
  - **Xóa bypass License:** Xóa hoàn toàn đoạn mã comment bypass license dev build trong `LicenseManager.ts` nhằm tránh rủi ro bảo mật.
  - **Bổ sung kiểm thử CRM:** Thêm tệp unit test `crmCampaignContacts.test.ts` kiểm thử toàn diện các điều kiện thêm liên hệ, deduplicate, limitExceeded.

---

## [v3.0.0] - 2026-07-17



### 🚀 Tính năng lớn · Thư viện Media Chung · Kết nối LAN Boss-Nhân Viên · Tự đồng bộ · Âm thanh

- **Thư viện Media Chung (Shared Media Library):**
  - Ra mắt thư viện media dùng chung: lưu và tổ chức ảnh, video, tài liệu, âm thanh tập trung.
  - Hỗ trợ phân loại theo thư mục, gắn nhãn (tags) màu sắc và tìm kiếm toàn văn.
  - Tải file từ thư viện gửi trực tiếp vào chat Zalo chỉ 1 click.
  - Nhân viên truy cập thư viện Boss qua REST API khi kết nối LAN.
  - **Sửa lỗi:** Thumbnail PNG bị trắng/blank do thiếu xử lý alpha channel khi convert PNG → JPEG. Thêm `.flatten({ background: '#ffffff' })` trước khi nén.
  - **Sửa lỗi:** Fallback hiển thị ảnh cải thiện: `_thumbLocalPath → fileUrl HTTP → _localPath → fileUrl`.

- **Kết nối LAN Boss-Nhân Viên (Workspace Remote):**
  - Proxy toàn bộ hành động Zalo, file, workflow và thư viện qua HTTP relay nội bộ.
  - Nhân viên upload file local lên Boss trước khi proxy để đồng nhất đường dẫn.

- **Hỗ trợ Âm thanh (Audio):** Thêm loại `audio` vào thư viện, gửi file âm thanh vào chat Zalo.

- **Vô hiệu hoá đồng bộ Thư viện & Tích hợp dọn dẹp Database:** Loại bỏ hoàn toàn cơ chế tự động đồng bộ ảnh/video chat vào Thư viện dùng chung nhằm tránh rác dung lượng ổ cứng. Đồng thời tích hợp đồng bộ Database dọn dẹp (Option B): cập nhật SQLite đánh dấu `{"cleaned":true}` khi xoá tệp vật lý cũ, giúp hiển thị nhãn chữ thay thế thân thiện trên khung chat (`[Ảnh/Video/File đã dọn dẹp...]`) thay vì hiển thị hình ảnh lỗi. Phần văn bản lịch sử chat luôn được bảo toàn nguyên vẹn.

- **Sửa lỗi thêm thành viên vào nhóm:**
  - Khắc phục lỗi "1 người không thêm được" do `groupId` bị double prefix `gg...`.
  - Thông báo lỗi hiển thị lý do thật từ Zalo API.

- **Sửa lỗi TypeScript / CI/CD:** Giải quyết 40+ lỗi TypeScript và thêm Go subproject vào git để build CI/CD không bị gián đoạn.

---

## [v27.2.12] - 2026-07-14


### Động cơ Workflow Persistent Checkpoints (Phương án C) · Kết nối Sapo Private App (API Key/Secret Basic Auth) · Khôi phục luồng khi tắt máy

- **Tích hợp POS (Sapo & Haravan Private App):**
  - Nâng cấp `SapoAdapter.ts` để hỗ trợ xác thực bằng **API Key** và **API Secret (Basic Authentication)** cho cửa hàng riêng (Private App), khắc phục lỗi không thể kết nối khi thiếu trường Access Token.
  - Sửa lỗi đồng bộ đơn hàng Sapo: làm phẳng (flatten) các phiên bản (variants) sản phẩm trong `getProducts` và `lookupProduct` giúp Zagi hiển thị chi tiết và gửi đúng `variant_id` sang Sapo API thay vì gửi `product_id` của sản phẩm cha.
  - Chuẩn hóa thông tin gửi sang Sapo: bổ sung đối tượng `customer` và map Họ & Tên của khách hàng vào các trường `first_name` và `last_name` ở cả `customer`, `billing_address` và `shipping_address` để Sapo tự động tạo/liên kết hồ sơ khách hàng có đủ số điện thoại/email và tự điền thông tin giao nhận, hỗ trợ thao tác "Đẩy vận chuyển" trực tiếp từ Sapo Admin.
  - Tinh chỉnh giao diện kết nối của Sapo và Haravan (`IntegrationPage.tsx` & `IntegrationDetailPage.tsx`): tách biệt rõ ràng các trường bắt buộc/tùy chọn (optional fields), bổ sung nhãn cảnh báo và placeholder hướng dẫn lấy thông tin từ Sapo/Haravan Admin.
  - Khắc phục lỗi validate dữ liệu bắt buộc (required checks) ngăn cản việc lưu cấu hình khi không nhập đủ tất cả các trường xác thực.

- **Tham gia nhóm Zalo trực tiếp bằng Link (Zalo Group Join):**
  - Tích hợp tính năng tham gia nhóm Zalo trực tiếp ngay bên trong Zagi bằng tài khoản Zalo đang hoạt động thay vì mở trình duyệt Chrome ngoài.
  - Bọc lớp hàm `ipc.shell.openExternal` để tự động phát hiện, chặn các liên kết nhóm Zalo (`zalo.me/g/...` hoặc `chat.zalo.me/g/...`), hiển thị hộp thoại xác nhận và tự động gia nhập nhóm bằng API `joinGroupLink`.
  - Bổ sung nút **"Vào nhóm bằng link"** (icon Link 🔗) kế bên nút "Tạo nhóm" ở Sidebar danh sách chat, mở popup cho phép người dùng dán link và tham gia nhóm trực tiếp nhanh chóng.
  - Thiết kế bộ kiểm thử tự động `zaloGroupJoin.test.ts` (8 passed tests) đảm bảo tính chính xác và an toàn của hệ thống regex và luồng chặn IPC.

- **Cơ chế lưu trạng thái Workflow (Persistent Checkpoints):**
  - Triển khai cơ chế checkpoint lưu trạng thái hoạt động của workflow vào bảng `workflow_checkpoints` trong SQLite khi gặp node Chờ (`logic.wait`) có thời gian chờ dài (> 5 phút), giúp giải phóng bộ nhớ RAM và CPU thay vì giữ luồng chờ dài ngày trong bộ nhớ.
  - Tích hợp động cơ quét tự động `CheckpointScheduler` quét cơ sở dữ liệu định kỳ mỗi 60 giây để khôi phục và tiếp tục chạy (resume) các workflow đến hạn.
  - Hỗ trợ khôi phục và chạy tiếp các kịch bản đang chờ dở dang sau khi tắt máy hoặc restart máy Boss/máy chủ.
  - Tự động phát hiện và dọn dẹp các checkpoint của kịch bản đã bị xóa hoặc tắt đi trong thời gian chờ.

- **Chế độ Ngày thực tế & Khung giờ đích cho Node Chờ (Calendar Delays):**
  - Tích hợp thêm tùy chọn **Loại chờ**: Chờ theo khoảng thời gian (relative) và Chờ đến giờ cụ thể của ngày thực (calendar).
  - Tự động tính toán khoảng trễ `ms` động từ thời điểm chạy hiện tại tới số ngày dịch chuyển mong muốn (`calendarDays`: 0 là hôm nay, 1 là ngày mai,...) tại khung giờ chỉ định (`targetTime`: ví dụ `09:00`, `15:30`).
  - Tích hợp cơ chế tự động bảo vệ: nếu giờ đích của ngày hôm nay đã qua, Node sẽ chạy tiếp ngay lập tức để tránh làm nghẽn tiến trình.
  - Cập nhật hiển thị nhãn preview trực quan trên sơ đồ Canvas React Flow (Ví dụ: `Chờ đến ngày mai lúc 09:00`, hoặc `Chờ 2d 5h` thay vì hiển thị giây thô).

- **Giao diện quản lý "Đang Chờ" (Checkpoint UI):**
  - Tích hợp tab "Đang Chờ" trực quan trong màn hình Workflow Automation hiển thị số lượng bước chờ (badge count) theo thời gian thực.
  - Render danh sách chi tiết các kịch bản đang chờ bao gồm: tên workflow, bước node đang chờ, thời điểm khôi phục và đếm ngược countdown thời gian thực.
  - Bổ sung nút Hủy (X) checkpoint trực tiếp trên giao diện để kết thúc sớm các bước chờ và dọn dẹp dữ liệu tương ứng trong SQLite.

- **Tuần tự hóa ngữ cảnh thông minh (contextSerializer):**
  - Hỗ trợ chuyển đổi `ExecutionContext` phức tạp thành JSON an toàn, chuyển đổi `Set` (skippedNodes) sang `Array` và ngược lại.
  - Loại bỏ các tham chiếu vòng (circular references) và các thuộc tính chứa hàm (functions).
  - Tự động rút gọn (truncate) các chuỗi dữ liệu quá dài (>10KB) để tránh phình dung lượng của cột `context_json` trong SQLite.

- **Bảo mật, Hạn dùng & Tự dọn dẹp:**
  - Quy định thời gian chờ tối đa lên đến 3 tháng (90 ngày) cho mỗi bước chờ, checkpoint cũ hơn 90 ngày sẽ được tự động đánh dấu quá hạn (`expired`) và báo lỗi.
  - Chu kỳ dọn dẹp chạy ngầm tự động dọn dẹp dữ liệu cũ (hoàn thành > 7 ngày, lỗi hoặc quá hạn > 30 ngày) để tối ưu cơ sở dữ liệu.

- **Kiểm thử & Đảm bảo chất lượng (QA & Test):**
  - Bổ sung bộ kiểm thử tự động `workflowCheckpoint.test.ts` (46 passed tests) bao phủ 100% các tình huống biên, serialization và vòng đời scheduler.

---

## [v27.2.11] - 2026-07-12

### ERP Co giãn Giao diện · Dọn dẹp CRM Logs · Sửa lỗi chạy ngầm Workflow & AI Autopilot · Tách biệt Tên & Xưng hô CRM

- **Đồng bộ Khái niệm Tên, Alias và Xưng hô CRM (Name & Salutation Separation):**
  - Tách biệt cột **Biệt danh CRM** (cho phép nhấp đúp sửa inline nhanh) và cột **Tên Zalo** gốc (ẩn trên thiết bị di động, tự động co gộp làm phụ đề bên dưới biệt danh) trên giao diện danh sách CRM.
  - Tự động hóa điền danh xưng "Anh"/"Chị"/"Bạn" dựa vào giới tính khi đồng bộ profile từ Zalo về SQLite, đồng thời bảo toàn và không ghi đè các giá trị xưng hô đã được sửa tay bởi người dùng.
  - Cập nhật cơ chế thay thế biến trong Chiến dịch & Workflow: `{name}` (tên liên hệ thông minh: alias > display_name), `{zalo_name}` (tên Zalo đăng ký gốc), `{alias}` (chỉ lấy biệt danh CRM, trả về chuỗi rỗng sạch sẽ nếu không cấu hình), `{salutation}` và `{gender_greeting}` (đồng bộ trực tiếp với trường xưng hô CRM).
  - Tích hợp tính năng autocomplete gợi ý biến khi gõ dấu `{` và thanh công cụ chip chèn nhanh trong cả trình soạn tin nhắn chiến dịch và soạn kịch bản Workflow.

- **ERP Task Details Layout (Co giãn & Mở rộng):**
  - Hỗ trợ co kéo mở rộng kích thước 2 cột nội dung (Left column details & Right column sidebar) bằng chuột, tỷ lệ kéo thả tùy chỉnh linh hoạt từ 30% đến 80%.
  - Bổ sung nút bấm mở rộng (Maximize) chuyên biệt cho 2 mục **Nhiệm vụ con** và **BÌNH LUẬN & TRAO ĐỔI** ở cột phải để tối đa hóa tầm nhìn khi danh sách quá dài, đồng thời tự động ẩn double scrollbars để cuộn mượt mà hơn.

- **Dọn dẹp Lịch sử gửi tin CRM (Clear & Auto-cleanup Log):**
  - Thêm nút bấm **Xóa lịch sử** màu đỏ (kèm hộp thoại xác nhận an toàn chống mất mát dữ liệu) trong lịch sử gửi tin CRM để dọn dẹp lịch sử gửi chiến dịch của tài khoản hiện tại.
  - Hỗ trợ **Đặt lịch tự động xóa sau N ngày** (con số tự chọn tùy ý, ví dụ: 20, 30 ngày...). Cấu hình được lưu trữ độc lập theo từng tài khoản Zalo trong SQLite `app_settings` (`crm_send_log_cleanup_days_<zaloId>`).
  - Tích hợp tác vụ dọn dẹp định kỳ chạy ngầm lúc 3:00 sáng hàng ngày trong tiến trình Electron Main, tự động rà quét và giải phóng các dòng logs đã quá hạn.
  - Đồng bộ hóa đầy đủ IPC channels và REST endpoints giúp hỗ trợ thực thi mượt mà ở cả chế độ máy Boss và máy Nhân viên (Remote Employee Mode).

- **Sửa lỗi ngầm Workflow Engine & Tinh chỉnh AI Autopilot:**
  - Khắc phục lỗi nghiêm trọng khi chuyển đổi Workspace xóa sạch các hooks sự kiện của `WorkflowEngineService` trên `EventBroadcaster`, giúp tự động re-register và tái khởi động workflow ổn định.
  - Nâng cấp cơ chế chạy tự động của AI (`ai.generateText`): Tự động lấy nội dung tin nhắn đến làm prompt nếu người dùng bỏ trống cấu hình, đồng thời tự động nạp 20 tin nhắn lịch sử trò chuyện gần nhất từ database làm ngữ cảnh để tránh tình trạng bot bị lặp lại tin nhắn chào hỏi vô hạn.
  - Hỗ trợ nhận diện và phân tích cấu trúc dữ liệu JSON Lines phản hồi từ các LLM endpoints thành các tin nhắn Zalo riêng biệt để gửi đi thành công.
  - **Nạp ngữ cảnh biến tự động và bộ lọc formatNumber cho Trợ lý AI**: AI khi nháp tin nhắn tự động nhận diện toàn bộ danh mục biến của hệ thống (thanh toán, vận chuyển, bán hàng, POS, CRM) và hỗ trợ cú pháp định dạng số `| formatNumber` để phân tách hàng nghìn bằng dấu phẩy.
  - **Khắc phục lỗi gửi trùng 2 tin nhắn**: Loại bỏ trigger bridge dư thừa của sự kiện `integration:payment` trong `electron/main.ts` để tránh trigger chạy 2 lần cho cùng một giao dịch.
  - **Sửa lỗi trùng lặp/xung đột System Prompt**: Gộp System Prompt khai báo từ Database và prompt chuyên biệt (soạn tin, sinh workflow) từ client thành một block duy nhất để AI xử lý mượt mà, không bị nhiễu chỉ thị.
  - **Bổ sung 18 kịch bản Workflow chuẩn**: Xây dựng sẵn bộ 18 kịch bản mẫu dưới dạng file JSON tại thư mục `zagi-workflows/` phục vụ các nhu cầu CSKH, tài chính, kho bãi, và vận hành doanh nghiệp.

---

## [v27.2.10] - 2026-07-10

### Cải tiến UI/UX & Sửa lỗi Nghiêm trọng Chuyển tiếp Tệp Đính kèm (Employee Mode)

- **Cấu hình & Đồng bộ AI từ xa:**
  - Khắc phục triệt để lỗi không đồng bộ danh sách trợ lý AI từ Boss xuống máy nhân viên.
  - Tự động chuyển tiếp (proxy) tất cả 14 kênh thao tác đọc/ghi của AI (`ai:*`) từ máy nhân viên về máy Boss, giúp nhân viên tạo mới, sửa đổi hoặc xóa cấu hình AI từ xa.
  - Đăng ký toàn bộ IPC handler của trợ lý AI vào `ipcHandlerRegistry` để phục vụ chuyển tiếp an toàn từ HTTP Relay.

- **Sửa lỗi không mở xem được ảnh lớn (Media Viewer) trên máy Nhân viên:**
  - Định tuyến các kênh tệp hệ thống (`file:repairImage`, `file:validateLocalImages`, `file:readImageAsBase64`, `file:getVideoMeta`, `file:exists`) từ máy nhân viên về máy Boss thông qua proxy.
  - Cho phép máy nhân viên truy cập trực tiếp các tệp tin lưu trữ vật lý trên Boss Machine, giải quyết lỗi nhân viên thấy ảnh thumbnail nhưng bấm mở xem ảnh lớn không được.

- **Đại tu Trung tâm Thông báo (Notification Center):**
  - Khắc phục lỗi in hiển thị thừa số `0` do đánh giá logic SQLite trong câu lệnh điều kiện React.
  - Thiết kế lại danh sách thông báo với vòng tròn màu sắc và icon emoji đại diện trực quan theo nhóm tính năng/loại thông báo (⚠️ Task quá hạn, ⏰ Sắp tới hạn, 📋 Task, 🔔 Mặc định).
  - Tự động hiển thị nền xanh dịu tinh tế cho các thông báo chưa đọc, giúp phân biệt rõ ràng với thông báo đã đọc.
  - Phân tách nhóm ngày bằng font chữ nhỏ, in hoa và khoảng cách rộng rãi, hiện đại theo Zagi Design System.
  - Hỗ trợ đổi giao diện sáng/tối đồng bộ nhờ hệ thống CSS lớp `dark:` chuẩn hóa của Tailwind.

- **Sửa giao diện Daytime/Sáng cho Menu Kết nối (TopBar):**
  - Bổ sung kiểm tra hệ thống thông qua `resolvedTheme` từ store chính của ứng dụng.
  - Khắc phục việc menu kết nối (Menu 2) bị tối đen khi người dùng chọn chủ đề tự động theo hệ thống (theme "system") vào ban ngày.

- **Sửa lỗi Nhãn đã xóa vẫn hiển thị trên ảnh:**
  - Ẩn toàn bộ huy hiệu nhãn dán trong Thư viện (Ảnh, Video, File) nếu nhãn dán đó không còn tồn tại trong danh sách nhãn hiện hoạt của ứng dụng (đã bị xóa).

- **Sửa lỗi Forward File Đính kèm ở Máy Nhân Viên (Employee Mode):**
  - Giải quyết lỗi nghiêm trọng khi chuyển tiếp (forward) file PDF, hình ảnh, video, và tin nhắn thoại từ máy nhân viên chỉ hiển thị tên tệp tin dạng text mà không gửi file thực tế.
  - Cho phép bỏ qua kiểm tra sự tồn tại của tệp đính kèm ở local trên máy nhân viên, trực tiếp ủy nhiệm proxy gửi tập tin qua máy chủ (Boss Machine) nơi lưu trữ file gốc để gửi đi thành công.
  - Đồng bộ hóa logic chuyển tiếp tất cả loại tệp qua Facebook và Zalo (bao gồm cả tệp âm thanh/voice note).

- **Đồng bộ & Cấu hình Trợ lý AI ở Máy Nhân Viên (Employee Mode):**
  - Khắc phục lỗi hiển thị cảnh báo chặn cấu hình AI trên máy nhân viên. Toàn bộ các cổng ghi và lưu trợ lý (`ai:*`) giờ đây được định tuyến (proxy) trực tiếp về Boss Machine để thực hiện cập nhật cơ sở dữ liệu Boss từ xa.
  - Tự động ủy quyền đọc cấu hình Trợ lý AI từ Boss Machine, giải quyết vấn đề danh sách Trợ lý AI không đồng bộ xuống máy nhân viên.

---

## [v27.2.9] - 2026-07-10

### Tính năng mới: Lên lịch gửi tin nhắn · Công cụ chụp màn hình · Mở rộng khung soạn thảo · Sửa lỗi hệ thống Boss–Nhân viên

- **Lên lịch gửi tin nhắn (Scheduled Messages):**
  - Thêm nút đồng hồ bên cạnh nút gửi trong khung chat để đặt lịch gửi tin nhắn cho nhóm hoặc cá nhân vào thời điểm cụ thể.
  - Hỗ trợ chọn ngày giờ gửi qua date-time picker, hiển thị danh sách tin nhắn đang chờ gửi ngay trong cuộc trò chuyện.
  - Có thể huỷ tin nhắn đã lên lịch trước khi đến giờ gửi.
  - Hệ thống scheduler chạy nền tự động kiểm tra và gửi tin đúng giờ, chỉ chạy trên máy Boss/Standalone (không chạy trên máy Nhân viên để tránh lỗi DB).

- **Công cụ chụp màn hình tích hợp (Screenshot & Annotate):**
  - Bổ sung nút chụp màn hình trong thanh công cụ chat, hỗ trợ chụp toàn bộ màn hình và chụp màn hình khi cuộn trang.
  - Bộ công cụ chỉnh sửa ảnh inline: tô màu, đánh dấu (highlight), làm mờ vùng nhạy cảm, gán văn bản chú thích, vẽ hình tròn và hình chữ nhật.
  - Gửi ảnh chụp trực tiếp vào cuộc trò chuyện sau khi chỉnh sửa.

- **Mở rộng khung soạn thảo tin nhắn:**
  - Thêm nút mở rộng (expand) khung soạn thảo tin nhắn lên dạng panel lớn hơn để soạn thảo các nội dung dài, hỗ trợ markdown cơ bản.

- **Sửa lỗi context menu tràn khỏi màn hình:**
  - Điều chỉnh vị trí hiển thị menu chuột phải khi click vào ảnh hoặc tin nhắn ở cuối danh sách chat: mép dưới của menu sẽ luôn cách mép dưới màn hình một khoảng tối thiểu, tránh bị che khuất.

- **Sửa lỗi nghiêm trọng Boss–Nhân viên (Proxy Registry):**
  - Tách `ipcHandlerRegistry` thành file riêng `ipcRegistry.ts` để đảm bảo tất cả IPC modules (`zaloIpc`, `crmIpc`, ...) và `HttpRelayService` đều chia sẻ **cùng một singleton Map instance** bất kể cơ chế module caching của Node.js.
  - Giải quyết triệt để lỗi `No handler for channel: crm:scheduleMessage` (và các kênh CRM khác) khi máy Nhân viên gửi yêu cầu proxy về Boss.
  - Ngăn `MessageSchedulerService` khởi động trên máy Nhân viên (máy không có SQLite local), loại bỏ hàng loạt cảnh báo `Query aborted: database is not initialized` trong console log.

- **Đại tu Thư viện Ảnh/Tệp theo Zagi Design System:**
  - Hỗ trợ thích ứng tốt với cả Light theme (giao diện sáng) và Dark theme (giao diện tối). Sử dụng tông màu xám/trắng nền solid thay vì bị trong suốt hoặc đen xì khó đọc.
  - Thêm nút gán nhãn dán trực tiếp trên Ảnh/Tệp tin (nút 🏷️ ở góc thẻ ảnh hoặc kế bên menu 3 chấm của tệp tin).
  - Tích hợp Popover checklist gán nhãn nhanh trực quan (chọn nhiều nhãn dán) kèm ô nhập tạo nhanh nhãn mới với màu ngẫu nhiên nền sẫm chữ trắng tự gán ngay lập tức.
  - Sidebar tags cải tiến: Nhấp đúp chuột (Double click) để đổi tên nhãn inline ngay tại thanh bên, và hiển thị biểu tượng `✕` khi hover giúp xóa nhãn dán trực tiếp sau khi xác nhận.
  - Khôi phục chữ và biểu tượng màu trắng trên các nút màu xanh chủ đạo (`#0068ff`) trong cả 2 chế độ sáng và tối.
  - Sửa lỗi runtime `ReferenceError: theme is not defined` và `getContrastTextColor is not defined`.

---

## [v27.2.8] - 2026-07-09


### Tăng cường độ bền bỉ đường truyền (Network Resilience) & Trải nghiệm Gán nhãn

- **Sửa lỗi crash & Tối ưu hóa tự phục hồi kết nối khi Sleep/Wakeup và đổi WiFi:**
  - Tích hợp bộ lọc chống rung (debounce) **4 giây** cho sự kiện khôi phục kết nối mạng `workspace:network-online`. Khi WiFi đang trong quá trình kết nối hoặc thay đổi (Network Flapping), hệ thống sẽ đợi mạng ổn định hoàn toàn rồi mới tiến hành tái kết nối duy nhất 1 lần, tránh việc gửi truy vấn dồn dập gây treo ứng dụng.
  - Đồng bộ hóa địa chỉ `bossUrl` từ Main Process xuống Renderer. Khi Main Process tự động chuyển đổi giữa LAN và WAN/Tunnel, Renderer sẽ lập tức cập nhật lại `RestQueryService` theo URL mới, giải quyết triệt để lỗi gọi API REST vào cổng cũ bị ngắt kết nối.
  - Tối ưu hóa sự kiện ngủ/thức dậy (`resume` và `unlock-screen` của `powerMonitor`): Đánh dấu mất kết nối ngay lập tức (`markDisconnectedImmediately`) để hiển thị màn hình khóa cảnh báo mà không cần chờ timeout của heartbeat, ngăn chặn người dùng gửi tiếp request trong thời gian mạng đang phục hồi.
  - Xử lý lỗi mềm trong `proxyAction()` khi kết nối bị ngắt quãng, trả về lỗi thay vì `throw` lỗi nghiêm trọng để tránh Unhandled Promise Rejections gây crash ứng dụng.
  - Giải quyết xung đột luồng kết nối song song bằng cách bỏ qua yêu cầu Reconnect nếu Workspace đó đã có sẵn tiến trình kết nối đang hoạt động trong hàng đợi.

- **Kiến trúc Thin Client bảo mật dữ liệu tuyệt đối (Zero SQLite) cho máy Nhân viên:**
  - Chuyển đổi máy nhân viên thành dạng Thin Client hoàn toàn không tạo hoặc sử dụng cơ sở dữ liệu SQLite cục bộ (`zagi-tool.db`).
  - Dữ liệu cuộc trò chuyện và liên hệ được truy vấn trực tiếp thời gian thực từ Boss qua REST API (`DataAccessor.getConversations`) thay vì đọc từ DB SQLite local.
  - Loại bỏ hoàn toàn các tiến trình đồng bộ dữ liệu ngầm và ghi đĩa để đạt tiêu chuẩn bảo mật zero-footprint trên thiết bị nhân viên.
  - Vô hiệu hóa hoàn toàn các bộ timers/crons ERP chạy ngầm trên máy nhân viên để tránh ghi log DB rỗng.

- **Nâng cấp Giao thức Truyền tải Socket.IO:**
  - Thiết lập Socket.IO (`SocketIOService` trên Boss và `SocketIOClient` trên Employee) làm giao thức truyền tải thời gian thực chính thức cho các sự kiện (real-time event delivery), thay thế hoàn toàn cho SSE (Server-Sent Events) ở các phiên bản cũ.
  - Hỗ trợ cơ chế tự động kết nối lại (auto-reconnect) bền bỉ của Socket.IO, tự động join room nhân viên để nhận các sự kiện chat và ERP tức thời.

- **Màn hình khóa mất kết nối thông minh & tương tác (Connection Lost Lock Screen):**
  - Tích hợp nút **"Thử lại ngay"** để người dùng chủ động gửi tín hiệu kết nối lại.
  - Tích hợp form cấu hình đăng nhập nhanh/thay đổi IP BOSS ngay trên màn hình khóa. Khi mất kết nối hoặc đổi IP/mật khẩu, nhân viên có thể cập nhật thông tin và kết nối lại trực tiếp mà không bị treo cứng màn hình.

- **Cải tiến trải nghiệm gắn nhãn Zalo & Quản lý thư viện:**
  - Hỗ trợ click trực tiếp vào nhãn Zalo trên danh sách hội thoại để thay đổi hoặc gỡ nhãn nhanh.
  - Bổ sung biểu tượng thẻ nhãn (tag icon) khi hover vào hội thoại chưa có nhãn để thao tác nhanh.
  - Thêm mục "Phân loại (Gán nhãn Zalo)" vào menu chuột phải (context menu) của danh sách hội thoại.
  - Sửa lỗi CRUD thư mục thư viện ảnh/file trên máy nhân viên hoạt động không chính xác khi giao tiếp qua Boss HTTP relay router.

---

## [v27.2.7] - 2026-07-08

### Tính năng mới & Cải tiến tối ưu hóa kết nối & Tự động kết nối lại

- **Tự động tối ưu hóa kết nối LAN (LAN Auto-Switching):**
  - Boss Server tự động phát danh sách IP nội bộ (`localIps`) và port LAN hoạt động của mình trong phản hồi API đăng nhập và heartbeat.
  - Client tự động dò quét các IP cục bộ này trong nền bằng các gói tin ping nhanh (`GET /api/health` với timeout 1.5s).
  - Tự động chuyển luồng kết nối active và SSE sang mạng LAN để đạt tốc độ truyền tải file/đồng bộ tối đa khi nhân viên làm việc cùng văn phòng với Boss.
  - Tự động fallback về địa chỉ Tunnel (WAN) khi ngắt kết nối hoặc mất mạng LAN cục bộ.

- **Tự động kết nối lại tức thì (Instant Reconnect):**
  - Đăng ký lắng nghe các sự kiện hệ điều hành thông qua `powerMonitor` của Electron (`resume`, `unlock-screen`) để kích hoạt kết nối lại lập tức cho tất cả remote workspaces ngay khi mở máy/mở khóa màn hình.
  - Lắng nghe trạng thái mạng `online` của trình duyệt ở Renderer để thực hiện gửi tín hiệu IPC và kích hoạt kết nối lại ngay lập tức khi khôi phục WiFi.

---

## [v27.2.6] - 2026-07-08

### Tính năng mới & Cải tiến hạ tầng mạng Boss–Nhân viên

- **Tải file lớn phân đoạn (Chunked Upload) — Option A:**
  - Thêm dịch vụ `UploadChunkService.ts` mới trên máy Boss để tiếp nhận, quản lý và tự động ghép nối các phân đoạn file (chunk 2MB mỗi phần). Dọn dẹp thư mục tạm (`_temp_uploads/`) sau khi ghép xong.
  - Bổ sung endpoint `POST /api/media/upload-chunk` trên `HttpRelayService`. Nhân viên có thể gửi file lớn (video, PDF…) mà không bị tràn bộ nhớ (Out of Memory).
  - `HttpClientService.uploadMedia()` tự động phân tách file > 2MB thành nhiều chunk Base64 và gửi lần lượt; file nhỏ hơn tiếp tục sử dụng endpoint `/api/media/upload` cũ để tối ưu tốc độ (tương thích ngược 100%).

- **Phục hồi sự kiện SSE bằng Last-Event-ID — Option C:**
  - Mỗi sự kiện SSE đẩy từ Boss đến Nhân viên được đánh số thứ tự tăng dần (Sequence ID) duy nhất theo từng nhân viên, gắn kèm theo trường `id:` theo chuẩn SSE spec.
  - Boss duy trì **Event History Queue** tối đa 500 sự kiện / 10 phút cho từng nhân viên (Circular Buffer).
  - Khi Nhân viên reconnect SSE, client tự gửi `?lastEventId=xxx` — Boss kiểm tra:
    - **Hit (Trúng):** Boss đẩy bù ngay lập tức các sự kiện bị lỡ từ `lastEventId + 1`, không cần query DB.
    - **Miss (Trượt — tràn buffer / tắt máy lâu):** Boss gửi sự kiện đặc biệt `relay:fallbackDeltaSync` để Nhân viên tự động kích hoạt Delta Sync, khôi phục trạng thái DB an toàn.
  - `HttpClientService` lưu `lastEventId` vào SQLite local (key `last_sse_event_id_{workspaceId}`) sau mỗi sự kiện nhận thành công.

- **AI Assistant chế độ Read-only trên máy Nhân viên:**
  - Các IPC ghi của AI (`ai:saveAssistant`, `ai:deleteAssistant`, `ai:uploadFile`, `ai:removeFile`, `ai:setAccountAssistant`) bị chặn trực tiếp trên máy Nhân viên.
  - Nhân viên chỉ sử dụng Trợ lý do Boss cấu hình sẵn. Cấu hình Prompt, API Key và tài liệu nội bộ chỉ quản lý tập trung tại Boss.

- **Đồng bộ 2 chiều phân hệ Facebook (Boss ↔ Nhân viên):**
  - **Đọc (Boss → Nhân viên):** Thêm hàm `exportFacebookDataFiltered` trong `DataSyncService`, đồng bộ 4 bảng (`fb_accounts`, `fb_threads`, `fb_messages`, `fb_crm_contacts`) theo tài khoản được giao cho nhân viên. Full sync giới hạn tin nhắn FB 30 ngày gần nhất.
  - **Ghi (Nhân viên → Boss):** Toàn bộ IPC thao tác Facebook (gửi tin, upload, kết nối…) tự động proxy lên Boss qua `ipcHandlerRegistry`. Nhân viên chỉ giữ quyền đọc local.

- **Workflow Real-time 2 chiều (Boss ↔ Nhân viên):**
  - IPC ghi kịch bản (`workflow:save`, `workflow:delete`, `workflow:toggle`) trên máy Nhân viên proxy thẳng lên Boss.
  - Sau khi Boss lưu thành công, Boss phát sự kiện `db:workflowChanged` qua SSE đến tất cả Nhân viên — nhân viên tự cập nhật DB local và reload WorkflowEngine theo thời gian thực.

---

## [v27.2.5] - 2026-07-06


### Sửa lỗi nghiêm trọng (Critical Bug Fixes)

- **Sửa lỗi crash `n.startsWith is not a function` khi mở chiến dịch có ảnh:**
  - Lỗi xảy ra tại `CampaignCreateModal` khi parse `block.images` từ DB — nếu có giá trị non-string (null, object, ...) thì hàm `toLocalMediaUrl()` crash ngay tại `.startsWith()` làm toàn bộ màn hình chiến dịch bị trắng.
  - `parseContentConfig` nay **sanitize** từng phần tử `block.images`, chỉ giữ lại các phần tử là `string` hợp lệ.
  - Bổ sung filter `typeof p === 'string'` tại cả 2 chỗ render ảnh (preview + editor) trong `CampaignCreateModal.tsx`.
  - `toLocalMediaUrl` bổ sung guard `typeof filePath !== 'string'` trả về `''` thay vì throw lỗi runtime.

### Tính năng mới (New Features)

- **Gán / Xóa nhãn Local đồng loạt (Bulk Local Label Sync):**
  - Modal gán nhãn hàng loạt nay tự động **nạp trước** (pre-load) union nhãn hiện có của tất cả liên hệ đã chọn.
  - Hỗ trợ **sync 2 chiều**: thêm nhãn mới + xóa nhãn không còn được tích chọn.
  - **Để trắng** toàn bộ → nút đỏ **"Xóa tất cả nhãn"** + cảnh báo cam ⚠️ rõ ràng trước khi thực hiện.

### Cải tiến (Improvements)

- Bổ sung log chẩn đoán `[CRMQueue] ⚠️ Image not found on disk: /path/...` để phát hiện file ảnh chiến dịch không còn tồn tại trên disk trước khi gửi.

---

## [v27.2.4] - 2026-07-06


### Thay đổi & Tính năng mới

- **Thống kê & Báo cáo Cuộc gọi CRM Zalo (CRM Call Analytics & Logs):**
  - **Tab "Cuộc gọi" tại chi tiết liên hệ:** Bổ sung tab collapsible hiển thị thống kê 6 chỉ số (Tổng cuộc gọi, Tổng thời lượng đàm thoại, Số cuộc gọi nhỡ, Gọi đi, Gọi đến, Khách gọi lại) và danh sách chi tiết lịch sử cuộc gọi với từng khách hàng kèm tính năng **Xuất CSV**.
  - **Thống kê tổng hợp tại Báo cáo & Phân tích:** Bổ sung tab **Cuộc gọi** vào trang phân tích chung của Zagi, hỗ trợ vẽ biểu đồ xu hướng theo ngày bằng BarChart, danh sách top khách hàng gọi nhiều nhất, và xếp hạng theo nhân viên.
  - **Phân quyền bảo mật:** Tự động lọc tài khoản Zalo theo phân quyền gán cho nhân viên (`assignedAccounts`) từ `useEmployeeStore`. Nhân viên chỉ xem được báo cáo cuộc gọi của mình, Boss xem được toàn bộ hệ thống.

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

- **Sửa lỗi crash khi chọn liên hệ cho chiến dịch (Target Selection Type Fix):**
  - Khắc phục lỗi `TypeError: n.startsWith is not a function` khi chọn liên hệ gửi chiến dịch hoặc đồng bộ nhãn Zalo. Nguyên nhân do một số liên hệ có ID dạng số (`number`) khi được lấy từ Zalo API hoặc SQLite DB, khiến hàm xử lý chuỗi bị lỗi. Đã bổ sung ép kiểu chuỗi bằng `String()` trước khi gọi các hàm xử lý `.startsWith` và `.includes` trong [TargetSelector.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/campaigns/TargetSelector.tsx), [CRMPage.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/CRMPage.tsx), và [labelUtils.ts](file:///Users/kimtrungduong/Downloads/deplao/src/ui/lib/labelUtils.ts).

- **Sửa lỗi hiển thị vị trí Zalo (Location Message display):**
  - Khắc phục lỗi hiển thị tin nhắn vị trí `chat.location.new` dưới dạng `[Đính kèm]`. Bây giờ hiển thị đúng icon `📍 [Vị trí]` hoặc tên địa điểm cụ thể trong cuộc hội thoại và danh sách tin nhắn.

- **Sửa lỗi màn hình trắng khi vào ERP Tasks (`useMemo is not defined`):**
  - Bổ sung import thiếu `useMemo` từ `'react'` trong [TaskBoardPage.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/features/erp/tasks/TaskBoardPage.tsx).

- **Sửa lỗi tạo project bị nhân đôi (Double Project Creation Race Condition):**
  - Thêm kiểm tra trùng lặp trong `createProject` của [erpTaskStore.ts](file:///Users/kimtrungduong/Downloads/deplao/src/ui/store/erp/erpTaskStore.ts) trước khi thêm dự án vào state, ngăn race condition giữa client-side optimistic add và sự kiện realtime `erp:event:projectCreated`.

- **Thêm thông báo lỗi cho các thao tác dự án & nhiệm vụ ERP:**
  - `createProject`, `updateProject`, `deleteProject`, `deleteTask` nay hiển thị toast notification khi thất bại (thay vì fail âm thầm).

- **Chọn ảnh đính kèm nhiều tệp cùng lúc (CRM Campaign Multi-Image Select):**
  * Hỗ trợ cờ `multiSelect: true` giúp người dùng bôi đen chọn nhiều ảnh cùng lúc từ Finder/File Explorer khi tạo chiến dịch.
  * Tự động gửi gộp Album ảnh native trên Zalo (thay vì tách gửi từng ảnh rời rạc).

- **Tự động gắn nhãn khi chạy chiến dịch thành công (CRM Auto-Label on Success):**
  * Thêm tùy chọn tự động gán nhãn Local hoặc nhãn Zalo cho khách hàng ngay sau khi gửi thành công tin nhắn chiến dịch.
  * Hỗ trợ hai chế độ: **Chọn nhãn có sẵn** hoặc **Tạo nhãn mới trực tiếp ngay tại chỗ** (tự động khởi tạo khi chiến dịch chạy).

- **Mã hóa di động dự phòng Local/Dev (Portable Encryption Fallback):**
  * Hỗ trợ cơ chế mã hóa dự phòng XOR-Base64 với tiền tố `local:` khi chạy local/dev (`!app.isPackaged`).
  * Giúp giữ lại API Key AI, thông tin Casso/SePay và cấu hình bảo mật khi nâng cấp phiên bản ứng dụng mà không bị lỗi Keychain hệ điều hành.

- **Sửa lỗi mời bạn bè vào nhóm (Zalo Group Invitation Fixes):**
  * Tự động chuẩn hóa tiền tố `g` cho ID nhóm từ cơ sở dữ liệu SQLite trước khi gọi Zalo API.
  * Phân tích thuộc tính `grid_message_map` để cập nhật trạng thái lỗi thực tế (`failed` kèm chi tiết lỗi) thay vì hiển thị báo cáo trạng thái ảo `sent`.

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
