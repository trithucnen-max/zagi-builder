# Tài Liệu Kênh Giao Tiếp IPC (API Reference)

Tài liệu này định nghĩa danh sách các cổng giao tiếp IPC (Inter-Process Communication) giữa React UI (Renderer process) và Electron Main process trong phần mềm **Zagi**.

---

## 📑 Danh Sách Nhóm Kênh IPC
1. [Quản lý tài khoản & Đăng nhập (login:*)](#1-quản-lý-tài-khoản--đăng-nhập-login)
2. [Tích hợp ngoài & Cấu hình POS VC (integration:* & tunnel:*)](#2-tích-hợp-ngoài--cấu-hình-pos-vc-integration--tunnel)
3. [Trợ lý AI & Gọi LLM (ai:*)](#3-trợ-lý-ai--gọi-llm-ai)
4. [Tự động hóa (workflow:*)](#4-tự-động-hóa-workflow)
5. [Hệ thống Task & ERP (erp:*)](#5-hệ-thống-task--erp-erp)

---

## 1. Quản lý tài khoản & Đăng nhập (`login:*`)

Sử dụng để quản lý đăng nhập nhiều tài khoản Zalo bằng QR Code và trạng thái kết nối.

### `login:qr`
Yêu cầu tạo mã QR đăng nhập Zalo mới.
- **Tham số**:
  - `tempId`: `string` (ID tạm thời để theo dõi phiên quét QR).
- **Phản hồi**:
  - `{ success: boolean, qrCodeUrl?: string, error?: string }` (Trả về URL chứa nội dung mã QR hoặc mã Base64 để vẽ QR ở UI).

### `login:connect`
Yêu cầu khởi chạy tiến trình lắng nghe (listener) kết nối Zalo.
- **Tham số**:
  - `auth`: Đối tượng lưu trữ session cookies đã quét thành công.
- **Phản hồi**:
  - `{ success: boolean, error?: string }`

### `login:getAccounts`
Lấy danh sách tất cả tài khoản Zalo đã đăng nhập trên máy.
- **Tham số**: Không có.
- **Phản hồi**:
  - `{ success: boolean, accounts: Account[] }`
  - Cấu trúc `Account`:
    ```typescript
    interface Account {
      zalo_id: string;
      full_name: string;
      avatar_url: string;
      status: 'online' | 'offline';
      phone: string;
    }
    ```

---

## 2. Tích hợp ngoài & Cấu hình POS VC (`integration:*` & `tunnel:*`)

Sử dụng để kết nối tới các phần mềm bán hàng KiotViet, Sapo, Haravan, SAP và các dịch vụ vận chuyển.

### `integration:list`
Lấy danh sách các tài khoản tích hợp đang có.
- **Phản hồi**:
  - `{ success: boolean, integrations: Integration[] }`

### `integration:save`
Lưu hoặc cập nhật một cấu hình tích hợp mới.
- **Tham số**:
  - `integration`: Đối tượng cấu hình (chứa Client ID, API Key, Token, Loại hệ thống KiotViet/Sapo...).
- **Phản hồi**:
  - `{ success: boolean, id?: string, error?: string }`

### `integration:execute`
Gọi một hàm chức năng (action) cụ thể của POS/Vận chuyển.
- **Tham số**:
  - `id`: ID của tích hợp trong Database.
  - `action`: Tên hàm muốn gọi (`'getProducts'` | `'lookupProduct'` | `'createOrder'`).
  - `params`: Đối tượng chứa các tham số truyền cho hàm.
- **Phản hồi**:
  - `{ success: boolean, data?: any, error?: string }`

---

## 3. Trợ lý AI & Gọi LLM (`ai:*`)

Sử dụng để cấu hình trợ lý, quản lý tệp kiến thức nền tảng và tương tác với các LLM.

### `ai:listAssistants`
Lấy danh sách tất cả trợ lý AI.
- **Phản hồi**:
  - `{ success: boolean, assistants: AIAssistant[] }`

### `ai:saveAssistant`
Tạo mới hoặc cập nhật thông tin một trợ lý AI.
- **Tham số**:
  - `payload`: Đối tượng cấu hình trợ lý (chứa tên, platform, apiKey, model, customUrl...).
- **Phản hồi**:
  - `{ success: boolean, id?: string, error?: string }`

### `ai:chat`
Gửi tin nhắn hội thoại và nhận câu trả lời từ trợ lý AI.
- **Tham số**:
  - `assistantId`: ID trợ lý.
  - `messages`: Mảng lịch sử chat dạng `ChatMessage[]`.
  - `structured`: `boolean` (Bật định dạng JSON để bóc tách văn bản và link ảnh sản phẩm).
- **Phản hồi**:
  - `{ success: boolean, result: string, promptTokens?: number, completionTokens?: number, totalTokens?: number }`

### `ai:uploadFile`
Nạp thêm tệp tin văn bản vào kho kiến thức trợ lý.
- **Tham số**:
  - `assistantId`: ID trợ lý.
  - `filePath`: Đường dẫn tệp tin trên máy tính của bạn.
- **Phản hồi**:
  - `{ success: boolean, fileId?: number, error?: string }`

---

## 4. Tự động hóa (`workflow:*`)

Vận hành kéo thả kịch bản tự động hóa trả lời.

### `workflow:list`
Lấy danh sách kịch bản workflow.
- **Phản hồi**:
  - `{ success: boolean, workflows: Workflow[] }`

### `workflow:save`
Lưu sơ đồ nodes & edges của workflow.
- **Tham số**:
  - `workflow`: Đối tượng sơ đồ kéo-thả (chứa mảng nodes và edges).
- **Phản hồi**:
  - `{ success: boolean, id?: string }`

---

## 5. Hệ thống Task & ERP (`erp:*`)

Quản lý đầu việc nội bộ, lịch làm việc chung và ghi chú nội bộ.

### `erp:task:list`
Lấy danh sách các công việc được phân công.
- **Tham số**:
  - `projectId`: ID dự án (tùy chọn).
- **Phản hồi**:
  - `{ success: boolean, tasks: Task[] }`

### `erp:task:create`
Tạo mới một đầu việc cho bản thân hoặc phân công cho nhân viên.
- **Tham số**:
  - `task`: Đối tượng chi tiết công việc.
- **Phản hồi**:
  - `{ success: boolean, id?: number }`
