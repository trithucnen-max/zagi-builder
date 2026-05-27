# Hướng dẫn Phân quyền Zalo theo Thẻ & Nhóm

**Phiên bản:** 1.0 | **Cập nhật:** 2026-05-28

---

## 1. Tổng quan

Tính năng **Phân quyền Zalo** cho phép Boss kiểm soát chính xác những cuộc trò chuyện nào mỗi nhân viên có thể nhìn thấy và thao tác trên tài khoản Zalo chung.

### Nguyên tắc hoạt động

| Nhân viên | Cấu hình | Kết quả |
|-----------|----------|---------|
| Không giới hạn | Không chọn nhóm, không chọn thẻ, không chặn | Thấy tất cả tin nhắn, nhóm, liên hệ |
| Theo nhóm | Chọn nhóm "Dự án Lào", "Nhóm VIP" | Chỉ thấy 2 nhóm đó, không thấy nhóm khác |
| Theo thẻ CRM | Chọn thẻ "VIP", "Quan Tâm" | Thấy liên hệ có thẻ VIP/Quan Tâm + **tất cả liên hệ chưa gắn thẻ** |
| Ẩn liên hệ bị khóa | Bật "Ẩn liên hệ bị khóa" | Không thấy bất kỳ liên hệ/nhóm mà Boss đã bấm Chặn |

---

## 2. Cơ chế Phân quyền Chi tiết

### 2.1 Thứ tự ưu tiên xét quyền

```
1. Chặn (Block) → Ưu tiên CAO NHẤT
   └─ Nếu liên hệ bị Boss chặn VÀ nhân viên có exclude_blocked = BẬT
      → Ẩn hoàn toàn, dù liên hệ có thẻ hợp lệ

2. Nhóm Zalo
   └─ Nếu allowed_groups không rỗng
      → Chỉ hiển thị các nhóm nằm trong danh sách

3. Liên hệ cá nhân (User)
   └─ Nếu allowed_tags không rỗng
      ├─ Liên hệ CHƯA có thẻ CRM: Tất cả nhân viên đều xem được
      └─ Liên hệ ĐÃ có thẻ CRM: Chỉ nhân viên có ít nhất 1 thẻ trùng mới thấy
```

### 2.2 Ví dụ thực tế

**Tình huống:** Tài khoản Zalo kinh doanh dùng chung giữa 3 nhân viên

| Nhân viên | allowed_groups | allowed_tags | exclude_blocked |
|-----------|---------------|--------------|-----------------|
| Nguyễn Văn A (Hỗ trợ) | Nhóm 1, Nhóm 2 | — (trống) | Tắt |
| Trần Thị B (Kinh doanh) | — (trống) | VIP, Quan Tâm | Bật |
| Lê Văn C (Quản lý) | — (trống) | — (trống) | Bật |

**Kết quả:**
- **A** thấy: Nhóm 1, Nhóm 2 + mọi liên hệ (kể cả chưa gắn thẻ)
- **B** thấy: Tất cả nhóm + liên hệ chưa gắn thẻ + liên hệ có thẻ VIP/Quan Tâm. KHÔNG thấy liên hệ bị Boss khóa
- **C** thấy: Tất cả — trừ liên hệ/nhóm đã bị Boss chặn

---

## 3. Hướng dẫn Cấu hình

### 3.1 Truy cập phân quyền

1. Mở **Cài đặt** → **Quản lý nhân viên**
2. Bấm nút **✏️ (Sửa)** hoặc **➕ Thêm nhân viên mới**
3. Trong form nhân viên, cuộn xuống mục **"Tài khoản Zalo được quản lý"**

### 3.2 Cấu hình từng tài khoản Zalo

Sau khi tích chọn tài khoản Zalo, bấm nút **⚙️ Phân quyền** để mở bảng cấu hình:

#### a) Chọn nhóm Zalo được phép xem

- **Bỏ trống** = nhân viên thấy tất cả nhóm
- **Tích chọn** một hoặc nhiều nhóm = chỉ thấy những nhóm đó

> 💡 Danh sách nhóm được lấy tự động từ danh bạ Zalo đã đồng bộ

#### b) Chọn thẻ CRM được phép xem

- **Bỏ trống** = nhân viên thấy tất cả liên hệ (kể cả chưa gắn thẻ)
- **Tích chọn** thẻ = chỉ thấy liên hệ có thẻ đó + **liên hệ chưa gắn thẻ nào**

