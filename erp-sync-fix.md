# Kế hoạch triển khai: Sửa lỗi đồng bộ ERP 2 chiều & Cơ chế phòng ngừa

Tài liệu này mô tả chi tiết phương án khắc phục lỗi đứt gãy đồng bộ dữ liệu ERP chiều từ Nhân viên lên Boss và từ Boss xuống Nhân viên, đồng thời thiết lập cơ chế kiểm soát phòng ngừa lỗi tương tự trong tương lai.

## 1. Hiện trạng & Phân tích nguyên nhân gốc rễ
*   **Nguyên nhân 1 (Chiều lên Employee -> Boss)**: Khi Employee gọi các API ghi của ERP (như tạo Project, tạo Task, bình luận...), IPC Handler cục bộ chỉ thực thi trên SQLite local của Employee mà không gửi lên Boss.
*   **Nguyên nhân 2 (Chiều xuống Boss -> Employee)**: Khi Boss thực hiện cập nhật ERP, hệ thống gửi thông báo thời gian thực qua SSE (`erp:event:*`). Tuy nhiên, `HttpClientService.ts` trên máy Employee chỉ đẩy sự kiện lên UI React qua `EventBroadcaster` mà **không hề ghi các thay đổi này vào SQLite local**. Dẫn đến khi Employee tải lại trang hoặc reset ứng dụng, dữ liệu bị mất cho đến phiên đồng bộ Delta tiếp theo.

---

## 2. Giải pháp kỹ thuật đề xuất

### A. Tự động hóa Ghi dữ liệu thời gian thực từ SSE vào SQLite cục bộ (Employee)
Cấu hình hàm `persistRelayConversationEvent` trong [HttpClientService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/http/HttpClientService.ts) để ghi nhận tất cả các sự kiện `erp:event:*` vào SQLite local của Employee.

Sử dụng cơ chế phản xạ (Reflection) động thông qua `PRAGMA table_info` của SQLite để lọc lấy các trường hợp lệ từ Payload và tự động upsert vào bảng tương ứng, tránh việc phải code thủ công hàng chục câu lệnh SQL cho từng loại thực thể:
1.  **Dự án**: `erp:event:projectCreated` / `projectUpdated` (ghi vào `erp_projects`), `projectDeleted` (xóa khỏi `erp_projects`).
2.  **Tác vụ & Giao việc**: `erp:event:taskCreated` / `taskUpdated` (ghi vào `erp_tasks`, cập nhật `erp_task_assignees`, `erp_task_watchers`), `taskDeleted` (xóa khỏi `erp_tasks`).
3.  **Bình luận**: `erp:event:commentAdded` (ghi vào `erp_task_comments` và cập nhật count ở `erp_tasks`).
4.  **Lịch & Cuộc họp**: `erp:event:calendarEventCreated` / `calendarEventUpdated` (ghi vào `erp_calendar_events`, cập nhật `erp_event_attendees`), `calendarEventDeleted` (xóa).
5.  **Ghi chú**: `erp:event:noteCreated` / `noteUpdated` (ghi vào `erp_notes`, cập nhật `erp_note_shares`), `noteDeleted` (xóa).
6.  **Nhân sự (HRM)**: `erp:event:attendanceUpdated` (ghi vào `erp_attendance`), `leaveCreated` / `leaveDecided` (ghi vào `erp_leave_requests`), `departmentUpdated` (ghi vào `erp_departments`), `employeeProfileUpdated` / `employeeProfileDeleted`.

