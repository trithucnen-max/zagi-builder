# Services

> Mỗi service là singleton. Đọc section tương ứng trước khi sửa code liên quan.

## Service Index

| Service | File | Size | Purpose |
|---|---|---|---|
| DatabaseService | `src/services/database/DatabaseService.ts` | 400KB | SQLite CRUD — single source of truth |
| WorkflowEngineService | `src/services/workflow/WorkflowEngineService.ts` | 180KB | Thực thi workflow automation |
| EventBroadcaster | `src/services/event/EventBroadcaster.ts` | 75KB | Pub/sub events giữa main ↔ renderer ↔ workflow |
| ZaloService | `src/services/zalo/ZaloService.ts` | 79KB | Gọi Zalo API (gửi tin, file, group...) |
| HttpRelayService | `src/services/http/HttpRelayService.ts` | 74KB | HTTP server cho Boss (nhân viên kết nối vào) |
| HttpClientService | `src/services/http/HttpClientService.ts` | 88KB | HTTP client cho Nhân viên (kết nối tới Boss) |
| HttpConnectionManager | `src/services/http/HttpConnectionManager.ts` | 13KB | Quản lý HttpClientService instances theo workspace |
| CRMQueueService | `src/services/crm/CRMQueueService.ts` | 48KB | Campaign gửi tin hàng loạt CRM |
| AIAssistantService | `src/services/ai/AIAssistantService.ts` | 34KB | AI chat assistant tích hợp nhiều provider |
| EmployeeService | `src/services/employee/EmployeeService.ts` | 16KB | Quản lý nhân viên, auth, permissions |
| DataSyncService | `src/services/employee/DataSyncService.ts` | 30KB | Đồng bộ dữ liệu Boss → Nhân viên (Zalo, ERP, Facebook) |
| UploadChunkService | `src/services/file/UploadChunkService.ts` | 4KB | Tiếp nhận và ghép nối phân đoạn file upload từ nhân viên |
| WebhookGatewayService | `src/services/workflow/WebhookGatewayService.ts` | 10KB | HTTP gateway nhận webhook trigger workflow |
| ConnectionManager | `src/utils/ConnectionManager.ts` | 8KB | Map zaloId → ZaloService instance |
| WorkspaceManager | `src/utils/WorkspaceManager.ts` | 18KB | Quản lý workspace local/remote, DB path |
| ZaloLoginHelper | `src/utils/ZaloLoginHelper.ts` | 55KB | Login Zalo, giữ session, emit events |
| FileStorageService | `src/services/file/FileStorageService.ts` | — | Resolve file paths, xử lý temp files |
| LicenseManager | `src/services/license/LicenseManager.ts` | — | Kiểm tra license, seat limit |

---

## WorkflowEngineService

**File:** `src/services/workflow/WorkflowEngineService.ts`
**Singleton:** `WorkflowEngineService.getInstance()`
**Chạy:** LOCAL trên cả Boss lẫn Nhân viên (mỗi machine 1 instance độc lập)

### Purpose
Engine thực thi kịch bản automation. Load workflows từ DB, lắng nghe events qua `EventBroadcaster`, thực thi các node theo thứ tự topological.

### Key Types
- `Workflow` — { id, name, enabled, channel, pageIds, nodes, edges }
- `WorkflowNode` — { id, type: NodeType, config }
- `NodeType` — 70+ loại: `zalo.sendMessage`, `logic.if`, `crm.getContacts`, `ai.generateText`, ...
- `ExecutionContext` — { trigger, nodes (output of each node), variables, pageId, skippedNodes }

