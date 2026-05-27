# Hướng Dẫn Sử Dụng Phần Mềm Zagi

Tài liệu này cung cấp hướng dẫn vận hành chi tiết cho các mô-đun và chức năng trong phần mềm **Zagi** — giải pháp quản lý Zalo đa tài khoản tích hợp CRM, tự động hóa quy trình (Workflow) và trợ lý AI.

---

## 📑 Mục Lục
1. [Giới thiệu tổng quan](#1-giới-thiệu-tổng-quan)
2. [Quản lý tài khoản Zalo & Đăng nhập QR](#2-quản-lý-tài-khoản-zalo--đăng-nhập-qr)
3. [Hộp thư tập trung & Soạn mẫu tin nhắn](#3-hộp-thư-tập-trung--soạn-mẫu-tin-nhắn)
4. [Quản lý khách hàng (CRM) & Quét nhóm](#4-quản-lý-khách-hàng-crm--quét-nhóm)
5. [Chiến dịch gửi tin hàng loạt](#5-chiến-dịch-gửi-tin-hàng-loạt)
6. [Trình thiết kế quy trình tự động (Workflow)](#6-trình-thiết-kế-quy-trình-tự-động-workflow)
7. [Tích hợp Trợ lý AI cá nhân](#7-tích-hợp-trợ-lý-ai-cá-nhân)
8. [Đồng bộ POS & Vận chuyển](#8-đồng-bộ-pos--vận-chuyển)
9. [Mô hình cộng tác Boss ↔ Nhân viên](#9-mô-hình-cộng-tác-boss--nhân-viên)

---

## 1. Giới thiệu tổng quan

**Zagi** là ứng dụng desktop chạy trực tiếp trên máy tính của bạn, hoạt động theo kiến trúc **Local-first** (Dữ liệu lưu trữ cục bộ trên ổ cứng của bạn). Zagi giúp gom toàn bộ luồng chat, dữ liệu khách hàng, quy trình tự động phản hồi và báo cáo hiệu suất về một nơi duy nhất mà không phụ thuộc vào máy chủ trung gian của bên thứ ba, bảo mật thông tin tối đa.

---

## 2. Quản lý tài khoản Zalo & Đăng nhập QR

Để quản lý và vận hành nhiều tài khoản Zalo cùng lúc:

### Các bước đăng nhập:
1. Tại menu bên trái, truy cập mục **Dashboard (Trang chủ)**.
2. Nhấn nút **+ Đăng nhập tài khoản**. Hộp thoại hiển thị mã QR Code sẽ xuất hiện.
3. Sử dụng ứng dụng Zalo trên điện thoại quét mã QR và chọn **Đăng nhập** để xác nhận quyền truy cập trên máy tính.
4. Phiên đăng nhập (Session cookies) sẽ được mã hóa và lưu trực tiếp trên máy của bạn (thông qua `electron-store`). Bạn không cần quét lại mã QR ở những lần mở app sau trừ khi tài khoản bị đăng xuất.

### Quản lý trạng thái:
- **Listener (Bộ lắng nghe)**: Đảm bảo bộ lắng nghe tin nhắn luôn bật (màu xanh lá) để nhận tin nhắn thời gian thực và kích hoạt các workflow tự động.
- **Reconnect (Kết nối lại)**: Nếu tài khoản bị mất mạng hoặc mất session, nhấn **Kết nối lại** để khôi phục phiên hoạt động tức thì.

---

## 3. Hộp thư tập trung & Soạn mẫu tin nhắn

Hộp thư tập trung giúp gom toàn bộ tin nhắn từ tất cả tài khoản Zalo đã đăng nhập vào một giao diện làm việc duy nhất để tăng tốc chốt đơn.

### Chế độ gộp tài khoản (Unified Inbox)
- Bật công tắc **Gộp tài khoản** ở phía trên thanh danh sách chat. Luồng tin nhắn của khách hàng nhắn tới bất kỳ số Zalo nào của bạn đều sẽ xuất hiện chung trong một inbox.
- Mỗi hội thoại hiển thị huy hiệu nhỏ để nhận diện khách hàng đang tương tác với tài khoản Zalo nào của doanh nghiệp.

### Bộ lọc & Tìm kiếm nhanh
- Lọc hội thoại theo các trạng thái: **Tất cả**, **Chưa đọc**, **Chưa trả lời**, hoặc lọc theo **Nhãn phân loại (Tags)**.
- Thanh tìm kiếm hỗ trợ tìm nhanh theo tên, biệt hiệu (alias) hoặc số điện thoại của khách hàng.

### Tin nhắn nhanh (Quick Messages)
1. Vào mục **Cài đặt** -> **Tin nhắn nhanh**.
2. Thiết lập các mẫu câu trả lời soạn sẵn kèm theo phím tắt (VD: `/giasp` -> "Sản phẩm hiện tại có giá 250k...").
3. Khi chat với khách hàng, chỉ cần gõ ký tự `/` và phím tắt để gọi nhanh mẫu câu và nhấn gửi.

---

## 4. Quản lý khách hàng (CRM) & Quét nhóm

### Quản lý Liên hệ CRM
- Toàn bộ thông tin bạn bè Zalo và những khách hàng từng nhắn tin sẽ được tự động đồng bộ vào mục **CRM** -> **Liên hệ**.
- Hỗ trợ lưu trữ thêm các trường dữ liệu nội bộ: Số điện thoại, Ngày sinh, Giới tính, Ghi chú chi tiết và gán nhãn phân loại màu sắc.

### Quét thành viên nhóm (Group Member Scanner)
- Công cụ giúp quét và thu thập thông tin thành viên của các nhóm Zalo bạn đã tham gia hoặc từ link mời tham gia nhóm.
- Bạn có thể quét lọc theo các thành viên hoạt động tích cực, lưu danh sách thành viên vào CRM để chạy chiến dịch kết bạn hoặc gửi tin nhắn tư vấn tự động.

---

## 5. Chiến dịch gửi tin hàng loạt

Hỗ trợ gửi tin nhắn chăm sóc khách hàng cũ hoặc quảng cáo sản phẩm mới đến danh sách số điện thoại hoặc danh sách liên hệ CRM.

### Cách tạo chiến dịch:
1. Vào mục **Chiến dịch (Campaign)** -> **Tạo chiến dịch mới**.
2. Chọn loại hành động: **Gửi tin nhắn**, **Gửi lời mời kết bạn**, hoặc **Mời vào nhóm**.
3. Tải danh sách người nhận (từ file Excel hoặc chọn theo nhãn CRM).
4. Soạn nội dung gửi: Hỗ trợ đính kèm hình ảnh và sử dụng tính năng **Random nội dung (SpinText)** dạng `{Chào bạn|Xin chào}` để hạn chế trùng lặp nội dung khi gửi hàng loạt, tránh bị khóa tài khoản Zalo.
5. Cài đặt **Thời gian chờ (Delay)** giữa các tin nhắn (khuyến nghị từ 15 - 30 giây).
6. Nhấn **Chạy**. Bạn có thể theo dõi tiến độ gửi trực tiếp theo thời gian thực và tạm dừng khi cần thiết.

---

## 6. Trình thiết kế quy trình tự động (Workflow)

Workflow Engine của Zagi hoạt động theo cơ chế kéo thả trực quan giúp tự động hóa hoạt động tư vấn và CSKH 24/7.

### Các thành phần chính:
- **Trigger (Bộ kích hoạt)**: Kích hoạt khi có tin nhắn mới chứa từ khóa, khi khách được gán nhãn mới, khi có sự kiện nhóm (thành viên mới vào), hoặc kích hoạt theo thời gian (cron job).
- **Node xử lý**: Node điều kiện logic (Nếu/Thì), Node gọi API ngoài (HTTP Request), Node đọc/ghi dữ liệu vào Google Sheets, Node Notion, Node gửi tin nhắn Telegram/Discord.
- **Action (Hành động)**: Gửi tin nhắn tự động cho khách, gửi hình ảnh/file, gán nhãn khách hàng, thu hồi tin nhắn, hoặc chuyển tiếp hội thoại cho nhân viên khác.

---

## 7. Tích hợp Trợ lý AI cá nhân

Zagi tích hợp trực tiếp các mô hình ngôn ngữ lớn để làm trợ lý tư vấn hoặc trả lời tự động cho khách hàng.

### Các nền tảng hỗ trợ:
- **Thương mại**: OpenAI, Google Gemini, Anthropic Claude, Grok (xAI), Mistral AI.
- **Tổng hợp & Proxy**: **OpenRouter** (hỗ trợ hàng trăm model mã nguồn mở và thương mại giá rẻ).
- **Custom API Endpoint**: Kết nối tới bất kỳ máy chủ LLM nội bộ hoặc bên thứ ba nào tương thích với định dạng API của OpenAI hoặc Anthropic Claude.

### Cách cấu hình dữ liệu cho AI:
- **File kiến thức**: Tải các file tài liệu định dạng văn bản (`.txt`, `.md`, `.json`, `.csv`) lên app. Hệ thống sẽ trích xuất nội dung text và tự động nạp làm ngữ cảnh tham khảo cho AI khi trả lời.
- **Ghim sản phẩm**: Chọn và ghim danh sách sản phẩm từ kho POS liên kết để AI nắm thông tin giá cả, mã hàng và hình ảnh khi chat với khách.

---

## 8. Đồng bộ POS & Vận chuyển

Hỗ trợ đồng bộ dữ liệu bán hàng và tạo đơn giao hàng trực tiếp ngay trong khung chat Zagi.

### Nền tảng POS hỗ trợ:
- **Đồng bộ**: KiotViet, Sapo, Haravan, Nhanh.vn, Pancake POS.
- **Tính năng**: Đồng bộ danh mục sản phẩm, tồn kho, giá bán và thông tin khách hàng từ POS về Zagi để gọi nhanh khi chốt đơn.

### Đối tác vận chuyển:
- **Kết nối**: Giao Hàng Nhanh (GHN), Giao Hàng Tiết Kiệm (GHTK).
- **Tính năng**: Tính thử phí ship trực tiếp trong khung chat, điền nhanh địa chỉ và đẩy đơn giao hàng sang đơn vị vận chuyển chỉ với 1 click.

---

## 9. Mô hình cộng tác Boss ↔ Nhân viên

Dành cho các đội ngũ bán hàng có nhiều nhân sự cùng vận hành.

### Cách thức hoạt động:
- **Thiết bị của Boss (Chủ doanh nghiệp)**: Đóng vai trò là máy chủ trung tâm (Local Workspace), đăng nhập tất cả các tài khoản Zalo, lưu trữ Database SQLite và các tệp tin hình ảnh. Boss bật tính năng **Relay Server** (chạy ngầm cổng Express/WebSocket).
- **Thiết bị của Nhân viên**: Cài đặt ứng dụng Zagi và chọn chế độ **Nhân viên (Employee Mode)**, kết nối đến IP máy Boss thông qua mạng LAN hoặc VPN từ xa.
- **Phân quyền**: Boss gán quyền cụ thể cho từng nhân viên (nhân viên A chỉ được xem và chat với tài khoản Zalo #1, không được quyền cấu hình Workflow, không được xuất bản báo cáo). Mọi dữ liệu của nhân viên thao tác sẽ được chuyển tiếp về xử lý và lưu tại ổ cứng máy Boss.
