# UI Components & Stores

> UI là React SPA chạy trong Electron renderer. App.tsx (~70KB) là file lớn nhất — chứa router + layout.
> **Theme:** tuân theo Mục 22 — Theme Resolution (Design Standard v27.2.9). Dùng `data-theme` trên `<html>`, đọc qua `useResolvedTheme()`.

## Store Architecture (Zustand)

| Store | File | State |
|---|---|---|
| `appStore` | `src/ui/store/appStore.ts` (35KB) | App-wide: active account, settings, notifications, sidebar, **theme** |
| `chatStore` | `src/ui/store/chatStore.ts` (27KB) | Messages, threads, typing, unread counts |
| `crmStore` | `src/ui/store/crmStore.ts` (8KB) | CRM contacts, campaigns, labels |
| `accountStore` | `src/ui/store/accountStore.ts` (4KB) | Zalo accounts đang connected |
| `employeeStore` | `src/ui/store/employeeStore.ts` (9KB) | Employee list, permissions (Boss UI) |
| `workspaceStore` | `src/ui/store/workspaceStore.ts` (4KB) | Workspace config: local/remote |
| `updateStore` | `src/ui/store/updateStore.ts` (2KB) | Auto-update state |

### appStore — important state
```typescript
activeZaloId: string              // zaloId đang active
selectedThreadId: string          // thread đang mở
isBossMode: boolean               // Boss hay nhân viên?
accountPermissions: Permission[]  // quyền của nhân viên hiện tại
theme: ThemePreference            // 'light' | 'dark' | 'system' (persist: zagi-theme)
resolvedTheme: ResolvedTheme      // 'light' | 'dark' (đã resolve, xem Mục 22)
```

### Multi-account Event Isolation (Security Pattern)
Khi Boss có nhiều tài khoản Zalo, events PHẢI được verify trước khi show UI:
```typescript
// 3-layer guard:
// 1. useZaloEvents: check accounts array
// 2. handleReminderEvent: check ownedAccount
// 3. onOpenThread: check isValidAccount + isValidThread
```

---

## UI Component Map

### `/src/ui/components/`

| Folder / Component | Purpose |
|---|---|
| `chat/` | MessageList, MessageInput, ThreadList, TypingIndicator |
| `crm/` | ContactList, CampaignManager, LabelManager, PhoneScanPanel (Quét SĐT Multi-Account) |
| `common/GlobalSupportChat.tsx` | Widget Trợ lý AI hỗ trợ Zagi kết nối Dify Chatbot `app-Shoio3nzmEVuoJJOBUsycsp9` (hỗ trợ cả Boss & Employee Web Mode) |
| `workflow/` | NodeConfigPanel, WorkflowEditor (ReactFlow), NodePicker |
| `settings/` | AccountSettings, EmployeeSettings (Ẩn Workspace tab với nhân viên), NotificationSettings |
| `analytics/` | Dashboard charts (Recharts) |
| `auth/` | Login screens |
| `layout/` | Sidebar, Topbar, MainLayout |
| `common/` | Modal, Button, Input, SmartTextarea, Avatar |
| `integration/` | Webhook, KiotViet, GHN, Sapo... |
| `dashboard/` | Dashboard overview |

### Key Large Components

**`WorkflowEditor`** — ReactFlow drag-drop. `NodeConfigPanel.tsx` (500+ lines/node type), `workflowConfig.ts` (default config). Hỗ trợ Undo/Redo (useRef guard), Auto-align BFS, Cycle detection, Silent auto-save. `SmartTextarea` hỗ trợ `{{ $trigger.xxx }}`.

**`App.tsx`** (70KB) — Router (react-router-dom v6), layout Sidebar + Main, khởi tạo Zalo/IPC. **Gọi `useResolvedTheme()` một lần tại đây.**

**`CampaignCreateModal`** — Tạo campaign gửi hàng loạt: contacts, message template, delay, sendMode.

---

## UI Patterns

### Gọi IPC từ renderer
```typescript
// CHUẨN: qua preload bridge
const result = await window.api.zalo.sendMessage({ message, threadId, type });
```
> **MUST NOT** dùng `window.require('electron')` trực tiếp — vi phạm contextIsolation, rủi ro bảo mật với dữ liệu chat khách hàng. Chỉ dùng preload bridge `window.api`.

### useRef guard (Double-save prevention)
```typescript
const isSubmittingRef = useRef(false);
if (isSubmittingRef.current) return;
isSubmittingRef.current = true;
try { await save(); } finally { isSubmittingRef.current = false; }
```

### SmartTextarea Variable Syntax (ngữ cảnh Workflow)
```
{{ $trigger.threadId }}        ← thread trigger
{{ $trigger.message }}         ← tin nhắn trigger
{{ $node.NodeLabel.field }}    ← output của node khác
{{ $item.display_name }}       ← CRM contact field
{{ $item.salutation }}         ← xưng hô (Anh/Chị)
```
> Lưu ý: cú pháp `{{ $... }}` dùng cho Workflow node. Biến soạn tin CRM dạng `{gender_greeting}`/`{alias}` (pill, xem Design Standard Mục 15) là ngữ cảnh KHÁC — không trộn lẫn parser.

---

## Routing Structure (App.tsx)
```
/            → Dashboard
/chat        → Chat UI
/crm         → CRM contacts + campaigns
/workflow    → Workflow list + editor
/analytics   → Analytics dashboard
/settings    → Settings
/integration → Integration management
```

---

## UI Coding Patterns

### Theme Detection — TUÂN THEO MỤC 22
Theme resolution tuân theo **Mục 22 — Theme Resolution** (Design Standard v27.2.9).

Vấn đề với `theme === 'light'`: không cover `'system'` khi OS ở Light Mode. **Giải pháp chuẩn** là resolve `'system'` sẵn trong `appStore` và đọc qua hook:

```typescript
import { useResolvedTheme } from '@/ui/theme/useResolvedTheme';

const resolved = useResolvedTheme(); // 'light' | 'dark'
const isLight = resolved === 'light';
```

> **MUST NOT** đọc `document.documentElement.getAttribute('data-theme')` trực tiếp trong render — DOM không trigger re-render, gây bug "đổi theme phải đóng mở lại mới cập nhật". `data-theme` chỉ là đầu ra cho Tailwind, không phải nguồn đọc cho React.
