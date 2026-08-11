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
| PhoneScanService | `src/services/crm/PhoneScanService.ts` | 21KB | Quét SĐT hàng loạt Multi-Account Parallel, Fair Round-Robin Distribution |
| MessageSchedulerService | `src/services/chat/MessageSchedulerService.ts` | 15KB | Hẹn giờ & tự động gửi tin nhắn Zalo |
| AIAssistantService | `src/services/ai/AIAssistantService.ts` | 34KB | AI chat assistant tích hợp Dify Chatbot `app-Shoio3nzmEVuoJJOBUsycsp9` |
| EmployeeService | `src/services/employee/EmployeeService.ts` | 16KB | Quản lý nhân viên, auth, permissions |
| DataSyncService | `src/services/employee/DataSyncService.ts` | 30KB | Đồng bộ dữ liệu Boss → Nhân viên (Zalo, ERP, Facebook) |
| UploadChunkService | `src/services/file/UploadChunkService.ts` | 4KB | Tiếp nhận và ghép nối phân đoạn file upload từ nhân viên |
| WebhookGatewayService | `src/services/workflow/WebhookGatewayService.ts` | 10KB | HTTP gateway nhận webhook trigger workflow |
| CheckpointScheduler | `src/services/workflow/CheckpointScheduler.ts` | 4KB | Quét DB định kỳ, khôi phục workflow checkpoint đến hạn |
| contextSerializer | `src/services/workflow/contextSerializer.ts` | 3.5KB | Serialize/deserialize ExecutionContext cho persistent checkpoint |
| ConnectionManager | `src/utils/ConnectionManager.ts` | 8KB | Map zaloId → ZaloService instance |
| WorkspaceManager | `src/utils/WorkspaceManager.ts` | 18KB | Quản lý workspace local/remote, DB path |
| ZaloLoginHelper | `src/utils/ZaloLoginHelper.ts` | 55KB | Login Zalo, giữ session, emit events |
| FileStorageService | `src/services/file/FileStorageService.ts` | — | Resolve file paths, xử lý temp files |
| LicenseManager | `src/services/license/LicenseManager.ts` | — | Kiểm tra license, seat limit, mã hóa Hardware ID |
| Supabase Edge Functions | `supabase/functions/` | — | Serverless functions cho Checkout, Payment Status & SePay Webhook (v3.0.6) |
| LibraryService | `src/services/library/LibraryService.ts` | 21KB | Quản lý thư viện media dùng chung (ảnh, file, video, audio) |


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
Pub/sub bus trung tâm. Phát sự kiện Zalo/Facebook từ Main process tới renderer và các trước-khi-gửi (before-send) hooks của WorkflowEngineService.

### Filtering Middleware (v3.0.1)
Tự động lọc sự kiện qua phương thức tĩnh `shouldFilterEvent`:
1. **Cách ly tài khoản:** Nếu sự kiện có chứa `zaloId` nhưng tài khoản này không nằm trong danh sách gán của workspace hiện tại (`db.getAccounts()`), sự kiện sẽ bị hủy bỏ ngay lập tức để tránh hiển thị thông báo chéo giữa các nhân viên.
2. **Lọc lặp kết bạn:** Đối với `event:friendRequest`, nếu ID người gửi đã có trong danh sách bạn bè (`db.checkIsFriend`), sự kiện sẽ bị hủy để tránh hiển thị lại thông báo kết bạn cũ lúc login/reconnect.

### Pattern
```typescript
// Đăng ký hook (WorkflowEngine)
const unsub = EventBroadcaster.onBeforeSend('event:message', handler);

// Broadcast (ZaloLoginHelper khi nhận tin)
EventBroadcaster.sendDirect('event:message', data);
```

### Key Channels
- `event:message` — nhận tin Zalo
- `event:friendRequest` — nhận lời mời kết bạn
- `event:reaction` — reaction vào tin
- `event:groupEvent` — sự kiện nhóm (thêm/xóa thành viên)
- `db:workflowChanged` — workflow thay đổi

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
Quản lý thực thi chiến dịch gửi tin nhắn / kết bạn hàng loạt CRM. Đảm bảo an toàn 100% bằng quy tắc **1 chiến dịch hoạt động / 1 tài khoản Zalo** kết hợp hệ thống Hàng đợi (FIFO + Priority Queue) và tự động khôi phục ngày mới.

