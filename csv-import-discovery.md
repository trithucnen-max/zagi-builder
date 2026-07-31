# csv-import-discovery.md — Phase P-1 Discovery Report

> **Ngày:** 2026-07-31 · **Agent:** backend-specialist
> **Trạng thái:** Chờ xác nhận trước khi sang P0

---

## ✅ D1 — Định dạng lưu `birthday`

**Kết luận: Chuỗi TEXT dạng `DD/MM/YYYY`, `DD/MM`, hoặc `YYYY`. Không dùng timestamp, không dùng JSON.**

| Nguồn | Dòng | Nội dung |
|---|---|---|
| `DatabaseService.ts:2122` | `ALTER TABLE contacts ADD COLUMN birthday TEXT DEFAULT NULL` | Kiểu TEXT |
| `DatabaseService.ts:3576` | `b.replace(/[\.-]/g, '/')` | Normalise `.` và `-` thành `/` khi ghi |
| `DatabaseService.ts:6577` | `split('/') → parts[0]=day, parts[1]=month, parts[2]=year` | Cấu trúc DD/MM/YYYY |
| `CRMQueueService.ts:390–394` | `parts[0]=day, parts[1]=month` | Template `{birthday_day}/{birthday_month}` |

**Xử lý thiếu:**
- Chỉ `DD/MM`: lưu `DD/MM` — filter today/this_week/this_month vẫn đọc được
- Chỉ năm: lưu `YYYY` — filter `year_` đọc `parts[2]`, các filter ngày/tháng bỏ qua (parts.length < 2)
- null/rỗng: `has_birthday`/`no_birthday` xử lý đúng

**Hệ quả P1:** `birthdayParser.ts` xuất ra:
- `"15/03/1990"` → precision=full
- `"15/03"` → precision=day_month
- `"1990"` → precision=year_only (lưu thẳng "1990")
- null → precision=none

---

## ✅ D2 — Cột thực tế của bảng `contacts`

**Cột CREATE TABLE gốc** (`DatabaseService.ts:572–587`):
- `id` INTEGER PK AUTOINCREMENT
- `owner_zalo_id` TEXT NOT NULL
- `contact_id` TEXT NOT NULL (Zalo UID)
- `display_name` TEXT DEFAULT ''
- `avatar_url` TEXT DEFAULT ''
- `phone` TEXT DEFAULT ''
- `is_friend` INTEGER DEFAULT 0
- `contact_type` TEXT DEFAULT 'user'
- `unread_count` INTEGER DEFAULT 0
- `last_message` TEXT DEFAULT ''
- `last_message_time` INTEGER DEFAULT 0
- `pipeline_stage_id` INTEGER DEFAULT NULL
- `ai_profile` TEXT DEFAULT NULL
- UNIQUE(`owner_zalo_id`, `contact_id`)

**Cột đã bổ sung qua migration (đang có trên production):**
- `is_muted` INTEGER (dòng 2097)
- `mute_until` INTEGER (dòng 2102)
- `is_in_others` INTEGER (dòng 2107)
- `alias` TEXT (dòng 2112)
- `gender` INTEGER (dòng 2117)
- `birthday` TEXT (dòng 2122)
- `extra_data` TEXT (dòng 2132)
- `fb_linked_id` TEXT (dòng 2137)
- `salutation` TEXT (dòng 2142)
- `ai_assistant_id` TEXT (dòng 2147)
- `is_blocked` INTEGER (dòng 1224)
- `channel` TEXT (dòng 1703)

**Cột CHƯA CÓ — phải thêm qua P0:**
- `real_name` TEXT
- `phone_raw` TEXT
- `full_name_raw` TEXT
- `field_sources_json` TEXT
- `import_session_id` TEXT
- `alias_manual` INTEGER DEFAULT 0
- `salutation_manual` INTEGER DEFAULT 0
- `alias_sync_status` TEXT

---

## ✅ D3 — Cờ đánh dấu sửa tay (`alias_manual`, `salutation_manual`)

