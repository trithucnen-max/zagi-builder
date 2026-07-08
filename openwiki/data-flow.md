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

## Flow 2: Workflow gửi tin Zalo (Nhân viên machine)

```
WorkflowEngine.executeNode('zalo.sendMessage', cfg, ctx)
    │
    ▼
getApi(ctx.pageId, ctx.trigger?.zaloId)
    │
    ├── [workspace.local] → ConnectionManager.getConnection(zaloId).api
    │       └─► ZaloService.sendMessage() → zca-js → Zalo server ✅
    │
    └── [workspace.remote] → proxy object
            │
            ▼
        HttpConnectionManager.proxyAction(workspaceId, 'zalo:sendMessage', {
            zaloId, message, threadId, type, typeMessage
        })
            │
            ▼
        POST Boss /api/proxy/action
            │
            ▼
        Boss: ipcHandlerRegistry['zalo:sendMessage'](null, params)
            │
            ▼
        ZaloService.sendMessage() → zca-js → Zalo server ✅

⚠️  BUG (zalo.sendImage): proxy object không truyền attachments
    → Boss nhận typeMessage='file' nhưng attachments=[undefined]
    → throw "No attachments provided" → ảnh không gửi được
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

## Flow 4: Boss → Nhân viên SSE Event Push (v27.2.6 — Sequence ID)

```
[Zalo event on Boss]
    │
    ▼
EventBroadcaster.broadcast(channel, data)
    │
    ▼
HttpRelayService.relayEventToEmployees(channel, data)
    │ gán eventId = ++emp.lastEventSeq
    │ lưu vào Event History Queue (max 500, TTL 10phút)
    ▼
SSE push → tất cả connected employees (kèm `id: {eventId}`)
    │
    ▼
[Nhân viên machine] HttpClientService receives SSE
    ├── saveLastEventId(eventId) → SQLite local
    ├── persistRelayConversationEvent() → lưu vào local DB
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

## Flow 8: SSE Last-Event-ID Recovery (v27.2.6)

```
Nhân viên mất mạng/reconnect SSE
    │ đọc lastEventId từ SQLite local
    │
    ▼
GET /api/events/stream?lastEventId={N}
    │
    ▼ Boss kiểm tra Event History Queue:
    ├── [HIT] tìm thấy ID N trong queue:
    │       replay các sự kiện N+1..hiện tại
    │       Nhân viên nhận được và cập nhật DB local ✅
    └── [MISS] ID quá cũ/tràn buffer:
            gửi sự kiện: relay:fallbackDeltaSync
            Nhân viên chạy onSSEReconnected()
            → Delta Sync → DB local được phục hồi toàn vẹn ✅
```
