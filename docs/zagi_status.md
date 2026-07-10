# TRẠNG THÁI HIỆN TẠI CỦA HỆ THỐNG ZAGI
> **Ngày cập nhật:** 10/07/2026  
> **Phiên bản:** v27.2.10 (Stable)  
> **Nhánh Git hiện tại:** `main` (Working tree sạch)

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
    *   **Tự động nhận diện API tài khoản:** Cơ chế `resolveApiForThread()` tự động tra cứu cơ sở dữ liệu để tìm tài khoản Zalo đang kết nối thực tế có tham gia nhóm/hội thoại, giải quyết triệt để lỗi Zalo API 161 "Nhóm không tồn tại".
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
17. **Cải tiến UI/UX & Sửa lỗi chuyển tiếp tệp đính kèm (v27.2.10):**
    *   **Đại tu Notification Center**: Thiết kế lại giao diện trực quan, trực tiếp bổ sung vòng tròn màu sắc và icon emoji đại diện cho từng loại task/sắp tới hạn. Hỗ trợ hiển thị nền xanh nhạt cho thông báo chưa đọc, khắc phục triệt để lỗi in thừa số `0` dư thừa do đánh giá SQLite.
    *   **Khắc phục lỗi tối giao diện ban ngày**: Đồng bộ hiển thị sáng/tối của Menu kết nối (TopBar) theo cấu hình hệ thống bằng cách kiểm tra biến `resolvedTheme`.
    *   **Ẩn nhãn đã xóa**: Tự động lọc và không hiển thị các huy hiệu nhãn dán trên tệp/hình ảnh trong Thư viện nếu nhãn dán đó đã bị xóa.
    *   **Sửa lỗi forward file đính kèm máy nhân viên**: Tự động điều hướng và bỏ qua kiểm tra tệp local tại máy nhân viên, thực hiện gửi trực tiếp tệp gốc được lưu trữ trên Boss Machine khi chuyển tiếp PDF, ảnh, video, âm thanh sang hội thoại đích.
    *   **Đồng bộ & Cấu hình AI từ xa**: Chuyển tiếp toàn bộ 14 kênh thao tác đọc/ghi của AI (`ai:*`) từ máy nhân viên về máy Boss. Nhân viên có thể tải và xem toàn bộ danh sách trợ lý AI cấu hình trên Boss, đồng thời tạo mới hoặc chỉnh sửa trợ lý AI từ xa.
    *   **Mở hình ảnh/file Media đầy đủ**: Tự động chuyển tiếp các yêu cầu kiểm tra sự tồn tại của tệp, đọc dữ liệu ảnh base64, lấy metadata video, và sửa chữa ảnh hỏng (`file:repairImage`, `file:validateLocalImages`, `file:readImageAsBase64`, `file:getVideoMeta`, `file:exists`) từ máy nhân viên về máy Boss nơi tệp tin được lưu trữ vật lý. Sửa triệt để lỗi nhân viên nhìn thấy ảnh thumbnail nhưng bấm mở xem ảnh lớn không được.


## 4. Trạng Thái Kiểm Thử & Chạy Thử
*   **Preview Server:** ⚪ **Stopped** (Đang dừng).
*   **Hệ thống Unit Test:** Đã cấu hình Jest & `ts-jest` cho các tệp kiểm thử:
    1.  `lunar.test.ts` (Kiểm tra thuật toán chuyển đổi lịch âm Việt Nam).
    2.  `import.test.ts` (Kiểm tra logic chuẩn hóa số điện thoại và phân tách CSV).
    *   *Lưu ý kỹ thuật:* Chạy test toàn bộ hệ thống qua `npx jest` hiện tại gặp lỗi tràn bộ nhớ NodeJS (`JavaScript heap out of memory`) khi biên dịch TypeScript qua `ts-jest` trên môi trường hiện hành do quy mô dự án lớn.
