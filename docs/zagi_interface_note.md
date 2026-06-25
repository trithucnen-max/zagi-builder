# GHI CHÚ GIAO DIỆN (INTERFACE SYSTEM NOTE) - ZAGI DESKTOP

> **Từ khóa định hướng:** Chuyên nghiệp (Professional) · Tin cậy (Trustworthy) · Tốc độ (High-speed)  
> **Nguyên tắc cốt lõi:** Kế thừa trải nghiệm thân quen của Zalo PC · Đồng bộ hình ảnh thương hiệu · Nói KHÔNG với màu tím (Purple Ban)

Tài liệu này được biên soạn dành riêng để ghi chú và mô tả các tiêu chuẩn giao diện người dùng (UI) và trải nghiệm người dùng (UX) mới áp dụng cho Zagi Desktop. Điều này giúp đảm bảo sự nhất quán tuyệt đối trong suốt quá trình phát triển các tính năng hiện tại và tương lai.

---

## 1. HỆ MÀU CHỦ ĐẠO & BẢNG MÀU THƯƠNG HIỆU

Màu sắc của ứng dụng Zagi được điều chỉnh đồng nhất với Logo chính thức (chữ `zagi` màu xanh navy đậm và bong bóng chat `Zalo` màu xanh dương sáng). 

> [!WARNING]
> **Quy tắc Purple Ban (Cấm màu tím):** Không sử dụng bất kỳ màu tím, violet, magenta hay gradient pha tím nào trên toàn bộ giao diện (kể cả biểu tượng AI, nút bấm, avatar mặc định hay biểu đồ).

### 1.1. Màu thương hiệu (Brand Colors)
* **Zalo Blue (Primary):** `#0068FF`  
  * *Ứng dụng:* Màu nền thanh Sidebar chính bên trái, nút bấm chính, liên kết, icon trạng thái đang chọn, đường viền tiêu điểm.
  * *Hover state:* `#005AE0` (giảm độ sáng nhẹ để tạo phản hồi click).
* **Zagi Navy (Secondary):** `#0A3064`  
  * *Ứng dụng:* Tiêu đề chính của trang lớn, các yếu tố đồ họa đại diện cho thương hiệu Zagi.
* **Zalo Light Blue:** `#E5F0FF` (Light Mode) / `#1A3B66` (Dark Mode)  
  * *Ứng dụng:* Nền tin nhắn đã gửi của tôi, nền của cuộc hội thoại đang được lựa chọn.

### 1.2. Màu trung tính & Nền (Neutral Colors)

| Thành phần giao diện | Chế độ Sáng (Light Mode) | Chế độ Tối (Dark Mode) |
| :--- | :--- | :--- |
| **Nền các cột bên (Sidebar trái, Chat List, Info bên phải)** | `#FFFFFF` (Trắng tinh) | `#1F2937` (Gray 800) / `#1A202C` (Gray 850) |
| **Nền thanh đầu và thanh soạn thảo (Header & MessageInput)** | `#FFFFFF` (Trắng tinh) | `#1F2937` (Gray 800) |
| **Nền cửa sổ trò chuyện ở giữa (Chat scroller area)** | `#F4F5F7` (Xám rất nhẹ) | `#111827` (Gray 900) |
| **Đường viền/Phân cách (Border)** | `#E5E7EB` (Gray 200) | `#374151` (Gray 700) |
| **Chữ tiêu đề chính (Primary Text)** | `#0F172A` (Slate 900) | `#F9FAFB` (Gray 50) |
| **Chữ nội dung phụ (Secondary Text)** | `#475569` (Slate 600) | `#9CA3AF` (Gray 400) |

---

## 2. PHÔNG CHỮ HỆ THỐNG (TYPOGRAPHY SYSTEM)

Để đạt được mục tiêu **Tốc độ cao (High-speed)** và tránh hiện tượng giật màn hình khi tải phông chữ từ Google Fonts, Zagi sử dụng bộ phông chữ hệ thống mặc định (System Font Stack) giống hệt Zalo PC:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### Các quy chuẩn định dạng chữ:
* **Tên người gửi / Tiêu đề hội thoại:** Kích thước `14px` (`text-sm`), độ đậm `600` (Semi-bold).
* **Nội dung tin nhắn / Đoạn chat:** Kích thước `14px` (`text-sm`), độ đậm `400` (Regular), khoảng cách dòng `line-height: 1.5`.
* **Trích đoạn tin nhắn mới nhất (Danh sách chat):** Màu sắc dịu hơn (`#657786` ở Light Mode, `#8899A6` ở Dark Mode) để phân biệt rõ với tên người gửi.
* **Thời gian nhận tin / Số lượng tin chưa đọc:** Kích thước `12px` (`text-xs`), font đậm vừa phải.

