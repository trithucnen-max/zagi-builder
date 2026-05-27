# Hướng Dẫn Quy Trình Vận Hành Với Zagi

Tài liệu này hướng dẫn chi tiết các quy trình nghiệp vụ và các bước vận hành thực tế khi sử dụng **Zagi** trong hoạt động bán hàng và chăm sóc khách hàng trên Zalo.

---

## 📑 Danh Sách Quy Trình
1. [Quy trình gửi tin hàng loạt tránh khóa tài khoản Zalo](#1-quy-trình-gửi-tin-hàng-loạt-tránh-khóa-tài-khoản-zalo)
2. [Quy trình tự động phân loại tag & phản hồi bằng AI & Workflow](#2-quy-trình-tự-động-phân-loại-tag--phản-hồi-bằng-ai--workflow)
3. [Quy trình lên đơn hàng chốt trên Zalo và đồng bộ POS](#3-quy-trình-lên-đơn-hàng-chốt-trên-zalo-và-đồng-bộ-pos)
4. [Quy trình bàn giao tài khoản và giám sát nhân viên](#4-quy-trình-bàn-giao-tài-khoản-và-giám-sát-nhân-viên)
5. [Quy trình sao lưu & đổi thư mục dữ liệu cục bộ an toàn](#5-quy-trình-sao-lưu--đổi-thư-mục-dữ-liệu-cục-bộ-an-toàn)

---

## 1. Quy trình gửi tin hàng loạt tránh khóa tài khoản Zalo

Gửi tin nhắn hàng loạt trên Zalo rất dễ bị hệ thống bảo mật của Zalo đánh dấu là spam và khóa tài khoản nếu không thực hiện đúng quy trình. Dưới đây là các bước vận hành an toàn:

### Bước 1: Chuẩn bị tệp danh sách gửi
- Hạn chế gửi cho khách hàng hoàn toàn mới (chưa từng nhắn tin hoặc không phải bạn bè).
- Khuyên dùng: Sử dụng bộ lọc nhãn trong CRM để chọn nhóm khách hàng cũ đã từng tương tác thành công.

### Bước 2: Soạn thảo nội dung cá nhân hóa (SpinText)
- Không bao giờ gửi một nội dung duy nhất cho hàng trăm người.
- Sử dụng cú pháp SpinText để hệ thống tự động đổi từ đồng nghĩa:
  `{Chào bạn|Chào anh/chị|Dạ chào khách yêu}, Zagi gửi tặng {mã giảm giá|quà tặng đặc biệt} ...`
- Sử dụng các token cá nhân hóa:
  - `[name]`: Tên hiển thị Zalo của khách hàng.
  - `[alias]`: Tên biệt danh bạn đặt riêng cho khách hàng trong CRM.
  - Ví dụ: `Dạ em chào anh [alias]...`

### Bước 3: Cấu hình giãn cách gửi (Delay)
- Khoảng cách giữa mỗi tin nhắn tối thiểu nên để từ **15 giây đến 30 giây**.
- Tuyệt đối không gửi liên tục dưới 5 giây. Nếu gửi trên 500 khách hàng, nên chia làm nhiều khung giờ trong ngày hoặc thiết lập delay trên 45 giây.

### Bước 4: Giám sát chiến dịch
- Theo dõi log chạy trực tiếp. Nếu thấy có cảnh báo từ Zalo hoặc tỷ lệ không gửi được tăng cao, nhấn **Tạm dừng** ngay để bảo vệ tài khoản, kiểm tra lại nội dung và tiếp tục sau.

---

## 2. Quy trình tự động phân loại tag & phản hồi bằng AI & Workflow

Quy trình tự động hóa trả lời khách hàng khi có tin nhắn mới đi vào hệ thống:

```
[Khách nhắn tin] ──► [Trigger: Tin nhắn mới] ──► [Node AI: Phân tích nhu cầu]
                                                        │
                      ┌─────────────────────────────────┴─────────────────────────────────┐
                      ▼ (Hỏi mua hàng)                                                    ▼ (Khiếu nại/Hỏi khác)
           [Action: Gán nhãn "Quan tâm"]                                        [Action: Gán nhãn "Cần hỗ trợ"]
                      │                                                                   │
           [Node AI: Gợi ý sản phẩm]                                            [Action: Forward tin nhắn tới Boss]
                      │                                                                   │
           [Action: Gửi tin tự động]                                            [Action: Tự động trả lời hẹn giờ]
```

### Các bước thiết lập:
1. **Bước 1: Khởi tạo Trợ lý AI**: Vào mục **Trợ lý AI**, tạo trợ lý chuyên trách, nạp file kiến thức sản phẩm và cấu hình API Key.
2. **Bước 2: Tạo kịch bản Workflow**: Vào mục **Workflow** -> **Tạo mới**.
3. **Bước 3: Chọn Trigger**: Chọn trigger **Tin nhắn mới** (lọc theo từ khóa hoặc áp dụng cho tất cả tin nhắn mới nhận).
4. **Bước 4: Thêm Node AI**: Kéo node **AI Assistant** vào bảng vẽ, nối từ Trigger sang Node AI. Cấu hình prompt yêu cầu AI phân loại tin nhắn (Mua hàng / Tư vấn / Khiếu nại).
5. **Bước 5: Thêm Nhánh điều kiện (Logic)**: Nối đầu ra của AI sang Node điều kiện logic:
   - Nếu kết quả là "Mua hàng" -> Chạy sang hành động **Gán nhãn "Quan tâm"** và **Gửi tin nhắn mẫu chứa sản phẩm**.
   - Nếu kết quả là "Khiếu nại" -> Chạy sang hành động **Gửi tin nhắn cảnh báo qua Telegram/Discord cho quản lý** để xử lý thủ công gấp.
6. **Bước 6: Kích hoạt**: Nhấn **Lưu** và bật công tắc **Kích hoạt** kịch bản để tự động chạy nền.

---

## 3. Quy trình lên đơn hàng chốt trên Zalo và đồng bộ POS

Quy trình tư vấn, chốt đơn và đồng bộ dữ liệu về KiotViet / Sapo / Haravan:

1. **Bước 1: Tra cứu tồn kho**: Khi khách hỏi sản phẩm, trong khung chat Zagi, nhấn biểu tượng **Hộp sản phẩm** (hoặc hỏi Trợ lý AI đã ghim sản phẩm). Gõ từ khóa để tra cứu mã hàng, số lượng tồn kho thực tế và giá bán chính xác từ POS.
2. **Bước 2: Gửi thông tin & Hình ảnh**: Chọn sản phẩm trong danh sách tra cứu, nhấn **Gửi hình ảnh + Giá** trực tiếp vào khung chat Zalo cho khách hàng.
3. **Bước 3: Xác nhận thông tin giao hàng**: Khi khách chốt mua, hỏi thông tin: Tên người nhận, Số điện thoại, Địa chỉ nhận hàng.
4. **Bước 4: Tính phí vận chuyển**: Copy địa chỉ của khách, nhấn nút **Vận chuyển** trong khung chat. Chọn đơn vị GHN hoặc GHTK, dán địa chỉ để tính nhanh phí ship.
5. **Bước 5: Tạo đơn POS**: Nhấn **Tạo đơn hàng**. Điền các thông tin sản phẩm, phí ship, số tiền khách chuyển khoản trước (nếu có). Nhấn **Đồng bộ**. Đơn hàng sẽ ngay lập tức được tạo thành công trên hệ thống POS (KiotViet/Sapo) và trạng thái tồn kho sẽ tự động trừ đi.

---

## 4. Quy trình bàn giao tài khoản và giám sát nhân viên

Dành cho chủ doanh nghiệp (Boss) phân chia công việc quản lý chat cho nhân viên mà không sợ bị rò rỉ dữ liệu hoặc mất kiểm soát:

### Bước 1: Đăng ký tài khoản nhân viên
- Trên máy của Boss, vào mục **ERP** -> **Nhân viên**.
- Nhấn **Thêm nhân viên**, nhập Tên, Email đăng nhập và đặt Mật khẩu ban đầu cho nhân viên.

### Bước 2: Thiết lập phân quyền chi tiết
- Chọn tài khoản nhân viên vừa tạo, tích chọn các quyền hạn:
  - Chỉ được quyền truy cập mô-đun **Chat & Inbox** và **CRM**. Khóa các mô-đun Báo cáo, ERP, Workflow, Cài đặt hệ thống.
  - Phân quyền gán tài khoản Zalo: Tích chọn các số Zalo cụ thể mà nhân viên này được phép nhìn thấy và trả lời tin nhắn. Nhân viên sẽ hoàn toàn không thấy tin nhắn của các số Zalo khác.

### Bước 3: Nhân viên đăng nhập từ xa
- Nhân viên mở ứng dụng Zagi trên máy của mình, chọn **Đăng nhập chế độ Nhân viên**.
- Nhập IP máy Boss (hoặc link VPN từ xa do Boss cấp) kèm Email và Mật khẩu được cấp.
- Hệ thống sẽ kết nối trực tiếp đến máy Boss, tải dữ liệu tương ứng với quyền hạn đã cấu hình.

### Bước 4: Giám sát hiệu suất
- Boss vào mục **Báo cáo (Report)** -> **Nhân viên** để theo dõi: Số lượng tin nhắn nhân viên đã trả lời, thời gian phản hồi trung bình cho khách hàng, số lượng đơn hàng chốt được và số nhãn khách hàng đã xử lý trong ngày.

---

## 5. Quy trình sao lưu & đổi thư mục dữ liệu cục bộ an toàn

Zagi lưu trữ dữ liệu hoàn toàn local. Đây là quy trình để sao lưu dữ liệu phòng trường hợp hỏng máy, hoặc di chuyển toàn bộ dữ liệu sang ổ đĩa khác để tránh đầy ổ C.

### Quy trình di chuyển dữ liệu:
1. **Bước 1: Tắt hoàn toàn ứng dụng**: Đảm bảo tắt Zagi (kiểm tra khay hệ thống, không để chạy ngầm).
2. **Bước 2: Định vị thư mục dữ liệu hiện tại**:
   - Thư mục dữ liệu mặc định nằm tại: `C:\Users\Tên_User\AppData\Roaming\zagi\` (trên Windows) hoặc `/Users/Tên_User/Library/Application Support/zagi/` (trên macOS).
   - Trong đó tệp tin **`zagi-tool.db`** chứa toàn bộ tin nhắn, CRM, cấu hình và thư mục **`media/`** chứa toàn bộ ảnh, video, file tải xuống.
3. **Bước 3: Copy sang vị trí mới**: Sao chép toàn bộ tệp `zagi-tool.db` và thư mục `media/` sang ổ đĩa mới (Ví dụ: `D:\ZagiData\`).
4. **Bước 4: Cấu hình đường dẫn mới**:
   - Mở Zagi, truy cập mục **Cài đặt (Settings)** -> **Workspace**.
   - Tại dòng **Đường dẫn dữ liệu cục bộ**, nhấn **Thay đổi** và trỏ đến thư mục mới `D:\ZagiData\`.
   - Nhấn **Lưu & Khởi động lại**. Hệ thống sẽ tự động quét cơ sở dữ liệu tại thư mục mới và tiếp tục vận hành bình thường.
5. **Bước 5 (Sao lưu dự phòng)**: Nên thiết lập copy tệp `zagi-tool.db` sang các dịch vụ đám mây (Google Drive/Dropbox) hàng tuần để dự phòng rủi ro mất mát dữ liệu do hỏng ổ cứng máy tính.
