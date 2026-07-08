# IPC Channels

> Tất cả IPC channels giữa renderer ↔ main. Renderer gọi qua `window.api.xxx()`, main xử lý trong `electron/ipc/`.

## IPC Registry Pattern

Các Zalo IPC handler đăng ký kép:
```typescript
// electron/ipc/zaloIpc.ts
ipcMain.handle(channel, handler);
ipcHandlerRegistry.set(channel, handler);  // ← để Boss proxy gọi được
```

`ipcHandlerRegistry` là Map dùng bởi `HttpRelayService.executeProxyAction()` — Boss dùng để forward proxy action từ nhân viên.

## ERP Proxy Override (main.ts)

Tất cả `erp:*` channels (trừ whitelist read-only) bị intercept:
```typescript
if (activeWs?.type === 'remote' && !args[0]?._fromRelay) {
  → proxyAction(channel, args[0]) → Boss
}
```
`_fromRelay: true` được inject bởi Boss để tránh vòng lặp proxy.

## Zalo IPC Channels (`electron/ipc/zaloIpc.ts`)

| Channel | Handler | Params |
|---|---|---|
| `zalo:sendMessage` | `s.sendMessage(p.message, p.threadId, p.type, p.typeMessage, p.quote, p.mentions, p.styles)` | message, threadId, type, typeMessage, quote? |
| `zalo:sendImage` | `s.sendImage(resolveAbsPath(p.filePath), p.threadId, p.type, p.message, p.quote)` | filePath (local abs path), threadId, type |
| `zalo:sendImages` | `s.sendImages(p.filePaths.map(resolveAbsPath), p.threadId, p.type, p.quote)` | filePaths[], threadId, type |
| `zalo:sendFile` | `s.sendFile(resolveAbsPath(p.filePath), p.threadId, p.type, p.quote)` | filePath, threadId, type |
| `zalo:sendSticker` | `s.sendSticker(p.stickerId, p.threadId, p.type)` | stickerId, threadId, type |
| `zalo:sendVideo` | `s.sendVideo(p.options, p.threadId, p.type, p.quote)` | options{videoUrl, thumbnailUrl...}, threadId, type |
| `zalo:sendVoice` | `s.sendVoice(p.options, p.threadId, p.type, p.quote)` | options, threadId, type |
| `zalo:sendLink` | `s.sendLink(p.url, p.threadId, p.type, p.quote, p.message)` | url, threadId, type |
| `zalo:sendCard` | `s.sendCard([{options, threadId, type, quote}])` | card object |
| `zalo:sendBankCard` | `s.sendBankCard(p.payload, p.threadId, p.type)` | payload, threadId, type |
| `zalo:undoMessage` | `s.undoMessage(p.message)` | message object |
| `zalo:addReaction` | `s.addReaction(p.reaction, p.message)` | reaction key, message |
| `zalo:findUser` | `s.findUser(p.phone)` | phone |
| `zalo:getUserInfo` | `s.getUserInfo(p)` | userId |
| `zalo:sendFriendRequest` | `s.sendFriendRequest(p.message, p.userId)` | message, userId |
| `zalo:acceptFriendRequest` | `s.acceptFriendRequest(p.userId)` | userId |
| `zalo:setMute` | `s.setMute(p.threadId, p.threadType, p.duration, p.isMute)` | threadId, type, duration, isMute |
| `zalo:addToGroup` | — | groupId, members[] |
| `zalo:removeFromGroup` | — | groupId, members[] |
| `zalo:createPoll` | — | poll data |
| `zalo:getMessageHistory` | — | threadId, type, count |

## Workflow IPC Channels (`electron/ipc/workflowIpc.ts`)

| Channel | Purpose |
|---|---|
| `workflow:list` | Lấy danh sách workflows |
| `workflow:save` | Lưu / tạo mới workflow |
| `workflow:delete` | Xóa workflow |
| `workflow:run` | Chạy thử workflow (sandbox=true) |
| `workflow:getLogs` | Lấy run logs |
| `workflow:executed` | Event: workflow vừa chạy xong (broadcast) |

## Login IPC Channels (`electron/ipc/loginIpc.ts`)

| Channel | Purpose |
|---|---|
| `login:connect` | Login Zalo bằng cookies + IMEI |
| `login:disconnect` | Disconnect tài khoản |
| `login:status` | Kiểm tra trạng thái login |
| `login:qr` | Lấy QR code để login |

## Database IPC (`electron/ipc/databaseIpc.ts`)

File lớn nhất trong ipc/ (62KB). Bao gồm toàn bộ CRUD:
- Messages, Threads, Contacts
- Zalo accounts management
- Labels, Notes
- Employee data
- Settings & configs

## File IPC (`electron/ipc/fileIpc.ts`)

| Channel | Purpose |
|---|---|
| `file:upload` | Upload file từ renderer |
| `file:download` | Download file về local |
| `file:resolveAbsPath` | Resolve đường dẫn tuyệt đối |
| `file:openDialog` | Mở file picker dialog |

## threadType Values

| Value | Meaning |
|---|---|
| `0` | Individual chat (người dùng) |
| `1` | Group chat |

## destType (gửi typing event)

| threadType | destType |
|---|---|
| `0` (Individual) | `3` |
| `1` (Group) | `undefined` |