### Queue Engine & Key Methods
- `startForAccount(zaloId, targetCampaignId?)` → Kích hoạt thực thi cho tài khoản Zalo. Nếu tài khoản đang có 1 chiến dịch `active` chạy, chiến dịch mới kích hoạt sẽ tự động đặt trạng thái `queued` (Hàng đợi).
- `promoteNextQueuedCampaign(zaloId)` → Tự động đôn chiến dịch kế tiếp trong hàng đợi lên trạng thái `active` và chạy ngay khi chiến dịch hiện tại hoàn thành (`done`) hoặc tạm dừng do hết quota (`paused_quota`). Ưu tiên đôn chiến dịch có `priority = 'high'`, sau đó đến FIFO theo thời gian `queued_at`.
- `updateCRMCampaignStatusWithReason(id, status, reason)` → Cập nhật trạng thái kèm phân loại nguyên nhân tạm dừng `pause_reason`:
  - `user_manual`: Người dùng chủ động bấm Tạm dừng (KHÔNG tự động chạy lại).
  - `daily_quota`: Tạm dừng do đụng định mức an toàn ngày (Tự động chạy lại lúc 00:00 ICT ngày mới).
  - `quiet_hours`: Tạm dừng do khung giờ nghỉ đêm (Tự động chạy lại sau 07:00 sáng).
- `checkAndStopIfIdle(zaloId)` → Kiểm tra và dừng timer nếu không còn chiến dịch active, tự động gọi `promoteNextQueuedCampaign`.

---

## PhoneScanService

**File:** `src/services/crm/PhoneScanService.ts`
**Singleton:** `PhoneScanService.getInstance()`

### Purpose
Quản lý động cơ Quét số điện thoại Zalo hàng loạt đa tài khoản với cơ chế Điều hòa Tần suất (Steady Pacing Rate Limiting), Tự động chuyển Single Mode khi chạm `-216`, và Phân loại lỗi 3 nhánh chuẩn xác.

### Key Features (v3.1.7)
- **Steady Pacing Rate Limiter (90s – 120s / SĐT)**: Dàn đều thời gian quét giữa các số từ 90s đến 120s (kèm jitter ngẫu nhiên), phân bổ đều đặn **25 – 34 số/giờ** và **100 – 200 số/ngày**. Mô phỏng 100% hành vi người dùng thật, loại bỏ 99% nguy cơ bị Zalo phát hiện bot hoặc cảnh báo `50004` (quét quá nhanh).
- **Failover Option A + C (Bulk ➔ Single Mode & SQLite Persistence)**:
  - Khi API Bulk `getMultiUsersByPhones` chạm trần `-216`, hệ thống tự động chuyển nick sang chế độ `single` (gọi `findUser` đơn lẻ với quota độc lập và bỏ qua mã 216).
  - Trạng thái `single` mode được lưu cố định vào SQLite (`scan_bulk_mode_${zaloId}` qua `DatabaseService.ts`), duy trì bền bỉ qua các lần khởi động lại ứng dụng và tự reset sau 60 phút hoặc qua 00:00 ngày mới.
- **Phân loại lỗi 3 nhánh chuẩn xác (`classifyPhoneLookupError`)**:
  - `not_found`: Phân biệt rõ **"SĐT chưa đăng ký tài khoản Zalo"** (code 5001, 5004, data rỗng).
  - `not_found` (Privacy): Phân biệt **"Khách hàng cài đặt quyền riêng tư (Tắt tìm kiếm qua SĐT / Chặn người lạ)"** (code 201, 202, 204, 214, 576).
  - `pending` (Temporary): Lỗi mạng / timeout tạm thời sẽ tự động hoàn tác về `pending` để thử lại.
