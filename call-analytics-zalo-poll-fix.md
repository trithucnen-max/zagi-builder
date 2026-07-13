# 🛠️ Bản vá lỗi: Zalo Poll, Lọc Workflow Nhân viên & Bộ lọc Nhãn Cuộc gọi

Bản vá này sửa đổi 3 lỗi quan trọng liên quan đến tính năng bình chọn (Poll) Zalo, phân quyền lọc Workflow của Nhân viên, và sửa lỗi bộ lọc nhãn cuộc gọi trong tab Báo cáo & Phân tích.

---

## 📋 Chi tiết các lỗi và giải pháp khắc phục

### 1. Sửa lỗi Tạo Poll Zalo trong Workflow
*   **Vấn đề:** 
    *   Hàm `createPoll` trong thư viện `zca-js` và lớp `ZaloService` yêu cầu hai đối số độc lập: `options` (chứa câu hỏi, mảng phương án...) và `groupId`.
    *   Tuy nhiên, tại [`WorkflowEngineService.ts`](./src/services/workflow/WorkflowEngineService.ts), tham số `groupId` lại được truyền lồng bên trong đối tượng `options` và chỉ gọi hàm với một đối số duy nhất. Đồng thời, API proxy mock dành cho nhân viên cũng bỏ qua tham số `groupId` thứ hai.
    *   Điều này khiến API của Zalo không nhận diện được ID nhóm trò chuyện (`groupId` bị `undefined`) $\rightarrow$ tạo poll thất bại.
*   **Giải pháp:** 
    *   Đồng bộ lại cấu trúc gọi hàm `createPoll` trong [`WorkflowEngineService.ts`](./src/services/workflow/WorkflowEngineService.ts) về dạng hai đối số chuẩn: `options` và `groupId`.
    *   Cập nhật hàm proxy mock `createPoll` của employee để đóng gói và chuyển tiếp đầy đủ cả 2 tham số lên máy BOSS.

### 2. Giới hạn hiển thị Workflow cho Nhân viên
*   **Vấn đề:** 
    *   Khi nhân viên đăng nhập, giao diện danh sách Workflow mặc định lọc theo "Tất cả tài khoản" (mảng `filterPages` rỗng). Vì mảng rỗng, logic lọc bỏ qua và hiển thị toàn bộ workflow trong hệ thống (bao gồm cả các workflow thuộc tài khoản Zalo của nhân viên khác).
*   **Giải pháp:** 
    *   Nhập thêm `useEmployeeStore` trong [`WorkflowList.tsx`](./src/ui/components/workflow/WorkflowList.tsx).
    *   Cập nhật hàm `load()` để tự động kiểm tra nếu người dùng hiện tại là Nhân viên (`mode === 'employee'`), danh sách workflow trả về từ database sẽ lập tức được lọc để chỉ giữ lại các workflow thuộc quyền quản lý của các tài khoản Zalo được gán cho nhân viên đó (`useAccountStore().accounts`).

### 3. Sửa lỗi Bộ lọc Nhãn trong Báo cáo Cuộc gọi
*   **Vấn đề:** 
    *   Mặc dù hàm `getCallReport` ở [`DatabaseService.ts`](./src/services/database/DatabaseService.ts) hỗ trợ đầy đủ việc lọc theo nhãn thông qua `localLabelIds` và `zaloLabelThreadIds`.
    *   Tuy nhiên, tại file IPC handler [`databaseIpc.ts`](./electron/ipc/databaseIpc.ts), hàm `db:getCallReport` chỉ bóc tách 3 tham số `{ zaloId, fromTs, toTs }` từ client gửi lên và bỏ qua các tham số nhãn. Điều này khiến câu lệnh truy vấn SQL luôn chạy ở chế độ không lọc nhãn.
*   **Giải pháp:** 
    *   Cập nhật IPC handler `db:getCallReport` trong [`databaseIpc.ts`](./electron/ipc/databaseIpc.ts) để bóc tách đầy đủ các tham số nhãn và chuyển tiếp chúng xuống Database Service (hoặc thông qua proxy `proxyToBossAsync` nếu chạy ở chế độ Nhân viên).

