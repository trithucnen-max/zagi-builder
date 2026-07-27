# Database

> DatabaseService là singleton SQLite, toàn bộ schema trong 1 file ~400KB. Dùng better-sqlite3 (sync API).

## Access Pattern

```typescript
const db = DatabaseService.getInstance();

// Query nhiều rows
const rows = db.query<Contact>('SELECT * FROM contacts WHERE zalo_id = ?', [zaloId]);

// Query 1 row
const msg = db.queryOne<Message>('SELECT * FROM messages WHERE id = ?', [id]);

// Ghi
db.run('INSERT INTO messages (...) VALUES (?)', [value]);

// Switch DB path tạm thời (multi-workspace)
db.withDbPath('/path/to/other.db', () => {
  db.run('INSERT ...');
});
```

## Multi-Workspace DB

Mỗi workspace có thể có DB riêng. `WorkspaceManager.resolveDbPath(ws.dbPath)` trả về absolute path.

Boss pin DB path khi khởi động RelayService:
```typescript
EmployeeService.getInstance().pinToCurrentDb();
// → đảm bảo Boss luôn đọc/ghi đúng DB dù có workspace switch
```

## Key Tables (inferred from code)

| Table | Purpose |
|---|---|
| `messages` | Tin nhắn Zalo/Facebook. Fields: id, owner_zalo_id, thread_id, is_sent, timestamp, content |
| `threads` | Hội thoại. Fields: thread_id, owner_zalo_id, thread_type, name, avatar |
| `contacts` | CRM contacts. Fields: zalo_id, display_name, phone, salutation, labels |
| `accounts` | Zalo accounts. Fields: zalo_id, full_name, avatar_url, phone, is_business, is_active |
| `workflows` | Workflow definitions. Fields: id, name, enabled, channel, pageIds, nodes_json, edges_json |
| `workflow_run_logs` | Lịch sử chạy workflow. Fields: id, workflow_id, status, node_results_json |
| `employees` | Nhân viên. Fields: employee_id, username, display_name, role, permissions, assigned_accounts |
| `employee_sessions` | Online sessions của nhân viên (analytics) |
| `employee_actions` | Log hành động: sent, replied, session_start... |
| `erp_employee_profiles` | ERP role và extra JSON config per employee |
| `local_labels` | Nhãn local (không sync Zalo). Fields: id, name, color, emoji |
| `local_label_threads` | Map label → thread |
| `integrations` | Config tích hợp: KiotViet, GHN, Sapo... |
| `crm_campaigns` | CRM campaigns |
| `crm_campaign_contacts` | Contacts trong campaign, status gửi |
| `phone_scan_batches` | Lô quét SĐT. Fields: id, name, assigned_account_id, target_account_id, contact_assignment_mode, daily_limit, hourly_limit |
| `phone_scan_items` | Danh sách SĐT trong lô quét. Fields: id, batch_id, phone, phone_normalized, status, scanned_by_account_id |
| `workflow_checkpoints` | Persistent checkpoints cho workflow. Fields: id, workflow_id, workflow_name, triggered_by, run_id, resume_at, created_at, resume_node_id, wait_label, context_json, status, error_message |

## Supabase Cloud Tables & Affiliate Engine (v3.0.7)

| Table / View | Engine | Purpose |
|---|---|---|
| `licenses` | Supabase REST API | Quản lý bản quyền (188+ khách hàng), gán `boss_machine_id`, `plan_code`, `status`, `expires_at` |
| `plans` | Supabase REST API | Bảng giá cước động (Gói Solo 5 Năm, Team 5 Năm, Trial 14d) |
| `partner_tiers` | Supabase REST API | Cấp bậc Đại lý & Hoa hồng: `ctv` (15%), `dl` (25%), `tdl` (35%), `npp` (45%) |
| `partners` | Supabase REST API | Mã giới thiệu Đại lý (PK: SĐT), `tier_code`, `parent_phone`, `is_manual_tier` |
| `commissions` | Supabase REST API | Lịch sử hoa hồng trọn đời (F1 direct / F2 override), trạng thái `pending_payout` |
| `payout_cycles` | Supabase REST API | Lịch đối soát & thanh toán hoa hồng định kỳ vào **ngày 10 hàng tháng** |
| `view_partner_payout_summary` | Supabase SQL View | View thống kê tổng hợp tiền hoa hồng chờ thanh toán cho Admin 1-click |

Hầu hết query đều filter theo `owner_zalo_id`:
```sql
SELECT * FROM messages
WHERE owner_zalo_id = ? AND thread_id = ?
ORDER BY timestamp DESC LIMIT 50
```

## Gotchas & Storage Config (v3.0.6)

- **Config File**: `zagi-config.json` (trong `userData` directory, tự động fallback đọc `deplao-config.json` cũ nếu tồn tại).
- **SQLite DB File**: `zagi-tool.db` (tự động fallback đọc `deplao-tool.db` cũ nếu đã có dữ liệu).
- **Sync API only**: better-sqlite3 chỉ hỗ trợ sync — không dùng `await` với db calls
- **Single writer**: SQLite không hỗ trợ concurrent writes — đảm bảo không write song song từ nhiều processes
- **No migration system**: Schema thay đổi trực tiếp trong DatabaseService (không có migration files)
- **withDbPath is not thread-safe**: gọi trong serial, không concurrent
