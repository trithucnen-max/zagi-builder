# Architecture

> Zagi là Electron monolith với mô hình Boss/Nhân viên: Boss giữ Zalo credentials, Nhân viên proxy lệnh qua HTTP.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON PROCESS                          │
│                                                             │
│  main.ts ──► IPC Handlers (24 files)                       │
│      │              │                                       │
│      │         ┌────▼────────────────────────────────┐     │
│      │         │         SERVICES LAYER               │     │
│      │         │  WorkflowEngine  ZaloService         │     │
│      │         │  DatabaseService EventBroadcaster    │     │
│      │         │  HttpRelayService HttpClientService  │     │
│      │         │  CRMQueueService  AIAssistantService │     │
│      │         └────────────────────────────────────┘      │
│      │                                                      │
│  preload.ts ──► window.api (bridge)                        │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   RENDERER PROCESS                          │
│                                                             │
│  React + Zustand                                           │
│  App.tsx (router) → pages/components                       │
│  Stores: chatStore, appStore, crmStore, accountStore       │
└─────────────────────────────────────────────────────────────┘
```

## Boss / Nhân viên Architecture

### Boss machine
```
HttpRelayService (port 27800)
  ├── /api/auth/login          ← nhân viên đăng nhập
  ├── /api/proxy/action        ← nhận IPC proxy từ nhân viên
  ├── /api/sync/snapshot       ← data snapshot cho nhân viên
  ├── /api/media/upload        ← nhận file nhỏ (≤2MB) từ nhân viên
  ├── /api/media/upload-chunk  ← nhận chunk file lớn, tự ghép khi đủ [v27.2.6]
  ├── /api/media/request       ← nhân viên request file từ Boss
  └── Socket.IO (port 27800)   ← WebSockets / Polling stream events + EventBuffer catch-up [v27.2.7]
```

### Nhân viên machine
```
HttpClientService (kết nối tới Boss)
  ├── authenticate() → lấy token + snapshot
  ├── proxyAction(channel, params) → forward IPC → Boss
  ├── uploadMedia(base64, filename) → tự chọn:
  │     ├── file ≤2MB → /api/media/upload (1 request)
  │     └── file >2MB → /api/media/upload-chunk (nhiều chunk 2MB) [v27.2.6]
  ├── Socket.IO Client → nhận event:message, event:reaction, ...
  └── Catch-up on reconnect → gửi { lastSeqId } → Boss replay các sự kiện bị lỡ [v27.2.7]
```

### Network Stability & LAN/WAN Switching (v27.2.8)
* **net.request Migration**: Toàn bộ tiến trình chính (Main Process) được di chuyển sang sử dụng `net.request` của Electron cho mọi cuộc gọi HTTP/HTTPS, loại bỏ hoàn toàn lỗi sập thư viện `c-ares` (`ares_dns_rr_get_ttl` SIGTRAP) khi đổi Wifi hoặc gập máy ngủ.
* **Delayed Reconnect on Sleep/Wake**: Trì hoãn cuộc gọi kết nối lại (3s khi unlock screen, 5s khi resume từ sleep) để card mạng của hệ điều hành nhận IP và ổn định trước khi thực hiện DNS lookup.
* **LAN/WAN Auto-Switch & Rollback**:
  * Khi có mạng LAN chung với Boss, tự động dò tìm IP LAN và chuyển sang kết nối trực tiếp LAN qua HTTP và Socket.IO để tối ưu hóa tốc độ.
  * Khi rời xa LAN hoặc Wifi đổi mạng, sau 2 lần Heartbeat lỗi (~30s), tự động Rollback lùi về mạng WAN/Tunnel (`https://relay.basancorp.com`).
  * Hiển thị thông báo trạng thái kết nối trực tiếp lên màn hình UI của nhân viên.

### AI Read-Only Policy (v27.2.6)
Trên máy Nhân viên (workspace `remote`), các IPC ghi AI bị chặn hoàn toàn:
```typescript
const AI_WRITE_CHANNELS = new Set([
  'ai:saveAssistant', 'ai:deleteAssistant',
  'ai:uploadFile', 'ai:removeFile', 'ai:setAccountAssistant'
]);
// → trả về { success: false, error: 'Chế độ nhân viên (Remote): ...' }
```

### ERP Proxy Pattern (main.ts override)
Mọi `erp:*` channel (trừ read-only) đều bị intercept tại `ipcMain.handle`:
```typescript
// main.ts dòng 70-88
if (channel.startsWith('erp:') && !ERP_READ_ONLY_CHANNELS.has(channel)) {
  if (activeWs?.type === 'remote') → proxy to Boss
}
```

## WorkflowEngine Architecture

```
Trigger (Zalo event / cron / webhook / manual)
    │
    ▼
WorkflowEngineService.triggerWorkflows(type, data)
    │
    ▼
Match enabled workflows có trigger matching
    │
    ▼
executeWorkflow(workflow, context)
    │
    ├── topologicalSort(nodes)
    ├── renderConfig(cfg, ctx)  ← template {{$trigger.field}}
    └── executeNode(node, ctx)
            │
            ├── getApi(pageId, zaloId) ← QUAN TRỌNG
            │       ├── workspace.remote → proxy object
            │       └── local → ConnectionManager.getConnection()
            └── [node logic: gửi message, if/else, forEach, AI...]
```

## Data Flow: Zalo Event → Workflow

```
zca-js listener (ZaloLoginHelper)
  → emits raw event
  → EventBroadcaster.broadcast(channel, data)
      ├── → ipcMain.emit → renderer (UI update)
      └── → WorkflowEngine hooks (trigger workflows)
```

## Tech Decisions

| Decision | Rationale |
|---|---|
| SQLite (better-sqlite3) | Offline-first, single file DB, sync API |
| Zustand over Redux | Đơn giản hơn, ít boilerplate |
| ReactFlow | Workflow drag-drop graph editor |
| Cloudflared tunnel | Nhân viên ở ngoài mạng nội bộ vẫn kết nối Boss |
| zca-js | Reverse-engineered Zalo Web API |
| WorkflowEngine chạy LOCAL trên nhân viên | Nhân viên có thể chạy workflow mà không cần Boss online — **nhưng khi cần gửi Zalo phải proxy qua Boss** |