---

## 3. HIỆU ỨNG TƯƠNG TÁC GẦN GIỐNG ZALO PC (MICRO-INTERACTIONS)

UX của Zagi mô phỏng lại các tương tác quen thuộc trên Zalo PC để tạo cảm giác thân thiện nhất cho nhân viên trực chat:

### 3.1. Danh sách cuộc hội thoại (Conversation List)
* **Hover State:** Khi di con trỏ chuột qua một hội thoại trong danh sách, nền đổi nhẹ sang màu `#F1F2F4` (Sáng) hoặc `#2D3748` (Tối). Con trỏ chuyển thành `cursor-pointer`. Thời gian chuyển tiếp chuyển đổi là `150ms`.
* **Active State:** Hội thoại đang được click chọn sẽ có:
  * Nền chuyển sang màu `#E5F0FF` (Sáng) hoặc `#1A3B66` (Tối) để làm nổi bật dòng hội thoại hiện tại.

### 3.2. Bong bóng tin nhắn (Chat Bubbles)
* **Tin nhắn gửi đi (Sender):** 
  * *Light Mode:* Nền màu `#E5F0FF` (Zalo Light Blue), chữ màu đen.
  * *Dark Mode:* Nền màu `#0068FF` (Zalo Blue), chữ màu trắng.
  * *Bo góc:* Góc bo tròn mặc định là `12px`, riêng góc dưới bên phải bo sát lại `4px` để tạo đuôi bong bóng chat.
* **Tin nhắn nhận về (Recipient):**
  * *Light Mode:* Nền màu `#FFFFFF` (Trắng tinh), có viền mảnh `#E5E7EB` (`border border-gray-200`), chữ màu đen.
  * *Dark Mode:* Nền màu `#374151` (Gray 700), chữ màu trắng xám.
  * *Bo góc:* Góc bo tròn đều `12px`, riêng góc dưới bên trái bo sát lại `4px`.

### 3.3. Thanh Sidebar chính bên trái (Main Navigation)
* **Nền:** Luôn hiển thị màu **Zalo Blue (`#0068FF`)** để giao diện sáng sủa và mang lại cảm giác quen thuộc hơn cho người dùng.
* **Icon điều hướng:** Sử dụng icon đơn sắc dạng SVG màu trắng mờ 70% (`text-white/70`).
* **Hover Icon:** Nền icon chuyển sang màu mờ trắng `bg-white/10`, icon sáng lên 100% màu trắng.
* **Active Icon:** Nền icon chuyển sang màu xanh đậm thương hiệu `bg-zalo-blue-dark` (`#0052CC`), icon sáng 100% màu trắng để biểu thị mục hiện tại một cách rõ nét và đẳng cấp trên nền xanh dương.

---

## 4. QUY CHUẨN GIAO DIỆN CRM & WORKFLOW

* **CRM Kanban:** Các nhãn giai đoạn (Lead, Contacted, Proposal, Won, Lost) sử dụng màu sắc dịu nhẹ. Tuyệt đối không dùng cột hay nhãn màu tím; các trạng thái liên quan sẽ chuyển sang màu xanh chàm (`indigo`) hoặc xanh dương nhạt.
* **Workflow Nodes:**
  * **Trigger Node:** Đổi sang viền và điểm nhấn màu xanh chàm (`indigo-500` / `#6366F1`).
  * **Action Node:** Đổi sang viền và điểm nhấn màu xanh dương (`blue-500` / `#0068FF`).
  * **Logic/Filter Node:** Đổi sang viền và điểm nhấn màu cam (`amber-500` / `#F59E0B`).
  * **Nút Trợ lý AI (🪄):** Thiết kế tối giản, loại bỏ hoàn toàn dải màu tím gradient. Khi hover hiển thị các gợi ý trợ lý với màu xanh dương nhạt chàm lịch sự.
  * **Cấu hình gửi ảnh/file trong Workflow:**
    *   Trình chọn ảnh (`MultiImageSelector`) thay thế cho ô nhập link/path đơn lẻ cũ.
    *   Cho phép chọn nhiều ảnh/file cùng lúc qua Dialog hệ thống (với key `multiSelect: true`) hoặc nhập thêm URL thủ công.
    *   Hiển thị danh sách ảnh/tệp dưới dạng lưới ảnh xem trước (image preview grid) có nút xóa nhanh (icon `x` trên nền đỏ mờ ở góc trên bên phải của từng ảnh thu nhỏ) và hiển thị nhãn của đường dẫn tệp đầy đủ giúp người dùng dễ nhận diện.
    *   Tích hợp Checkbox tùy chọn "Gửi ngẫu nhiên 1 ảnh" dùng màu xanh Zalo Blue nổi bật khi click chọn để thay đổi `sendMode` tương ứng.

