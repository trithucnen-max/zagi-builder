# TRẠNG THÁI HIỆN TẠI CỦA HỆ THỐNG ZAGI
> **Ngày cập nhật:** 31/07/2026  
> **Phiên bản:** v3.1.1 (Stable)  
> **Nhánh Git hiện tại:** `main`  

---

## 1. Thông Tin Chung & Kiến Trúc
*   **Tên dự án:** Zagi (Hộp thư Zalo đa tài khoản tích hợp CRM, ERP, POS, Workflow và Trợ lý AI).
*   **Đường dẫn thư mục:** `/Users/kimtrungduong/Downloads/deplao`
*   **Tổng số tệp tin:** 644 tệp tin được quản lý trong thư mục dự án.

## 2. Ngăn Xếp Công Nghệ (Tech Stack)
*   **Giao diện & Desktop Shell:** Electron v41 + React v18 + Vite v6 + TypeScript v5.
*   **Styling (Giao diện):** Tailwind CSS v4, thiết kế mô phỏng giao diện Zalo PC (Tone màu Zagi Navy & Zalo Blue).
*   **Cơ sở dữ liệu:** SQLite (`better-sqlite3` chạy ở chế độ WAL cục bộ - local-first).
*   **Trạng thái ứng dụng:** Zustand Store.
*   **Tương tác nền tảng:**
    *   `zca-js`: API Zalo.
    *   `fbchat-bridge-e2ee.exe` (viết bằng Go): Bridge xử lý tin nhắn mã hóa Facebook Messenger.
    *   `reactflow`: Canvas sơ đồ Workflow kéo thả.
    *   `recharts`: Render báo cáo và biểu đồ.
*   **Mô hình AI hỗ trợ:** OpenAI, Claude, Gemini, OpenRouter, và 9Router proxy gateway.

## 3. Các Tính Năng Đã Hoàn Thiện (Completed Features)
1.  **Hộp thư đa tài khoản:** Đăng nhập song song QR/Cookie, gom tin nhắn, cấu hình Proxy riêng cho từng tài khoản.
2.  **CRM & Kanban Pipeline:** Phễu Kanban, phân biệt Nhãn Zalo & Nhãn Local độc lập.
3.  **Quản lý nhóm nâng cao:** Rời nhóm hàng loạt (tự chuyển quyền Trưởng nhóm & gửi tin nhắn tạm biệt qua AI), quét UID thành viên ẩn bằng thuật toán **Quét Bóng Thụ Động (PSS)**.
4.  **Chiến dịch gửi tin an toàn:** Cơ chế trễ ngẫu nhiên (1-2s hoặc 2-3s) và phân đợt gửi tin (tối đa 20 người/lần, nghỉ 30s) tránh khóa tài khoản.
5.  **Workflow tự động hóa:**
    *   Động cơ Workflow chạy Sandbox Debugger trực quan (Xanh/Đỏ/Xám).
    *   Trình chọn nhiều ảnh & gửi ngẫu nhiên (`MultiImageSelector`).
    *   Smart Variable Autocomplete gợi ý biến khi gõ dấu `{`.
6.  **Trợ lý AI tích hợp:** Soạn thảo văn bản AI tại MessageInput và các trường nhập liệu trong Workflow, tóm tắt hội thoại ra Markdown.
7.  **Đồng bộ POS & Brand Logos:** Tích hợp KiotViet, Haravan, Sapo, Pancake, Nhanh.vn, GHN, GHTK, Casso, SePay (SVG trắng trên nền màu gốc). DeepSeek dùng nền trời xanh (`bg-sky-600`) để tuân thủ **quy tắc cấm màu tím (Purple Ban)**.
8.  **Font Scale & UI Zoom:** Co giãn phông chữ đồng bộ qua CSS Variable (`--zagi-font-scale`) không vỡ layout, tích hợp thanh trượt trên TopBar.
9.  **Hướng dẫn sử dụng tích hợp:** Được đưa thành một Tab chuyên biệt trong **Cài đặt → Giới thiệu → Hướng dẫn sử dụng**.
10. **Nâng cấp Động cơ Workflow & Chạy thử (v27.1.8):**
    *   **Tự động nhận diện API tài khoản:** Cơ chế `resolveApiForThread()` tự động tra cứu cơ sở dữ liệu để tìm tài khoản Zalo đang kết nối thực tế có tham gia nhóm/hội thoại, giải quyết triệt to lỗi Zalo API 161 "Nhóm không tồn tại".
    *   **Chạy thử linh hoạt (Modal Test-run):** Nâng cấp `TestRunModal` hỗ trợ tab **Bạn bè** và **Nhóm** giúp chạy thử trực tiếp vào Group.
    *   **Gửi thực tế theo cấu hình Node:** Thêm toggle **"Gửi thực tế theo cấu hình Node"** để mô phỏng chạy thật (gửi trực tiếp vào ID nhóm được cấu hình trong Node) thay vì luôn ghi đè đích gửi test.