- **Huy hiệu Động & Đồng hồ Đếm ngược Thời gian thực (`QuotaCountdownBadge`)**:
  - Giao diện phản ánh chính xác trạng thái thực tế: `🟢 Đang quét`, `⏳ Chờ hạn ngạch GIỜ (-216)` (kèm đếm ngược từng phút giây), `🌙 Chờ 00:00 (Hạn ngạch NGÀY)`, `⏰ Hẹn giờ`, `🟡 Chờ hàng đợi`.
- **Hỗ trợ 3 quy tắc lưu trữ CRM**:
  - 🟢 **Phân tán theo nick quét**: Nick nào quét thấy lưu vào danh bạ CRM nick đó.
  - 🔵 **Gom về 1 nick Master**: Các nick phụ hỗ trợ quét, toàn bộ kết quả tạo profile CRM đổ về 1 nick chỉ định (Sếp).
  - 🟣 **Đồng bộ tất cả các nick**: Dữ liệu kết quả được nhân bản lưu đồng thời ở tất cả các nick Zalo active.

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

## MessageSchedulerService

**File:** `src/services/chat/MessageSchedulerService.ts`
**Singleton:** `MessageSchedulerService.getInstance()`
**Chạy:** Chỉ hoạt động trên máy Boss / Standalone (Không chạy trên máy Nhân viên để tránh lỗi kết nối SQLite cục bộ).

### Purpose
Hệ thống scheduler quét cơ sở dữ liệu định kỳ mỗi phút và tiến hành gửi tin nhắn Zalo đã được hẹn lịch khi đến giờ.

### Gotchas
- **Kiểm tra khởi tạo Database:** Để tránh lỗi crash hoặc ghi log cảnh báo `Query aborted: database is not initialized` lúc khởi động, scheduler luôn kiểm tra `DatabaseService.getInstance().getIsInitialized() === true` trước khi truy vấn.
- **Quyền gửi:** Chỉ được thực thi trên tài khoản Boss có kết nối SQLite local.

---

## AIAssistantService

**File:** `src/services/ai/AIAssistantService.ts`

### Purpose
Chat assistant AI. Hỗ trợ OpenAI, Gemini, Deepseek, Grok. Tích hợp context Zalo conversations.

### Gotchas
- Dùng chung patterns AI với `WorkflowEngineService` (ai.generateText, ai.classify nodes)
- **Nhân viên chỉ có quyền đọc (Read-only):** Các IPC ghi (`ai:saveAssistant`, `ai:deleteAssistant`, `ai:uploadFile`, `ai:removeFile`, `ai:setAccountAssistant`) bị chặn hoàn toàn trên workspace remote. Cấu hình Trợ lý AI chỉ được phép trên máy Boss.

---

## CheckpointScheduler

**File:** `src/services/workflow/CheckpointScheduler.ts`
**Singleton:** `CheckpointScheduler.getInstance()`
**Chạy:** Chỉ hoạt động trên máy Boss / Standalone.

### Purpose
Quản lý chu kỳ quét cơ sở dữ liệu (SQLite) định kỳ mỗi 60 giây để khôi phục và tiếp tục chạy (resume) các workflow đang tạm dừng ở node Chờ (`logic.wait` > 5 phút) khi đến hạn.
Nhiệm vụ:
- Quét các checkpoint có status `pending` và có thời điểm khôi phục `resume_at` <= thời gian hiện tại.
- Tự động đánh dấu `processing` (đảm bảo atomic không bị resume trùng lặp) và gọi `WorkflowEngineService.resumeFromCheckpoint(cp)`.
- Đánh dấu `done` hoặc `failed` tùy theo kết quả thực thi tiếp theo.
- Tự động quét và đánh dấu `expired` (quá hạn 90 ngày) các checkpoint đã nằm trong hàng chờ quá lâu.
- Dọn dẹp định kỳ dữ liệu checkpoint cũ (hoàn thành > 7 ngày, lỗi/quá hạn > 30 ngày).

