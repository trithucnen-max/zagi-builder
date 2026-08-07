# Data Flow

> Luồng dữ liệu chính trong Zagi: Zalo event → EventBroadcaster → Workflow/UI.

## Flow 1: Nhận tin Zalo → Hiển thị UI + Trigger Workflow

```
[Zalo Server]
    │ (WebSocket / long-poll via zca-js)
    ▼
ZaloLoginHelper (src/utils/ZaloLoginHelper.ts)
    │ parse raw event
    ▼
EventBroadcaster.broadcast('event:message', {
    zaloId, threadId, threadType, message, ...
})
    │
    ├──► [Hook 1] WorkflowEngine.triggerWorkflows('trigger.message', data)
    │         │
    │         └─► match enabled workflows → executeWorkflow()
    │
    └──► [ipcMain.emit] → renderer process
              │
              └─► chatStore.addMessage() → UI re-render
```

## Flow 2: Workflow gửi tin Zalo & Đính kèm Media (Nhân viên machine)

```
WorkflowEngine.executeNode('zalo.sendMessage', cfg, ctx)
    │
    ▼
getApi(ctx.pageId, ctx.trigger?.zaloId)
    │
    ├── [workspace.local (Boss)] → ConnectionManager.getConnection(zaloId).api
    │       └─► ZaloService.sendMessage() → zca-js → Zalo server ✅
    │
    └── [workspace.remote (Nhân viên)] → proxy object
            │
            ├── [Nếu có attachments ảnh/tệp]
            │       │ (Đọc file local → Base64 / Stream)
            │       ▼
            │   HttpClientService.uploadMedia(base64, filename, targetZaloId)
            │       │ POST Boss /api/media/upload (hoặc upload-chunk nếu >2MB)
            │       ▼
            │   Boss lưu file vào ổ đĩa và trả về: { success: true, bossPath: "..." }
            │       │ (Thay thế đường dẫn attachments thành bossPath)
            │       ▼
            ▼
        HttpConnectionManager.proxyAction(workspaceId, 'zalo:sendMessage', {
            zaloId, message: { ...msg, attachments: [bossPath] }, threadId, type, typeMessage
        })
            │
            ▼
        POST Boss /api/proxy/action
            │
            ▼
        Boss: ipcHandlerRegistry['zalo:sendMessage'](null, params)
            │
            ▼
        ZaloService.sendMessage() → zca-js → Zalo server (Gửi ảnh & text thành công 100%) ✅
```

## Flow 3: CRM Campaign gửi hàng loạt

```
User click "Bắt đầu Campaign"
    │
    ▼
CRMQueueService.startCampaign(id)
    │
    ├── Load contacts từ DB
    ├── sendMode: 'random' → chọn 1 Zalo account ngẫu nhiên
    │   sendMode: 'all'    → gửi từ tất cả accounts được giao
    │
    └── Loop contacts với delay giữa mỗi lần gửi
            │
            ▼
        ZaloService.sendMessage() / sendImage() / sendImages()
```

## Flow 4: Boss → Nhân viên Socket.IO Event Push (v27.2.8)

```
[Zalo event on Boss]
    │
    ▼
EventBroadcaster.broadcast(channel, data)
    │
    ▼
HttpRelayService.relayEventToEmployees(channel, data)
    │
    ▼
SocketIOService.emitToEmployeeRoom(employeeId, channel, data)
    │
    ▼
[Nhân viên machine] HttpClientService (via SocketIOClient) receives event
    ├── triggerWorkflowEngine(channel, data) → trigger workflow local
    └── ipcRenderer.emit(channel, data) → renderer update UI
```

## Flow 5: Nhân viên gửi file/ảnh qua workflow (sau khi fix v27.2.6)

```
Nhân viên machine: getApi() proxy → sendMessage với attachments
    │
    ▼
Đọc file local → base64
    │
    ▼
uploadMedia(base64, filename):
    ├── nếu ≤2MB → POST Boss /api/media/upload
    └── nếu >2MB → chia chunk → POST Boss /api/media/upload-chunk (nhiều lần)
            │ Boss UploadChunkService.saveChunk() → lưu từng chunk
            │ Chunk cuối → mergeChunks() → trả về bossPath
    │
    ▼
proxyAction('zalo:sendImages', { filePaths: [bossPath], threadId, type })
    │
    ▼
Boss: ZaloService.sendImages([bossPath], threadId, type) ✅
```

## Flow 6: Webhook trigger Workflow

```
External service POST → Boss /webhook/{webhookId}
    │
    ▼
WebhookGatewayService.handleWebhook(id, payload)
    │
    ▼
WorkflowEngine.triggerWorkflows('trigger.webhook', { webhookId, payload })
    │
    └─► match workflow có trigger.webhook với webhookId → execute
```

## Flow 7: Chunked Upload — Nhân viên gửi file lớn (v27.2.6)

```
Nhân viên: uploadMedia(base64, filename)
    │ base64.length > 2MB_CHUNK_SIZE?
    ├── KHÔNG: POST /api/media/upload (legacy, 1 request)
    └── CÓ: tính totalChunks = ceil(size / 2MB)
              │
              ▼
          Lặp i=0..totalChunks-1:
              POST /api/media/upload-chunk {
                uploadId, chunkIndex=i, totalChunks,
                filename, zaloId, chunkBase64
              }
              │
              ▼ Boss:
          UploadChunkService.saveChunk(i) → lưu chunk_i
              │
          nếu i == totalChunks-1:
              mergeChunks() → ghép tất cả chunk → lưu file
              │ dọn dẹp _temp_uploads/{uploadId}/
              ▼ trả về: { success: true, bossPath }
```

## Flow 8: Tự động phục hồi mạng & Đồng bộ địa chỉ kết nối (v27.2.8)

```
[Nhân viên gập máy / đổi WiFi / mất mạng]
    │
    ├── Browser phát hiện offline → App.tsx gọi ipc.workspace.notifyNetworkOffline()
    ├── Main process nhận tín hiệu → Đánh dấu ngay các kết nối là degraded (connected=false)
    └── Giao diện lập tức hiện màn hình Lock Screen mất kết nối
    │
[Mạng có lại / Thức dậy]
    │
    ├── Browser phát hiện online → App.tsx gọi ipc.workspace.notifyNetworkOnline()
    ├── Main process kích hoạt Debounce 4 giây để mạng ổn định IP
    ├── Hết 4s: HttpConnectionManager.forceReconnectAll()
    │     └── Kiểm tra nếu không bận kết nối → service.connect()
    │
[Tái kết nối thành công]
    │
    ├── Gửi event 'workspace:connectionStatus' (kèm connected, isUsingLan, bossUrl)
    ├── Renderer nhận status → Đóng màn hình Lock Screen cảnh báo
    └── Renderer tự động re-initialize RestQueryService(bossUrl, token)
          └─► Đảm bảo mọi request REST API tiếp theo đi đúng địa chỉ LAN/WAN mới ✅
```