11. **Sửa lỗi hệ thống (v27.1.8):**
    *   **Sửa lỗi tải thành viên nhóm:** Bổ sung xử lý khóa `changed_groups` khi parse danh sách nhóm và bọc try-catch/hiển thị thông báo khi quét nhóm bị khóa.
    *   **Sửa lỗi tạo chiến dịch:** Khắc phục lỗi thiếu placeholder `?` trong câu lệnh INSERT bảng `crm_campaigns` và sửa lỗi mất số điện thoại (`phone`) khi nhân bản (clone) chiến dịch.
    *   **Sửa lỗi trắng trang CRM**: Khắc phục lỗi thiếu `onPatchContact` trong destructuring props của `CRMContactList.tsx` gây crash runtime React.
    *   **Sửa lỗi Giới tính trong Chat**: Cấu hình lại các tùy chọn chọn giới tính của chat profile khớp with DB SQLite.
12. **Cải tiến Inline Edit CRM & Custom Salutation (v27.1.8):**
    *   **Inline Edit trên CRM lớn & bảng chi tiết**: Nháy đúp (hoặc click 1 lần khi bật Sửa nhanh) để sửa trực tiếp Biệt danh, Xưng hô, Sinh nhật, SĐT trên bảng CRM lớn. Cho phép sửa trực tiếp thông tin trên bảng chi tiết khách hàng và tự động lưu.
    *   **Chế độ Sửa nhanh (Edit Mode)**: Thêm nút bật tắt "Sửa nhanh" trên thanh công cụ giúp vô hiệu hóa mở bảng chi tiết khi click dòng và cho phép click 1 phát sửa ngay.
    *   **Cột Xưng hô (Salutation) & Biến chiến dịch**: Thêm cột Xưng hô tự động từ giới tính và có thể chỉnh sửa thủ công (Cô, Chú, Em...). Biến `{salutation}` hỗ trợ lấy xưng hô tùy chỉnh này hoặc tự động fallback về giới tính nếu rỗng.
13. **Cập nhật Xưng hô trực tiếp khi Chat (v27.1.8):**
    *   Thêm trường nhập **Xưng hô (tùy chỉnh)** vào form chỉnh sửa thông tin liên hệ ngay bên cạnh khung chat (ConversationInfo Panel) để bổ sung nhanh khi đang chat.
    *   Đồng bộ dữ liệu thời gian thực giữa Database, danh sách Chat (`chatStore`) và danh sách CRM (`crmStore`).
