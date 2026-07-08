# UI Components & Stores

> UI là React SPA chạy trong Electron renderer. App.tsx (~70KB) là file lớn nhất — chứa router + layout.

## Store Architecture (Zustand)

| Store | File | State |
|---|---|---|
| `appStore` | `src/ui/store/appStore.ts` (35KB) | App-wide state: active account, settings, notifications, sidebar |
| `chatStore` | `src/ui/store/chatStore.ts` (27KB) | Messages, threads, typing, unread counts |
| `crmStore` | `src/ui/store/crmStore.ts` (8KB) | CRM contacts, campaigns, labels |
| `accountStore` | `src/ui/store/accountStore.ts` (4KB) | Danh sách Zalo accounts đang connected |
| `employeeStore` | `src/ui/store/employeeStore.ts` (9KB) | Employee list, permissions (dành cho Boss UI) |
| `workspaceStore` | `src/ui/store/workspaceStore.ts` (4KB) | Workspace config: local/remote |
| `updateStore` | `src/ui/store/updateStore.ts` (2KB) | Auto-update state |

### appStore — important state
```typescript
// Các state quan trọng trong appStore:
activeZaloId: string          // zaloId đang active
selectedThreadId: string      // thread đang mở
isBossMode: boolean           // Boss hay nhân viên?
accountPermissions: Permission[] // quyền của nhân viên hiện tại
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

| Folder | Purpose |
|---|---|
| `chat/` | Chat UI: MessageList, MessageInput, ThreadList, TypingIndicator |
| `crm/` | CRM: ContactList, CampaignManager, LabelManager |
| `workflow/` | Workflow editor: NodeConfigPanel, WorkflowEditor (ReactFlow), NodePicker |
| `settings/` | Settings pages: AccountSettings, ChangelogSettings, EmployeeSettings |
| `analytics/` | Dashboard charts (Recharts) |
| `auth/` | Login screens |
| `layout/` | Sidebar, Topbar, MainLayout |
| `common/` | Shared: Modal, Button, Input, SmartTextarea, Avatar |
| `integration/` | Integration settings: Webhook, KiotViet, GHN, Sapo... |
| `dashboard/` | Dashboard overview |

### Key Large Components

**`WorkflowEditor`** (`src/ui/components/workflow/`)
- Dùng ReactFlow cho drag-drop
- `NodeConfigPanel.tsx` — cấu hình từng node (500+ lines per node type)
- `workflowConfig.ts` — default config cho mỗi NodeType
- Hỗ trợ: Undo/Redo (useRef guard), Auto-align BFS, Cycle detection, Silent auto-save
- `SmartTextarea` — textarea hỗ trợ template variables `{{ $trigger.xxx }}`

**`App.tsx`** (`src/ui/App.tsx`, 70KB)
- Router chính (react-router-dom v6)
- Layout: Sidebar + Main content
- Khởi tạo: kết nối Zalo, load initial data, setup IPC listeners

**`CampaignCreateModal`** (`src/ui/components/crm/campaigns/CampaignCreateModal.tsx`)
- Tạo campaign gửi hàng loạt
- Cấu hình: danh sách contacts, message template, delay, sendMode

---

## UI Patterns

### Gọi IPC từ renderer
```typescript
// Qua preload bridge:
const result = await window.api.zalo.sendMessage({ message, threadId, type });

// Hoặc qua ipcRenderer trực tiếp (ít dùng):
const { ipcRenderer } = window.require('electron');
await ipcRenderer.invoke('zalo:sendMessage', params);
```

### useRef guard (Double-save prevention)
```typescript
// BUG đã gặp: async handlers gọi 2 lần
// FIX: dùng useRef thay useState làm guard
const isSubmittingRef = useRef(false);
if (isSubmittingRef.current) return;
isSubmittingRef.current = true;
try { await save(); } finally { isSubmittingRef.current = false; }
```

### SmartTextarea Variable Syntax
```
{{ $trigger.threadId }}        ← thread trigger
{{ $trigger.message }}         ← tin nhắn trigger
{{ $node.NodeLabel.field }}    ← output của node khác
{{ $item.display_name }}       ← CRM contact field
{{ $item.salutation }}         ← xưng hô (Anh/Chị)
```

---

## Routing Structure (App.tsx)

```
/                    → Dashboard
/chat                → Chat UI (ThreadList + MessageView)
/crm                 → CRM contacts + campaigns
/workflow            → Workflow list + editor
/analytics           → Analytics dashboard
/settings            → Settings (account, employee, integrations)
/integration         → Integration management
```
