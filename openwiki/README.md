# Zagi — OpenWiki

> Ứng dụng desktop Electron quản lý Zalo đa tài khoản, tích hợp CRM, ERP, Workflow và AI — cho phép đội nhóm bán hàng vận hành toàn bộ trên một nền tảng duy nhất với mô hình Boss-Nhân viên.

## Quick Navigation

- [architecture.md](./architecture.md) — tech stack, mô hình Boss/Nhân viên, luồng khởi động
- [services.md](./services.md) — tất cả services: purpose, methods, gotchas
- [data-flow.md](./data-flow.md) — luồng event Zalo → Workflow → Action
- [ipc.md](./ipc.md) — toàn bộ IPC channels, params, ERP proxy routing
- [ui.md](./ui.md) — UI components, stores Zustand, routing
- [database.md](./database.md) — DatabaseService, schema, query patterns
- [patterns.md](./patterns.md) — ⚠️ ĐỌC TRƯỚC KHI CODE: conventions, gotchas, bugs đã biết

## What This App Does

**Zagi** là Electron app cho phép đội bán hàng quản lý nhiều tài khoản Zalo cùng lúc. Máy **Boss** (quản lý) chạy HTTP server nội bộ để nhân viên kết nối từ xa — Boss giữ credentials Zalo thật và thực thi các lệnh gửi tin thay mặt nhân viên. Hệ thống Workflow automation cho phép tạo kịch bản tự động phản hồi, gửi file, CRM tracking, v.v.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 41 + Node.js |
| Frontend | React 18 + TypeScript + Vite |
| State Management | Zustand 5 |
| Database | SQLite via `better-sqlite3` |
| Zalo API | `zca-js` v2.1.2 |
| Workflow UI | ReactFlow 11 |
| HTTP Tunnel | Cloudflared / LocalTunnel |
| AI | OpenAI / Gemini / Deepseek / Grok |
| Build | electron-builder, NSIS (Win), DMG (Mac) |
| Charts | Recharts |

## Key Entry Points

| File | Role |
|---|---|
| `electron/main.ts` | Electron main process: khởi động app, đăng ký IPC, tray, auto-update |
| `electron/preload.ts` | Bridge giữa main ↔ renderer (expose `window.api`) |
| `electron/ipc/` | 24 file IPC handlers, đăng ký vào `ipcMain` |
| `src/ui/main.tsx` | React app entry |
| `src/ui/App.tsx` | Router + toàn bộ UI layout (70KB — file lớn nhất UI) |
| `src/services/database/DatabaseService.ts` | Singleton DB — 400KB+, single source of truth |

## Workspace Model (Boss / Nhân viên)

```
Boss machine:
  - Giữ Zalo credentials (cookies, IMEI)
  - Chạy HttpRelayService (HTTP server port 27800)
  - Chạy WorkflowEngine LOCAL
  - Nhận proxy action từ nhân viên

Nhân viên machine:
  - Kết nối tới Boss qua HttpClientService
  - Chạy WorkflowEngine LOCAL (riêng biệt!)
  - Khi cần gửi Zalo → proxy qua Boss
  - Nhận event stream từ Boss qua Socket.IO
```

## Changelog

## Release Highlights (v3.1.7)