---

## 5. QUY CHUẨN NÚT BẤM & TƯƠNG PHẢN (BUTTON STANDARDIZATION)

Các nút bấm, thanh tab lọc, vị trí mốc thời gian và biểu tượng chức năng trong Zagi được chuẩn hóa để đảm bảo tính thẩm mỹ hiện đại, độ tương phản cao và tuân thủ quy chuẩn:

### 5.1. Các loại nút bấm tiêu chuẩn
* **Nút hành động chính (Primary Button / Add new buttons):**
  * *Mã màu:* Nền màu Zalo Blue (`#0068FF`), hover chuyển sang Zalo Blue Hover (`#005AE0`).
  * *Quy định tương phản:* Trong Light Mode, bắt buộc sử dụng lớp `.text-white-important` để khôi phục màu chữ và icon trắng tinh khiết `#ffffff`, không để màu chữ bị chuyển thành màu đen.
  * *Biểu tượng đi kèm:* Sử dụng biểu tượng SVG dấu cộng trắng mảnh dạng nét vẽ (`stroke="currentColor"`) thay vì emoji `➕` hay `➕` dạng khối màu sắc.
  * *Ví dụ:* Nút `+ Thêm proxy`, `+ Thêm nhân viên`, `+ Thêm workspace`.
* **Nút hành động phụ (Secondary Button):**
  * *Mã màu:* Nền màu xám (`bg-gray-700 hover:bg-gray-600`), chữ xám nhạt (`text-gray-200`).
* **Nút hành động nguy hiểm/cảnh báo (Danger Button):**
  * *Mã màu:* Nền đỏ chuẩn (`bg-red-600 hover:bg-red-700`), chữ trắng (`text-white`). 
  * *Quy định thiết kế:* Nền đỏ chữ trắng rõ ràng, loại bỏ hoàn toàn các nền xám hồng/đất mờ có chữ đỏ lỗi thời.
  * *Ví dụ:* Nút `Đăng xuất` bản quyền.

### 5.2. Các tab lọc & chỉ thị nhãn (Purple Ban)
* **Bộ lọc hội thoại:** Sử dụng màu xanh dương thương hiệu (`bg-blue-600`) cho trạng thái được chọn (Active), loại bỏ hoàn toàn màu tím.
  * *Ví dụ:* Bộ lọc liên hệ `"👤👥 Tất cả"` / `"👤 Cá nhân"` / `"👥 Nhóm"`.
* **Chỉ thị Nhãn Local:** Sử dụng tông màu xanh chàm (`indigo`) thay vì màu tím để đánh dấu và đếm số lượng nhãn local được chọn.

### 5.3. Quy chuẩn biểu tượng chức năng (Flat SVG Icons)
* Các nút chức năng trò chuyện hình tròn (như Tắt thông báo, Ghim hội thoại, Tạo nhóm, Sửa thông tin) không được sử dụng emoji 3D nhiều màu (`🔔`/`🔕`, `📌`, `👥`, `✏️`).
* Thay thế hoàn toàn bằng các **biểu tượng SVG đơn sắc, phẳng (Flat SVG Icons)**:
  * Inactive state: Nền vòng tròn màu xám mờ (`bg-gray-700`), biểu tượng màu xám (`text-gray-400`).
  * Active state: Nền vòng tròn màu xanh Zalo Blue (`bg-blue-600`), biểu tượng màu trắng (`text-white-important`).

### 5.4. Quy chuẩn mốc thời gian tin nhắn (Message Timestamps)
* **Thời gian gửi tin:** Dịch chuyển mốc thời gian hiển thị **ngay phía trên bong bóng chat** thay vì hiển thị dạng viên thuốc (pill) ở giữa màn hình cho mỗi lần đổi người gửi.
  * *Tin nhắn đến (nhóm chat):* Hiển thị dạng `<Tên người gửi>   <Mốc thời gian>` (ví dụ: `Vợ yêu Lê Thị Thu Hiển   17:44`) bằng màu xám nhạt.
  * *Tin nhắn đến (chat 1-1):* Chỉ hiển thị mốc thời gian dạng `<Mốc thời gian>` (ví dụ: `17:44`) phía trên bong bóng chat.
  * *Tin nhắn đi (của tôi):* Hiển thị mốc thời gian dạng `<Mốc thời gian>` căn lề phải phía trên bong bóng chat.