### Key Methods
- `triggerWorkflows(type, data)` — entry point khi có event. Match workflows theo trigger type + pageId
- `executeWorkflow(wf, trigger, isSandbox)` — chạy 1 workflow
- `executeNode(node, cfg, ctx)` — switch/case trên NodeType, xử lý từng loại node
- `getApi(pageId, fallbackZaloId)` → **CRITICAL**: trả về ZaloAPI. Nếu workspace là `remote` → trả proxy object gọi Boss; nếu local → `ConnectionManager.getConnection()`
- `resolveTargetThreadIds(cfg, triggerThreadId, ctx)` → resolve threadId target (hỗ trợ JSON array `threadIds` + đơn lẻ `threadId`)
- `renderConfig(config, ctx)` → render template `{{ $trigger.field }}`, `{{ $node.Label.output }}`
- `resolveExpressionValue(expr, ctx)` → resolve biến động, hỗ trợ pipe filters

### Gotchas
- **Bug hiện tại (2026-07-08):** `getApi()` proxy `sendMessage` không truyền `attachments` → `zalo.sendImage` trả `success: true` nhưng ảnh không gửi được khi chạy trên máy nhân viên
- `success: true` hardcoded tại dòng 1752-1754 trong case `zalo.sendImage` bất kể lỗi thực tế
- Workflow chạy LOCAL trên nhân viên — nếu nhân viên offline, workflow không chạy
- `isSandbox: true` → chạy thử, không gửi tin thật

---

## EventBroadcaster

**File:** `src/services/event/EventBroadcaster.ts`
**Singleton:** `EventBroadcaster.getInstance()`

### Purpose
Pub/sub bus trung tâm. Main process đăng ký hooks; khi có event Zalo/Facebook, broadcast đồng thời tới renderer (qua `ipcMain.emit`) và workflow engine hooks.

### Pattern
```typescript
// Đăng ký hook (WorkflowEngine)
EventBroadcaster.getInstance().registerHook('event:message', handler);

// Broadcast (ZaloLoginHelper khi nhận tin)
EventBroadcaster.getInstance().broadcast('event:message', data);
```

### Key Channels
- `event:message` — nhận tin Zalo
- `event:friendRequest` — nhận lời mời kết bạn
- `event:reaction` — reaction vào tin
- `event:groupEvent` — sự kiện nhóm (thêm/xóa thành viên)
- `db:localLabelThreadChanged` — nhãn local thay đổi → trigger workflow

---

## HttpRelayService (Boss side)

**File:** `src/services/http/HttpRelayService.ts`
**Singleton:** `HttpRelayService.getInstance()`
**Chạy:** Chỉ trên máy Boss

### Purpose
HTTP server nội bộ cho phép nhân viên kết nối. Xử lý auth, proxy IPC actions, Socket.IO event stream, media upload/request, data sync.

