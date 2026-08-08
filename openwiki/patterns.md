# Patterns & Conventions

> ⚠️ ĐỌC FILE NÀY TRƯỚC KHI VIẾT BẤT KỲ CODE NÀO trong project Zagi.

---

## Architecture Patterns

### 1. Singleton Services
Mọi service đều là singleton. Luôn dùng `.getInstance()`:
```typescript
const db = DatabaseService.getInstance();
const engine = WorkflowEngineService.getInstance();
const relay = HttpRelayService.getInstance();
```

### 2. Boss/Remote Detection
Trước khi thực hiện action, check workspace type:
```typescript
const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
if (activeWs?.type === 'remote') {
  // Proxy lên Boss
} else {
  // Thực thi local
}
```

### 3. getApi() — Central Zalo API Resolver
**LUÔN dùng `getApi(pageId, fallbackZaloId)`** trong WorkflowEngine để lấy Zalo API, không import ZaloService trực tiếp. `getApi()` tự xử lý remote/local routing.

### 4. ipcHandlerRegistry (Boss Proxy)
Khi thêm IPC handler Zalo mới, PHẢI đăng ký vào cả `ipcMain` lẫn `ipcHandlerRegistry`:
```typescript
// zaloIpc.ts — hàm wrap() tự động đăng ký cả 2
wrap('zalo:myNewChannel', (s, p) => s.myMethod(p.param));
```
Nếu chỉ đăng ký `ipcMain`, Boss sẽ không proxy được channel đó cho nhân viên.

### 5. ERP Actions Auto-Proxy
Mọi `erp:*` action (write) trên nhân viên tự động được proxy về Boss qua `ipcMain.handle` override trong `main.ts`. Không cần thêm code proxy thủ công.

### 6. _fromRelay Flag
Khi Boss gọi IPC handler thay mặt nhân viên, params có `_fromRelay: true`. Dùng để tránh proxy loop:
```typescript
if (params?._fromRelay) {
  // Thực thi trực tiếp, không proxy lại
}
```

### 7. Chunked Upload (v27.2.6)
Với file > 2MB, `uploadMedia()` tự động phân đoạn và gửi tuần tự qua `/api/media/upload-chunk`:
```typescript
// Không cần thêm code ở caller — uploadMedia() tự xử lý
const { bossPath } = await httpClient.uploadMedia(base64, filename, zaloId);
```
Trên Boss, `UploadChunkService.saveChunk()` lưu từng chunk; `mergeChunks()` ghép khi nhận đủ.

### 8. SSE Last-Event-ID Recovery (v27.2.6)
Khi nhân viên reconnect SSE:
- Client tự gửi `?lastEventId=N` dựa trên giá trị lưu trong SQLite local.
- Boss phán là Hit (replay) hoặc Miss (gửi `relay:fallbackDeltaSync`).
- Client lắng nghe `relay:fallbackDeltaSync` và chạy `onSSEReconnected()` tự động.

### 9. AI Read-Only Policy (v27.2.6)
Trên máy Nhân viên, các IPC ghi của AI bị chặn tại `ipcMain.handle` override trong `main.ts`:
```typescript
if (AI_WRITE_CHANNELS.has(channel) && activeWs?.type === 'remote') {
  return { success: false, error: 'Chế độ nhân viên (Remote): ...' };
}
```

### 10. Facebook 2-way Sync Pattern (v27.2.6)
- **Đọc (Boss → Nhân viên):** `DataSyncService.exportFacebookDataFiltered()` lọc dữ liệu FB theo `assigned_accounts` của nhân viên.
- **Ghi (Nhân viên → Boss):** Mọi IPC ghi FB `(fb:send*, fb:upload*, fb:connect*)` được proxy tự động đến Boss qua `ipcHandlerRegistry`.

---

## Naming Conventions

- **Services**: PascalCase, suffix `Service` — `WorkflowEngineService`, `CRMQueueService`
- **IPC channels**: `domain:action` — `zalo:sendMessage`, `workflow:run`, `erp:task:list`
- **Zustand stores**: camelCase, suffix `Store` — `appStore`, `chatStore`
- **DB tables**: snake_case — `employee_actions`, `workflow_run_logs`
- **Template variables**: `{{ $trigger.field }}`, `{{ $node.Label.field }}`, `{{ $item.field }}`
- **WorkflowNode types**: `domain.action` — `zalo.sendMessage`, `logic.if`, `ai.generateText`