14. **Nâng cấp Workflow Editor & Sửa lỗi Smart Connect (v27.2.2):**
    *   **Hoàn tác / Làm lại (Undo/Redo)**: Bổ sung phím nóng Ctrl+Z / Ctrl+Y và hai nút bấm ↩️ / ↪️ trên đầu trang giúp quay lại các thao tác nhanh chóng.
    *   **Tự động sắp xếp sơ đồ (Auto Align)**: Nút ✨ Căn chỉnh tự động xếp các Node kịch bản thẳng hàng dọc theo chiều rộng (BFS Layout) cân đối.
    *   **Kiểm tra vòng lặp vô hạn (Cycle Detection)**: Tự động phát hiện và chặn các kết nối tạo thành vòng lặp vô tận, hiển thị cảnh báo đỏ thân thiện.
    *   **Tự động lưu ngầm (Silent Auto-save)**: Lưu kịch bản xuống DB SQLite sau mỗi lần kéo thả kết thúc hoặc thay đổi kết nối mà không hiển thị popup phiền phức.
    *   **Xem chi tiết biến tại chỗ (Tooltip preview)**: Hover lên biến hiện cú pháp gốc và mô tả chi tiết của biến.
    *   **Mở rộng 3 kịch bản mẫu nâng cao mới**: AI Phân loại & Chăm sóc KH Tiềm năng (`tpl-ai-lead-scoring`), Chăm sóc sau sự kiện Mở bán BĐS (`tpl-re-event-followup`), và Nhắc lịch hẹn dịch vụ từ POS (`tpl-pos-appointment-reminder`).
    *   **Sửa lỗi Kết nối thông minh (Smart Connect)**: Định vị điểm nhả qua elementFromPoint để sửa lỗi menu gợi ý Node không hiện.
    *   **Tối ưu hóa Toolbar chèn biến**: Giới hạn thanh công cụ chèn biến chỉ xuất hiện trên các trường nhập liệu văn bản tin nhắn (`textarea`, `multiline`).
    *   **Tối ưu hóa các biến chào CRM**: Đổi biến chào cũ sang định dạng Zalo-native lịch sự hơn là `{{ $item.salutation }} {{ $item.display_name }}`.
15. **Trạng thái trực tuyến, Quét nhóm ẩn, Ghost Mode, Rich Media & 2-way ERP (v27.2.3):**
    *   **Đồng bộ Online**: Gọi API `getFriendOnlines` qua cổng IPC của `zca-js` định kỳ mỗi 60 giây, hỗ trợ hiển thị chấm hoạt động online màu xanh ở avatar và bộ lọc trực quan trên CRM.
    *   **Ký hiệu kết bạn mới**: Đổi chỉ báo kết bạn cũ sang biểu tượng tick xanh dương dạng V để phân biệt rõ với chấm hoạt động online.
    *   **Quét nhóm ẩn nâng cao (PSS)**: Bổ sung 3 luồng quét sâu lịch sử trò chuyện (Reactions tin nhắn, tag Mentions thành viên, và dữ liệu System Messages) giúp thu hoạch đầy đủ UIDs của các thành viên ẩn trong nhóm khóa.
    *   **Ẩn danh Ghost Mode (Online & Read Privacy)**: Tích hợp chế độ ẩn chấm xanh hoạt động (Ghost Online ping mỗi 5 phút) và đọc ngầm tin nhắn không gửi tín hiệu đã xem (Ghost Read).
    *   **Tin nhắn đa phương tiện & Tự động gộp Album**: Thêm bảng thao tác nhanh ⚡ gửi Voice Note từ file, thẻ ngân hàng Bank Card và danh thiếp Zalo Card. Tự động gộp ảnh gửi cùng lúc thành Album và tự động phát hiện video gửi làm Rich Video.
    *   **4 Node kịch bản Workflow mới**: Thêm các node `zalo.sendVideo`, `zalo.sendVoice`, `zalo.sendBankCard`, và `zalo.sendCard` hỗ trợ biến động và proxy trung chuyển.
    *   **Import SĐT siêu tốc**: Sử dụng API truy vấn hàng loạt `getMultiUsersByPhones` theo lô 100 SĐT để import CSV cực nhanh (< 5s).
    *   **Sửa lỗi đồng bộ ERP & Nhãn 2 chiều**: Cấu hình bộ chuyển tiếp proxy tự động `proxyToBossAsync` cho toàn bộ các thao tác ghi (mutations) của nhân viên lên máy Boss; Đồng thời xây dựng cơ chế phân tích cấu trúc bảng động qua `PRAGMA table_info` để tự động ghi nhận (SQLite upsert) 19 sự kiện `erp:event:*` thời gian thực nhận được từ SSE vào SQLite local của Nhân viên.