### Key Endpoints
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/login` | POST | Nhân viên đăng nhập, nhận token + snapshot |
| `/api/proxy/action` | POST | Proxy IPC channel từ nhân viên → ipcHandlerRegistry |
| `/api/sync/snapshot` | GET | Trả về EmployeeSnapshot (accounts, permissions) |
| `/api/media/upload` | POST | Nhận base64 file nhỏ (≤2MB) từ nhân viên, lưu Boss storage |
| `/api/media/upload-chunk` | POST | Nhận từng phân đoạn (chunk) của file lớn, tự ghép khi hoàn tất |
| `/api/media/request` | POST | Trả về file binary theo path |
| Socket.IO (Port 27800) | WS/Polling | Đẩy sự kiện thời gian thực (Zalo, ERP, CRM) từ Boss về nhân viên |

### Socket.IO Event Recovery (Event Buffer catch-up)
- Mỗi sự kiện đẩy được đánh số ID `seqId` tăng dần theo từng nhân viên.
- Boss duy trì **Event History Queue** tối đa 500 sự kiện / 10 phút cho mỗi nhân viên.
- Khi nhân viên kết nối lại, gửi `catch-up` event kèm theo `{ lastSeqId }`:
  - **Hit:** Boss replay các sự kiện bị bỏ lỡ từ `lastSeqId + 1`.
  - **Miss:** Boss gửi `relay:fallbackDeltaSync` → nhân viên chạy Delta Sync.

### executeProxyAction
Khi nhân viên proxy action:
1. Auth token
2. Check `assigned_accounts` → nhân viên chỉ dùng được account được giao
3. Inject `realAuth` (cookies, IMEI thật từ Boss DB)
4. Lookup `ipcHandlerRegistry` → gọi handler đúng
5. Log action vào `employee_actions` DB

---

## HttpClientService (Nhân viên side)

**File:** `src/services/http/HttpClientService.ts`
**Khởi tạo bởi:** `HttpConnectionManager`

### Purpose
Kết nối nhân viên tới Boss. Thực hiện xác thực, thiết lập kênh Socket.IO để nhận sự kiện real-time, thực hiện proxy actions lên Boss và upload media. Quản lý chuyển đổi mạng LAN/WAN thông minh và phục hồi kết nối.

### Key Methods
- `connect(bossUrl, token)` — Thiết lập kết nối, khởi động local callback server, gửi heartbeat đăng ký, kết nối Socket.IO và bắt đầu luồng Heartbeat định kỳ.
- `proxyAction(channel, params)` — POST `/api/proxy/action` lên Boss. Khi mất kết nối hoặc ở trạng thái `degraded`, phương thức này trả về lỗi mềm thay vì ném ngoại lệ (`throw Error`), tránh gây crash/treo Renderer do Unhandled Rejections.
- `markDisconnectedImmediately()` — Đánh dấu trạng thái kết nối là suy hao (`degraded = true`, `connected = false`) tức thì khi phát hiện máy tính Sleep/Wake hoặc thay đổi WiFi, đồng thời buộc rollback từ LAN về WAN URL.
- `uploadMedia(base64, filename, zaloId)` — Tự động chọn: nếu file > 2MB dùng Chunked Upload qua `/api/media/upload-chunk`, nếu nhỏ hơn dùng `/api/media/upload` — **timeout 120s/chunk**.
- `requestMedia(filePath)` — Lấy file binary từ Boss.
- `triggerWorkflowEngine(channel, data)` — Khi nhận sự kiện qua Socket.IO → trigger workflow local.

### Network Resilience (Độ bền bỉ đường truyền)
- **Heartbeat & LAN Auto-Switching:** Định kỳ gửi heartbeat (mỗi 15s với timeout 5s). Nếu phát hiện Boss chạy cùng mạng LAN, client sẽ tự động chuyển đổi `bossUrl` sang IP cục bộ để tối ưu băng thông. Nếu mất kết nối LAN hoặc heartbeat thất bại liên tiếp (2 lần với LAN, 5 lần với WAN), client tự động rollback về cấu hình WAN ban đầu.
- **Debounce Reconnect:** Hệ thống lắng nghe sự kiện `workspace:network-online` và `powerMonitor.on('resume')` để tự động kết nối lại, tích hợp bộ chống Flapping mạng (debounce 4s) để tránh việc card mạng chưa nhận xong IP đã gửi kết nối dồn dập gây treo.
- **Renderer Sync:** Khi trạng thái kết nối thay đổi, địa chỉ `bossUrl` đang hoạt động sẽ được gửi lên Renderer qua sự kiện `workspace:connectionStatus`. Renderer sẽ đồng bộ hóa địa chỉ này vào `RestQueryService` để đảm bảo các truy vấn REST API luôn chạy đúng cổng.

---

## ZaloService

**File:** `src/services/zalo/ZaloService.ts`
**Singleton:** 1 instance per zaloId trong `ConnectionManager`

### Purpose
Wrapper quanh `zca-js` API. Xử lý gửi tin, gửi file, upload media, reactions, friend requests.

### Key Methods
- `sendMessage(message, threadId, type, typeMessage, quote, mentions, styles)` — gửi text/file/link
  - Khi `typeMessage === 'file'`: đọc `message.attachments` (local paths), đọc buffer, gọi zca-js sendMessage
  - **Attachments phải là local path có thể đọc được** — nếu path từ nhân viên sẽ fail
- `sendImage(filePath, threadId, type, message, quote)` — gửi 1 ảnh
- `sendImages(filePaths[], threadId, type, quote)` — gửi nhiều ảnh
- `sendFile(filePath, threadId, type)` — gửi file

---

## DatabaseService

**File:** `src/services/database/DatabaseService.ts` (~400KB)
**Singleton:** `DatabaseService.getInstance()`

### Purpose
Toàn bộ CRUD cho app: messages, threads, contacts, workflows, employees, ERP data. Sử dụng `better-sqlite3` (sync API).

### Pattern
```typescript
const db = DatabaseService.getInstance();
db.query<T>(sql, params);      // SELECT nhiều rows
db.queryOne<T>(sql, params);   // SELECT 1 row
db.run(sql, params);           // INSERT/UPDATE/DELETE
db.withDbPath(path, fn);       // Switch DB path tạm thời
```

### Gotchas
- **Single file**: toàn bộ schema trong 1 file 400KB — không tách module
- `withDbPath(path, fn)` dùng để truy cập workspace DB khác (nhân viên có DB riêng)
- Boss pin DB path khi khởi động RelayService (`EmployeeService.pinToCurrentDb()`)

---

## CRMQueueService

**File:** `src/services/crm/CRMQueueService.ts`
**Singleton:** `CRMQueueService.getInstance()`

### Purpose
Gửi tin hàng loạt đến danh sách CRM contacts. Hỗ trợ delay giữa các tin, chọn account ngẫu nhiên (sendMode: random/all).

### Key Methods
- `startCampaign(campaignId)` → bắt đầu gửi
- `stopCampaign(campaignId)` → dừng
- `sendMode`: `random` (chọn 1 account ngẫu nhiên), `all` (gửi từ tất cả accounts)

---

## UploadChunkService

**File:** `src/services/file/UploadChunkService.ts`
**Singleton:** `UploadChunkService.getInstance()`
**Chạy:** Chỉ trên máy Boss

### Purpose
Tiếp nhận và lưu trữ tạm các phân đoạn (chunk) của file lớn được gửi từ Nhân viên. Khi nhận đủ tất cả chunk (`chunkIndex === totalChunks - 1`), tự động ghép lại thành file hoàn chỉnh và lưu vào Boss storage. Dọn dẹp thư mục tạm sau khi ghép xong.

### Key Methods
- `saveChunk(uploadId, chunkIndex, totalChunks, buffer)` → lưu chunk vào `media/_temp_uploads/{uploadId}/chunk_{i}`
- `mergeChunks(uploadId, totalChunks, filename, zaloId?)` → ghép các chunk theo thứ tự, gọi `FileStorageService.saveBuffer()` nếu có `zaloId`, trả về `bossPath` của file hoàn chỉnh

### Upload Protocol (Employee → Boss)
1. Employee tính `totalChunks = Math.ceil(base64.length / 2MB_chunk_size)`
2. Gửi tuần tự từng chunk: `POST /api/media/upload-chunk` với `{ uploadId, chunkIndex, totalChunks, filename, zaloId, chunkBase64 }`
3. Boss `UploadChunkService.saveChunk()` lưu từng chunk
4. Chunk cuối: Boss gọi `mergeChunks()`, trả về `{ success: true, completed: true, bossPath }`
5. Các chunk trung gian trả về `{ success: true, completed: false }`

---

## AIAssistantService

**File:** `src/services/ai/AIAssistantService.ts`

### Purpose
Chat assistant AI. Hỗ trợ OpenAI, Gemini, Deepseek, Grok. Tích hợp context Zalo conversations.

### Gotchas
- Dùng chung patterns AI với `WorkflowEngineService` (ai.generateText, ai.classify nodes)
- **Nhân viên chỉ có quyền đọc (Read-only):** Các IPC ghi (`ai:saveAssistant`, `ai:deleteAssistant`, `ai:uploadFile`, `ai:removeFile`, `ai:setAccountAssistant`) bị chặn hoàn toàn trên workspace remote. Cấu hình Trợ lý AI chỉ được phép trên máy Boss.