> ⚠️ Liên hệ chưa gắn thẻ luôn hiển thị cho tất cả nhân viên cho đến khi được Boss gắn thẻ phân loại

#### c) Ẩn liên hệ bị khóa (Exclude Blocked)

- **Tắt** = nhân viên vẫn thấy liên hệ bị khóa
- **Bật** = ẩn hoàn toàn liên hệ mà Boss đã bấm "Chặn tin nhắn"

> 🔴 Quy tắc Block có **ưu tiên cao nhất** — dù liên hệ có thẻ hợp lệ, nếu bị Block sẽ không hiển thị

### 3.3 Lưu cấu hình

Sau khi thiết lập xong, bấm nút **"Cập nhật"** hoặc **"Tạo nhân viên"** để lưu. Cấu hình sẽ có hiệu lực ngay lập tức cho nhân viên đã kết nối.

---

## 4. Cơ chế Kỹ thuật

### 4.1 Luồng dữ liệu

```
Boss Machine (Electron)
  └─ DatabaseService → employee_account_access (allowed_groups, allowed_tags, exclude_blocked)
      └─ DataSyncService.filterSyncPayload()
          └─ HttpRelayService.shouldRelayZaloEventToEmployee()
              └─ Máy nhân viên chỉ nhận dữ liệu đã được lọc
```

### 4.2 Cơ sở dữ liệu

**Bảng `employee_account_access`:**

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| employee_id | TEXT | ID nhân viên |
| zalo_id | TEXT | Zalo ID được gán |
| allowed_groups | TEXT | Danh sách Group UID, cách nhau dấu phẩy |
| allowed_tags | TEXT | Danh sách Label ID, cách nhau dấu phẩy |
| exclude_blocked | INTEGER | 0 = hiện, 1 = ẩn liên hệ bị khóa |

**Bảng `contacts` (bổ sung):**

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| is_blocked | INTEGER | 0 = bình thường, 1 = Boss đã chặn |

### 4.3 Hàm kiểm tra quyền `isThreadAllowedForEmployee()`

```
Input: employeeId, zaloId, threadId
Output: true/false

Logic:
  1. Lấy access config của employee cho zaloId
  2. Lấy thông tin thread (is_group, is_blocked, labels)
  3. if is_blocked AND exclude_blocked → return FALSE (Block ưu tiên cao nhất)
  4. if is_group:
       if allowed_groups empty → return TRUE
       else → return (threadId IN allowed_groups)
  5. if is_user:
       if labels.length === 0 → return TRUE (chưa phân loại, ai cũng thấy)
       if allowed_tags empty → return TRUE
       else → return (intersection(labels, allowed_tags).length > 0)
```

---

## 5. Các câu hỏi thường gặp

**Q: Nhân viên không thấy cuộc trò chuyện nào cả?**
> Kiểm tra xem tài khoản Zalo đã được gán cho nhân viên chưa. Vào Quản lý nhân viên → Sửa → Kiểm tra ô "Tài khoản Zalo được quản lý".

**Q: Tôi muốn nhân viên thấy khách hàng mới nhưng không thấy khách cũ đã phân loại?**
> Không tích chọn thẻ nào → nhân viên sẽ thấy TẤT CẢ liên hệ kể cả chưa phân loại. Để chỉ thấy chưa phân loại, hiện tại chưa có tùy chọn đó — hãy gắn thẻ cho khách cũ và phân quyền theo thẻ.

**Q: Boss chặn một người dùng rồi, nhân viên vẫn thấy?**
> Kiểm tra xem nhân viên đó có bật "Ẩn liên hệ bị khóa" chưa. Nếu chưa bật, nhân viên vẫn thấy liên hệ bị Boss chặn.

**Q: Cấu hình phân quyền có hiệu lực ngay không?**
> Có. Sau khi Boss bấm "Cập nhật", relay server sẽ cập nhật bộ lọc ngay lập tức. Các sự kiện tin nhắn mới sẽ được lọc theo cấu hình mới. Dữ liệu cũ đã sync vẫn giữ nguyên cho đến lần sync tiếp theo.

---

*Tài liệu này được tạo tự động. Liên hệ Boss hoặc quản trị viên để được hỗ trợ thêm.*
