# Nhật Ký Thay Đổi (Changelog)

Tất cả các thay đổi chính thức, sửa lỗi và cải tiến tính năng của phần mềm **Zagi** sẽ được ghi chép chi tiết tại đây.

Định dạng nhật ký dựa trên tiêu chuẩn [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [26.4.3] - 2026-05
### Added (Thêm mới)
- Tích hợp thêm nhà cung cấp **OpenRouter** hỗ trợ truy cập hàng trăm mô hình ngôn ngữ lớn (LLM) thương mại và mã nguồn mở.
- Bổ sung tùy chọn **Custom API Endpoint** tương thích với chuẩn gọi API của OpenAI và Anthropic Claude cho phép kết nối máy chủ AI tự dựng.
- Tự động hiển thị và cho phép người dùng tự gõ tên Model tuỳ chỉnh khi sử dụng các cổng API tự cấu hình hoặc OpenRouter.

### Improved (Cải tiến)
- Nâng cấp hoàn toàn prompt tóm tắt cuộc trò chuyện bằng AI (phím tắt "Tóm tắt" tại panel chat) để tự động xuất ra báo cáo CRM đầy đủ cấu trúc (Bối cảnh, Yêu cầu khách, Phương án giải quyết, Action Items) thay vì giới hạn ngắn gọn 3-5 dòng như trước.

### Fixed (Sửa lỗi)
- Sửa lỗi logic hiển thị mục **CRM -> Liên hệ** gộp sai các phòng chat nhóm vào danh sách khách hàng cá nhân.

---

## [26.4.2] - 2026-05
### Improved (Cải tiến)
- Cập nhật trang thông tin giới thiệu chính thức sang tên miền mới: [https://itngon.com/zagi](https://itngon.com/zagi).
- Chuyển cổng tiếp nhận phản hồi, báo lỗi và yêu cầu hỗ trợ sang LarkSuite Ticket.

---

## [26.4.1] - 2026-05
### Added (Thêm mới)
- Chiến dịch gửi tin hàng loạt (Campaign) hỗ trợ soạn tin kèm hình ảnh.
- Hỗ trợ gửi nhiều tin nhắn nối tiếp trong cùng một lượt chạy chiến dịch.
- Bổ sung tính năng **Random nội dung (SpinText)** giúp nội dung gửi đa dạng, giảm tỷ lệ bị Zalo đánh dấu spam.

### Fixed (Sửa lỗi)
- Sửa lỗi thanh sticker trượt ngang mượt mà bằng cuộn chuột.
- Khắc phục lỗi giật/nháy khi mở xem ảnh trong khung chat và lỗi tự tắt hộp thoại zoom ảnh.

---

## [26.4.0] - 2026-04
### Added (Thêm mới)
- **Bản phát hành đầu tiên**: Quản lý đa tài khoản Zalo bằng QR Code và lưu dữ liệu cục bộ an toàn (Local-first).
- **Hộp thư tập trung (Unified Inbox)**: Gộp tin nhắn từ nhiều số Zalo về một luồng xử lý duy nhất.
- **Mục CRM & Nhóm**: Đồng bộ bạn bè, phân loại nhãn hai chiều và quét thành viên nhóm Zalo nâng cao.
- **Workflow tự động hóa**: Trình editor kéo thả Node tự động trả lời, tích hợp AI, Google Sheets, Notion và Webhook.
- **Tích hợp POS & Vận chuyển**: Đồng bộ kho hàng KiotViet, Sapo, Haravan và đẩy đơn giao vận nhanh qua GHN/GHTK.
- **Boss ↔ Nhân viên**: Chế độ làm việc Employee Mode và phân quyền chia sẻ tài khoản từ xa bảo mật.
