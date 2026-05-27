# Kế hoạch triển khai: Tính năng Quản lý Nhóm Trưởng/Phó Nhóm

Tài liệu này mô tả kế hoạch thiết kế và phát triển tính năng quản lý các nhóm Zalo mà tài khoản hiện tại làm **Trưởng nhóm** hoặc **Phó nhóm**. Tính năng này cho phép người dùng lọc danh sách các nhóm mình quản lý, thêm một liên hệ vào nhiều nhóm cùng lúc, hoặc xóa một thành viên ra khỏi nhiều nhóm (hoặc tất cả các nhóm) đang quản lý trực tiếp trên giao diện CRM của Zagi.

---

## ℹ️ Overview (Tổng quan)
- **Mục tiêu**: Hỗ trợ admin quản lý nhóm hiệu quả (lọc nhóm quản lý, thêm người vào nhiều nhóm, xóa người khỏi nhiều nhóm/tất cả nhóm).
- **Lý do**: Tăng hiệu quả quản trị và chống spam khi vận hành nhiều nhóm Zalo cùng lúc.

## 📱 Project Type (Loại dự án)
- **Loại dự án**: **WEB** (React Electron Desktop Application)

## 🎯 Success Criteria (Tiêu chí thành công)
- Lọc danh sách nhóm hiển thị chính xác các nhóm mà tài khoản hiện tại làm Trưởng/Phó nhóm (`role` = 1 hoặc 2 trong `page_group_member`).
- Có thể chọn 1 liên hệ và thêm thành công vào nhiều nhóm quản lý được chọn.
- Có thể chọn 1 thành viên và xóa thành công khỏi nhiều nhóm hoặc tất cả nhóm đang quản lý.
- Có thời gian delay (1s) giữa các lần gọi API Zalo để tránh bị Zalo khóa tài khoản.

## 🛠️ Tech Stack (Công nghệ sử dụng)
- **Frontend**: React (TSX), Tailwind CSS (Tuân thủ luật **Purple Ban** - không dùng màu tím).
- **Backend/IPC**: Electron Main process, `zca-js` SDK.
- **Database**: SQLite cục bộ qua `better-sqlite3`.

## 📂 File Structure (Cấu trúc tệp tin)
- **Sửa đổi chính**: [GroupMembersTab.tsx](file:///Users/kimtrungduong/Downloads/deplao-builder-main/src/ui/components/crm/groups/GroupMembersTab.tsx)
- **Các thành phần mới thêm trực tiếp trong file này**:
  - `AddUserToGroupsModal`
  - `RemoveUserFromGroupsModal`

## 📝 Task Breakdown (Phân rã công việc)

### Phase 1: Research (Phân tích)
- **Task 1**: Xác thực cách lấy vai trò tài khoản hiện tại trong các nhóm.
  - *Đầu vào*: Lấy `activeAccountId` từ store và danh sách thành viên trong DB.
  - *Đầu ra*: Lọc ra các `groupId` nơi tài khoản hiện tại có `role === 1` hoặc `role === 2`.
  - *Xác minh*: Log thử mảng nhóm quản lý ở Console.

### Phase 2: Implementation (Triển khai)
- **Task 2**: Bổ sung bộ lọc nhóm tôi quản lý ở cột trái.
  - *Đầu vào*: State `groupFilter: 'all' | 'managed'`.
  - *Đầu ra*: Giao diện hiển thị nhóm rút gọn.
  - *Xác minh*: Bấm chọn và kiểm tra danh sách nhóm thay đổi.
- **Task 3**: Triển khai Modal thêm người vào nhiều nhóm.
  - *Đầu vào*: Chọn contact từ CRM, chọn nhiều nhóm bằng checkbox.
  - *Đầu ra*: Chạy vòng lặp gọi `ipc.zalo.addUserToGroup` kèm delay 1 giây và hiển thị progress.
  - *Xác minh*: Kiểm tra xem liên hệ đã vào nhóm trên ứng dụng Zalo chưa.
- **Task 4**: Triển khai Modal xóa người khỏi nhiều nhóm.
  - *Đầu vào*: Chọn thành viên, hiển thị danh sách nhóm quản lý họ đang tham gia.
  - *Đầu ra*: Chọn nhóm/chọn tất cả và gọi `ipc.zalo.removeUserFromGroup` tuần tự, cập nhật DB cục bộ.
  - *Xác minh*: Thành viên bị xóa khỏi nhóm tương ứng trên Zalo và DB.

## 🏁 Phase X: Verification (Xác minh & Nghiệm thu)
- Chạy `npx tsc --noEmit` để đảm bảo TypeScript biên dịch sạch sẽ.
- Chạy `npm run build:renderer` để kiểm tra Vite compile.
- Kiểm thử các chức năng thêm/xóa thực tế trên tài khoản Zalo dev.
