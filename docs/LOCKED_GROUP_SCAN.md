# Hướng dẫn Kỹ thuật: Quét Thành Viên Nhóm Ẩn (Lock View Member) trong Zagi

Tài liệu này ghi lại kiến trúc, logic hoạt động và cách duy trì công nghệ **Quét Bóng Thụ Động (Passive Shadow Scanning - PSS)** dùng để lấy danh sách UID của các nhóm Zalo bật tính năng ẩn thành viên (`lockViewMember`).

---

## 1. Bản chất vấn đề & Giới hạn của Zalo
* **Hành vi phía Zalo:** Đối với tài khoản thường (không phải Admin/Phó nhóm), khi gọi API `getGroupInfo` hoặc `getGroupLinkInfo`, Zalo Backend sẽ ẩn toàn bộ thành viên thường, chỉ trả về tối đa khoảng 3–8 người (bao gồm Người tạo, Admin, Phó nhóm và chính tài khoản của bạn).
* **Kết quả:** Các thuộc tính `memberIds` trả về mảng rỗng `[]`, và `memVerList` (danh sách phiên bản để đồng bộ nội bộ Zalo) chỉ chứa 8 UID đại diện của ban quản trị. Do đó, các phương pháp đồng bộ danh sách thành viên trực tiếp thông thường sẽ bị giới hạn ở 8 người này.

---

## 2. Cơ chế giải quyết: Công nghệ Quét Bóng Thụ Động (Passive Shadow Scanning - PSS)
Để thu thập tối đa số lượng UID của nhóm ẩn mà không cần quyền Admin, Zagi sử dụng công nghệ Quét Bóng Thụ Động (PSS) thực hiện phân tích và nhận diện định danh gián tiếp thông qua lịch sử hoạt động và tương tác của thành viên trong nhóm.

### A. Điều kiện kích hoạt (Trigger Condition)
Cơ chế này được kích hoạt tự động trong cả hai luồng:
1. **Quét nhóm theo link** (hàm `scanGroupByLink` trong `GroupMembersTab.tsx`).
2. **Đồng bộ / Tải thành viên** (hàm `_syncSingleGroup` trong `zaloGroupUtils.ts`).

**Điều kiện kiểm tra:**
```typescript
const isLocked = gData.setting?.lockViewMember === 1 || gData.lockViewMember === 1 || gData.setting?.lockViewMember === true;
const totalMember = Number(gData.totalMember || 0);

if (isLocked || (totalMember > 0 && memberIds.length < totalMember) || memberIds.length <= 15) {
    // Kích hoạt công nghệ Quét Bóng Thụ Động (PSS)
}
```

### B. Các nguồn dữ liệu khai thác tương tác
Khi kích hoạt, hệ thống sẽ thực hiện gọi 3 API tương tác sau để bóc tách UID:

1. **Lịch sử trò chuyện (Chat History):**
   * **API:** `ipc.zalo.getGroupChatHistory({ groupId, count: 100 })`
   * **Trích xuất UID:** Lấy từ `msg.data?.uidFrom` hoặc `msg.senderId`.
   
2. **Bảng tin nhóm (Group Board):**
   * **API:** `ipc.zalo.getListBoard({ groupId, options: { page: 1, count: 50 } })`
   * **Trích xuất UID:**
     * Người đăng bài: `item.data?.creatorId` hoặc `item.data?.params?.senderUid`.
     * Người bình luận: `comment.creatorId` hoặc `comment.uid` hoặc `comment.userId`.
     * Người thả cảm xúc (Reaction): `like.userId` hoặc `like.uid`.
   * **Trích xuất Poll ID:** Lấy ID các cuộc bầu chọn biểu quyết dạng Poll (`item.data?.poll_id` hoặc nếu `item.boardType === 3` thì lấy `item.data?.id`).

3. **Biểu quyết bình chọn (Poll Details):**
   * **API:** Với mỗi Poll ID tìm thấy từ bảng tin, gọi `ipc.zalo.getPollDetail({ pollId })`.
   * **Trích xuất UID:** Duyệt qua các phương án lựa chọn (`options`), trích xuất UID của những người đã bầu chọn từ mảng `voters` hoặc `userIds` (`voter.userId || voter`).

Sau khi thu thập đầy đủ, toàn bộ các UID tìm thấy sẽ được gộp lại (loại bỏ trùng lặp) và lưu vào Database dưới dạng các placeholder trước khi chạy tiến trình làm giàu thông tin (Enrichment - lấy tên hiển thị và ảnh đại diện).

---

## 3. Quy trình Đăng ký API IPC (Bắt buộc khi bảo trì/phát triển)
Khi thêm hoặc chỉnh sửa bất kỳ hàm API Zalo nào phục vụ quét tương tác (ví dụ: `getListBoard`), bắt buộc phải đăng ký đầy đủ ở 4 nơi sau để tránh lỗi `is not a function`:

1. **Main Process (Backend của Electron):**
   * File: `electron/ipc/zaloIpc.ts`
   * Nhiệm vụ: Đăng ký kênh IPC nhận cuộc gọi từ Renderer và gọi service của Zalo.
   * Ví dụ:
     ```typescript
     wrap('zalo:getListBoard', (s, p) => s.getListBoard(p.options, p.groupId))
     ```

2. **Preload Script (Cầu nối an toàn):**
   * File: `electron/preload.ts`
   * Nhiệm vụ: Expose hàm qua `contextBridge` để tầng React UI gọi được.
   * Ví dụ:
     ```typescript
     getListBoard: (params: any) => ipcRenderer.invoke('zalo:getListBoard', params),
     ```

3. **TypeScript Types (Khai báo kiểu dữ liệu cho React):**
   * File: `src/ui/lib/ipc.ts`
   * Nhiệm vụ: Khai báo signature cho hàm trong interface của `ipc.zalo`.
   * Ví dụ:
     ```typescript
     getListBoard: (params: any) => Promise<any>;
     ```

4. **React Component / Utility (Sử dụng thực tế):**
   * File: `GroupMembersTab.tsx` hoặc `zaloGroupUtils.ts`.
   * Ví dụ gọi:
     ```typescript
     const res = await ipc.zalo?.getListBoard({ auth, options, groupId });
     ```

> [!WARNING]
> Nếu chỉnh sửa file `electron/preload.ts`, bạn phải **khởi động lại hoàn toàn ứng dụng (Restart Electron app)** thì thay đổi mới có hiệu lực.
