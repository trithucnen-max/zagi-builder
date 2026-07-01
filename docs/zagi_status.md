# TRẠNG THÁI HIỆN TẠI CỦA HỆ THỐNG ZAGI
> **Ngày cập nhật:** 01/07/2026  
> **Phiên bản:** v27.2.2 (Stable)  
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
    *   **Sửa lỗi Giới tính trong Chat**: Cấu hình lại các tùy chọn chọn giới tính của chat profile khớp với DB SQLite.
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


## 4. Trạng Thái Kiểm Thử & Chạy Thử
*   **Preview Server:** ⚪ **Stopped** (Đang dừng).
*   **Hệ thống Unit Test:** Đã cấu hình Jest & `ts-jest` cho các tệp kiểm thử:
    1.  `lunar.test.ts` (Kiểm tra thuật toán chuyển đổi lịch âm Việt Nam).
    2.  `import.test.ts` (Kiểm tra logic chuẩn hóa số điện thoại và phân tách CSV).
    *   *Lưu ý kỹ thuật:* Chạy test toàn bộ hệ thống qua `npx jest` hiện tại gặp lỗi tràn bộ nhớ NodeJS (`JavaScript heap out of memory`) khi biên dịch TypeScript qua `ts-jest` trên môi trường hiện hành do quy mô dự án lớn.
