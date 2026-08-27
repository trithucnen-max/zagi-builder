# Kế Hoạch Triển Khai: Zalo Poll Full (Tạo Bình Chọn Đầy Đủ Tính Năng Chuẩn Zalo)

## 1. Mục tiêu
Nâng cấp tính năng Tạo Bình Chọn trong khung chat Zalo của Zagi để đạt 100% độ tương thích về cả giao diện và chức năng so với Zalo chính thức.

## 2. Phân rã công việc (Task Breakdown)
1. **API Layer (`zca-js` & `ZaloService.ts`)**:
   - Thêm tham số `pinAct: boolean` để hỗ trợ tính năng tự động ghim bình chọn lên đầu cuộc trò chuyện.
   - Chuẩn hóa việc parse timestamp thời hạn bình chọn (`expired_time`).
2. **UI Component (`CreatePollDialog` trong `ChatWindow.tsx`)**:
   - Thiết kế lại layout 2 cột chuẩn tỉ lệ và phong cách Zalo.
   - Textarea câu hỏi kèm bộ đếm `0/200`.
   - Danh sách phương án linh hoạt (thêm/xóa).
   - Ô thời hạn bình chọn có icon lịch 📅.
   - Nhóm "Thiết lập nâng cao": Ghim lên đầu, Chọn nhiều phương án 🛈, Có thể thêm phương án 🛈.
   - Nhóm "Bình chọn ẩn danh": Ẩn kết quả khi chưa vote 🛈, Ẩn người vote 🛈.
   - Nút ⚙️: Lưu cài đặt mặc định vào `localStorage`.
   - Các nút: Hủy, Tạo & Nhập tiếp, Tạo bình chọn.
3. **Build & Kiểm thử**:
   - Chạy `npm run build:renderer` kiểm tra tính toàn vẹn.
