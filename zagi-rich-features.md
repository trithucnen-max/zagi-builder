# Kế hoạch Triển khai Tính năng Nâng cao Zagi (zca-js Integration)

## Overview

Triển khai **7 tính năng nâng cao** từ thư viện `zca-js` (đối chiếu với `zalogo`) vào Zagi (`deplao`), chia thành **3 giai đoạn** phân theo mức độ ưu tiên và độ phức tạp.

**Nguồn tham chiếu:**
- Thư viện lõi JS/TS: `zca-js-main/` (`/Users/kimtrungduong/Downloads/zca-js-main/`)
- Thư viện Go tham khảo: `zalogo/` (`/Users/kimtrungduong/Downloads/zalogo/`)
- Dự án triển khai: `deplao/` (`/Users/kimtrungduong/Downloads/deplao/`)

---

## Project Type
**DESKTOP (Electron + React + TypeScript)**

---

## Success Criteria

| # | Tính năng | Tiêu chí xác minh |
|---|-----------|-------------------|
| 1 | `getMultiUsersByPhones` | Import 50 SĐT CSV trong < 5 giây thay vì > 25 giây |
| 2 | Album ảnh hàng loạt | Gửi 3+ ảnh → 1 tin nhắn dạng grid album + 1 chuông thông báo |
| 3 | Quản lý lời mời kết bạn | Tab hiển thị danh sách + thu hồi hàng loạt hoạt động |
| 4 | Ghost Mode đọc ngầm | Nhân viên đọc → khách thấy "Đã nhận" không "Đã xem" |
| 5 | Ghost Mode ẩn online | Toggle bật → chấm xanh biến mất trên Zalo di động khách |
| 6 | Gửi Video Rich | Video hiển thị thumbnail + nút Play trực tiếp trong chat Zalo |
| 7 | Rich Message Actions | Voice, BankCard, BusinessCard hoạt động từ Chat + Workflow |

---

## Tech Stack

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| API lõi | `zca-js` (đã cài trong deplao) | Đã có sẵn toàn bộ 7 phương thức cần thiết |
| IPC Bridge | Electron `ipcMain.handle` | Cơ chế IPC hiện hành của Zagi |
| Frontend | React + TypeScript (Vite) | Codebase hiện tại |
| State | Zustand (`appStore`) | Đang sử dụng |
| Video metadata | `sharp` / ffprobe wrapper | Trích xuất thumbnail và thông số video |

---

## File Structure Cần Cập nhật

```
deplao/
├── src/
│   ├── services/zalo/
│   │   └── ZaloService.ts              # Thêm 7 phương thức mới
│   ├── ui/lib/
│   │   └── ipc.ts                      # Khai báo type cho 7 IPC mới
│   ├── ui/store/
│   │   └── appStore.ts                 # ghostModeRead, ghostModeOnline state
│   ├── ui/components/
│   │   ├── crm/contacts/
│   │   │   └── CRMImportModal.tsx      # [MODIFY] multiget thay vòng lặp findUser
│   │   ├── crm/
│   │   │   └── FriendRequestsTab.tsx   # [NEW] Tab quản lý lời mời kết bạn
│   │   ├── settings/
│   │   │   ├── AccountSettings.tsx     # [MODIFY] Nút gạt Ghost Mode online
│   │   │   └── ChangelogSettings.tsx   # [MODIFY] Changelog v27.2.3
│   │   └── chat/
│   │       ├── MessageInput.tsx        # [MODIFY] Ghost Mode đọc, Multi-image, Video rich
│   │       ├── ConversationList.tsx    # [MODIFY] Ghost Mode đọc ngầm
│   │       └── RichMessageActions.tsx  # [NEW] Modal Voice/BankCard/BusinessCard
│   ├── ui/components/workflow/
│   │   ├── workflowConfig.ts           # [MODIFY] Thêm 4 node mới
│   │   ├── NodeConfigPanel.tsx         # [MODIFY] Form config 4 node mới
│   │   ├── WorkflowNodes.tsx           # [MODIFY] Icon hiển thị 4 node mới
│   │   └── WorkflowEngineService.ts    # [MODIFY] case handler 4 node mới
│   └── ui/hooks/
│       ├── useChat.ts                  # [MODIFY] Ghost Mode đọc ngầm
│       └── useZaloEvents.ts            # [MODIFY] Ghost Mode đọc ngầm
└── electron/main.ts                    # [MODIFY] Đăng ký 7 IPC handler mới
```

---

## 📦 GIAI ĐOẠN 1: CRM & Trải nghiệm Chat Cốt lõi (v27.2.3)
> **Mục tiêu:** Tăng tốc độ quét SĐT, kiểm soát trạng thái tài khoản, bảo vệ giới hạn kết bạn.

