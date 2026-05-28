# 🎼 ZAGI UPGRADE PLAN — Lộ trình Nâng cấp Toàn diện

> **Phiên bản hiện tại:** v26.4.6 | **Mục tiêu:** v27.0.0
> **Tạo bởi:** Orchestrator Agent (explorer-agent × project-planner × 5 chuyên gia)
> **Ngày phân tích:** 2026-05-28
> **Cập nhật lần cuối:** 2026-05-28

---

## 📊 PHÂN TÍCH HIỆN TRẠNG (Explorer Agent)

### Kiến trúc tổng quan

| Lớp | Thành phần | Số lượng | Kích thước |
|-----|-----------|---------|----------|
| Renderer (React) | TSX Components | 115 files | App.tsx: 1,357 dòng |
| Main Process | Electron IPC Handlers | 20 files | main.ts: 946 dòng |
| Services | Business Logic | 44 files | 16 modules |
| State (Zustand) | Stores | 7 stores | appStore.ts: 28KB |
| Tests | Unit Tests | 3 files | **Rất thấp!** |

### 🔴 Vấn đề Kỹ thuật Phát hiện

| Mức độ | Vấn đề | Tác động |
|--------|--------|---------|
| 🔴 Nghiêm trọng | Chỉ 3 test files / 115+ component files | Không phát hiện regression |
| 🔴 Nghiêm trọng | `App.tsx` 1,357 dòng — God Component | Khó maintain, hiệu suất kém |
| 🔴 Nghiêm trọng | `main.ts` 946 dòng — God File | Khó scale IPC handlers |
| 🟡 Quan trọng | 71/115 components dùng `any` type | Type safety yếu |
| 🟡 Quan trọng | 48 `console.log` trong production code | Rò rỉ thông tin |
| 🟡 Quan trọng | 742 usages `any` trong services | Lỗi runtime khó tìm |
| 🟢 Cải thiện | Bundle size 4.8 MB — không có code splitting | First load chậm |

---

## 🗺️ LỘ TRÌNH 5 GIAI ĐOẠN

---

## GIAI ĐOẠN 1: NỀN TẢNG & BẢO MẬT (v26.5.0) 🔐

**Timeline: 1–2 tuần | Ưu tiên: KHẨN CẤP**

> Mục tiêu: Ổn định code base, xóa technical debt nguy hiểm nhất, tăng độ bao phủ test.

### Trạng thái: ⏳ Chờ triển khai

### 1.1 Refactor App.tsx — Tách God Component

**Agent:** `frontend-specialist`

| Tác vụ | File mục tiêu | Mô tả | Trạng thái |
|--------|-------------|-------|-----------|
| Tách Route logic | `src/ui/router/AppRouter.tsx` | Toàn bộ routes, guards, lazy loading | ⏳ |
| Tách Chat page | `src/ui/pages/ChatPage.tsx` | Chat logic độc lập | ⏳ |
| Tách CRM page | `src/ui/pages/CRMPage.tsx` | CRM context riêng | ⏳ |
| Tách Workflow page | `src/ui/pages/WorkflowPage.tsx` | Workflow state riêng | ⏳ |
| Tách Layout | `src/ui/layouts/MainLayout.tsx` | Sidebar, TopBar wrapper | ⏳ |

**Kết quả mong đợi:** `App.tsx` < 200 dòng, mỗi trang độc lập, tải nhanh hơn 40%.

---

### 1.2 Bổ sung Test Coverage

**Agent:** `test-engineer`

| Tác vụ | Priority | File | Trạng thái |
|--------|----------|------|-----------|
| Unit test: CRMQueueService | P0 | `src/__tests__/CRMQueueService.test.ts` | ⏳ |
| Unit test: WorkflowEngine | P0 | `src/__tests__/WorkflowEngine.test.ts` | ⏳ |
| Unit test: LicenseManager | P1 | Bổ sung edge cases | ⏳ |
| Integration test: IPC | P1 | `src/__tests__/ipc/*.test.ts` | ⏳ |
| E2E: Luồng đăng nhập | P1 | Playwright tests | ⏳ |
| Coverage target | — | >= 60% statements | ⏳ |

---

### 1.3 Security Hardening

**Agent:** `security-auditor`

| Tác vụ | Hiện trạng | Cần làm | Trạng thái |
|--------|-----------|---------|-----------|
| Xóa `console.log` | 48 instances | ESLint rule + script tự động | ⏳ |
| `API_SECRET` hardcoded | Trong LicenseManager.ts | Chuyển sang env var / encrypted config | ⏳ |
| IPC validation | Chưa có | Thêm Zod schema validation | ⏳ |
| Content Security Policy | Chưa cấu hình | Thêm CSP header trong main.ts | ⏳ |
| Audit dependencies | — | `npm audit fix` | ⏳ |

---

## GIAI ĐOẠN 2: HIỆU SUẤT & UX (v26.6.0) ⚡

**Timeline: 2–3 tuần | Ưu tiên: CAO**