---

## Known Bugs (2026-07-08)

### BUG-01: zalo.sendImage không gửi ảnh từ máy nhân viên (Đã sửa v3.1.0/v3.1.7)
- **Location:** `WorkflowEngineService.ts` (`getApi` proxy sendMessage) & `HttpClientService.ts`
- **Root cause:** Ban đầu proxy `sendMessage` chưa stream file → Boss không có file local của nhân viên để gửi.
- **Giải pháp đã thực hiện:** `getApi()` tự động đọc file và gọi `uploadMedia()` stream Base64/Chunks lên máy Boss trước, nhận `bossPath`, sau đó proxy `zalo:sendMessage` với `attachments: [bossPath]` → Gửi ảnh & file thành công 100%.

### BUG-02: Double-save khi async handler gọi 2 lần
- **Root cause:** Dùng `useState` làm guard thay vì `useRef`
- **Fix:** Dùng `useRef` guard + `type="button"` cho nút tránh form submit
- **Pattern đúng:** Xem `ui.md` → "useRef guard"

### BUG-03: Media Token Array Duplication khi Nhân viên gửi Ảnh/File qua Proxy (Đã sửa v3.0.6)
- **Location:** `electron/ipc/zaloIpc.ts` (`resolveMediaTokens`)
- **Root cause:** Khi Nhân viên tải ảnh lên máy Boss, `MessageInput.tsx` gán `bossPath` vào cả `mediaTokens` LẪN `filePaths`. `resolveMediaTokens` đọc cả 2 tham số tạo thành mảng trùng lặp `[bossPath, bossPath]`.
- **Fix:** Khử trùng lặp phần tử mảng đường dẫn trước khi gọi `ZaloService.sendImages()`.

### BUG-04: Lỗi hiển thị thẻ Link Website trên Zagi UI (Đã sửa v3.0.6)
- **Location:** `src/ui/components/chat/MessageBubbles.tsx` (`isCardType`, `CardBubble`)
- **Root cause:** Cấu hình cứng `if (action === 'recommened.link')`, bỏ qua các tin nhắn link có `action = 'link'`, `chat.link`, `share.link` hoặc object chứa `href`/`url`/`link`.
- **Fix:** Cập nhật `isCardType` và `CardBubble` nhận diện linh hoạt toàn bộ cấu trúc tin nhắn liên kết.

---

## Security Patterns

### Multi-account Event Isolation
Khi Boss có nhiều tài khoản Zalo, hệ thống tự động cách ly sự kiện ở mức Main Process (Backend) trước khi gửi về Renderer hoặc gọi Workflow:
```typescript
// 4-layer guard:
// Layer 0: EventBroadcaster.shouldFilterEvent (Main process) — tự động hủy sự kiện nếu zaloId không thuộc db.getAccounts() của workspace hiện tại, và chặn lặp event:friendRequest nếu đã kết bạn.
// Layer 1: useZaloEvents hook (Renderer) — check accounts array trong Zustand store
const accounts = useAccountStore.getState().accounts;
if (!accounts.find(a => a.zalo_id === event.zaloId)) return;

// Layer 2: handleReminderEvent — check ownedAccount
// Layer 3: onOpenThread — check isValidAccount + isValidThread
```

### Zalo Group ID Prefix Stripping (v3.0.1)
Các API tương tác nhóm Zalo của `zca-js` (như `addUserToGroup` và `inviteUserToGroups`) yêu cầu mã nhóm `groupId` dạng chuỗi số nguyên bản, không được chứa tiền tố `'g'` (ví dụ: gửi `277983691919864278` thay vì `g277983691919864278`). Hãy luôn chuẩn hóa bằng cách cắt tiền tố `'g'` trước khi gọi thư viện.
```typescript
const cleanGroupId = groupId.startsWith('g') ? groupId.slice(1) : groupId;
```

### Employee Permission Check (Boss side)
```typescript
const empSvc = EmployeeService.getInstance();
if (!empSvc.hasPermission(employee.employee_id, module)) {
  return { success: false, error: 'Không có quyền...' };
}
```

