# Nhật Ký Thay Đổi (Changelog)

Tất cả các thay đổi chính thức, sửa lỗi và cải tiến tính năng của phần mềm **Zagi** sẽ được ghi chép chi tiết tại đây.

Định dạng nhật ký dựa trên tiêu chuẩn [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [26.4.6] - 2026-05
### Added (Thêm mới)
- Thêm tab **"Bản quyền" (License)** vào sidebar trang Cài đặt React.
- Hiển thị đầy đủ thông tin giấy phép: Email đăng ký, Họ tên, Số điện thoại, Loại gói (Dùng thử, Gói 6 tháng, Gói 1 năm, Vĩnh viễn) và Mã kích hoạt.
- Thêm thanh tiến trình (Progress Bar) trực quan thể hiện thời hạn sử dụng bản quyền còn lại, tự động đổi màu sắc cảnh báo: Xanh lá (>15 ngày hoặc Vĩnh viễn), Vàng cam (6-15 ngày), Đỏ nguy cấp (<=5 ngày).
- Tích hợp nút **"Đăng xuất"** trong vùng nguy hiểm (Danger Zone) để hủy kích hoạt giấy phép cũ, có hộp thoại xác nhận và tự động khởi động lại ứng dụng để mở lại popup kích hoạt.

### Improved (Cải tiến)
- Tự động mã hóa ẩn License Key dưới dạng chấm tròn `••••••••` và thêm nút con mắt (👁️) để bật tắt hiển thị khóa nhằm bảo mật.

---

## [26.4.5] - 2026-05
### Fixed (Sửa lỗi)
- Khắc phục lỗi chuyển hướng đăng nhập Google (HTTP 401 & 403) của Google Apps Script Web App bằng cách điều chỉnh cấu hình truy cập thành "Anyone".
- Đồng bộ hóa tên bảng tính trong API Sheets sang "Licenses" để tránh lỗi truy vấn dữ liệu.

---

## [26.4.4] - 2026-05
### Added (Thêm mới)
- Triển khai dịch vụ **LicenseManager** ngầm mã hóa file `license.dat` cục bộ bằng API `safeStorage` của Electron.
- Tạo màn hình kích hoạt bản quyền (`popup.html`) sử dụng hiệu ứng kính mờ (glassmorphism) đẹp mắt, tự động kích hoạt gói dùng thử và tích hợp quét mã QR chuyển khoản cho gói trả phí.

### Improved (Cải tiến)
- Cập nhật Logo thương hiệu Zagi mới trên giao diện đăng nhập nhân viên.
- Tái tạo hệ thống icon ứng dụng đóng gói (.ico, .icns, .png) cho mọi hệ điều hành macOS, Windows, Linux.

### Fixed (Sửa lỗi)
- Sửa lỗi crash luồng gửi tin hàng loạt của chiến dịch CRM khi gửi tin nhắn kèm hình ảnh (sửa lỗi `conn.api.sendImages is not a function`).

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