**CHƯA CÓ** bất kỳ cột `*_manual` nào trong `DatabaseService.ts`, `patchContactFields` (dòng 3555–3588), hay `updateContactProfile` (dòng 3341–3393).

→ P0 cần thêm `alias_manual INTEGER DEFAULT 0` và `salutation_manual INTEGER DEFAULT 0` vào `contacts`.

---

## ✅ D4 — Code import CSV hiện tại ở đâu

**Vị trí:** `src/ui/components/crm/contacts/CRMImportModal.tsx` (873 dòng)

| Hàm | Dòng | Tái dùng? |
|---|---|---|
| `parseCSV(text)` | 52–68 | ⚠️ Tham khảo — không tái dùng trực tiếp (là UI component, không phải pure function, chỉ hỗ trợ format cũ fbName/fbLink/gender) |
| `isValidPhone(p)` | 47–49 | ❌ Thay bằng `isValidVietnamPhone` |

**Chuẩn hoá SĐT:**
- `src/ui/utils/phoneUtils.ts` → `normalizePhone()`, `isValidVietnamPhone()` (dòng 14, 42) — Pure function, ĐÃ TEST
- `DatabaseService.ts:509` → `normalizeVietnamPhone()` (private) — không import được

**Thiếu so với yêu cầu mới:**
- Không xử lý `985999959.0` (Excel float)
- Không xử lý `9.86E+08` (scientific notation)
- Không xử lý number input (non-string)

**Tests đã có:** `src/__tests__/import.test.ts` + `src/__tests__/phoneUtils.test.ts` — 21 suite, PASS.

---

## ✅ D5 — Schema `phone_scan_batches` và `phone_scan_items`

**`phone_scan_batches`** (`DatabaseService.ts:1132`, migrations đến 1218):
- id, name, assigned_account_id, target_account_id
- `contact_assignment_mode` TEXT DEFAULT 'distributed' (distributed|single|all_accounts)
- auto_tag_ids JSON, daily_limit=100, hourly_limit=30, priority, status
- total_count, scanned_count, found_count, not_found_count, error_count, duplicate_count
- scheduled_time, skip_crm_existing, auto_workflow_id, update_zalo_alias, sort_order

**`phone_scan_items`** (`DatabaseService.ts:1155`):
- id, batch_id (FK cascade), phone, phone_normalized
- status (pending|found|not_found|error)
- zalo_uid, zalo_name, zalo_avatar, error_msg
- scanned_by_account_id, scanned_at, created_at

**`phone_scan_items` KHÔNG CÓ** `real_name`, `gender`, `birthday`, `notes` — đúng theo thiết kế: staging là `import_rows`, không phải `phone_scan_items`.

---

## ✅ D6 — Thư viện đọc `.xlsx`

**`xlsx` (SheetJS) `^0.18.5` ĐÃ CÓ** trong `package.json:64`.

Không cần cài thêm package. Dùng `xlsx.read(buffer, { type: 'buffer', raw: true })` để lấy raw cell values.

---

## ✅ D7 — `getMultiUsersByPhones` trả về những field nào

**Cách gọi** (`PhoneScanService.ts:293–305`):
```typescript
const res: any = await zaloService.getMultiUsersByPhones([phoneNormalized]);
const mapObj = res?.data ?? res?.response ?? res;
// mapObj = { "0985999999": userRaw, ... }
```

**`extractZaloUser` trích xuất** (dòng 282–290):
- `uid`: `u.uid || u.userId || u.uId || u.id`
- `name`: `u.displayName || u.display_name || u.zaloName || u.zalo_name || u.name || u.dpName`
- `avatar`: `u.avatar || u.avatarUrl || u.avatar_url`

**⚠️ QUAN TRỌNG:** `gender` và `birthday` KHÔNG được lấy từ `getMultiUsersByPhones` trong code hiện tại. Chỉ lấy uid/name/avatar. Type `GetMultiUsersByPhonesResponse` import từ `zca-js` (dòng 70).

---