---

### TASK 1.1 — IPC `zalo:getMultiUsersByPhones`
**Agent:** `backend-specialist` | **Priority:** P0 (blocker cho Task 1.2)

**INPUT:** `electron/main.ts` + `ZaloService.ts` chưa có API tra cứu SĐT hàng loạt

**OUTPUT:**
- `ZaloService.ts`: thêm `async getMultiUsersByPhones(phones: string[])` wrap `this.api.getMultiUsersByPhones`
- `electron/main.ts`: thêm `ipcMain.handle('zalo:getMultiUsersByPhones', ...)`
- `ipc.ts`: khai báo `getMultiUsersByPhones: (params: {auth, phones: string[]}) => Promise<Record<string, UserBasic>>`

**VERIFY:** Gọi IPC với 5 SĐT → nhận về Map `{phone: UserBasic}` đúng format

---

### TASK 1.2 — Thay thế vòng lặp `findUser` trong `CRMImportModal.tsx`
**Agent:** `frontend-specialist` | **Priority:** P0 | **Depends:** Task 1.1

**INPUT:** `CRMImportModal.tsx#L254-L276` — vòng lặp tuần tự + `setTimeout(r, 500)` mỗi SĐT

**OUTPUT:**
- Xóa vòng lặp tuần tự + delay 500ms
- Gọi 1 lần `ipc.zalo.getMultiUsersByPhones({ auth, phones: allPhones })` cho toàn bộ batch
- Map kết quả trả về vào `ParsedRow[]` cho UI preview
- Tăng `MAX_PHONES` từ 50 → 100

**VERIFY:** Import file 100 SĐT → kết quả xuất hiện trong < 10 giây, giao diện preview đầy đủ dữ liệu

---

### TASK 1.3 — IPC `zalo:updateActiveStatus` (Ghost Mode online)
**Agent:** `backend-specialist` | **Priority:** P1

**OUTPUT:**
- `ZaloService.ts`: thêm `async updateActiveStatus(active: boolean)`
- `electron/main.ts`: handler `zalo:updateActiveStatus`
- `ipc.ts`: type `updateActiveStatus: (params: {auth, active: boolean}) => Promise<{status: boolean}>`

**VERIFY:** `updateActiveStatus(false)` → trên app Zalo di động chấm xanh biến mất

---

### TASK 1.4 — UI Toggle Ghost Mode Online
**Agent:** `frontend-specialist` | **Priority:** P1 | **Depends:** Task 1.3

**OUTPUT:**
- `appStore.ts`: state `ghostModeOnline: boolean` (persist localStorage)
- Toggle "Chế độ ẩn danh" trong cài đặt tài khoản Zalo
- Bật: gọi `updateActiveStatus(false)` + lặp lại mỗi 5 phút (Zalo có TTL ping)
- Tắt: gọi `updateActiveStatus(true)`

**VERIFY:** Bật Toggle → ẩn online. Tắt Toggle → hiện online lại

---

### TASK 1.5 — Chế độ Đọc ngầm (Silent Reading)
**Agent:** `frontend-specialist` | **Priority:** P1 | **Depends:** Không

**INPUT:** `useChat.ts#L61`, `ConversationList.tsx#L955`, `useZaloEvents.ts#L712` — gọi `ipc.db.markAsRead` tự động

**OUTPUT:**
- `appStore.ts`: state `ghostModeRead: boolean` (persist localStorage)
- Toggle "Đọc ngầm" trong Settings > Cài đặt Chat
- Bao bọc tất cả `ipc.db.markAsRead` bằng: `if (!ghostModeRead) ipc.db.markAsRead(...)`
- Frontend xóa badge unread local dù không gửi seen lên server Zalo

**VERIFY:** Bật Ghost Mode Read → mở tin nhắn → UI mất badge → khách không thấy "Đã xem"

---

### TASK 1.6 — IPC `zalo:getSentFriendRequest` + `zalo:undoFriendRequest`
**Agent:** `backend-specialist` | **Priority:** P1

**OUTPUT:**
- `ZaloService.ts`: `getSentFriendRequest()` + `undoFriendRequest(friendId: string)`
- `electron/main.ts`: 2 handler IPC
- `ipc.ts`: 2 type khai báo

**VERIFY:** Gọi `getSentFriendRequest()` → nhận danh sách lời mời đã gửi chưa được chấp nhận

---

### TASK 1.7 — UI Tab Quản lý Lời mời Kết bạn đã gửi
**Agent:** `frontend-specialist` | **Priority:** P2 | **Depends:** Task 1.6

