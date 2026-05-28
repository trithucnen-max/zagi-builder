## [27.0.0] — 2026-05-28

### 🚀 Cải tiến Kiến trúc & Hệ thống
- **Tối ưu hóa Codebase**: Tái cấu trúc thành công `App.tsx` (từ 1,357 còn 175 dòng) và `main.ts` (từ 946 còn 165 dòng) bằng cách chuyển đổi sang mô hình module hướng đối tượng (`StartupManager`, `AppManager`, `LicenseGate`, `UpdateManager`).
- **Tách component CRMPage**: Trực quan hóa và làm gọn `CRMPage.tsx` sang 3 component modals độc lập (`BulkLocalLabelModal`, `BulkZaloLabelModal`, `AddToCampaignModal`), giảm LOC từ 883 xuống 662 dòng.
- **Hệ thống Plugin mới**: Tích hợp `PluginManager` và hệ thống IPC Plugin hỗ trợ cài đặt và quản lý các package mở rộng động cho Zagi.
- **Cơ chế Cập nhật Tự động (Delta Update)**: Kích hoạt NSIS `differentialPackage` giúp tự động tạo các bản cập nhật delta kích thước cực nhỏ cho hệ điều hành Windows.

### ✨ Tính năng mới & Trải nghiệm người dùng
- **Trực quan hóa & Phân tích CRM**: Bổ sung biểu đồ hình phễu CRM (Funnel Chart) sử dụng Recharts, dòng thời gian liên hệ (Contact Timeline), và hỗ trợ xuất nhập UTF-8 BOM CSV cho danh sách khách hàng.
- **Tính năng AI nâng cao**: Thêm cơ chế tóm tắt ghi chú hàng loạt bằng AI (`batchSummarizeContactNotes`) và đề xuất nhãn thông minh (`suggestSmartTags`).
- **Tự động hóa Workflow**: Tích hợp Visual Cron Builder 3 chế độ (Thời gian, Định kỳ, Lặp lại), Webhook URL Banner kèm nút Copy nhanh, và lịch ghim tin nhắn nhóm Zalo.
- **Giao diện Bản quyền mới**: Bổ sung bộ chọn tab gói cước Solo (1 tài khoản Zalo) và Team (Không giới hạn), tích hợp địa chỉ CÔNG TY CỔ PHẦN BASAN trực tiếp vào biểu mẫu chuyển khoản.

### ⚡ Hiệu suất & Tối ưu hóa Cơ sở dữ liệu
- **Tối ưu hóa SQLite**: Bật chế độ WAL (Write-Ahead Logging) tăng tốc độ đọc ghi DB, bổ sung 22 chỉ mục (indexes) tối ưu hóa các câu truy vấn CRM nặng.
- **Giám sát IPC**: Triển khai `AppMonitorService` đo lường độ trễ IPC (P50/P95/P99) và báo cáo lỗi crash cục bộ định kỳ 7 ngày.
- **Sao lưu cơ sở dữ liệu**: Hỗ trợ tự động sao lưu định kỳ cơ sở dữ liệu cục bộ nhằm tránh mất mát dữ liệu khách hàng.

### 🔒 Bảo mật & Chất lượng mã nguồn
- **Nâng cao Type-safety**: Giảm đáng kể số lượng kiểu dữ liệu `any` trong preload và IPC sang `unknown`, loại bỏ hơn 721 usages `any` không an toàn.
- **Vá lỗ hổng bảo mật**: Khắc phục hoàn toàn 2 lỗ hổng bảo mật HIGH của Axios (CSRF + SSRF).
- **Mở rộng Test Suite**: Nâng tổng số tệp kiểm thử lên 21 files với 211 test cases đạt tỉ lệ coverage 30.85% (Jest unit tests pass 100%).

### 💳 Thay đổi Cổng Thanh toán & Bảng giá
- **Thông tin ngân hàng mới**:
  - Chủ tài khoản: **CÔNG TY CỔ PHẦN BASAN**
  - Địa chỉ: Số SA 34, Khu đô thị FLC Garden City, Phường Tây Mỗ, TP Hà Nội
  - Số tài khoản: **63666999** tại Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank) - CN Bờ Hồ.
- **Bảng giá mới**:
  - Gói Solo: 6 tháng (2.450.000đ) | 12 tháng (4.450.000đ) | Vĩnh viễn (7.450.000đ).
  - Gói Team: 6 tháng (4.900.000đ) | 12 tháng (8.900.000đ) | Vĩnh viễn (14.900.000đ).
- **Tích hợp VietQR**: Sinh mã QR thanh toán động chứa thông tin số tiền và nội dung chuyển khoản tự động.

---

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
