# Hướng Dẫn Phát Triển Dự Án Zagi

Tài liệu này dành cho lập trình viên tham gia phát triển, bảo trì và mở rộng hệ thống phần mềm **Zagi**. Tài liệu chi tiết hoá thiết lập môi trường, kiến trúc mã nguồn, cơ chế giao tiếp và sơ đồ lưu trữ dữ liệu.

---

## 📑 Mục Lục
1. [Thiết lập môi trường phát triển](#1-thiết-lập-môi-trường-phát-triển)
2. [Cơ chế biên dịch thư viện C++ Native](#2-cơ-chế-biên-dịch-thư-viện-c-native)
3. [Kiến trúc giao tiếp IPC (Main ↔ Renderer)](#3-kiến-trúc-giao-tiếp-ipc-main--renderer)
4. [Quản lý State tại Frontend (Zustand)](#4-quản-lý-state-tại-frontend-zustand)
5. [Sơ đồ Cơ sở dữ liệu cục bộ (SQLite)](#5-sơ-đồ-cơ-sở-dữ-liệu-cục-bộ-sqlite)
6. [Quy trình CI/CD Đóng gói tự động](#6-quy-trình-cicd-đóng-gói-tự-động)

---

## 1. Thiết lập môi trường phát triển

Dự án Zagi là một ứng dụng **Electron Monorepo** sử dụng TypeScript cho cả hai tiến trình Main (chạy Node.js nền) và Renderer (chạy React UI).

### Yêu cầu tiên quyết:
- **Node.js**: Phiên bản `18.x` hoặc `20.x` LTS.
- **npm**: Phiên bản `9.x` trở lên.
- **Git** để quản lý mã nguồn.

### Các bước cài đặt:
1. Clone mã nguồn dự án về máy tính.
2. Cài đặt các thư viện phụ thuộc bằng lệnh:
   ```bash
   npm install --legacy-peer-deps
   ```
   *(Lưu ý: Bắt buộc dùng tham số `--legacy-peer-deps` để tránh xung đột phiên bản kiểu dữ liệu giữa các thư viện UI).*
3. Khởi chạy dự án ở chế độ phát triển (Development):
   ```bash
   npm run dev
   ```
   Lệnh này sẽ khởi chạy Vite dev server cho React UI, biên dịch TypeScript cho Electron Main process dạng watch, và khởi động cửa sổ Electron.

---

## 2. Cơ chế biên dịch thư viện C++ Native

Zagi sử dụng thư viện cơ sở dữ liệu **`better-sqlite3`** — một thư viện C++ native được biên dịch trực tiếp để đạt hiệu năng tối đa. 

### Quá trình Rebuild:
Khi chạy đóng gói hoặc cài đặt, thư viện này cần được biên dịch lại (rebuild) tương thích với phiên bản runtime của Electron (khác với runtime Node.js của máy).
- Lệnh biên dịch tự động tích hợp trong `electron-builder` và được định nghĩa thông qua các tệp script trong thư mục `scripts/`.
- **Yêu cầu máy dev**:
  - **macOS**: Cần cài Xcode Command Line Tools (`xcode-select --install`).
  - **Windows**: Cần bộ Visual Studio Build Tools (Workload phát triển C++).

---

## 3. Kiến trúc giao tiếp IPC (Main ↔ Renderer)

Tiến trình React UI (Renderer) không có quyền truy cập trực tiếp vào hệ thống file, cơ sở dữ liệu hoặc gọi các thư viện mạng cấp thấp. Mọi thao tác này phải được gửi về tiến trình Electron Main xử lý thông qua giao thức IPC (Inter-Process Communication).

### Luồng xử lý:
1. **Frontend (React)** gọi các api cầu nối được đăng ký sẵn trong `src/lib/ipc.ts`:
   ```typescript
   // Ví dụ lấy danh sách trợ lý AI
   const res = await ipc.ai.listAssistants();
   ```
2. **Preload Script** (`electron/preload.ts`) đóng vai trò cầu nối an toàn, chuyển tiếp thông điệp qua `contextBridge`.
3. **Electron Main Process** đón nhận yêu cầu qua `ipcMain.handle` trong các tệp tin đặt tại thư mục `electron/ipc/`:
   - `loginIpc.ts`: Xử lý đăng nhập tài khoản Zalo QR, duy trì kết nối session.
   - `integrationIpc.ts`: Quản lý cấu hình POS KiotViet, Sapo, Haravan, SAP, các cổng webhook và đường truyền tunnel.
   - `aiIpc.ts`: Quản lý trợ lý AI, CRUD và gọi API tới LLMs.
   - `erpTaskIpc.ts`, `erpNoteIpc.ts`: Vận hành ERP, lịch, ghi chú và phân quyền nhân viên.
   - `chatIpc.ts`: Đồng bộ tin nhắn, gửi tin nhắn, tải media đính kèm.

---

## 4. Quản lý State tại Frontend (Zustand)

Zagi sử dụng thư viện **Zustand** để quản lý trạng thái tập trung gọn nhẹ, phân tách dữ liệu theo mô-đun:

- **`accountStore`** (`src/store/accountStore.ts`): Quản lý danh sách các tài khoản Zalo đã kết nối, trạng thái kết nối trực tuyến (online/offline) và tài khoản đang active.
- **`chatStore`** (`src/store/chatStore.ts`): Lưu trữ danh sách cuộc hội thoại (threads), tin nhắn gần đây của từng hội thoại, trạng thái gộp hộp thư và tiến trình tải tin nhắn cũ.
- **`workspaceStore`** (`src/store/workspaceStore.ts`): Quản lý không gian làm việc hiện tại, cấu hình kết nối Relay Server và cổng mạng của Boss.
- **`employeeStore`** (`src/store/employeeStore.ts`): Quản lý phân quyền và thông tin đăng nhập của nhân viên dưới quyền.

---

## 5. Sơ đồ Cơ sở dữ liệu cục bộ (SQLite)

Hệ thống sử dụng cơ sở dữ liệu SQLite cục bộ (`zagi-tool.db`) đặt tại thư mục dữ liệu ứng dụng. Sơ đồ các bảng chính bao gồm:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                               zagi-tool.db                              │
├───────────────────┬───────────────────┬───────────────────┬─────────────┤
│     contacts      │      friends      │     messages      │  ai_usage_  │
│                   │                   │                   │    logs     │
├───────────────────┼───────────────────┼───────────────────┼─────────────┤
│ - contact_id (PK) │ - user_id (PK)    │ - message_id (PK) │ - id (PK)   │
│ - display_name    │ - display_name    │ - thread_id       │ - assistant_│
│ - alias           │ - avatar          │ - sender_id       │   id        │
│ - avatar_url      │ - phone           │ - content         │ - prompt_   │
│ - phone           │ - owner_zalo_id   │ - timestamp       │   tokens    │
│ - contact_type    │ - status          │ - is_sent         │ - total_    │
│ - owner_zalo_id   │                   │ - msg_type        │   tokens    │
└───────────────────┴───────────────────┴───────────────────┴─────────────┘
```

- **`contacts`**: Lưu thông tin khách hàng và thông tin phòng chat nhóm. Cột `contact_type` phân loại giữa `'user'` và `'group'`.
- **`friends`**: Đồng bộ danh sách bạn bè chính thức của từng tài khoản Zalo sở hữu (`owner_zalo_id`).
- **`messages`**: Lưu trữ lịch sử tin nhắn phục vụ tìm kiếm nhanh offline và nạp làm ngữ cảnh cho AI.
- **`ai_assistants`**: Cấu hình các trợ lý AI bao gồm API Key (mã hóa bằng `safeStorage`), prompt hệ thống, danh sách sản phẩm ghim và trường `custom_url`.
- **`workflow_nodes`** & **`workflow_edges`**: Lưu trữ cấu trúc kéo-thả sơ đồ kịch bản tự động hóa.

---

## 6. Quy trình CI/CD Đóng gói tự động

Zagi sử dụng **GitHub Actions** để tự động biên dịch và đóng gói ứng dụng đa nền tảng mỗi khi có bản phát hành mới.

### Cơ chế Trigger:
Hệ thống tự động kích hoạt tiến trình đóng gói khi lập trình viên tạo thẻ tag phiên bản mới bắt đầu bằng chữ `v` (VD: `git tag v26.4.3` và `git push origin v26.4.3`).

### Luồng chạy của GitHub Actions:
1. **Khởi chạy môi trường**: Job chạy trên hệ điều hành tương ứng (`windows-latest` cho Windows và `macos-14` cho macOS).
2. **Biên dịch & Tối ưu**:
   - Chạy `npm ci` để cài đặt sạch thư viện.
   - Biên dịch TypeScript main process và đóng gói Vite bundle cho frontend.
3. **Đóng gói Installer**:
   - Chạy `electron-builder` để đóng gói thành tệp `.exe` (trên Windows) và tệp `.dmg` (trên macOS).
   - Tự động rebuild thư viện native `better-sqlite3`.
4. **Phát hành Releases**:
   - Sử dụng thư viện `softprops/action-gh-release` tải các tệp đóng gói đầu ra lên mục GitHub Releases của repository dưới dạng bản cập nhật chính thức.