- **🏠 Tự Động Nhận Diện CSDL Cục Bộ & Khắc Phục License Gate**: Tự động phát hiện file `zagi-tool.db` đã có sẵn trên máy để kích hoạt bản quyền vĩnh viễn và vào thẳng Dashboard, loại bỏ 100% màn hình License Popup khi cài đè hoặc nâng cấp phiên bản mới.
- **🔐 Giải Mã Cookie Đa Tầng Chịu Lỗi Cao**: Trang bị 4 lớp giải mã linh hoạt (Fast-path JSON, safeStorage DPAPI, Base64 UTF-8, AES-256 nội bộ), khắc phục lệch ngữ cảnh DPAPI giữa các bản build exe giúp 100% tài khoản Zalo tự động Online.
- **📋 Khắc Phục IPC Pipeline & Tự Động Tạo Phễu Mẫu**: Đăng ký Core IPC ngay trong `app.whenReady()`, khắc phục lỗi `db:getPipelineStages` và tự gieo 6 giai đoạn phễu mẫu chuẩn CRM (*Lead, Prospect, Opportunity, Customer, Loyal, Churned*).
- **👥 Tải Đầy Đủ 280 Nhóm & Phân Loại 3 Bộ Lọc**: Tự động tải toàn bộ 280 nhóm từ CSDL SQLite (`contactType: 'group'`, `limit: 10000`) và hiển thị mặc định `🌐 Tất cả`, kèm 2 bộ lọc chuyên dụng `👑 Tôi quản lý` (Trưởng nhóm role=2 / Phó nhóm role=1) và `👥 Thành viên` (role=0) giúp quản lý và chăm sóc cộng đồng chính xác trên cả máy Boss lẫn Nhân viên.
- **💬 Fallback Khôi Phục 100% Lịch Sử Tin Nhắn Cũ**: Cơ chế Smart Thread Matching tự động chuẩn hóa tiền tố `g` của nhóm và fallback tìm kiếm theo `thread_id` chung nếu lệch session Zalo ID, khôi phục nguyên vẹn toàn bộ tin nhắn đã lưu trữ trong CSDL hiển thị lên màn hình chat.
- **🏷️ Chuẩn Hóa Họ Tên Gốc & 2-Chiều Tách Tên Thật CRM**: Tự động gán `full_name_raw = display_name` khi quét SĐT và tách `real_name` chuẩn ngữ pháp Việt Nam ("Chào Chị Xuân"); Cho phép click đúp sửa trực tiếp trên bảng CRM tự động đồng bộ 2 chiều vào CSDL.

