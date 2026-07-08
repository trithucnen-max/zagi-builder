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
  └── /api/events/stream       ← SSE push event + Last-Event-ID recovery [v27.2.6]
```

### Nhân viên machine
```
HttpClientService (kết nối tới Boss)
  ├── authenticate() → lấy token + snapshot
  ├── proxyAction(channel, params) → forward IPC → Boss
  ├── uploadMedia(base64, filename) → tự chọn:
  │     ├── file ≤2MB → /api/media/upload (1 request)
  │     └── file >2MB → /api/media/upload-chunk (nhiều chunk 2MB) [v27.2.6]
  ├── SSE listener → nhận event:message, event:reaction, ...
  └── SSE reconnect → gửi ?lastEventId=N → Boss replay các sự kiện bị lỡ [v27.2.6]
```

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