**OUTPUT:**
- Tạo mới `FriendRequestsTab.tsx` trong khu vực CRM hoặc Quản lý bạn bè
- Danh sách hiển thị: avatar, tên, thời gian gửi lời mời, lời nhắn gửi kèm
- Nút "Thu hồi" đơn lẻ + "Thu hồi tất cả đã chọn"
- Thống kê số lượng lời mời đang chờ

**VERIFY:** Bấm Thu hồi → biến mất khỏi danh sách; Trên Zalo di động đối phương không còn thấy lời mời pending

---

## 📦 GIAI ĐOẠN 2: Giao tiếp Đa phương tiện Nâng cao (v27.2.3)
> **Mục tiêu:** Video rich streaming, Album ảnh gộp 1 tin nhắn.

---

### TASK 2.1 — IPC `zalo:sendVideo` (Rich Video)
**Agent:** `backend-specialist` | **Priority:** P0

**OUTPUT:**
- `ZaloService.ts`: thêm `sendVideo(options: SendVideoOptions, threadId: string, type)`
- `electron/main.ts`: handler `zalo:sendVideo`
- `ipc.ts`: type với params `{auth, videoUrl, thumbnailUrl, duration?, width?, height?, threadId, threadType}`

**VERIFY:** Gọi IPC với link video CDN + link thumbnail → Zalo di động hiển thị video có nút Play

---

### TASK 2.2 — Helper tự động tạo Video Thumbnail & Metadata
**Agent:** `backend-specialist` | **Priority:** P0 | **Parallel với Task 2.1**

**OUTPUT:**
- Main Process: hàm `extractVideoMeta(filePath: string)` → `{thumbnailBase64, duration, width, height}`
- Handler `zalo:extractVideoMeta`
- Dùng `sharp` để tạo thumbnail hoặc FFmpeg wrapper nếu có sẵn

**VERIFY:** Truyền `.mp4` → nhận thumbnail base64 + duration/width/height đúng

---

### TASK 2.3 — Cập nhật `MessageInput.tsx` gửi Video Rich
**Agent:** `frontend-specialist` | **Priority:** P1 | **Depends:** Task 2.1 + 2.2

**OUTPUT:**
- Khi đính kèm tệp video: tự gọi `extractVideoMeta` → upload video + thumbnail → gọi `ipc.zalo.sendVideo`
- Preview thumbnail trong composer trước khi gửi
- Fallback về `sendFile` nếu không trích xuất được metadata

**VERIFY:** Gửi video `.mp4` từ Zagi → khách nhận video với thumbnail + nút Play

---

### TASK 2.4 — Album ảnh hàng loạt (Multi-Image Album)
**Agent:** `frontend-specialist` | **Priority:** P2

**INPUT:** `MessageInput.tsx` gửi từng ảnh tạo nhiều tin nhắn riêng lẻ

**OUTPUT:**
- Khi chọn 2+ ảnh: tạo `groupLayoutId` timestamp chung
- Gửi parallel các ảnh với `isGroupLayout: 1`, `groupLayoutId`, `totalItemInGroup`, `idInGroup`
- UI preview: lưới ảnh trong composer, tối đa 30 ảnh
- Hỗ trợ cả chat 1-1 và nhóm

**VERIFY:** Gửi 5 ảnh → 1 tin nhắn album lưới; Điện thoại khách 1 chuông thông báo

---

## 📦 GIAI ĐOẠN 3: Rich Actions + Workflow Integration (v27.2.3)
> **Mục tiêu:** Bộ công cụ chốt đơn chuyên nghiệp, tích hợp toàn bộ vào Workflow Editor.

---

### TASK 3.1 — IPC `zalo:sendVoice`, `zalo:sendBankCard`, `zalo:sendCard`
**Agent:** `backend-specialist` | **Priority:** P0

**OUTPUT:**
- `ZaloService.ts`: thêm 3 phương thức:
  - `sendVoice(voiceUrl, threadId, type, fileSize?, ttl?)`
  - `sendBankCard(bankNum, nameAccBank, bank, threadId, type)`
  - `sendCard(userId, phoneNumber?, threadId, type)`
- `electron/main.ts`: 3 handler IPC
- `ipc.ts`: 3 type khai báo

**VERIFY:** Từng IPC gọi thành công với payload đúng định dạng Zalo

---

### TASK 3.2 — UI `RichMessageActions.tsx` trong Chat
**Agent:** `frontend-specialist` | **Priority:** P1 | **Depends:** Task 3.1