### B. Cơ chế Phòng ngừa lỗi trong tương lai (Secure-by-default)
1.  **Monkey-patching tự động ở Electron IPC**: Sử dụng cơ chế ghi đè `ipcMain.handle` hiện có trong [main.ts](file:///Users/kimtrungduong/Downloads/deplao/electron/main.ts). Mọi IPC đăng ký có tiền tố `erp:` mà không nằm trong danh sách trắng `ERP_READ_ONLY_CHANNELS` sẽ **tự động** được chuyển tiếp qua Proxy HTTP lên Boss. Điều này bảo đảm nếu lập trình viên tương lai thêm tính năng ERP mới mà quên viết Proxy, ứng dụng vẫn tự động hoạt động chính xác ở chế độ Employee.
2.  **Cảnh báo lập trình viên (Developer Warning)**: Bổ sung log cảnh báo ở `HttpClientService.ts` nếu nhận được một sự kiện `erp:event:*` chưa được cấu hình hàm ghi vào SQLite để phát hiện sớm lỗ hổng trong môi trường Dev.

---

## 3. Chi tiết thay đổi mã nguồn

### [MODIFY] [HttpClientService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/http/HttpClientService.ts)
*   **Bổ sung hàm helper `getTableColumns`**:
    ```typescript
    private getTableColumns(db: any, tableName: string): string[] {
        try {
            const rows = db.query(`PRAGMA table_info(${tableName})`);
            return rows.map((r: any) => r.name);
        } catch (err) {
            Logger.warn(`[HttpClientService] getTableColumns error for ${tableName}:`, err);
            return [];
        }
    }
    ```
*   **Bổ sung hàm helper `upsertRow`**:
    ```typescript
    private upsertRow(db: any, tableName: string, row: any): void {
        if (!row || typeof row !== 'object') return;
        const validCols = this.getTableColumns(db, tableName);
        if (validCols.length === 0) return;

        const colsToInsert = Object.keys(row).filter(key => validCols.includes(key));
        if (colsToInsert.length === 0) return;

        const colList = colsToInsert.join(', ');
        const placeholders = colsToInsert.map(() => '?').join(', ');
        const vals = colsToInsert.map(c => {
            const v = row[c];
            if (v && (typeof v === 'object' || Array.isArray(v))) {
                return JSON.stringify(v);
            }
            return v;
        });

        db.run(`INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES (${placeholders})`, vals);
    }
    ```
*   **Cập nhật `persistRelayConversationEvent`**: Xử lý toàn bộ các kênh `erp:event:*` để cập nhật cơ sở dữ liệu local khi có sự kiện thời gian thực từ Boss.

### [MODIFY] [main.ts](file:///Users/kimtrungduong/Downloads/deplao/electron/main.ts)
*   Review lại danh sách trắng `ERP_READ_ONLY_CHANNELS` để bảo đảm không bỏ sót bất kỳ truy vấn đọc nào (tất cả các truy vấn ghi phải được đưa ra ngoài danh sách này để tự động chuyển tiếp qua HTTP proxy).

---

## 4. Kịch bản xác minh (Verification Plan)

### Kiểm tra tự động
*   Chạy biên dịch TypeScript để kiểm tra lỗi cú pháp: `npm run build` hoặc `tsc --noEmit`.

### Kiểm tra thủ công (2 thiết bị hoặc 2 Workspaces song song)
1.  **Đồng bộ ERP chiều lên (Employee -> Boss)**:
    *   Sử dụng Workspace Employee tạo dự án mới "Dự án Thử nghiệm 1".
    *   Kiểm tra màn hình Boss xem dự án mới có hiển thị ngay lập tức không.
2.  **Đồng bộ ERP chiều xuống (Boss -> Employee & SQLite Persist)**:
    *   Sử dụng máy Boss chỉnh sửa tên dự án thành "Dự án Thử nghiệm 1 - Cập nhật".
    *   Kiểm tra máy Employee xem tên dự án thay đổi ngay lập tức.
    *   Tắt/Mở lại ứng dụng Employee (hoặc refresh trang) và kiểm tra xem dự án cập nhật có được giữ lại trong danh sách không (chứng minh dữ liệu đã được ghi vào SQLite local).
3.  **Đồng bộ Nhãn**:
    *   Tạo nhãn ở máy Boss, gán nhãn cho một hội thoại của nhân viên.
    *   Kiểm tra xem máy nhân viên có cập nhật nhãn tức thời và lưu trữ bền vững không.