16. **ERP Task UX Upgrade — Icon SVG & Always-colored Sidebar (v27.2.4):**
    *   **Hệ thống Icon SVG Dự án**: Thay thế toàn bộ bộ chọn emoji cũ bằng 12 icon SVG tối giản Lucide-style (`folder`, `rocket`, `target`, `code`, `palette`, `chart`, `home`, `fire`, `bulb`, `sparkles`, `phone`, `bag`). Tên dự án lưu theo định dạng `[slug] Tên dự án`. Hàm `getProjectDisplay` và `renderProjectIcon` đồng bộ trên `TaskBoardPage`, `TaskCreateModal`, `TaskEditorDrawer`.
    *   **Sidebar Dự án luôn hiển thị màu**: Mỗi dự án trong sidebar ERP Task luôn hiển thị màu nền liên tục (active=`opacity:1`, inactive=`opacity:0.6`). Chữ và icon SVG được force màu trắng (`color:#ffffff`).
    *   **Sửa lỗi màn hình trắng ERP Tasks**: Import thiếu `useMemo` trong `TaskBoardPage.tsx`.
    *   **Sửa lỗi tạo project nhân đôi**: Race condition giữa optimistic state add và sự kiện realtime `erp:event:projectCreated`.
    *   **Toast thông báo lỗi ERP**: Toàn bộ thao tác `createProject`, `updateProject`, `deleteProject`, `deleteTask` hiển thị toast khi thất bại.
    *   **Cải tiến ErrorBoundary**: Hiển thị thông báo lỗi nổi bật (hộp đỏ) + nút Sao chép mã lỗi.