### 8. Electron net.request for Main Process HTTP (v27.2.8)
Để tránh sập ứng dụng do lỗi bộ nhớ phân giải DNS c-ares của Node.js khi đổi Wifi hoặc gập máy ngủ:
* **KHÔNG DÙNG** module `http`/`https` của Node.js hoặc thư viện `axios` trong Main Process.
* **LUÔN DÙNG** `net.request` của Electron để phân giải tên miền qua Network Stack của Chromium.

### 9. Trì hoãn Reconnect khi Thức dậy/Mở khóa máy (v27.2.8)
* Khi bắt sự kiện `resume` hoặc `unlock-screen` từ `powerMonitor`, **KHÔNG** kích hoạt kết nối lại ngay lập tức.
* **LUÔN trì hoãn 3-5 giây** (sử dụng `setTimeout`) trước khi gọi các hàm kết nối DNS để card mạng của hệ thống có đủ thời gian lấy IP ổn định.

### 10. Option C: Smart Single-Mode Resilience & Rate-Limit Adaptive Cooldown (v3.1.8)
Khi thực thi quét SĐT hàng loạt:
* Bắt mã `-216` ở cả dạng exception và JSON response payload (`res?.error_code === -216`).
* Tự động chuyển tài khoản sang chế độ Single Mode (`findUser`) kết hợp jitter an toàn (`1.5s - 3s`), không bao giờ ngắt cả lô khi gặp 1 số lỗi.
* Áp dụng quy tắc ngưỡng 3 lần liên tiếp (`consecutiveSingleRateLimitCount`): lỗi 1-2 lần đơn lẻ rollback về `pending` và nghỉ 3 phút (`accountCooldownUntil`), chỉ khi 3 số khác nhau liên tiếp đều lỗi mới pause tài khoản.

### 11. Fullscreen Batch Report Filtering & 1-Click Reassignment (v3.1.8)
* Modal báo cáo lô phóng to (`fullscreenReportBatch`) lọc danh sách tài khoản & quota card chính xác theo những nick được gán trong lô (`getBatchAssignedAccounts`) kèm tỷ lệ `%`.
* Trang bị bộ phím điều khiển tức thì: `⚡ Tiếp tục quét Single Mode`, `🔄 Quét lại các số Lỗi`, và `🔄 Đổi Nick quét tiếp` với 1 chạm.

---

## Performance Gotchas

- **DatabaseService.ts là 400KB** — không import toàn bộ, dùng `getInstance()`
- **WorkflowEngineService.ts là 180KB** — executeNode là switch/case khổng lồ
- **App.tsx là 70KB** — avoid thêm code vào đây, tách component riêng
- **better-sqlite3 là sync** — đừng để DB query trong hot path (event handlers)
- **Socket.IO stream** — Boss push events realtime qua WebSocket, nhân viên không cần poll

---

## Anti-Patterns (Đừng Làm)

❌ **Gọi ZaloService trực tiếp trong WorkflowEngine** — dùng `getApi()` để routing đúng local/remote

❌ **Thêm IPC handler Zalo chỉ vào ipcMain** — phải thêm vào cả `ipcHandlerRegistry` (dùng `wrap()`)

❌ **Đọc file local path từ nhân viên trên Boss** — path của nhân viên không tồn tại trên Boss, phải upload trước

❌ **Dùng `useState` làm guard cho async submit** — dùng `useRef` thay thế

❌ **Hardcode `success: true`** — luôn phản ánh kết quả thực tế từ API call

❌ **Proxy erp: channel thủ công** — đã có auto-proxy trong main.ts, làm thủ công sẽ bị gọi 2 lần

❌ **Concurrent write vào SQLite** — better-sqlite3 sync, tránh race condition

---

## Workflow Node Development Checklist

Khi thêm node type mới vào WorkflowEngine:
- [ ] Thêm type vào `NodeType` union (dòng ~20-57)
- [ ] Thêm case trong `executeNode()` switch
- [ ] Thêm default config vào `workflowConfig.ts`
- [ ] Thêm UI fields vào `NodeConfigPanel.tsx`
- [ ] Nếu cần gọi Zalo: dùng `getApi()`, không import ZaloService trực tiếp
- [ ] Nếu là proxy action mới: đăng ký trong `zaloIpc.ts` dùng `wrap()`
- [ ] Test cả sandbox mode (isSandbox=true) lẫn thật
- [ ] Test trên cả máy Boss lẫn nhân viên