## ✅ D8 — Cơ chế thêm cột/bảng khi không có migration system

**Pattern chuẩn** (`DatabaseService.ts:2093–2168`):
```typescript
try {
    const contactCols = this.query<any>(`PRAGMA table_info(contacts)`);
    const names = contactCols.map((c: any) => c.name);
    if (!names.includes('alias')) {
        db!.exec(`ALTER TABLE contacts ADD COLUMN alias TEXT DEFAULT ''`);
    }
} catch (err: any) {
    Logger.warn(`...`);
}
```

- Idempotent: kiểm tra `names.includes()` trước ALTER TABLE
- `CREATE TABLE IF NOT EXISTS`: idempotent sẵn
- Tất cả migration chạy trong `init()` mỗi lần app khởi động
- **Không có** `ensureColumn`/`ensureTable` helper tập trung

→ P0 thêm migration blocks cuối `init()`, tạo helper private `ensureColumn()` trong DatabaseService.

---

## 📋 Code TÁI DÙNG vs VIẾT MỚI

### Tái dùng (không sửa):
| File | Hàm |
|---|---|
| `src/ui/utils/phoneUtils.ts` | `normalizePhone()`, `isValidVietnamPhone()` |
| `PhoneScanService.ts` | Toàn bộ logic quét (tick/scanItem) |
| `electron/ipc/zaloIpc.ts` | `wrap('zalo:getMultiUsersByPhones', ...)` |

### Viết mới:
| File | Loại |
|---|---|
| `src/services/crm/import/phoneNormalizer.ts` | Pure function |
| `src/services/crm/import/nameSplitter.ts` | Pure function (74 fixture) |
| `src/services/crm/import/birthdayParser.ts` | Pure function |
| `src/services/crm/import/genderParser.ts` | Pure function |
| `src/services/crm/import/fileParser.ts` | Pure function (dùng `xlsx` có sẵn) |
| `src/services/crm/import/ContactImportService.ts` | Singleton service |
| `src/services/crm/import/__tests__/*.test.ts` | Unit tests |
| `electron/ipc/importIpc.ts` | IPC handler mới (wrap pattern) |
| `src/ui/components/crm/import/ImportWizardModal.tsx` | UI Wizard 2 bước |
| Migration trong `DatabaseService.ts` | +4 bảng +7 cột contacts |

---

## ⚠️ Điểm KHÁC so với source

| # | Giả định spec | Thực tế | Ảnh hưởng |
|---|---|---|---|
| **KHÁC-1** | "Tái dùng code import CSV hiện có" | `CRMImportModal.tsx::parseCSV` là UI component, không phải pure function, format cũ (fbName/fbLink) — không tái dùng trực tiếp | P1 viết mới `fileParser.ts`, tham khảo logic cũ |
| **KHÁC-2** | Ma trận merge: "Zalo bù `gender`/`birthday`" | `getMultiUsersByPhones` không trả `gender`/`birthday` | Thực tế `gender`/`birthday` chỉ đến từ CSV |

---

## 🔴 Câu hỏi cần xác nhận trước khi sang P0

**Q1 — gender/birthday từ Zalo:**
`getMultiUsersByPhones` không trả `gender`/`birthday`. Có chấp nhận: với module này, 2 trường này **chỉ từ CSV**, không bù từ Zalo?
→ **Đề xuất:** Có, chỉ từ CSV. Tránh phụ thuộc API không chính thức.

**Q2 — SALUTATION_WORDS:**
`{ "anh" }` hay thêm `{ "em" }`?
→ **Đề xuất:** Chỉ `{ "anh" }` — thêm "em" sẽ sai tên như "Bùi Thanh Em".

**Q3 — Quy mô import:**
500 / 5.000 / 50.000 dòng? Ảnh hưởng đến việc cần utility process không?
→ **Đề xuất:** Target 5.000, dùng utility process để tránh đóng băng UI.

---

**DỪNG — Chờ xác nhận Q1, Q2, Q3 trước khi bắt đầu P0.**