**OUTPUT:**
- `RichMessageActions.tsx`: popup menu nâng cao trong thanh công cụ chat
  - **Voice Note**: picker file `.m4a`/`.mp3` → `ipc.zalo.sendVoice`
  - **Thẻ ngân hàng**: dropdown chọn ngân hàng (50+ ngân hàng VN), nhập số TK + tên chủ thẻ → `ipc.zalo.sendBankCard`
  - **Danh thiếp**: search liên hệ theo tên/SĐT → `ipc.zalo.sendCard`
- Tích hợp vào `MessageInput.tsx` bên cạnh nút đính kèm file

**VERIFY:** Gửi thẻ ngân hàng → widget card đẹp; Gửi danh thiếp → hiển thị avatar + tên

---

### TASK 3.3 — Workflow Nodes mới (4 node)
**Agent:** `frontend-specialist` | **Priority:** P2 | **Depends:** Task 3.1

**OUTPUT — `workflowConfig.ts`:**
```ts
{ type: 'zalo.sendVideo',    label: 'Gửi Video',          desc: 'Gửi video kèm thumbnail phát trực tiếp', channel: 'zalo' },
{ type: 'zalo.sendVoice',    label: 'Gửi Tin nhắn thoại', desc: 'Gửi file âm thanh dạng voice note',     channel: 'zalo' },
{ type: 'zalo.sendBankCard', label: 'Gửi Thẻ Ngân hàng',  desc: 'Gửi widget thông tin tài khoản ngân hàng', channel: 'zalo' },
{ type: 'zalo.sendCard',     label: 'Gửi Danh Thiếp',      desc: 'Gửi danh thiếp liên hệ Zalo',          channel: 'zalo' },
```

**OUTPUT — `NodeConfigPanel.tsx`:** form config cho 4 node mới với các trường tương ứng

**OUTPUT — `WorkflowEngineService.ts`:** 4 case mới gọi IPC tương ứng

**OUTPUT — `WorkflowNodes.tsx`:** icon hiển thị cho 4 node mới

**VERIFY:** Kịch bản Workflow có `zalo.sendBankCard` chạy Sandbox → gửi thành công

---

### TASK 3.4 — Cập nhật Changelog và Tài liệu (v27.2.3)
**Priority:** P3 | **Depends:** Tất cả Phase 3

**OUTPUT:**
- `CHANGELOG.md`: mục `v27.2.3` mô tả đầy đủ 7 tính năng
- `ChangelogSettings.tsx`: entry `27.2.3` vào CHANGELOG UI
- `docs/zagi_status.md` + `docs/zagi_prd.md`: cập nhật bảng phiên bản + mô tả tính năng

---

## Dependency Graph

```
Phase 1:
  1.1 ──→ 1.2  (multiget CSV)
  1.3 ──→ 1.4  (ghost online)
  1.5          (ghost read - độc lập)
  1.6 ──→ 1.7  (friend requests)

Phase 2:
  2.1 ─┐
  2.2 ─┘──→ 2.3  (video rich)
  2.4           (album - tương đối độc lập)

Phase 3:
  3.1 ──→ 3.2  (rich actions UI)
  3.1 ──→ 3.3  (workflow nodes)
  3.2 + 3.3 + 3.1 ──→ 3.4 (docs)
```

---

## Ước tính thời gian

| Giai đoạn | Tasks | Effort |
|-----------|-------|--------|
| Phase 1 (v27.2.3) | 7 tasks | ~2 ngày |
| Phase 2 (v27.2.3) | 4 tasks | ~2 ngày |
| Phase 3 (v27.2.3) | 4 tasks | ~3 ngày |
| **Tổng** | **15 tasks** | **~7 ngày (Gộp chung)** |

---

## Phase X: Verification Checklist

### Phase 1
- [ ] Import CSV 100 SĐT xong trong < 10 giây
- [ ] Toggle Ghost Mode Online → chấm xanh biến mất trên app Zalo di động
- [ ] Bật Ghost Mode Read → khách không thấy "Đã xem" sau khi nhân viên đọc tin
- [ ] Xem + Thu hồi lời mời kết bạn thành công

### Phase 2
- [ ] Gửi video → thumbnail + nút Play trực tiếp trên app Zalo di động (không cần tải file)
- [ ] Gửi 3+ ảnh → 1 tin nhắn album lưới + 1 chuông thông báo

### Phase 3
- [ ] Gửi thẻ ngân hàng → widget card hiện số tài khoản dễ copy
- [ ] Gửi danh thiếp → hiển thị avatar + tên liên hệ
- [ ] Gửi Voice Note → phát được ngay trong app Zalo di động
- [ ] 4 Workflow Nodes mới chạy thành công ở Sandbox mode

### Build Verification
```bash
npm run build:electron
# Phải biên dịch 0 lỗi TypeScript
```