### 4. Sửa lỗi hiển thị & Cải tiến giao diện Card Ngân hàng (Bank Card) giống Zalo
*   **Vấn đề:** 
    *   **Lỗi hiển thị trắng trống trơn (Hình 3):** Khi gửi tin nhắn Card Ngân hàng tự động qua Workflow, tin nhắn được lưu trong database dưới dạng JSON thô mà không có tham số `action === 'zinstant.bankcard'`. Lớp `isBankCardType` và `parseBankCardFromContent` cũ chỉ nhận dạng được tin nhắn khi có đúng tham số `action` này, dẫn đến việc tin nhắn bị render thành text bubble trống trơn màu xanh nhạt của người gửi.
    *   **Giao diện chưa đồng bộ (Hình 2):** Màu nền MB Bank quá tối (`#1e0a5e`), màu chữ bị đổi thành màu đen (do CSS override), chỉ sử dụng icon mặc định `🏦` và chỉ có duy nhất 1 nút "Sao chép STK". Trong khi Zalo gốc có logo MB thật, chữ trắng tương phản tốt và có 2 nút "Lưu tài khoản" / "Chuyển khoản".
*   **Giải pháp:** 
    *   **Nhận dạng thông minh:** Cải tiến `isBankCardType` và `parseBankCardFromContent` trong `MessageBubbles.tsx` để tự động nhận dạng các tin nhắn có content dạng JSON chứa `binBank` và `numAccBank` bất kể có tham số `action` hay không.
    *   **Giao diện chuẩn Zalo:**
        *   Cập nhật bảng màu `BANK_CARD_COLORS` với mã màu chuẩn của MB Bank (`#153092`) và thêm mã code logo (ví dụ `MB`).
        *   Tự động tải logo thật từ API VietQR `https://api.vietqr.io/img/${info.code}.png` với cơ chế fallback thông minh về emoji `🏦`.
        *   Cố định màu chữ bằng inline style `style={{ color: '#ffffff' }}` để tránh bị CSS global đè màu đen.
        *   Tái cấu trúc Footer thành 2 nút nằm ngang phân tách bởi vạch dọc: **"Lưu tài khoản"** và **"Chuyển khoản"** đúng như Zalo gốc.

---

## 🛠️ Các file thay đổi

*   **[`src/services/workflow/WorkflowEngineService.ts`](./src/services/workflow/WorkflowEngineService.ts)**: Cấu trúc lại cách gọi API `createPoll` và proxy helper.
*   **[`src/ui/components/workflow/WorkflowList.tsx`](./src/ui/components/workflow/WorkflowList.tsx)**: Thêm bộ lọc workflow giới hạn theo phân quyền của nhân viên.
*   **[`electron/ipc/databaseIpc.ts`](./electron/ipc/databaseIpc.ts)**: Cập nhật bóc tách tham số bộ lọc nhãn trong IPC `db:getCallReport`.
*   **[`src/services/database/DatabaseService.ts`](./src/services/database/DatabaseService.ts)**: Thêm các dòng log debug để kiểm tra SQL query.
*   **[`src/ui/components/chat/MessageBubbles.tsx`](./src/ui/components/chat/MessageBubbles.tsx)**: Cập nhật logic parse, nhận dạng tin nhắn tự động từ workflow và cải tiến giao diện Card Ngân hàng chuẩn Zalo.

---

## 🚀 Hướng dẫn Kiểm tra & Triển khai (Deployment & Verification)

1.  **Khởi động lại ứng dụng:** Vì các thay đổi nằm ở Main Process (Electron backend) và UI, cả máy BOSS và máy Nhân viên đều cần được tắt ứng dụng và khởi động lại terminal (`npm run dev`) để nạp code IPC mới và giao diện mới.
2.  **Lọc nhãn cuộc gọi:** Truy cập tab Báo cáo cuộc gọi, chọn nhãn local (ví dụ: "zagi"). Kiểm tra số lượng cuộc gọi và top khách hàng thay đổi chính xác.
3.  **Kiểm tra Card Ngân hàng:** Gửi tin nhắn ngân hàng thủ công hoặc chạy workflow gửi tự động. Kiểm tra xem giao diện Card trên Zagi đã hiển thị logo thật của ngân hàng, chữ trắng rõ nét, có 2 nút "Lưu tài khoản" / "Chuyển khoản" và tin nhắn tự động từ workflow không còn bị trắng trống trơn.
4.  **CI/CD:** Commit và push code lên nhánh GitHub `fix/label-filter-workflow-poll-daterange`. Quy trình GitHub Actions sẽ tự động biên dịch, chạy các bài test chất lượng và tạo bản build mới cho các hệ điều hành.