17. **Cải tiến UI/UX & Sửa lỗi tệp đính kèm & Hệ thống 5 AI Agent (v27.2.11):**
    *   **Hệ thống 5 AI Agent chuyên biệt**: Cơ cấu phân chia 5 Trợ lý AI độc lập (AI 1: Tư vấn sản phẩm, AI 2: Soạn tin & Workflow, AI 3: Tóm tắt & Bộ nhớ, AI 4: Chân dung khách hàng, AI 5: Giải thích hướng dẫn Zagi).
    *   **Bong bóng Trợ lý Zagi (AI 5) kết nối Dify**: Widget chat nổi góc dưới phải màn hình kết nối trực tiếp chatbot Dify của Zagi, tự động lưu trữ và đồng bộ hóa `conversationId`, sử dụng icon robot phẳng chuẩn của Zagi, hỗ trợ Markdown render tin nhắn cực đẹp.
    *   **Bảng điều khiển vai trò AI tinh gọn**: Cho phép Boss gán trợ lý cho AI 2, AI 3, AI 4. Tự động ẩn cấu hình AI 5 vì đã được kết nối mặc định với Dify phía Boss.
    *   **Hiển thị động Chân dung khách hàng (AI 4) theo System Prompt**: Loại bỏ cấu trúc gán cứng tĩnh cũ. Toàn bộ thông tin chân dung khách hàng được trích xuất động bằng regex từ câu trả lời của AI dựa theo đúng cấu trúc tiêu chí (1-5 chỉ số) được định nghĩa trong System Prompt của người dùng. AI 4 sẽ phân tích và phác họa chân dung khách hàng chỉ dựa trên Ghi chú & Nhật ký.
    *   **Sửa lỗi nhận diện tin nhắn tự gửi (isSelf / ignoreOwn)**: Khắc phục lỗi AI tự nhận diện tin nhắn phản hồi của chính mình làm tin nhắn mới từ khách để rồi tiếp tục tự trả lời, tạo ra vòng lặp vô hạn. So sánh trực tiếp mã số người gửi (`uidFrom` / `senderId`) với mã số tài khoản đang chạy (`zaloId` / `fbAccountId`) ngoài việc dựa vào flag `isSelf` thô.
    *   **Đồng bộ & phơi bày IPC (Preload Bridge)**: Đăng ký đầy đủ 3 API IPC mới qua tệp `electron/preload.ts` khắc phục triệt để lỗi mất hàm phía Renderer.
    *   **Đại tu Notification Center**: Thiết kế lại giao diện trực quan, trực tiếp bổ sung vòng tròn màu sắc và icon emoji đại diện cho từng loại task/sắp tới hạn. Hỗ trợ hiển thị nền xanh nhạt cho thông báo chưa đọc, khắc phục triệt để lỗi in thừa số `0` dư thừa do đánh giá SQLite.
    *   **Khắc phục lỗi tối giao diện ban ngày**: Đồng bộ hiển thị sáng/tối của Menu kết nối (TopBar) theo cấu hình hệ thống bằng cách kiểm tra biến `resolvedTheme`.
    *   **Ẩn nhãn đã xóa**: Tự động lọc và không hiển thị các huy hiệu nhãn dán trên tệp/hình ảnh trong Thư viện nếu nhãn dán đó đã bị xóa.
    *   **Sửa lỗi forward file đính kèm máy nhân viên**: Tự động điều hướng và bỏ qua kiểm tra tệp local tại máy nhân viên, thực hiện gửi trực tiếp tệp gốc được lưu trữ trên Boss Machine khi chuyển tiếp PDF, ảnh, video, âm thanh sang hội thoại đích.
    *   **Đồng bộ & Cấu hình AI từ xa**: Chuyển tiếp toàn bộ 14 kênh thao tác đọc/ghi của AI (`ai:*`) từ máy nhân viên về máy Boss. Nhân viên có thể tải và xem toàn bộ danh sách trợ lý AI cấu hình trên Boss, đồng thời tạo mới hoặc chỉnh sửa trợ lý AI từ xa.
    *   **Mở hình ảnh/file Media đầy đủ**: Tự động chuyển tiếp các yêu cầu kiểm tra sự tồn tại của tệp, đọc dữ liệu ảnh base64, lấy metadata video, và sửa chữa ảnh hỏng từ máy nhân viên về máy Boss. Sửa triệt để lỗi nhân viên nhìn thấy ảnh thumbnail nhưng bấm mở xem ảnh lớn không được.
    *   **Nạp ngữ cảnh biến tự động & Bộ lọc formatNumber cho Trợ lý AI**: AI khi soạn tin tự động hiểu toàn bộ các biến động của hệ thống và hỗ trợ bộ lọc `formatNumber` để định dạng tiền tệ có dấu phẩy phân cách hàng nghìn.
    *   **Sửa lỗi gửi trùng 2 tin nhắn**: Loại bỏ trigger bridge trùng lặp của sự kiện `integration:payment` trong `electron/main.ts`, đảm bảo chỉ gửi đúng 1 tin nhắn duy nhất khi nhận webhook thanh toán.
    *   **Sửa lỗi trùng lặp/xung đột System Prompt**: Gộp System Prompt từ Database và prompt chuyên biệt từ client khi gọi AI để tránh xung đột chỉ dẫn hoặc làm AI bối rối.
    *   **Thư viện 18 kịch bản Workflow mẫu**: Xây dựng hoàn chỉnh 18 mẫu kịch bản Workflow `.json` lưu tại thư mục `zagi-workflows/` phục vụ đa dạng các nhu cầu vận hành, tài chính, kho bãi và CSKH.
18. **Tách biệt Tên, Alias & Xưng hô CRM (v27.2.11):**
    *   **Giao diện Tách Cột CRM**: Tách biệt cột **Biệt danh CRM** (click sửa nhanh inline) và cột **Tên Zalo** gốc. Ẩn tên Zalo gốc trên màn hình nhỏ và gom làm phụ đề nhỏ dưới biệt danh.
    *   **Tự động điền Xưng hô (Salutation)**: Tự động hóa điền xưng hô "Anh"/"Chị"/"Bạn" dựa vào giới tính khi đồng bộ profile từ Zalo, đồng thời giữ nguyên các xưng hô chỉnh sửa thủ công của người dùng.
    *   **Đồng bộ biến Chiến dịch & Workflow**: Thêm biến `{zalo_name}` / `$item.zalo_name` (tên Zalo gốc) và `{alias}` / `$item.alias` (biệt danh CRM, không tự động fallback khi rỗng). Đồng bộ `{salutation}` và `{gender_greeting}` trực tiếp với trường Xưng hô CRM.
    *   **Autocomplete trình soạn thảo**: Nhập dấu `{` tự động hiển thị popup gợi ý biến trong trình soạn tin nhắn chiến dịch & workflow, bổ sung thanh công cụ chips chèn nhanh.