> Mục tiêu: Giảm bundle size, tối ưu render, cải thiện trải nghiệm người dùng thực tế.

### Trạng thái: ⏳ Chờ Giai đoạn 1 hoàn thành

### 2.1 Code Splitting & Lazy Loading

**Agent:** `frontend-specialist` + `performance-optimizer`

| Chunk mới | Ước tính | Tải khi |
|-----------|---------|---------|
| vendor.js | ~960 KB | Startup |
| core.js | ~800 KB | Startup |
| crm.chunk.js | ~200 KB | Vào tab CRM |
| workflow.chunk.js | ~150 KB | Vào tab Workflow |
| erp.chunk.js | ~120 KB | Vào tab ERP |

### 2.2 Virtualization cho Danh sách lớn

| Component | Vấn đề | Giải pháp |
|-----------|--------|---------|
| `ConversationList.tsx` | Render toàn bộ | `react-virtual` |
| `CRMContactList.tsx` | Hàng nghìn contacts | Window-based virtualization |
| `SendHistoryLog.tsx` | Log dài | Paginated virtual scroll |

### 2.3 State Optimization

- Tách `appStore.ts` (28KB!) thành store nhỏ theo domain
- Thêm `React.memo` và `useMemo` cho component nặng
- Selector pattern cho `chatStore.ts` (23KB)
- Thêm Suspense + ErrorBoundary cho mọi page

### 2.4 UI/UX Cải tiến Quan trọng

| Tính năng | Mô tả | Priority |
|-----------|-------|---------|
| Skeleton Loading | Thay spinner bằng skeleton screen đẹp | P0 |
| Toast Notification System | Thống nhất thông báo | P0 |
| Keyboard Shortcuts | Cmd+K Command Palette | P1 |
| Drag & Drop | Kéo thả hội thoại vào nhóm/nhãn | P1 |
| Dark/Light Theme | Hoàn thiện Light mode | P2 |

---

## GIAI ĐOẠN 3: TÍNH NĂNG MỚI (v26.7.0 – v26.9.0) 🚀

**Timeline: 4–8 tuần | Ưu tiên: TRUNG BÌNH-CAO**

### Trạng thái: ⏳ Chờ Giai đoạn 2 hoàn thành

### 3.1 AI Assistant Nâng cấp

**Agent:** `backend-specialist` + `frontend-specialist`

| Tính năng | Mô tả | Trạng thái |
|-----------|-------|-----------|
| Phân tích cảm xúc (Sentiment) | AI đánh giá sentiment, hiển thị badge trên ConversationList | ⏳ |
| Tự động gợi ý trả lời | 3 mẫu trả lời theo context khi vào MessageInput | ⏳ |
| Tóm tắt định kỳ | AI tóm tắt CRM batch hàng ngày, gửi email báo cáo | ⏳ |
| Smart Tag | AI đề xuất nhãn cho contact tự động | ⏳ |
| AI Intent Recognition | Phân loại: Hỏi giá / Khiếu nại / Hỗ trợ / Đặt hàng | ⏳ |

### 3.2 CRM Pipeline Kanban

**Agent:** `backend-specialist` + `database-architect`

| Tính năng | Mô tả | Trạng thái |
|-----------|-------|-----------|
| Pipeline Kanban | Board kéo thả: Tiếp cận → Tư vấn → Chốt | ⏳ |
| Funnel Báo cáo | Biểu đồ phễu chuyển đổi | ⏳ |
| Reminder thông minh | Nhắc việc tự động theo timeline CRM | ⏳ |
| Export/Import | Xuất nhập contacts ra Excel/CSV | ⏳ |
| Timeline Contact | Lịch sử tương tác đầy đủ | ⏳ |

### 3.3 Workflow Engine Nâng cấp

| Tính năng | Mô tả | Trạng thái |
|-----------|-------|-----------|
| Debug Mode | Step-by-step trace từng node | ⏳ |
| Test Mode | Chạy thử với data giả lập | ⏳ |
| Template Gallery | 20+ template: Welcome, Follow-up, CSKH | ⏳ |
| Scheduling Builder | Cron expression builder trực quan | ⏳ |
| Webhook Trigger | Nhận trigger từ HTTP webhook | ⏳ |
| Rate Limiting | Giới hạn tốc độ gửi tránh spam detection | ⏳ |

### 3.4 Quản lý Nhóm Nâng cao

| Tính năng | Mô tả | Trạng thái |
|-----------|-------|-----------|
| Batch Group Management | Add/remove thành viên nhiều nhóm cùng lúc | ⏳ |
| Auto Welcome | Tự chào thành viên mới gia nhập | ⏳ |
| Pinned Notices | Ghim thông báo định kỳ tự động | ⏳ |

---

## GIAI ĐOẠN 4: KIẾN TRÚC & SCALABILITY (v27.0.0) 🏗️

**Timeline: 3–4 tuần | Ưu tiên: CHIẾN LƯỢC**

### Trạng thái: ⏳ Chờ Giai đoạn 3 hoàn thành

### 4.1 Database Optimization

