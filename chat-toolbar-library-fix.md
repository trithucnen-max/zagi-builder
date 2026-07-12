# Kế hoạch triển khai: Tối ưu hóa Chat Toolbar & Nâng cấp Thư viện Media

Chúng tôi đề xuất kế hoạch chi tiết để tối ưu hóa thanh công cụ chat, nâng cấp giao diện thư viện media (chế độ xem danh sách, trình phát xem trước video) và đồng bộ ghi chú CRM.

---

## 1. Mục tiêu & Các thay đổi đề xuất

### 1.1 Khắc phục trùng lặp icon Hẹn giờ gửi & Nhắc hẹn
- **Giải pháp:** Thay đổi icon của nút **Tạo nhắc hẹn** từ icon Đồng hồ (trùng với Hẹn giờ gửi) sang icon **Lịch biểu** (Calendar) trực quan.
- **File ảnh hưởng:**
  - [MessageInput.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/MessageInput.tsx)

### 1.2 Tạo nhiều Bình chọn liên tục (Tạo & Nhập tiếp)
- **Giải pháp:** Trong modal tạo bình chọn nhóm (`CreatePollDialog`), bổ sung thêm nút **Tạo & Nhập tiếp** cạnh nút Tạo bình chọn. Khi click:
  - Gọi API tạo bình chọn hiện tại lên nhóm Zalo.
  - Reset trống các trường nhập liệu (câu hỏi, danh sách lựa chọn) trong modal nhưng **không đóng modal**, cho phép soạn tiếp khảo sát tiếp theo.
- **File ảnh hưởng:**
  - [ChatWindow.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/ChatWindow.tsx)

### 1.3 Tích hợp Ghi chú CRM trực tiếp vào mục Chat
- **Giải pháp:** 
  - Loại bỏ hoàn toàn nút "Ghi chú nhóm" (Zalo group notes) trên toolbar chat.
  - Thêm nút **Ghi chú CRM** (CRM Note) hiển thị trên cả Chat cá nhân và Chat nhóm.
  - Khi click, mở một Modal tiện ích [CRMNotesModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/CRMNotesModal.tsx) mới để xem danh sách ghi chú CRM nội bộ của liên hệ này, cho phép thêm mới, sửa và xóa ghi chú trực tiếp, tự động đồng bộ về database CRM.
- **File ảnh hưởng:**
  - [MessageInput.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/MessageInput.tsx)
  - [CRMNotesModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/CRMNotesModal.tsx) [NEW]

### 1.4 Nâng cấp Thư viện Media (Chế độ Danh sách & Khung xem trước)
- **Giải pháp:**
  - **Sửa lỗi hiển thị ảnh PNG:** Bổ sung cơ chế fallback trong component hiển thị ảnh: nếu file thumbnail không tồn tại hoặc lỗi tải, hệ thống sẽ tự động sử dụng trực tiếp URL ảnh gốc để hiển thị, tránh ô trống trắng.
  - **Chế độ xem Danh sách (List View):** Thêm nút chuyển đổi chế độ xem **Lưới (Grid)** và **Danh sách (List)** ở góc trên thư viện. Chế độ danh sách hiển thị bảng chi tiết các cột: Tên file, Loại, Ngày tạo, Dung lượng, Nhãn dán.
  - **Khung xem trước (Preview Pane):** Thêm một panel bên phải (có thể bật/tắt hoặc hiển thị khi click chọn file) hiển thị ảnh kích thước lớn, thông tin chi tiết, và tích hợp thẻ HTML5 `<video>` để **phát xem trước video trực tiếp** (hỗ trợ .mp4, .mov, .webm).
  - **Sửa lỗi gắn thẻ (Tagging) cho Video/File:** Sửa lỗi bọt sự kiện (event bubbling) khiến tag popup bị đóng hoặc click nhầm chọn file. Hiển thị nhãn dán đầy đủ trên danh sách/khung xem trước.
- **File ảnh hưởng:**
  - [LibraryPickerModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/library/LibraryPickerModal.tsx)

---

## 2. Kế hoạch thực hiện chi tiết

### Bước 1: Điều chỉnh Toolbar Chat chính
- Thay đổi SVG icon của nút Tạo nhắc hẹn thành icon Calendar.
- Ẩn nút Ghi chú nhóm cũ, thay bằng nút Ghi chú CRM.

### Bước 2: Xây dựng modal tiện ích CRMNotesModal
- Tạo file [CRMNotesModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/CRMNotesModal.tsx) dùng chung cho cả chat cá nhân và chat nhóm.
- Gọi các hàm IPC `ipc.crm?.getNotes` và `saveNote`/`deleteNote` để tương tác trực tiếp với CRM database.

### Bước 3: Cải tiến tạo Bình chọn liên tục
- Sửa hàm `CreatePollDialog` trong `ChatWindow.tsx`, thêm nút "Tạo & Nhập tiếp".
- Viết logic thực thi gửi API bình chọn và xóa dữ liệu state cũ.

### Bước 4: Nâng cấp Thư viện Media UI & Fallback PNG
- Cập nhật component `ImagePreview` fallback sang `fileUrl` hoặc `_localPath` khi tải ảnh thumb bị lỗi.
- Xây dựng component `LibraryListView` hiển thị dạng bảng và `LibraryPreviewPane` hiển thị bên phải thư viện.
- Tích hợp HTML5 `<video>` player trong khung xem trước.

---

## 3. Kế hoạch kiểm thử (Verification Plan)

### Kiểm thử thủ công:
1. **Kiểm tra trực quan:**
   - Mở cửa sổ chat, kiểm tra xem hai biểu tượng Hẹn giờ gửi (Đồng hồ) và Nhắc hẹn (Lịch biểu) đã khác nhau rõ ràng chưa.
2. **Kiểm tra Ghi chú CRM:**
   - Bấm nút Ghi chú CRM trên chat cá nhân, thêm/sửa/xóa một ghi chú, sau đó mở tab CRM kiểm tra xem dữ liệu ghi chú đã cập nhật đồng bộ chưa.
3. **Kiểm tra Bình chọn liên tục:**
   - Tạo bình chọn bằng nút "Tạo & Nhập tiếp", kiểm tra xem bình chọn thứ nhất đã được gửi vào nhóm Zalo và modal vẫn mở sẵn sàng nhập tiếp hay chưa.
4. **Kiểm tra Thư viện Media:**
   - Tải lên ảnh PNG có chữ tiếng Việt, kiểm tra xem ảnh thumb hiển thị đầy đủ không bị trắng.
   - Bấm nút chuyển sang chế độ List view xem thông tin file có gọn gàng không.
   - Click chọn file video, kiểm tra xem video player bên phải có hoạt động và phát được nội dung xem trước không.