19. **Động cơ Workflow Persistent Checkpoints, Tích hợp Sapo & Tham gia nhóm Zalo (v3.0.1):**
    *   **Persistent Checkpoints**: Tự động lưu trạng thái hoạt động của workflow vào SQLite (`workflow_checkpoints`) khi gặp node Chờ (`logic.wait`) có thời gian chờ dài (> 5 phút), giúp giải phóng bộ nhớ RAM và CPU thay vì giữ luồng chờ dài ngày trong bộ nhớ.
    *   **Chế độ Chờ Ngày thực tế (Calendar Wait)**: Node Chờ hỗ trợ cấu hình theo ngày thực tế dịch chuyển (ví dụ: 0 là hôm nay, 1 là ngày mai) kết hợp khung giờ gửi cố định mong muốn (ví dụ: 09:00). Có bộ lọc an toàn tự động thực thi ngay nếu giờ đích trong ngày hôm nay đã trôi qua.
    *   **Động cơ Tự động Khôi phục (CheckpointScheduler)**: Khôi phục và chạy tiếp các kịch bản đang chờ dở dang sau khi tắt máy hoặc restart máy Boss/máy chủ. Tự động phát hiện và dọn dẹp các checkpoint của kịch bản đã bị xóa hoặc tắt đi trong thời gian chờ.
    *   **Tab quản lý "Đang Chờ" trên UI**: Tích hợp tab chuyên biệt trong phân hệ Workflow Automation hiển thị số lượng badge pending, countdown thời gian chờ thực tế và hỗ trợ Hủy checkpoint nhanh.
    *   **Tuần tự hóa ngữ cảnh thông minh (contextSerializer)**: Giải quyết triệt để vấn đề tham chiếu vòng, ép Set ↔ Array và rút gọn chuỗi >10KB để tránh phình dữ liệu.
    *   **Tích hợp Sapo Private App & Chuẩn hóa đồng bộ đơn hàng**: Nâng cấp `SapoAdapter.ts` hỗ trợ xác thực cổng Sapo Admin qua Basic Auth. Sửa lỗi đồng bộ đơn hàng: làm phẳng sản phẩm theo Variant level gửi đúng `variant_id` (mã phiên bản sản phẩm) thay vì Product ID cha. Bổ sung đối tượng `customer` và map Họ & Tên vào `first_name`/`last_name` ở address để Sapo tự động liên kết hồ sơ khách hàng đầy đủ SĐT/Email và tự động điền thông tin giao hàng để chủ shop có thể lên đơn "Đẩy vận chuyển" trực tiếp từ Sapo Admin không bị lệch thông tin. Tách bạch các trường tùy chọn và bắt buộc của Sapo & Haravan trên giao diện cấu hình, sửa lỗi required validation khi kết nối.
    *   **Tham gia nhóm Zalo trực tiếp bằng Link**: Tự động đánh chặn các link nhóm zalo.me được click trên khung chat và gọi API `joinGroupLink` trực tiếp trên tài khoản Zagi active. Đồng thời thêm nút **Vào nhóm bằng link** (icon 🔗) ở Sidebar danh sách chat để paste link tham gia nhanh chóng.

## 4. Trạng Thái Kiểm Thử & Chạy Thử
*   **Preview Server:** ⚪ **Stopped** (Đang dừng).
*   **Hệ thống Unit Test:** Đã cấu hình Jest & `ts-jest` thành công:
    1.  `lunar.test.ts` (Kiểm tra thuật toán chuyển đổi lịch âm Việt Nam).
    2.  `import.test.ts` (Kiểm tra logic chuẩn hóa số điện thoại và phân tách CSV).
    3.  `workflowCheckpoint.test.ts` (Kiểm tra động cơ checkpoint, contextSerializer, scheduler và Calendar wait calculations).
    4.  `zaloGroupJoin.test.ts` (Kiểm tra regex tìm kiếm group link và luồng interceptor IPC shell).
    *   *Lưu ý kỹ thuật:* Chạy test toàn bộ hệ thống thành công qua `npx jest --no-coverage` với 11/11 test suites đạt tỷ lệ PASS 100%.
