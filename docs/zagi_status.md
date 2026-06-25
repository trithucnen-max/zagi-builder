# TRẠNG THÁI HIỆN TẠI CỦA HỆ THỐNG ZAGI
> **Ngày cập nhật:** 26/06/2026  
> **Phiên bản:** v27.1.7 (Stable)  
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

## 4. Trạng Thái Kiểm Thử & Chạy Thử
*   **Preview Server:** ⚪ **Stopped** (Đang dừng).
*   **Hệ thống Unit Test:** Đã cấu hình Jest & `ts-jest` cho các tệp kiểm thử:
    1.  `lunar.test.ts` (Kiểm tra thuật toán chuyển đổi lịch âm Việt Nam).
    2.  `import.test.ts` (Kiểm tra logic chuẩn hóa số điện thoại và phân tách CSV).
    *   *Lưu ý kỹ thuật:* Chạy test toàn bộ hệ thống qua `npx jest` hiện tại gặp lỗi tràn bộ nhớ NodeJS (`JavaScript heap out of memory`) khi biên dịch TypeScript qua `ts-jest` trên môi trường hiện hành do quy mô dự án lớn.