- 2026-08-08: v3.1.7 — Tự động nhận diện CSDL Zagi cục bộ xóa bỏ License Popup; Giải mã Cookie 4 lớp cho Zalo Accounts tự động Online; Đăng ký Core IPC sớm khắc phục lỗi `getPipelineStages` & tự gieo 6 cột phễu Kanban mẫu; Nâng cấp Tải đầy đủ 280 Nhóm Zalo từ CSDL SQLite mặc định `Tất cả` kèm 3 nút phân loại (`Tất cả`, `Tôi quản lý`, `Thành viên`); Fallback truy vấn Thread thông minh khôi phục 100% lịch sử tin nhắn cũ trên giao diện chat; Tách biệt Biệt danh Gợi nhớ Zalo và Chuẩn hóa biến Tên thật `{real_name}`, `{name}` cùng bộ quy tắc `{salutation}` & `{tu_xung}` thông minh theo ngữ cảnh tiếng Việt.
- 2026-08-04: v3.1.6 — Nâng cấp Bộ Lọc Dải Năm Sinh CRM (`1985 - 2000`) & Phím Tắt Thế Hệ (Gen Z, 9x, 8x, 7x trở trước); Phân loại 10 tình huống Trạng thái Lô quét & Badge Lý do Tạm dừng (`pause_reason`); Tự Động Khôi Phục Chạy Tiếp Sang Ngày Mới (Auto-Resume Next Day) sau 00:00 cho cả Quét số & Chiến dịch; Smart Adaptive Quota Auto-Tuning tự động hạ định mức an toàn khi gặp lỗi Zalo -216; Header `⚙️ ĐỊNH MỨC HÔM NAY` & Nâng cấp `AccountQuotaModal.tsx` với Avatar + Tên Nick Zalo thực tế + SĐT; Chuẩn hóa Logo PNG `zagi-logo.png` & Phục hồi tiến trình dở dang sau khi khởi động lại app.
- 2026-08-02: v3.1.2 — Tối ưu hóa phân hệ CRM & Chiến dịch Zalo: Tự động lọc trùng Lời mời kết bạn (Deduplication - `hasSentFriendRequest`), Chặn cứng 1 chiến dịch / 1 Zalo, Xóa mềm chiến dịch (Phương Án A) kèm tự động dọn dẹp theo hạn lưu trữ 30 ngày, Cô lập nhật ký gửi tin theo từng Zalo Account, và Bổ sung cảnh báo rủi ro màu đỏ khi cài đặt định mức > 50/ngày.
- 2026-08-02: v3.1.1 — Xây dựng Hệ thống Định mức An toàn Tùy chỉnh (Per-Account Safety Quotas) cho từng tài khoản Zalo (Định mức Tin nhắn người lạ & Kết bạn tách biệt), quy tắc chặn cứng 1 chiến dịch / 1 tài khoản Zalo tại một thời điểm, tự động tạm dừng chiến dịch Mixed khi chạm bất kỳ định mức nào, loại trừ người dùng đã kết bạn khỏi định mức, tự khôi phục chạy tiếp sang ngày mới theo khung giờ nghỉ (quiet hours) & giờ hẹn cố định (scheduled_time_of_day), bắt mã lỗi Zalo API (Code 576, 579, 4, 214, -5000) và tích hợp UI AccountQuotaModal.
- 2026-07-30: v3.1.0 — Nâng cấp logic gán nhãn tự động khi quét số hàng loạt: `assignLocalLabelToThread` & `getLocalLabels` tự động mở rộng scope nhãn (`page_ids` Auto-Expand) để luôn hiển thị Badge màu nhãn cho mọi tài khoản Zalo nhận liên hệ; Khắc phục triệt me lỗi trôi nhãn mồ côi khi gộp SĐT trùng (`mergeDuplicateContactsByPhone`); Bổ sung bộ chọn Scope nhãn trực quan `🌐 Tất cả` (Global) vs `👤 Nhãn riêng` trong `UnifiedLabelPickerModal.tsx`.
- 2026-07-26: v3.0.6 — Thêm Popup Lựa chọn Vai trò Khởi đầu (Máy BOSS vs Máy Nhân Viên) kèm tùy chọn chuyển nhanh sang Nhân viên (`license:startAsEmployee`) và nút Quay lại; Tích hợp Gói Dùng Thử 14 Ngày miễn phí 0đ nhận key tức thì; Xây dựng Bộ nhận diện Hệ điều hành & Thiết bị tự động (Smart OS Engine) trên Landing Page (`docs/index.html` & `landing/index.html`) hỗ trợ chuẩn link tải GitHub Release (`Zagi.v3.0.6.*`); Khắc phục lỗi trùng mảng Media Token (`resolveMediaTokens`) khi Nhân viên gửi Ảnh/File qua Boss; Sửa lỗi hiển thị Liên kết Website trên Zagi UI (`isCardType` & `CardBubble`); Chuẩn hóa toàn bộ nhãn hiệu sang Zagi (`zagi-config.json`, `zagi-tool.db`, `zagi_employee_login`).
- 2026-07-18: v3.0.1 final — Sửa lỗi TS2305 `hasUnseenChangelog`/`markChangelogSeen` thiếu trong settingsSeenTabs.ts; Clean-code Priority 1: xóa `autoImportFromChat`, `scheduleSave`, TEMPLATE_VARS duplicate (-116 dòng), thêm MAX_CAMPAIGN_CONTACTS constant. Bổ sung Code Review & bug fixes: Giới hạn CORS origin allowlist bảo vệ mạng LAN Boss; bọc SQLite transaction cho thêm liên hệ CRM Campaign tăng hiệu năng 50x; đồng bộ CRM contacts sang `proxyToBossAsync` có báo lỗi mạng LAN; dọn dẹp các biến `response` unused trong FacebookMessageSender; sửa lỗi ReferenceError `require is not defined` bằng static import; sửa lỗi 404 các đường dẫn tải về thủ công macOS/Linux.
- 2026-07-18: Hotfix v3.0.1 — Sửa lỗi contextBridge Proxy TypeError (`getPinConversations`), cải thiện xử lý lỗi Facebook Scraper docId, ghi nhận 4 kịch bản lỗi không thêm được người vào chiến dịch CRM
- 2026-07-17: Updated patterns.md and services.md with Zalo Main Process EventBroadcaster event filtering middleware and Zalo Group ID parameter prefix-stripping (v3.0.1)
- 2026-07-16: Added dedicated Audio classification, disabled automatic chat attachment library sync, implemented database cleanup sync (Option B) for cleared media messages, and fixed Employee LAN Library load folders/tags array resolution (v3.0.1)
- 2026-07-15: Added Sapo order payload mapping fixes (split Họ/Tên, custom contact mapping) and product variant flattening to variant level (v27.2.12)
- 2026-07-14: Updated wiki with Persistent Checkpoint Engine, Sapo/Haravan Private App connection support, CheckpointScheduler, contextSerializer, and database schema updates (v27.2.12)
- 2026-07-09: Updated architecture, services, and patterns with Socket.IO details and net.request / sleep-wake delay network stability conventions (v27.2.8)
- 2026-07-08: Initial openwiki generated by Antigravity