### Gotchas
- **Tránh crash khi khởi động:** Scheduler luôn kiểm tra `DatabaseService.getInstance().getIsInitialized()` trước khi làm việc.
- **Bảo vệ tiến trình:** Sử dụng cờ `isPolling` để tránh các chu kỳ quét chồng chéo khi tác vụ resume trước đó chưa hoàn thành.
- **Không chạy trên máy nhân viên:** Remote workspace (`ws.type === 'remote'`) sẽ bỏ qua quá trình poll để tránh xung đột dữ liệu SQLite cục bộ.

---

## contextSerializer

**File:** `src/services/workflow/contextSerializer.ts`
**Chạy:** Cả Boss và Nhân viên (Helper functions).

### Purpose
Tuần tự hóa (Serialize) và giải tuần tự (Deserialize) ngữ cảnh thực thi (`ExecutionContext`) của Workflow để lưu trữ an toàn trong cơ sở dữ liệu SQLite dưới dạng văn bản JSON.
Nhiệm vụ:
- Chuyển đổi các cấu trúc dữ liệu không thể tuần tự hóa mặc định của JavaScript như `Set` (ví dụ: `skippedNodes`) sang dạng `Array` và ngược lại.
- Loại bỏ các tham chiếu vòng (circular references) hoặc các trường chứa hàm (functions) để tránh lỗi khi chuyển đổi JSON.
- Tự động rút gọn (truncate) các chuỗi văn bản quá dài (>10KB) nhằm hạn chế phình dung lượng của cột `context_json` trong SQLite.

### Gotchas
- **Idempotency:** Đảm bảo quá trình chạy thử hoặc chạy thực tế khôi phục đầy đủ các thông tin đầu ra của các node đã hoàn thành trước đó (`nodes`), các biến tạm (`variables`), và đối tượng trigger gốc (`trigger`).

---

## LibraryService

**File:** `src/services/library/LibraryService.ts`
**Singleton:** `LibraryService.getInstance()`
**Chạy:** Chỉ chạy trên máy Boss/Standalone (Nhân viên tương tác thông qua REST API do HttpRelayService cung cấp).

### Purpose
Quản lý thư viện media dùng chung của hệ thống (Ảnh, Video, Âm thanh, Tài liệu/File). Cung cấp các tính năng upload, truy vấn theo thư mục/nhãn dán, cập nhật tên và tự động import dữ liệu tệp tin từ chat history.

### Key Methods
- `upload(params)` — Nhận buffer file tải lên, tự động phân loại loại file, lưu trữ vật lý độc lập và tạo thumbnail (cho ảnh/video) trước khi ghi dữ liệu vào SQLite.
- `autoImportFromChat(zaloId, filePath, fileName, mimeType)` — *(Đã vô hiệu hoá ở v3.0.1)* Từng dùng để tự động nền hóa sao chép các tệp tin tải về hoặc gửi đi trong lịch sử chat vào Thư viện chung để quản lý và tránh trùng lặp.
- `getItems(params)` / `getFolders(zaloId, type)` / `getTags(zaloId)` — Truy vấn tệp tin, thư mục và nhãn dán từ cơ sở dữ liệu SQLite.

### Gotchas
- **Mạng LAN (Employee Mode):** Máy nhân viên (Remote workspace) giao tiếp với `LibraryService` của Boss qua endpoint `/api/library/*`. Kết quả danh sách thư mục và nhãn dán trả về từ REST API là mảng phẳng trực tiếp (`res.data`), cần bóc tách đúng định dạng ở frontend Client qua `DataAccessor`.
- **Thumbnail:** Sử dụng thư viện `sharp` để nén và resize ảnh nhỏ đại diện cho ảnh gốc nhằm giảm tải băng thông tải danh sách.

---

## PhoneScanService & Batch Stats Engine (v3.1.8)

**File:** `src/services/crm/PhoneScanService.ts`, `src/services/database/DatabaseService.ts`
**Chạy:** Boss / Standalone / Sub-process

### Purpose
Quản lý tính năng Quét số điện thoại Zalo hàng loạt, phân chia công việc công bằng (Fair Round-Robin) giữa các tài khoản Zalo, và tính toán số liệu thống kê thời gian thực với cơ chế tự phục hồi chống chặn số.