**Agent:** `database-architect`

| Tác vụ | Mô tả | Trạng thái |
|--------|-------|-----------|
| Index Optimization | Phân tích slow queries, thêm index cho conversation/contact | ⏳ |
| Schema Versioning | Migration version system cho SQLite | ⏳ |
| WAL Mode | Bật Write-Ahead Logging tăng throughput | ⏳ |
| Database Sharding | DB riêng mỗi workspace | ⏳ |
| Backup Automation | Auto backup ra Cloud định kỳ | ⏳ |

### 4.2 Tách Main.ts — IPC Router Architecture

**Agent:** `backend-specialist`

```
electron/
├── main.ts                  (< 100 dòng — chỉ bootstrap)
├── app/
│   ├── AppManager.ts        (window, tray, lifecycle)
│   ├── LicenseGate.ts       (license flow)
│   └── UpdateManager.ts     (auto-updater)
└── ipc/
    ├── router.ts            (IPC registry & Zod validation)
    └── handlers/            (domain handlers — hiện có 20 files)
```

### 4.3 Plugin / Extension System

| Tính năng | Mô tả | Trạng thái |
|-----------|-------|-----------|
| Plugin API | API cho third-party tích hợp workflow node mới | ⏳ |
| Custom Integration | UI tự cấu hình tích hợp không cần code | ⏳ |
| Marketplace | Thư viện template/plugin cộng đồng online | ⏳ |

---

## GIAI ĐOẠN 5: CHẤT LƯỢNG & DEVOPS (Liên tục) 🔄

**Timeline: Song song suốt roadmap | Ưu tiên: THƯỜNG XUYÊN**

### 5.1 Testing Strategy

| Loại test | Target | Tool |
|-----------|--------|------|
| Unit Tests | >= 60% coverage | Jest + ts-jest |
| Component Tests | Critical UI | Vitest + RTL |
| E2E Tests | 5 happy paths | Playwright |

### 5.2 CI/CD Nâng cấp

| Cải tiến | Mô tả | Trạng thái |
|---------|-------|-----------|
| Auto Release Notes | Tạo từ commit messages tự động | ⏳ |
| Auto Version Bump | Script tăng version theo conventional commits | ⏳ |
| Build Cache | Cache node_modules — build nhanh hơn 60% | ⏳ |
| Delta Update | File cập nhật nhỏ hơn 80% | ⏳ |
| Code Signing | Windows/macOS signing — không SmartScreen warning | ⏳ |

### 5.3 Monitoring & Error Tracking

| Tính năng | Tool | Mô tả | Trạng thái |
|-----------|------|-------|-----------|
| Error Reporting | Sentry (self-hosted) | Thu thập crash reports | ⏳ |
| Usage Analytics | Custom | Feature usage tracking | ⏳ |
| Performance Monitoring | Custom metrics | IPC latency, load time | ⏳ |

---

## 📅 TIMELINE TỔNG QUAN

```
Tháng 6           Tháng 7           Tháng 8-9         Q4/2026
│                 │                 │                 │
├─ GĐ1 (2 tuần) ──┤
│  Security        │
│  Refactor App   │
│  Test Coverage  │
│                  ├─ GĐ2 (3 tuần) ──┤
│                  │  Performance    │
│                  │  Code Splitting │
│                  │  UI/UX Fixes    │
│                  │                  ├─ GĐ3 (8 tuần) ──────────┤
│                  │                  │  AI Features            │
│                  │                  │  CRM Pipeline           │
│                  │                  │  Workflow++             │
│                  │                  │                  ├─ GĐ4 ─┤
│                  │                  │                  │ v27.0 │
└─ GĐ5: DevOps & Quality (song song suốt roadmap) ─────────────┘
```

---

## 🎯 METRICS THÀNH CÔNG

| Chỉ số | Hiện tại (v26.4.6) | Mục tiêu GĐ1 | Mục tiêu v27.0 | Đạt được |
|--------|-------------------|------------|--------------|---------|
| Test Coverage | ~3% | 30% | 60% | ⏳ |
| Bundle Size | 4.8 MB | 4.8 MB | < 2 MB | ⏳ |
| App.tsx LOC | 1,357 | < 200 | < 100 | ⏳ |
| `any` type count | 742 | < 400 | < 100 | ⏳ |
| `console.log` | 48 | 0 | 0 | ⏳ |
| Startup Time | chưa đo | — | < 2s | ⏳ |
| P95 IPC Latency | chưa đo | — | < 50ms | ⏳ |

---

## 📝 CHANGELOG KẾ HOẠCH

| Ngày | Phiên bản | Thay đổi |
|------|----------|---------|
| 2026-05-28 | v1.0 | Tạo kế hoạch lần đầu — phân tích codebase v26.4.6 |

---

## 🔖 Chú thích trạng thái

| Icon | Ý nghĩa |
|------|---------|
| ⏳ | Chờ triển khai |
| 🔄 | Đang thực hiện |
| ✅ | Hoàn thành |
| ❌ | Huỷ / Không áp dụng |