* **Thời gian phân cách giữa (Center Date Separator):** Chỉ hiển thị viên thuốc phân cách ở giữa màn hình khi bắt đầu một ngày mới hoặc có khoảng cách ngắt quãng thời gian lớn giữa 2 tin nhắn liên tiếp (> 15 phút).

### 5.5. Quy chuẩn thu phóng cỡ chữ hiển thị (Global UI Zoom)
* **Cơ chế thu phóng:** Để tránh hiện tượng vỡ layout viewport (100vh) và tràn khung màn hình, Zagi Desktop áp dụng đồng thời hai cơ chế:
  * Phóng to/thu nhỏ các phần tử dùng đơn vị `rem` bằng cách điều chỉnh `fontSize` của phần tử root `html`.
  * Phóng to/thu nhỏ các phần tử dùng pixel cứng của Tailwind (`text-[Xpx]`) bằng cách sử dụng CSS Variable `--zagi-font-scale` kết hợp ghi đè trực tiếp các class tương ứng trong CSS.
* **Nguyên tắc hoạt động:** Đảm bảo tất cả chữ (rem & px cứng) và các icon/button tự động co giãn đồng bộ theo tỷ lệ scale (từ 0.75x đến 1.5x) mà không làm tràn khung màn hình hay tạo thanh cuộn đứng ngoài mong muốn.

---

## 6. QUY CHUẨN TÍCH HỢP LOGO THƯƠNG HIỆU & HƯỚNG DẪN SỬ DỤNG

Các logo liên kết tích hợp ngoài và trung tâm tài liệu hướng dẫn sử dụng được tinh chỉnh theo các tiêu chuẩn giao diện cao cấp:

### 6.1. Tích hợp Logo Thương hiệu (Brand Logo Integrations)
* **Phong cách tổng thể (Visual Style):** Tất cả logo thương hiệu tích hợp (KiotViet, Haravan, Sapo, Nhanh.vn, Pancake POS, Casso, SePay, GHN, GHTK) và các logo nền tảng AI (OpenAI, Gemini, Claude, DeepSeek, Grok, OpenRouter) đều hiển thị dưới dạng **icon/biểu tượng SVG màu trắng tinh khiết trên nền màu đặc trưng của thương hiệu đó** (solid brand-colored backgrounds).
* **Độ tương phản & Bao bọc (Tile Wrapper):** 
  * Các ô vuông bao bọc logo sử dụng màu nền chính là màu đặc trưng của thương hiệu (`bg-kiotviet`, `bg-haravan`, v.v.), có độ bo góc đồng bộ, tạo cảm giác trực quan sinh động và đậm chất thương hiệu.
  * Các biểu tượng SVG bên trong sử dụng màu trắng (`text-white`) để đảm bảo tính thẩm mỹ, hiện đại và độ tương phản cao nhất.
  * Riêng DeepSeek được hiển thị bằng màu xanh bầu trời (`bg-sky-600` / `text-sky-500`) nhằm tuân thủ quy tắc cấm màu tím (Purple Ban) của hệ thống.

### 6.2. Trung tâm Hướng dẫn sử dụng (Built-in User Guide)
* **Vị trí hiển thị:** Chuyển hoàn toàn từ popup nổi ở Sidebar sang tab `"userguide"` trong mục **Cài đặt → Giới thiệu**, giúp người dùng tập trung hơn khi nghiên cứu tài liệu.
* **Tổ chức nội dung:** 
  * Tài liệu hướng dẫn sử dụng được chia thành 5 tab con điều hướng ngang: `Tổng quan`, `CRM`, `Workflow`, `Tích hợp`, và `Kết hợp`.
  * Các tab sử dụng font hệ thống rõ nét, có vạch chân chỉ thị màu xanh Zalo Blue (`#0068FF`) dày `2px` cho tab đang hoạt động.
  * Nội dung chi tiết phong phú, hỗ trợ render các thẻ alert định dạng GitHub (Note/Warning) giúp làm nổi bật các lưu ý kỹ thuật (ví dụ: quét nhóm ẩn lockViewMember, gửi nhiều file, v.v.).