### Key Methods & Features (v3.1.8)
- `executeBulkScan(chunkItems, batchId, zaloId)`: Quét gom 6-10 số/request với `getMultiUsersByPhones`. Bắt mã `-216` ở cả exception và JSON response payload, tự động chuyển sang Single Mode (`findUser`) với safe jitter delay (1.5s–3s).
- `handleScanWarningRateLimit(zaloId, batchId, itemId)`: Bắt cảnh báo `50004` (quét quá nhanh), đưa nick vào trạng thái cooldown 3 phút và rollback item về `pending`.
- `handleRateLimit(zaloId, batchId, triggerItemId)`: Rollback các item đang scanning về pending. Phân biệt Rate Limit Khung Giờ (cooldown 60 phút khi `todayCount < scanDailyLimit`) và Hạn ngạch Ngày (`todayCount >= scanDailyLimit`), **bảo toàn 100% định mức cài đặt** (không bao giờ tự ý bóp nghẹt giảm `scanDailyLimit` xuống 13 hay 20), tự động failover sang nick active khác nếu còn quota.
- `consecutiveSingleRateLimitCount` & `accountCooldownUntil`: Bộ đếm lỗi 3 lần liên tiếp trước khi pause nick; lỗi 1-2 lần chỉ nghỉ 3 phút và rollback item về `pending`.
- `getPhoneScanOverallStats(timeRange)`: Trả về số liệu thống kê tổng thể (`total`, `scanned`, `found`, `notFound`, `error`, `pending`) được lọc theo thời gian quét mốc `scanned_at` (`all`, `today`, `this_week`, `this_month`).
- `DatabaseService.updatePhoneScanBatchAssignedAccount(batchId, assignedAccountId)`: Cập nhật nick gán cho lô và unpause lô.
- `DatabaseService.retryPhoneScanErrorItems(batchId)`: Reset toàn bộ các item có status `error` về `pending` và unpause lô.
- `DatabaseService.resumePhoneScanBatchSingleMode(batchId)`: Mở lại lô ở chế độ Single Mode, xóa cooldown và pause state cho các nick được gán.

---

## LicenseManager & License Gate (v3.1.9)

**File:** `src/services/license/LicenseManager.ts`, `electron/ipc/licenseIpc.ts`
**Chạy:** Electron Main Process

### Key Methods & Features
- `needsActivation()` — Đảm bảo kiểm tra nghiêm ngặt bản quyền. Đã gỡ bỏ toàn bộ cơ chế tự cấp bản quyền giả lập `local-boss@zagi.app` khi phát hiện file SQLite cũ.
- `loadLicense()` — Tự động quét sạch và thu hồi các file `license.dat` có chứa thông tin license rác `local-boss@zagi.app`, trả về `null` để bắt buộc hiển thị màn hình License Gate.
- `reVerifyInBackground()` — Đối soát bản quyền trực tuyến với Supabase. Nếu License Key không tồn tại trên hệ thống hoặc bị khóa, hệ thống lập tức thu hồi bản quyền cục bộ.
- `license:switchToBoss` — IPC handler thực thi luồng chuyển từ Chế độ Nhân viên sang Chế độ BOSS. Tự động ngắt kết nối session nhân viên, switch active workspace về `'default'`, kiểm tra bản quyền `licenseManager.needsActivation()`:
  - Nếu máy chưa có Key BOSS hợp lệ: Đóng main window, kích hoạt cửa sổ License Gate (`createLicenseWindow` với `popup.html`) để Sếp thực hiện **Nhập Key** hoặc **Nhận Key** dùng thử/mua gói trước khi được mở app chính Chế độ BOSS.
  - Nếu máy đã có Key BOSS hợp lệ: Relaunch app để vào trực tiếp Chế độ BOSS.
- `license:startAsEmployee` — Bỏ qua kích hoạt Key máy BOSS và boot trực tiếp vào Chế độ Nhân viên cho thiết bị của nhân viên.




