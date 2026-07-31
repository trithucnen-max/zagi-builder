# csv-import-phone-scan.md — Zagi: Nhập CSV/Excel cho module Quét SĐT hàng loạt

> **Loại tài liệu:** Task plan giao cho AI coding agent.
> **Ngày lập:** 2026-07-30 · **Phiên bản Zagi hiện tại:** v3.1.0
> **Agent chính:** `backend-specialist` · **Agent phụ:** `frontend-specialist`, `security-auditor`
> **Ước lượng:** 4–5 tuần (1 dev full-time) · 7 phase P0→P6

---

## 0. ⚠️ ĐỌC TRƯỚC KHI VIẾT BẤT KỲ DÒNG CODE NÀO

Đọc theo đúng thứ tự sau, **không bỏ bước**:

| # | File | Vì sao bắt buộc |
|---|---|---|
| 1 | `AGENTS.md` | Điểm vào của dự án |
| 2 | `openwiki/patterns.md` | **QUAN TRỌNG NHẤT** — conventions, anti-patterns, known bugs. Vi phạm file này là nguyên nhân bug #1 của dự án |
| 3 | `openwiki/architecture.md` | Mô hình Boss/Nhân viên, luồng proxy |
| 4 | `openwiki/database.md` | Cách truy cập DB, gotchas của `better-sqlite3` |
| 5 | `openwiki/services.md` | Danh sách service + gotchas từng service |
| 6 | `openwiki/ipc.md` | Pattern đăng ký kép `ipcMain` + `ipcHandlerRegistry` |
| 7 | `openwiki/ui.md` | Zustand stores, theme, component map |
| 8 | `security-bugfix.md` | Tham chiếu định dạng task plan + các lỗi đã từng xảy ra (path traversal, SSRF) |

### Nguyên tắc bất di bất dịch khi thực thi kế hoạch này

1. **Tài liệu này có thể sai ở phần giả định.** Mọi chỗ đánh dấu `[CẦN XÁC NHẬN]` phải được kiểm chứng bằng cách đọc source thật ở phase **P-1**. Nếu source khác tài liệu → **DỪNG LẠI, báo cáo, chờ xác nhận**. **KHÔNG tự ý sửa spec, KHÔNG tự ý đoán.**
2. **KHÔNG tạo chuẩn dữ liệu mới.** Module này phải ghi vào **đúng** các trường và **đúng** định dạng mà Zagi đang dùng. Nếu không tìm được định dạng hiện tại → báo cáo, không tự định nghĩa.
3. **KHÔNG viết lại code đã có.** Zagi **đã có** logic import CSV cho quét SĐT (v3.0.2–v3.0.5) và đã có unit test "chuẩn hoá SĐT/CSV". Nhiệm vụ là **MỞ RỘNG**, không phải viết mới. Phase P-1 phải xác định rõ code nào tái dùng.
4. **Mọi hàm chuẩn hoá phải là pure function + có unit test** trước khi nối vào service. Không nhúng logic parse vào component React.
5. **Không bao giờ ghi đè dữ liệu gốc.** Luôn lưu `full_name_raw` và `phone_raw` nguyên bản.
6. **Không hardcode `success: true`** — đây là bug đã từng xảy ra trong dự án này (`WorkflowEngineService.ts` dòng 1751-1754). Luôn phản ánh kết quả thật.

---

## 1. NGỮ CẢNH DỰ ÁN (agent chưa biết gì về Zagi — đọc mục này)

### 1.1. Zagi là gì

Zagi là **ứng dụng desktop Electron** giúp đội bán hàng/CSKH Việt Nam vận hành **nhiều tài khoản Zalo cá nhân** tập trung, tích hợp CRM, ERP nội bộ, Workflow automation và AI. Dữ liệu **local-first**: toàn bộ tin nhắn, liên hệ, CRM nằm trong 1 file SQLite trên máy người dùng.

### 1.2. Tech stack

| Layer | Công nghệ |
|---|---|
| Runtime | Electron 41 + Node.js |
| Frontend | React 18 + TypeScript + Vite, Zustand 5, Tailwind |
| DB | SQLite qua `better-sqlite3` (**sync API**, single writer) |
| Zalo API | `zca-js` v2.1.2 (**API không chính thức**) |
| Workflow | ReactFlow 11 |
| Relay | Express + Socket.IO |
| Test | Jest + ts-jest (đã cấu hình, 11 suite đang PASS) |

### 1.3. Mô hình Boss ↔ Nhân viên (ảnh hưởng TRỰC TIẾP tới task này)

```
Máy BOSS (Sếp):
  - Giữ credential Zalo thật (cookie, IMEI)
  - Giữ file SQLite (zagi-tool.db) — SINGLE SOURCE OF TRUTH
  - Chạy HttpRelayService (Express + Socket.IO)
  - Chạy các job nền (cron, scheduler)

Máy NHÂN VIÊN:
  - THIN CLIENT — KHÔNG có SQLite cục bộ (Zero-SQLite, từ v27.2.8)
  - Mọi thao tác ghi phải PROXY về Boss
  - Upload file >2MB phải qua chunked upload (/api/media/upload-chunk)
```

**Hệ quả bắt buộc cho task này:** việc parse file + ghi DB **phải chạy trên Boss**. Nhân viên chỉ upload file và nhận kết quả preview qua proxy. Xem phase **P5**.

### 1.4. Các file/service liên quan trực tiếp

| Đường dẫn | Vai trò | Ghi chú |
|---|---|---|
| `src/services/crm/PhoneScanService.ts` (~21KB) | Service quét SĐT hàng loạt hiện tại | **Điểm nối chính** |
| `src/services/database/DatabaseService.ts` (~400KB) | Singleton SQLite, toàn bộ schema | God object — chỉ thêm, không refactor trong task này |
| `src/services/crm/CRMQueueService.ts` (~48KB) | Campaign gửi tin hàng loạt | Tham khảo pattern transaction |
| `src/services/http/HttpRelayService.ts` | HTTP server Boss | Nơi nhận file upload từ nhân viên |
| `src/services/http/HttpClientService.ts` | HTTP client nhân viên | `uploadMedia()` đã hỗ trợ chunked |
| `electron/ipc/databaseIpc.ts` (~62KB) | CRUD IPC | Nơi đăng ký IPC mới |
| `electron/ipc/zaloIpc.ts` | IPC Zalo + hàm `wrap()` | **Pattern đăng ký kép** |
| `electron/ipc/proxyHelper.ts` | `isEmployeeMode()`, `ipcHandle()` | Dùng để phân nhánh Boss/NV |
| `src/ui/components/crm/PhoneScanPanel.tsx` | UI quét SĐT hiện tại | **Điểm nối UI chính** |
| `src/ui/store/crmStore.ts` | Zustand store CRM | |
| `src/utils/WorkspaceManager.ts` | `getActiveWorkspace().type` = `local`\|`remote` | |
| `src/__tests__/` | Jest test | Đã có test chuẩn hoá SĐT/CSV — **tìm và mở rộng** |

### 1.5. Ràng buộc kỹ thuật cứng (từ `openwiki/database.md` + `patterns.md`)

| Ràng buộc | Hệ quả |
|---|---|
| `better-sqlite3` là **sync**, không dùng `await` với DB call | Không để DB query trong hot path/event handler |
| **Single writer** — không ghi song song | Import phải tuần tự hoá |
| **KHÔNG có migration system** — schema sửa trực tiếp trong `DatabaseService` | P0 phải tự dựng cơ chế migration an toàn |
| Bọc transaction cho insert loạt CRM → **nhanh gấp 50×** | Bắt buộc dùng transaction khi commit import |
| `withDbPath()` **không thread-safe** | Gọi tuần tự |
| Mọi query filter theo `owner_zalo_id` | Nhưng dedupe của task này là **toàn hệ thống** — xem mục 4.6 |

### 1.6. Giới hạn an toàn Zalo (KHÔNG được nới)

```
Quét SĐT : 100 số/ngày · 30 số/giờ  (mỗi tài khoản Zalo, sliding window)
Jitter   : 3–8 giây giữa các lần
API      : getMultiUsersByPhones — tối đa 100 số/request
Alias    : changeFriendAlias CHỈ hoạt động khi ĐÃ là bạn
```

**Hệ quả UX bắt buộc:** file 5.000 dòng với 1 tài khoản = **50 ngày**. Preview **phải** hiển thị ETA này. Xem P4.

---

## 2. MỤC TIÊU & PHẠM VI

### 2.1. Bối cảnh nghiệp vụ

Người dùng (chủ shop / trưởng phòng sale) có sẵn danh sách khách hàng trong Excel — thường xuất từ POS, form đăng ký, hoặc file quản lý tay. Họ muốn:

1. Đổ danh sách đó vào Zagi CRM,
2. Kiểm tra số nào có tài khoản Zalo để tiếp cận,
3. Không nhập trùng với khách đã có,
4. Không làm mất dữ liệu đã chăm sóc thủ công.

Hiện tại module Quét SĐT chỉ nhận **danh sách SĐT thuần**. Task này bổ sung **4 trường thông tin khách hàng** kèm bước xem trước và đối chiếu trùng.

### 2.2. Luồng 2 bước cần xây

```
BƯỚC 1 — NHẬP & XEM TRƯỚC (không ghi DB chính)
  Tải .xlsx/.csv (hoặc dán trực tiếp)
    → Ánh xạ cột (tự động + sửa tay)
    → Chuẩn hoá 4 trường: SĐT · Họ tên→real_name · Ngày sinh · Giới tính
    → Đối chiếu trùng: trong file · trong CRM (toàn hệ thống) · trong lô quét cũ
    → PREVIEW: 4 nhóm (Hợp lệ / Cảnh báo / Lỗi / Trùng), sửa inline, chọn chiến lược
    → Hiển thị ETA quét

BƯỚC 2 — QUÉT ZALO & GHI CRM
  Commit vào phone_scan_items
    → PhoneScanService quét theo lô 100 số (getMultiUsersByPhones)
    → Merge: CSV thắng → Zalo bù chỗ trống → để trống
    → Ghi contacts + sinh alias + sync changeFriendAlias (nếu đã là bạn)
```

### 2.3. Phạm vi

**TRONG phạm vi (IN SCOPE):**
- Parse `.csv` (UTF-8 có/không BOM) và `.xlsx`
- Ô dán nhanh (paste trực tiếp từ Excel)
- Ánh xạ cột tự động + sửa tay
- 4 bộ chuẩn hoá + thuật toán tách `real_name` (đã có reference implementation, mục 13)
- Bảng staging + preview + sửa inline + bulk action
- Đối chiếu 4 loại trùng + 3 chiến lược xử lý
- File mẫu tải về
- Snapshot rollback 30 ngày cho lựa chọn Ghi đè
- Hỗ trợ chạy trên cả máy Boss và máy Nhân viên

**NGOÀI phạm vi (OUT OF SCOPE — KHÔNG làm):**
- ❌ Refactor `DatabaseService.ts` hay `PhoneScanService.ts`
- ❌ Thay đổi giới hạn an toàn Zalo
- ❌ Tính năng kết bạn / gửi tin (đã có module riêng)
- ❌ Import các loại dữ liệu khác (đơn hàng, sản phẩm) — để dành phase sau
- ❌ Suy `real_name` từ Tên Zalo (đã bị loại khỏi spec theo quyết định nghiệp vụ)
- ❌ Đổi định dạng lưu `birthday` hiện có

---

## 3. PHASE P-1 — KHẢO SÁT BẮT BUỘC (làm trước tiên, có sản phẩm giao)

> Agent **KHÔNG được viết code chức năng** trước khi hoàn thành phase này và báo cáo kết quả.

### Sản phẩm giao của P-1: file `csv-import-discovery.md` trả lời đủ 8 câu hỏi

| ID | Câu hỏi cần trả lời bằng cách ĐỌC SOURCE | Nơi tìm |
|---|---|---|
| **D1** | **`birthday` đang lưu định dạng gì?** Chuỗi? timestamp? JSON `{day,month,year}`? 3 cột riêng? Xử lý thế nào khi khách chỉ có ngày/tháng, hoặc chỉ có năm, hoặc ẩn? | `DatabaseService.ts` (tìm `birthday`), hàm parse từ `getUserInfo`/`getMultiUsersByPhones`, `birthdayFilter`, biến `{birthday_day}`/`{birthday_month}` |
| **D2** | Bảng `contacts` có **chính xác** những cột nào liên quan? Có sẵn `real_name`, `alias`, `salutation`, `gender`, `birthday`, `phone`, `display_name` chưa? Kiểu dữ liệu? | `DatabaseService.ts` — phần `CREATE TABLE contacts` |
| **D3** | Đã có cột đánh dấu người dùng sửa tay chưa (`alias_manual`, `salutation_manual`, hoặc tương đương)? | `DatabaseService.ts`, `db:updateContactProfile` |
| **D4** | **Code import CSV hiện tại nằm ở đâu?** Hàm nào? Chuẩn hoá SĐT đang làm ở đâu? Có tái dùng được không? | `PhoneScanService.ts`, `src/__tests__/` (test "chuẩn hoá SĐT/CSV"), `PhoneScanPanel.tsx` |
| **D5** | Schema thật của `phone_scan_batches` và `phone_scan_items` — đủ cột chưa hay cần thêm? | `DatabaseService.ts` |
| **D6** | Thư viện đọc `.xlsx` đã có trong `package.json` chưa (SheetJS/`xlsx`, `exceljs`)? Nếu chưa, chọn cái nào? | `package.json` |
| **D7** | `getMultiUsersByPhones` được gọi ở đâu, trả về **đúng những field nào** (có `gender`? có `birthday`? tên field ra sao)? | `ZaloService.ts`, `PhoneScanService.ts` |
| **D8** | Cơ chế thêm cột/bảng mới hiện tại làm thế nào khi **không có migration system**? Có hàm `ensureColumn`/`ALTER TABLE IF NOT EXISTS` nào chưa? | `DatabaseService.ts` — hàm init/`ensureSchema` |

### VERIFY P-1
- [ ] File `csv-import-discovery.md` tồn tại, trả lời đủ D1–D8, **mỗi câu trả lời kèm đường dẫn file + số dòng**
- [ ] Nêu rõ danh sách code sẽ **TÁI DÙNG** và code sẽ **VIẾT MỚI**
- [ ] Nêu rõ mọi điểm mà tài liệu này giả định **SAI** so với source
- [ ] **Báo cáo và chờ xác nhận trước khi sang P0**

---

## 4. QUYẾT ĐỊNH THIẾT KẾ ĐÃ CHỐT (KHÔNG ĐƯỢC TỰ Ý ĐỔI)

Các quyết định dưới đây do chủ sản phẩm chốt sau 4 vòng review. Agent thực thi đúng, **không tối ưu lại theo ý mình**.

### 4.1. Trường bắt buộc / tuỳ chọn

| Cột file | Trường Zagi | Bắt buộc? |
|---|---|---|
| Số điện thoại | `phone` / `phone_normalized` | ✅ **BẮT BUỘC** — thiếu là lỗi cứng, chặn dòng |
| Họ và tên | → tách thành `real_name` | ⬜ Tuỳ chọn |
| Ngày sinh | `birthday` | ⬜ Tuỳ chọn |
| Giới tính | `gender` | ⬜ Tuỳ chọn |
| Ghi chú | `notes` | ⬜ Tuỳ chọn |

Cột tuỳ chọn có thể **trống** hoặc **không tồn tại trong file** — hệ thống vẫn phải chạy.

### 4.2. Chuẩn SĐT

```
Đích: 0985999959  (10 số, bắt đầu bằng 0)
Whitelist đầu số VN: 03x 05x 07x 08x 09x  (02x = số cố định → CẢNH BÁO VÀNG)
```

### 4.3. Chuẩn `gender`

```
0 = Nam   ·   1 = Nữ   ·   null = Chưa xác định
```

⚠️ **CẠM BẪY BẮT BUỘC XỬ LÝ:** quy ước phổ biến ngoài đời (và ISO 5218) là `1 = Nam, 2 = Nữ` — **ngược với Zagi**. Nếu cột giới tính trong file chứa **toàn số**, hệ thống **KHÔNG được tự đoán**, phải chặn ở preview và hỏi người dùng chọn quy ước. Đây là **lỗi âm thầm nguy hiểm nhất** của tính năng này.

### 4.4. Chuẩn `salutation`

```
gender = 0    → "Anh"
gender = 1    → "Chị"
gender = null → "Anh/Chị"
is_org = true → để TRỐNG (không gán Anh/Chị cho công ty)
```
Người dùng sửa tay → set cờ manual → lần sau **không ghi đè**.

### 4.5. Chuẩn `alias` (Tên gợi nhớ) — 2 chế độ theo checkbox

| Checkbox "Bắt buộc dùng công thức lô" | `alias` |
|---|---|
| ☑ Tích | `[Tên lô] - [Tên Zalo] - [SĐT]` — vd `VIN - Tùng Nguyễn - 0777778878` |
| ☐ Không tích | `[Tên Zalo]` |

Biên: Tên Zalo trống → ☑ dùng `[Tên lô] - [SĐT]` (không để `- -`) · vượt độ dài → cắt phần Tên Zalo ở giữa, giữ Tên lô + SĐT · chưa là bạn → `alias_sync_status = 'local_only'`, job nền sync lại sau.

### 4.6. Phạm vi đối chiếu trùng

```
Trùng = trùng phone_normalized trên TOÀN BỘ contacts của Boss
        (mọi owner_zalo_id, mọi workspace)
BẮT BUỘC hiển thị: đang tồn tại ở tài khoản Zalo NÀO, tên hiện tại là gì
```

### 4.7. Ba chiến lược khi trùng

| Chiến lược | Hành vi | Mặc định |
|---|---|---|
| ✏️ **Chỉ điền ô đang trống** | CRM có giá trị → giữ; ô trống → điền từ file. `notes` **nối thêm** kèm dấu thời gian, không ghi đè | ⭐ **MẶC ĐỊNH** |
| 🚫 Bỏ qua | Không đổi gì, không tính vào hạn mức quét | |
| ⚠️ Ghi đè | File thắng tất cả — **bắt buộc confirm 2 bước + snapshot rollback 30 ngày** | |

### 4.8. Ma trận merge ở bước 2

| Trường | Ưu tiên 1 | Ưu tiên 2 | Ưu tiên 3 |
|---|---|---|---|
| `real_name` | **CSV** | *(KHÔNG suy từ Tên Zalo)* | trống |
| `gender` | **CSV** | Zalo (nếu có) | `null` |
| `birthday` | **CSV** | Zalo (nếu có) | trống |
| `phone` | **CSV** | — | — |
| `display_name` | **chỉ Zalo** | — | trống |
| `alias` | hệ thống sinh (4.5) | — | — |
| `salutation` | suy từ `gender` final (4.4) | — | `Anh/Chị` |

Công thức: `final = CSV_value ?? ZALO_value ?? null` — **CSV luôn thắng, Zalo chỉ bù chỗ trống.**

---

## 5. THỨ TỰ THỰC THI

```
P-1 KHẢO SÁT  ──► BÁO CÁO + CHỜ XÁC NHẬN  (cổng chặn bắt buộc)
      │
      ▼
P0 Schema & Migration ──┬──► P1 Thư viện chuẩn hoá (pure fn + unit test)
                        │         │
                        │         ▼
                        └──► P2 Service layer (ImportService)
                                  │
                                  ▼
                            P3 IPC contracts
                                  │
                        ┌─────────┴─────────┐
                        ▼                   ▼
                  P4 UI Wizard        P5 Boss/Nhân viên
                        └─────────┬─────────┘
                                  ▼
                            P6 File mẫu
                                  ▼
                       PHASE X: Verification & Exit Gate
```

**Ghi chú:** P0 và P1 có thể làm song song (P1 là pure function, không phụ thuộc DB). P4 chỉ bắt đầu khi P3 đã có contract cố định.

---

## 6. P0 — SCHEMA & MIGRATION

### 6.1. Bối cảnh rủi ro

Zagi **không có migration system** (`openwiki/database.md`: *"Schema thay đổi trực tiếp trong DatabaseService"*). Khách hàng đang chạy production với dữ liệu thật. Thêm bảng/cột sai cách = **hỏng dữ liệu khách hàng**.

### 6.2. Việc cần làm

**B1. Dựng helper migration an toàn** (nếu D8 xác nhận chưa có):

```typescript
// Trong DatabaseService.ts — thêm 2 helper idempotent
private ensureTable(name: string, createSql: string): void
private ensureColumn(table: string, column: string, ddl: string): void
// ensureColumn: đọc PRAGMA table_info(table); nếu thiếu → ALTER TABLE ADD COLUMN
// Cả hai PHẢI idempotent — gọi nhiều lần không lỗi
```

**B2. Thêm 4 bảng mới** (tên cột cuối cùng điều chỉnh theo kết quả D1–D3):

```sql
-- Phiên import (staging — preview KHÔNG làm bẩn CRM)
CREATE TABLE IF NOT EXISTS import_sessions (
  id                      TEXT PRIMARY KEY,
  batch_id                TEXT,              -- FK phone_scan_batches (nullable tới khi commit)
  owner_zalo_id           TEXT,              -- tài khoản Zalo đang chọn
  created_by_employee_id  TEXT,
  file_name               TEXT,
  file_hash               TEXT,              -- SHA256 — cảnh báo up trùng file
  source_type             TEXT,              -- 'xlsx' | 'csv' | 'paste'
  data_source_note        TEXT,              -- NGUỒN DỮ LIỆU (tuân thủ NĐ13) — bắt buộc nhập
  total_rows              INTEGER DEFAULT 0,
  valid_rows              INTEGER DEFAULT 0,
  warn_rows               INTEGER DEFAULT 0,
  error_rows              INTEGER DEFAULT 0,
  dup_rows                INTEGER DEFAULT 0,
  column_mapping_json     TEXT,              -- {"real_name":"A","phone":"B",...}
  gender_convention       TEXT,              -- 'text' | '1=M,2=F' | '0=M,1=F' | 'ignore'
  date_order              TEXT DEFAULT 'DMY',-- 'DMY' | 'MDY'
  dup_strategy            TEXT DEFAULT 'fill_empty',  -- fill_empty | skip | overwrite
  alias_use_batch_formula INTEGER DEFAULT 0, -- checkbox mục 4.5
  batch_label             TEXT,              -- "VIN"
  status                  TEXT DEFAULT 'previewing', -- previewing|committed|cancelled|failed
  created_at              INTEGER,
  committed_at            INTEGER
);

-- Từng dòng của file
CREATE TABLE IF NOT EXISTS import_rows (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL,
  row_index          INTEGER,               -- số dòng trong file gốc (để báo lỗi)
  -- ===== NGUYÊN BẢN — KHÔNG BAO GIỜ GHI ĐÈ =====
  full_name_raw      TEXT,
  phone_raw          TEXT,
  birthday_raw       TEXT,
  gender_raw         TEXT,
  note_raw           TEXT,
  -- ===== ĐÃ CHUẨN HOÁ =====
  real_name          TEXT,
  phone_normalized   TEXT,
  birthday_value     TEXT,                  -- ĐÚNG định dạng Zagi (theo D1)
  birthday_precision TEXT,                  -- full | day_month | year_only | none
  gender             INTEGER,               -- 0 | 1 | NULL
  salutation         TEXT,
  alias_preview      TEXT,
  notes_merged       TEXT,
  -- ===== CHẤT LƯỢNG =====
  name_confidence    REAL DEFAULT 1.0,
  name_word_count    INTEGER,
  name_branch        TEXT,                  -- N1|GIVEN_NAME_ONLY|SALUTATION_TAIL|N<=3|N>=4|EMPTY
  name_alt_suggestion TEXT,
  is_org             INTEGER DEFAULT 0,
  validity           TEXT,                  -- valid | warning | error
  issues_json        TEXT,                  -- [{code,severity,message,autofixed}]
  -- ===== TRÙNG =====
  dup_type           TEXT,                  -- none|in_file|in_crm|in_scan
  dup_contact_ids_json     TEXT,
  dup_owner_accounts_json  TEXT,            -- [{zalo_id,account_name,current_display_name}]
  dup_account_count  INTEGER DEFAULT 0,
  -- ===== QUYẾT ĐỊNH NGƯỜI DÙNG =====
  user_action        TEXT,                  -- default|skip|fill_empty|overwrite
  user_edited        INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_import_rows_session ON import_rows(session_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_valid   ON import_rows(session_id, validity);
CREATE INDEX IF NOT EXISTS idx_import_rows_phone   ON import_rows(session_id, phone_normalized);

-- Học từ lần sửa tay của người dùng
CREATE TABLE IF NOT EXISTS name_split_overrides (
  full_name_normalized TEXT PRIMARY KEY,    -- lowercase, bỏ dấu, gộp space
  real_name            TEXT NOT NULL,
  hit_count            INTEGER DEFAULT 1,
  updated_at           INTEGER
);

-- Lưới an toàn cho chiến lược Ghi đè
CREATE TABLE IF NOT EXISTS import_rollback_snapshots (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  contact_id  TEXT NOT NULL,
  before_json TEXT NOT NULL,                -- toàn bộ bản ghi contact TRƯỚC khi ghi đè
  created_at  INTEGER,
  expires_at  INTEGER                       -- created_at + 30 ngày
);
CREATE INDEX IF NOT EXISTS idx_rollback_session ON import_rollback_snapshots(session_id);
```

**B3. Thêm cột vào `contacts`** (chỉ những cột D2/D3 xác nhận còn thiếu):

```sql
-- Dùng ensureColumn cho từng cột, KHÔNG viết CREATE TABLE mới
full_name_raw     TEXT      -- giữ nguyên bản Họ và tên từ file
phone_raw         TEXT      -- giữ nguyên bản SĐT từ file
field_sources_json TEXT     -- {"real_name":"csv","gender":"zalo",...}
import_session_id TEXT      -- truy vết dòng này đến từ lần import nào
alias_manual      INTEGER DEFAULT 0
salutation_manual INTEGER DEFAULT 0
alias_sync_status TEXT      -- local_only | synced | failed
```

**B4. Bảng cấu hình từ xưng hô** (cho thuật toán tách tên):

```sql
CREATE TABLE IF NOT EXISTS name_salutation_words (
  word TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1
);
-- Seed mặc định: ('anh', 1)
```

**B5. Job dọn snapshot hết hạn** — xoá `import_rollback_snapshots` có `expires_at < now`. Chạy **chỉ trên Boss** (nhân viên bị tắt timer nền theo v27.2.8).

### 6.3. VERIFY P0
- [ ] Chạy app trên **DB cũ có dữ liệu thật** (copy từ máy test) → app khởi động bình thường, không mất bảng nào
- [ ] Gọi hàm init 2 lần liên tiếp → không lỗi (idempotent)
- [ ] `PRAGMA table_info(contacts)` chứa đủ các cột mới
- [ ] 4 bảng mới tồn tại, index tồn tại
- [ ] `npm run build:electron` không lỗi TypeScript
- [ ] Rollback thử: xoá app, mở lại DB bằng SQLite CLI → dữ liệu cũ nguyên vẹn

---

## 7. P1 — THƯ VIỆN CHUẨN HOÁ (pure functions + unit test)

> **Nguyên tắc:** mọi hàm ở phase này là **pure** — không đọc DB, không gọi IPC, không side effect. Viết test TRƯỚC khi nối vào service.

Tạo thư mục mới: `src/services/crm/import/`

### 7.1. `phoneNormalizer.ts`

```typescript
export interface PhoneResult {
  normalized: string | null;   // "0985999959"
  raw: string;
  valid: boolean;
  issues: IssueCode[];         // ['EXCEL_LOST_LEADING_ZERO', ...]
  isLandline: boolean;
}
export function normalizePhone(raw: unknown): PhoneResult;
```

Bảng hành vi bắt buộc:

| Đầu vào | → | Issue | Kết quả |
|---|---|---|---|
| `"0985 999 959"` | `0985999959` | — | valid |
| `"+84985999959"` | `0985999959` | `INTL_PREFIX_CONVERTED` | valid |
| `"84985999959"` | `0985999959` | `INTL_PREFIX_CONVERTED` | valid |
| `"985999959"` | `0985999959` | `EXCEL_LOST_LEADING_ZERO` | valid ⚠️ |
| `985999959` (number) | `0985999959` | `EXCEL_LOST_LEADING_ZERO` | valid ⚠️ |
| `"0985999959.0"` | `0985999959` | `EXCEL_FLOAT_FORMAT` | valid ⚠️ |
| `9.85999959e8` | `0985999959` | `EXCEL_SCIENTIFIC_NOTATION` | valid ⚠️ |
| `"0287654321"` | `0287654321` | `LANDLINE_NUMBER` | valid ⚠️ (Zalo hầu như không có) |
| `"098599995"` | `null` | `PHONE_TOO_SHORT` | **error** |
| `"01234567890"` | `null` | `PHONE_LEGACY_PREFIX` | **error** + gợi ý đầu số mới |
| `"abc"` / trống | `null` | `PHONE_MISSING` | **error** |

⚠️ **Ba cạm bẫy Excel bắt buộc xử lý** — đây là nguyên nhân lỗi #1 khi import SĐT ở thị trường VN: Excel coi `0985999959` là số → mất số 0 / thành `.0` / thành ký hiệu khoa học. Phải đọc cell dưới dạng **raw string** trước, và **luôn hiện cảnh báo vàng** cho những gì hệ thống đã tự sửa (không silent fix).

### 7.2. `nameSplitter.ts` — thuật toán tách `real_name`

> **Đã có reference implementation Python đã kiểm thử 70/70 — xem mục 13.** Port sang TypeScript, **giữ nguyên logic và thứ tự bước**.

```typescript
export interface NameResult {
  realName: string | null;
  confidence: number;          // 0..1
  branch: 'N1'|'GIVEN_NAME_ONLY'|'SALUTATION_TAIL'|'N<=3'|'N>=4'|'EMPTY';
  altSuggestion?: string;
  isOrg: boolean;
  notesExtracted: string;      // nội dung trong () và sau dấu phân cách
  issues: IssueCode[];
  wordCount: number;
}
export function splitRealName(raw: unknown, cfg?: { salutationWords?: string[] }): NameResult;
```

**Thuật toán (thứ tự BẮT BUỘC):**

```
BƯỚC 0 — LÀM SẠCH (đúng thứ tự này)
  1. Bỏ ký tự vô hình: zero-width, NBSP (U+00A0)
  2. Trích nội dung trong ( ) [ ] → notesExtracted, rồi xoá khỏi chuỗi
  3. Bỏ emoji & ký hiệu
  4. Cắt tại dấu phân cách - | / _ , → phần sau đưa vào notesExtracted
  5. Bỏ dãy số dài ≥8 ký tự (SĐT lẫn trong tên)
  6. Gộp nhiều space, trim
  7. Bỏ xưng hô Ở ĐẦU  ← PHẢI làm TRƯỚC bước 8
        Điều kiện: (N>=3 và từ đầu ∈ LEADING_TITLES)
                hoặc (N>=2 và từ đầu ∈ {mr,mrs,ms,miss,a,c})
        Đặt cờ titleStripped = true
     ⚠️ CHỈ ở ĐẦU. Không bao giờ bỏ ở cuối — nếu không "Nguyễn Thế Anh" sẽ thành "Thế"
  8. Nhận diện tổ chức (is_org)  ← PHẢI làm SAU bước 7
     Dùng token đơn AN TOÀN: {cty,congty,tnhh,cp,shop,store,kho,ltd,jsc}
     + cụm nhiều chữ: {"cong ty","cua hang","chi nhanh","doanh nghiep","tap doan"}
     ⚠️ TUYỆT ĐỐI KHÔNG để token đơn "chi"/"co" trong danh sách
        → sẽ nhầm xưng hô "Chị"/"Cô" là tên công ty (bug đã xảy ra, xem mục 13.3)
  9. Title Case (chuẩn tiếng Việt)

BƯỚC 1 — QUY TẮC (đúng thứ tự này)
  N = số từ còn lại
  a) N == 1                                        → giữ nguyên          [N1]
  b) titleStripped && N == 2 && từ[0] ∉ SURNAMES    → lấy CẢ 2 từ  [GIVEN_NAME_ONLY]
       (vì đã bỏ xưng hô thì phần còn lại KHÔNG có họ → toàn bộ là tên gọi)
  c) từ CUỐI (bỏ dấu, lowercase) ∈ SALUTATION_WORDS → lấy 2 từ cuối [SALUTATION_TAIL]
       LUẬT CỨNG, không phụ thuộc N. Mặc định SALUTATION_WORDS = {"anh"}
       Lý do: nếu lấy 1 từ sẽ ra real_name="Anh" → template sinh "Chào Anh Anh"
       Nếu N==2 && từ[0] ∈ SURNAMES → hạ confidence 0.7 + issue SURNAME_PLUS_SALUTATION
  d) N <= 3                                        → lấy 1 từ cuối       [N<=3]
  e) N >= 4                                        → lấy 2 từ cuối       [N>=4]

BƯỚC 2 — CẢNH BÁO
  - Nếu N>=2, branch != SALUTATION_TAIL, từ CUỐI ∈ SURNAMES, từ ĐẦU ∉ SURNAMES
    → issue WESTERN_ORDER, confidence 0.4, altSuggestion = từ đầu
  - is_org → confidence 0.5, KHÔNG suy gender/salutation
```

**So khớp không dấu:** dùng `NFD` + lọc `category === 'Mn'`, **và xử lý riêng `đ`/`Đ`** (ký tự này KHÔNG nằm trong dải dấu Unicode nên không tự bỏ được).

### 7.3. `birthdayParser.ts`

```typescript
export interface BirthdayResult {
  value: string | null;        // ĐÚNG định dạng Zagi theo kết quả D1
  precision: 'full'|'day_month'|'year_only'|'none';
  valid: boolean;
  issues: IssueCode[];
}
export function parseBirthday(raw: unknown, dateOrder: 'DMY'|'MDY'): BirthdayResult;
```

| Đầu vào | precision | Issue |
|---|---|---|
| `15/03/1990`, `1990-03-15` | `full` | — |
| `15/03`, `15/3` | `day_month` | `BIRTHDAY_NO_YEAR` ⚠️ |
| `1990`, `03/1990` | `year_only` | `BIRTHDAY_YEAR_ONLY` ⚠️ |
| `32891` (Excel serial) | `full` | `EXCEL_SERIAL_DATE` ⚠️ |
| trống, `-`, `n/a` | `none` | — |
| `15/13/1990` | — | `BIRTHDAY_INVALID_MONTH` ❌ |
| `15/03/2030` | — | `BIRTHDAY_IN_FUTURE` ❌ |
| `15/03/1890` | `full` | `BIRTHDAY_TOO_OLD` ⚠️ (>120 tuổi) |
| `05/03/1990` | `full` | `DATE_ORDER_AMBIGUOUS` ⚠️ nếu cả 2 số ≤12 |

⚠️ **Cạm bẫy:** ô ngày trong `.xlsx` lưu dưới dạng **số serial** (số ngày từ 1900-01-01). Phải kiểm tra `cell.type === 'date'` hoặc chuyển đổi serial. **Ghi đúng định dạng theo D1 — KHÔNG tự định nghĩa định dạng mới.**

### 7.4. `genderParser.ts`

```typescript
export function parseGender(
  raw: unknown,
  convention: 'text'|'1=M,2=F'|'0=M,1=F'|'ignore'
): { gender: 0|1|null; issues: IssueCode[] };

export function detectGenderColumnKind(values: unknown[]): 'text'|'numeric'|'mixed'|'empty';
// Nếu trả về 'numeric' → UI PHẢI chặn và hỏi người dùng chọn quy ước
```

Ánh xạ chữ (không phân biệt hoa/thường, có/không dấu):
- → `0`: `nam`, `male`, `m`, `trai`, `ông`, `anh`, `boy`
- → `1`: `nữ`/`nu`, `female`, `f`, `gái`, `bà`, `chị`, `girl`
- → `null`: trống, `n/a`, `-`, `khác`, `không rõ`, `other`

### 7.5. `fileParser.ts`

```typescript
export function parseSheet(buffer: Buffer, kind: 'xlsx'|'csv'): RawTable;
export function parsePasted(text: string): RawTable;   // tab/comma-separated
export function autoMapColumns(header: string[]): ColumnMapping;
```

Yêu cầu:
- CSV: hỗ trợ **UTF-8 có BOM và không BOM**, tự nhận `,` `;` `\t`
- XLSX: đọc cell dạng raw để không mất định dạng số/ngày
- `autoMapColumns`: nhận nhiều biến thể tiêu đề — `Họ và tên`/`Ho ten`/`Tên`/`Full name`/`Khách hàng`; `Số điện thoại`/`SĐT`/`Phone`/`Mobile`/`DienThoai`; `Ngày sinh`/`NS`/`Birthday`/`DOB`; `Giới tính`/`GT`/`Gender`/`Sex`
- Không có header khớp → trả mapping rỗng, UI bắt người dùng chọn tay

### 7.6. VERIFY P1
- [ ] `src/services/crm/import/__tests__/` có test cho **cả 5 file**
- [ ] `nameSplitter` PASS **toàn bộ 74 case** ở mục 13.2 (bắt buộc 70/70 case có expected)
- [ ] `phoneNormalizer` PASS toàn bộ bảng 7.1 (gồm 3 cạm bẫy Excel)
- [ ] `birthdayParser` PASS toàn bộ bảng 7.3
- [ ] `genderParser`: `detectGenderColumnKind` phát hiện đúng cột toàn số
- [ ] `npm test` → **11 suite cũ vẫn PASS** + suite mới PASS
- [ ] Không file nào trong `import/` import `DatabaseService` hay `ipcRenderer`

---

## 8. P2 — SERVICE LAYER

Tạo `src/services/crm/import/ContactImportService.ts` — **singleton**, theo đúng convention Zagi (`ContactImportService.getInstance()`).

### 8.1. API công khai

```typescript
class ContactImportService {
  static getInstance(): ContactImportService;

  // Bước 1 — tạo phiên + parse + validate + dedupe (KHÔNG ghi contacts)
  createSession(input: {
    buffer?: Buffer; pastedText?: string;
    fileName?: string; sourceType: 'xlsx'|'csv'|'paste';
    ownerZaloId: string; batchLabel?: string;
    dataSourceNote: string;              // bắt buộc — tuân thủ NĐ13
  }): { sessionId: string; stats: SessionStats; header: string[]; mapping: ColumnMapping };

  // Áp lại cấu hình → re-validate toàn bộ dòng
  setConfig(sessionId: string, cfg: Partial<{
    columnMapping: ColumnMapping;
    genderConvention: GenderConvention;
    dateOrder: 'DMY'|'MDY';
    dupStrategy: 'fill_empty'|'skip'|'overwrite';
    aliasUseBatchFormula: boolean;
    batchLabel: string;
  }>): SessionStats;

  getRows(sessionId: string, opts: {
    filter?: 'all'|'valid'|'warning'|'error'|'dup';
    offset: number; limit: number;
  }): { rows: ImportRow[]; total: number };

  updateRow(sessionId: string, rowId: string, patch: Partial<ImportRow>): ImportRow;
  // Nếu patch.real_name khác giá trị thuật toán → ghi name_split_overrides

  bulkAction(sessionId: string, action:
    'skip_all_dup'|'fill_empty_all_dup'|'overwrite_all_dup'|
    'accept_all_name_suggestions'|'drop_all_errors'): SessionStats;

  exportErrors(sessionId: string): Buffer;   // .xlsx chỉ chứa dòng lỗi + cột "Lý do"

  // Bước 2 — commit
  commit(sessionId: string, opts: { batchId?: string; createNewBatch?: boolean }):
    { batchId: string; inserted: number; updated: number; skipped: number; snapshotCount: number };

  rollback(sessionId: string): { restored: number };
}
```

### 8.2. Yêu cầu thực thi bắt buộc

| # | Yêu cầu | Lý do |
|---|---|---|
| 1 | Parse & validate chạy trong **utility process**, không main thread | `better-sqlite3` sync + file 50k dòng sẽ **đóng băng UI** |
| 2 | `commit()` bọc **MỘT transaction duy nhất** | Tài liệu Zagi ghi rõ: bọc transaction cho insert loạt CRM → **nhanh gấp 50×** |
| 3 | Insert `import_rows` cũng bọc transaction, chia batch 500 dòng | Tránh giữ transaction quá lâu |
| 4 | Dedupe CRM bằng **1 query duy nhất** `WHERE phone_normalized IN (...)`, chia lô 900 giá trị | Không query từng dòng (5.000 query = treo) |
| 5 | `file_hash` = SHA256 nội dung file — nếu đã tồn tại session `committed` cùng hash → **cảnh báo** đã import file này | Chống double-import |
| 6 | `commit()` **idempotent** — gọi 2 lần chỉ ghi 1 lần (check `status`) | Người dùng bấm nút 2 lần |
| 7 | Chiến lược `overwrite` → **bắt buộc** ghi `import_rollback_snapshots` trước khi update | Lưới an toàn 30 ngày |
| 8 | `notes` khi trùng → **APPEND** kèm dấu thời gian `[Import 30/07] <nội dung>` | Ghi chú là dữ liệu không thể tái tạo |
| 9 | Ghi `field_sources_json` cho mọi trường | Truy vết nguồn từng trường (xem mục 4.8) |
| 10 | Không dùng `withDbPath()` song song | Không thread-safe |

### 8.3. Nối vào `PhoneScanService`

- `commit()` đẩy các dòng đã chọn vào `phone_scan_items` của một `phone_scan_batches`
- **Tái dùng nguyên logic quét hiện có** — giữ `daily_limit` 100, `hourly_limit` 30, jitter 3–8s, `getMultiUsersByPhones` 100 số/lần
- Sau khi quét xong 1 số → áp **ma trận merge mục 4.8** → cập nhật `contacts`
- Sinh `alias` theo mục 4.5 → gọi `changeFriendAlias` **chỉ khi đã là bạn**, ngược lại `alias_sync_status='local_only'`
- **KHÔNG tự đổi** giới hạn an toàn dù người dùng yêu cầu

### 8.4. VERIFY P2
- [ ] Import file 5.000 dòng → UI **không đóng băng**, có progress
- [ ] `commit()` 5.000 dòng hoàn tất < 10 giây (nhờ transaction)
- [ ] `commit()` 2 lần → chỉ ghi 1 lần
- [ ] Chiến lược `fill_empty`: contact có `real_name` cũ → **giữ nguyên**; `birthday` trống → được điền
- [ ] Chiến lược `overwrite` → có snapshot; `rollback()` phục hồi đúng
- [ ] `notes` được nối thêm, không mất nội dung cũ
- [ ] Up lại đúng file đã import → hiện cảnh báo trùng file

---

## 9. P3 — IPC CONTRACTS

### 9.1. Pattern bắt buộc (từ `openwiki/patterns.md`)

```typescript
// Đăng ký KÉP — nếu chỉ đăng ký ipcMain, Boss KHÔNG proxy được cho nhân viên
ipcMain.handle(channel, handler);
ipcHandlerRegistry.set(channel, handler);
// Dùng helper wrap() / ipcHandle() có sẵn trong proxyHelper.ts
```

### 9.2. Danh sách channel

| Channel | Params | Return | Ghi chú |
|---|---|---|---|
| `crm:import:downloadTemplate` | `{ format: 'xlsx' }` | `{ filePath }` | Mở save dialog |
| `crm:import:parseFile` | `{ fileBase64 \| pastedText, fileName, sourceType, ownerZaloId, batchLabel, dataSourceNote }` | `{ sessionId, stats, header, mapping, genderColumnKind }` | Nhân viên: proxy về Boss |
| `crm:import:setConfig` | `{ sessionId, ...cfg }` | `{ stats }` | Re-validate |
| `crm:import:getRows` | `{ sessionId, filter, offset, limit }` | `{ rows, total }` | Phân trang bắt buộc |
| `crm:import:updateRow` | `{ sessionId, rowId, patch }` | `{ row, stats }` | |
| `crm:import:bulkAction` | `{ sessionId, action }` | `{ stats }` | |
| `crm:import:downloadErrors` | `{ sessionId }` | `{ filePath }` | |
| `crm:import:commit` | `{ sessionId, batchId?, createNewBatch? }` | `{ batchId, inserted, updated, skipped, snapshotCount }` | |
| `crm:import:rollback` | `{ sessionId }` | `{ restored }` | Confirm 2 bước ở UI |
| `crm:import:cancelSession` | `{ sessionId }` | `{ ok }` | Xoá staging |

### 9.3. Ràng buộc
- **Không** trả toàn bộ 5.000 dòng qua IPC một lần — luôn phân trang (`limit` ≤ 200)
- Mọi return đều có `{ success: boolean, error?: string }` — **không hardcode `success: true`**
- Thêm `window.api.crm.import.*` vào `electron/preload.ts` (contextBridge). **Không dùng `window.require('electron')`** — vi phạm contextIsolation

### 9.4. VERIFY P3
- [ ] Mọi channel có trong **cả** `ipcMain` **và** `ipcHandlerRegistry`
- [ ] Gọi từ renderer qua `window.api.crm.import.*` hoạt động
- [ ] Trả lỗi mềm khi session không tồn tại (không throw làm crash renderer)

---

## 10. P4 — UI WIZARD 2 BƯỚC

### 10.1. Vị trí & file
- Nút **"📥 Nhập từ Excel/CSV"** thêm vào `src/ui/components/crm/PhoneScanPanel.tsx`
- Component mới: `src/ui/components/crm/import/ImportWizardModal.tsx` + các sub-component
- **KHÔNG thêm code vào `App.tsx`** (đã 70KB — anti-pattern đã ghi trong `patterns.md`)
- Theme: dùng `data-theme` + `useResolvedTheme()`, tuân thủ Design Standard

### 10.2. Chuẩn thiết kế (từ `docs/03-REFERENCE-IMPLEMENTATION.md.md`)
```
Primary  : Zalo Blue #0068FF   (hover #005AE0)
Secondary: Zagi Navy #0A3064
⛔ PURPLE BAN: TUYỆT ĐỐI không dùng tím/violet/magenta ở bất kỳ đâu
Nhãn local dùng tông indigo, KHÔNG dùng tím
Font: system font stack (không load Google Fonts)
Nút nguy hiểm: bg-red-600 chữ trắng
Icon: SVG phẳng stroke="currentColor", KHÔNG dùng emoji 3D nhiều màu cho nút chức năng
```

### 10.3. Bước 1 — màn Preview (thành phần bắt buộc)

```
┌─ NHẬP DANH SÁCH · BƯỚC 1/2 ──────────── Zagi_Khach_T7.xlsx ─┐
│ ① 4 thẻ thống kê: ✅ Hợp lệ · ⚠️ Cảnh báo · ❌ Lỗi · 🔁 Trùng │
│ ② Dòng ETA:  "4.801 số · 3 tài khoản → ~16 ngày"            │
│    + gợi ý "Thêm tài khoản Zalo để rút ngắn"                 │
│ ③ Ánh xạ cột: 5 dropdown, sửa được                           │
│ ④ Cảnh báo quy ước (chỉ hiện khi cần):                       │
│    ⚠️ Cột Giới tính chứa số → RADIO chọn quy ước (chặn cứng) │
│    ⚠️ Ngày đang đọc DD/MM → nút đổi sang MM/DD               │
│ ⑤ Ô nhập NGUỒN DỮ LIỆU (bắt buộc, tuân thủ NĐ13)             │
│ ⑥ Checkbox ☑ Bắt buộc dùng công thức tên lô + ô [Tên lô]     │
│ ⑦ Radio chiến lược trùng: ●Chỉ điền ô trống ○Bỏ qua ○Ghi đè │
│ ⑧ 5 tab lọc: Tất cả · Hợp lệ · Cảnh báo · Lỗi · Trùng        │
│ ⑨ Bảng ảo hoá (virtualized), sửa inline, hiện GỐC → SAU      │
│ ⑩ Bulk action bar                                            │
│ ⑪ 📥 Tải báo cáo lỗi (.xlsx)                                 │
│ ⑫ [← Chọn file khác]  [Tiếp tục quét Zalo →]                 │
└──────────────────────────────────────────────────────────────┘
```

**Cột bảng:** `Dòng · Họ tên gốc → Tên thật · SĐT gốc → SĐT chuẩn · Ngày sinh · Giới tính · Xưng hô · Trạng thái trùng · Hành động`

**Quy tắc hiển thị bắt buộc:**

| Quy tắc | Chi tiết |
|---|---|
| **Không silent fix** | Mọi thứ hệ thống tự sửa (thêm số 0, cắt `.0`, đổi serial date, lột emoji) **phải** có badge ⚠️ + tooltip giải thích |
| **Hiện cả gốc và kết quả** | `Nguyễn Văn Bình` → `Bình` hiển thị cạnh nhau, không chỉ hiện kết quả |
| **Bôi vàng khi `confidence < 0.8`** | Kèm nút 1-click áp `altSuggestion` |
| **Trùng CRM** | Hiện **tên tài khoản Zalo** đang chứa + tên hiện tại của contact. Nhiều tài khoản → badge `3 tài khoản ▾` mở rộng được |
| **Ảo hoá bảng** | 5.000+ dòng phải dùng virtual list, không render hết |
| **Chặn cứng** | Nút "Tiếp tục" **disabled** khi: cột SĐT chưa map · cột giới tính toàn số mà chưa chọn quy ước · chưa nhập nguồn dữ liệu · 0 dòng hợp lệ |

### 10.4. Bước 2 — màn Quét
- Chọn lô mới / lô có sẵn, hiển thị `daily_limit`/`hourly_limit`
- Chọn (các) tài khoản Zalo dùng để quét + **điểm sức khoẻ** nếu có
- Nút Bắt đầu → tiến độ realtime, 4 tab trạng thái (tái dùng UI hiện có)
- Kết thúc: báo cáo `% Zalo Active`, số contact tạo mới / cập nhật / bỏ qua

### 10.5. VERIFY P4
- [ ] Import file 10.000 dòng → bảng cuộn mượt (virtualized)
- [ ] Cột giới tính toàn số → **không thể** bấm Tiếp tục cho tới khi chọn quy ước
- [ ] Sửa inline `real_name` → lưu, `user_edited=1`, ghi override
- [ ] Bulk action cập nhật đúng 4 thẻ thống kê
- [ ] Dark mode + Light mode đều đúng, **không có màu tím**
- [ ] Tải báo cáo lỗi → file `.xlsx` mở được, có cột "Lý do"
- [ ] Không có thay đổi nào trong `App.tsx`

---

## 11. P5 — BOSS / NHÂN VIÊN

### 11.1. Vấn đề
Máy nhân viên là **Thin Client Zero-SQLite** — không có DB để tạo staging. Nhưng nhân viên cũng cần nhập file.

### 11.2. Giải pháp
```
Nhân viên chọn file
  → đọc thành base64 trong renderer
  → file ≤2MB : proxy 'crm:import:parseFile' kèm base64
  → file >2MB : HttpClientService.uploadMedia() (chunked 2MB có sẵn)
                → nhận bossPath → proxy 'crm:import:parseFile' kèm bossPath
  → Boss parse + tạo staging + dedupe trên DB của Boss
  → trả stats + rows (phân trang) về nhân viên
  → mọi setConfig/updateRow/commit đều proxy về Boss
```

### 11.3. Bảo mật bắt buộc (rút từ `security-bugfix.md` P0-B)

> Đã từng có lỗ hổng **path traversal** ở `/api/media/upload`: nhân viên upload `filename='../../electron/main.js'` ghi đè file hệ thống Boss.

```typescript
const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
const uploadDir = path.join(app.getPath('userData'), 'employee-imports');
const finalPath = path.join(uploadDir, safeName);
if (!finalPath.startsWith(uploadDir)) return json(res, 400, { success:false, error:'Invalid filename' });
```

Bổ sung:
- Giới hạn kích thước file (đề xuất 20MB) và số dòng (đề xuất 50.000) → vượt thì từ chối rõ ràng
- Chỉ nhận đuôi `.csv` / `.xlsx`, kiểm tra **magic bytes**, không tin phần mở rộng
- Xoá file tạm sau khi parse xong
- Job dọn snapshot & staging **chỉ chạy trên Boss** (nhân viên bị tắt timer nền — v27.2.8)
- Kiểm tra `assigned_accounts`: nhân viên chỉ import vào tài khoản Zalo được giao

### 11.4. VERIFY P5
- [ ] Import từ **máy nhân viên** thành công, dữ liệu ghi vào DB **Boss**
- [ ] File 8MB từ nhân viên → chunked upload → parse OK
- [ ] Upload `filename='../../etc/passwd'` → **lỗi 400**
- [ ] Upload `.exe` đổi tên thành `.csv` → bị từ chối (magic bytes)
- [ ] Boss offline → nhân viên nhận **lỗi mềm** rõ ràng, renderer không crash
- [ ] Nhân viên không import được vào tài khoản Zalo chưa được giao

---

## 12. P6 — FILE MẪU

Tạo `Zagi_Mau_Nhap_SDT_v3.xlsx` (sinh runtime bằng thư viện, **không** commit file binary vào repo).

**Sheet 1 `DANH_SACH`** — header + 5 dòng mẫu:

| Họ và tên | Số điện thoại | Ngày sinh | Giới tính | Ghi chú |
|---|---|---|---|---|
| Nguyễn Văn Bình | 0985999959 | 15/03/1990 | Nam | Khách VIP quận 7 |
| Trần Thị Hồng Nhung | 0906111222 | 20/11 | Nữ | |
| Nguyễn Thế Anh | 0988777666 | 1992 | Nam | |
| Nam Phong | 0912345678 | | | |
| Minh | 0977123456 | | Nam | |

Yêu cầu kỹ thuật:
- Cột `Số điện thoại` định dạng **Text** để Excel không mất số 0
- Cột `Giới tính` có **Data Validation dropdown** `Nam` / `Nữ`
- Freeze dòng header

**Sheet 2 `HUONG_DAN`** (khoá sửa) — ghi rõ:
- Chỉ `Số điện thoại` bắt buộc; các cột khác có thể trống hoặc không tồn tại
- Ngày sinh nhận `15/03/1990` · `15/03` · `1990` — **không bắt buộc đủ**
- Giới tính **gõ chữ** `Nam`/`Nữ`, đừng dùng số
- **Bảng quy tắc tách Tên thật** kèm 6 ví dụ:

| Họ và tên | → Tên thật |
|---|---|
| Nguyễn Văn Bình | Bình |
| Lê Minh Quân | Quân |
| Nam Phong | Phong |
| Minh | Minh |
| Trần Thị Hồng Nhung | Hồng Nhung |
| Nguyễn Thế Anh | Thế Anh |

Giải thích 1 câu: *"Lấy 1 từ cuối. Tên từ 4 chữ trở lên lấy 2 từ cuối. Tên kết thúc bằng 'Anh' lấy 2 từ cuối."*

### VERIFY P6
- [ ] File tải về mở được bằng Excel + Google Sheets + LibreOffice
- [ ] Nhập `0985999959` vào cột SĐT → **không mất số 0**
- [ ] Dropdown Giới tính hoạt động
- [ ] Import lại chính file mẫu → 5/5 dòng hợp lệ, tên tách đúng bảng trên

---

## 13. PHỤ LỤC — REFERENCE IMPLEMENTATION & TEST FIXTURE

### 13.1. Trạng thái
Thuật toán tách tên **đã được hiện thực và kiểm thử bằng Python: 70/70 case PASS (100%)**. Agent **port sang TypeScript**, giữ nguyên logic + thứ tự bước, và **phải PASS toàn bộ fixture 13.2**.

### 13.2. Test fixture — 74 case (dùng làm `nameSplitter.test.ts`)

```
// ===== 9 ví dụ nghiệp vụ gốc (BẮT BUỘC PASS) =====
"Nguyen Van Binh"            -> "Binh"
"Nguyễn Văn Bình"            -> "Bình"
"Nam Phong"                  -> "Phong"
"Minh"                       -> "Minh"
"Trần Thị Hồng Nhung"        -> "Hồng Nhung"
"Nguyễn Thị Mai Anh"         -> "Mai Anh"
"Nguyễn Thế Anh"             -> "Thế Anh"
"Lê Minh Quân"               -> "Quân"
"Phạm Ngọc Hà"               -> "Hà"

// ===== LUẬT CỨNG: từ cuối là "Anh" -> 2 từ (15 case) =====
"Anh"->"Anh"  "Hoàng Anh"->"Hoàng Anh"(conf .7)  "Ngọc Anh"->"Ngọc Anh"
"Nguyễn Anh"->"Nguyễn Anh"(conf .7)  "Trần Thị Anh"->"Thị Anh"
"Lê Văn Anh"->"Văn Anh"  "Nguyễn Thị Ngọc Anh"->"Ngọc Anh"
"Phạm Hoàng Việt Anh"->"Việt Anh"  "Nguyễn Văn Hoàng Tuấn Anh"->"Tuấn Anh"
"Nguyen The Anh"->"The Anh"  "NGUYỄN THẾ ANH"->"Thế Anh"
"Đỗ Quỳnh Anh"->"Quỳnh Anh"  "Vũ Tuấn Anh"->"Tuấn Anh"
"Bùi Lan Anh"->"Lan Anh"  "Mai Phương Anh"->"Phương Anh"

// ===== N<=3 -> 1 từ cuối (10 case) =====
"Trần Thị Hoa"->"Hoa"  "Đỗ Đức Duy"->"Duy"  "Nguyễn Đình Tùng"->"Tùng"
"Lê Hữu Phước"->"Phước"  "Phan Xuân Mạnh"->"Mạnh"
"Tôn Thất Thuyết"->"Thuyết"   // họ kép — quy tắc đếm từ tự xử lý, KHÔNG cần từ điển họ kép
"Hồ Ngọc Hà"->"Hà"  "Vũ Thị Lan"->"Lan"  "Ngô Bảo Châu"->"Châu"
"Dương Tử Quỳnh"->"Quỳnh"

// ===== N>=4 -> 2 từ cuối (8 case) =====
"Nguyễn Văn Hoàng Long"->"Hoàng Long"   "Nguyễn Phúc Ánh Tuyết"->"Ánh Tuyết"
"Trần Lê Minh Khôi"->"Minh Khôi"        "Nguyễn Thị Thanh Thảo"->"Thanh Thảo"
"Lê Hoàng Bảo Ngọc"->"Bảo Ngọc"         "Phạm Thị Kim Chi"->"Kim Chi"
"Nguyễn Văn Thành Đạt"->"Thành Đạt"     "Trần Nguyễn Thu Hằng"->"Thu Hằng"

// ===== Làm sạch (5 case) =====
"nguyễn văn bình"->"Bình"  "NGUYỄN THỊ HỒNG NHUNG"->"Hồng Nhung"
"Nguyễn  Văn   Bình"->"Bình"  "  Nam Phong  "->"Phong"
"nguyen thi hong nhung"->"Hong Nhung"

// ===== Xưng hô ở đầu (7 case) =====
"A Bình"->"Bình"  "C Nhung"->"Nhung"
"Chị Hồng Nhung"->"Hồng Nhung"    // ★ nhánh GIVEN_NAME_ONLY
"Anh Nguyễn Văn Bình"->"Bình"  "Mr. Bình"->"Bình"  "Ms Nhung"->"Nhung"
"Cô Trần Thị Hoa"->"Hoa"

// ===== Ngoặc / phân cách / SĐT lẫn trong tên (6 case) =====
"Nguyễn Văn Bình (Anh Bình Bảo Hiểm)"->"Bình"   // "(...)" -> notes
"Bình - Kho Q7"->"Bình"  "Nhung | Sale"->"Nhung"  "Hoa / Ketoan"->"Hoa"
"Nguyễn Văn Bình 0985999959"->"Bình"  "Trần Thị Hoa (Hoa Kế toán)"->"Hoa"

// ===== Emoji (3 case) =====
"Bình ❤️🌸"->"Bình"  "Nguyễn Thế Anh ✨"->"Thế Anh"  "Hồng Nhung 🔥🔥"->"Nhung"

// ===== Tổ chức (3 case) =====
"Cty TNHH Minh Phát"->"Minh Phát"(is_org)  "Shop Mỹ Phẩm Hà Anh"->"Hà Anh"(is_org)
"Kho Q7"-> is_org=true

// ===== Thứ tự Tây -> cảnh báo conf 0.4 (3 case) =====
"Bình Nguyễn"->"Nguyễn"  "Trang Le"->"Le"  "Nhung Tran"->"Tran"

// ===== Biên (5 case) =====
""->null  "   "->null  null->null
"Bình Bình"->"Bình"  "Nguyễn Văn Bình Bình"->"Bình Bình"
```

**Kết quả mong đợi:** 8/74 dòng có `confidence < 0.8` (2× SURNAME_PLUS_SALUTATION, 3× ORGANIZATION, 3× WESTERN_ORDER) ≈ **11% dòng cần người xem** — phần còn lại chạy im lặng.

### 13.3. ⚠️ Hai bug đã phát hiện khi kiểm thử — KHÔNG được tái tạo

| Bug | Biểu hiện | Nguyên nhân | Cách tránh |
|---|---|---|---|
| **B1** | `Chị Hồng Nhung` bị gắn cờ 🏢 tổ chức; `Cô Trần Thị Hoa` cũng vậy | Token đơn `"chi"`, `"co"` (để bắt *"chi nhánh"*, *"công ty"*) **trùng** với xưng hô `Chị`, `Cô` | Tách `ORG_TOKENS` (token đơn an toàn) và `ORG_PHRASES` (cụm nhiều chữ). **Bỏ xưng hô TRƯỚC khi kiểm tra tổ chức** |
| **B2** | `Chị Hồng Nhung` → `Nhung` (sai, phải là `Hồng Nhung`) | Sau khi bỏ xưng hô, phần còn lại **không có họ** → quy tắc đếm từ sai tiền đề | Thêm nhánh `GIVEN_NAME_ONLY` (mục 7.2 bước 1b) |

> Cả hai bug đều **không báo lỗi, chỉ cho kết quả sai** — không thể phát hiện bằng đọc code, chỉ phát hiện được bằng chạy test. Đây là lý do fixture 13.2 là bắt buộc.

---

## 14. PHASE X — VERIFICATION & EXIT GATE

### 14.1. Build & test
```bash
npm install --legacy-peer-deps
npm test                    # 11 suite cũ PASS + suite mới PASS
npm run build:electron      # KHÔNG có lỗi TypeScript
```

### 14.2. Manual test checklist (chạy trên cả máy Boss và máy Nhân viên)

**Nhóm A — Nhập & chuẩn hoá**
- [ ] Import `.xlsx` 5 dòng mẫu → 5/5 hợp lệ, tên tách đúng
- [ ] Import `.csv` UTF-8 **có BOM** → tiếng Việt không lỗi font
- [ ] Import `.csv` **không BOM** → tiếng Việt không lỗi font
- [ ] Dán trực tiếp 1 cột SĐT từ Excel → chạy được
- [ ] File thiếu cột Ngày sinh & Giới tính hoàn toàn → vẫn import được
- [ ] File **không có** cột SĐT → báo lỗi rõ ràng, không cho tiếp tục

**Nhóm B — Cạm bẫy Excel**
- [ ] SĐT bị Excel làm mất số 0 (`985999959`) → tự sửa + **có badge cảnh báo**
- [ ] SĐT dạng `9.86E+08` → tự sửa + badge
- [ ] Ngày sinh dạng số serial `32891` → tự sửa + badge
- [ ] Không có "silent fix" nào — mọi thay đổi đều có badge

**Nhóm C — Giới tính (cạm bẫy nghiêm trọng)**
- [ ] Cột giới tính chữ `Nam`/`Nữ` → map đúng `0`/`1`
- [ ] Cột giới tính **toàn số** → hiện radio chọn quy ước, **chặn** nút Tiếp tục
- [ ] Chọn `1=Nam,2=Nữ` → `1` map thành `gender=0`
- [ ] Giới tính trống → `gender=null` → `salutation="Anh/Chị"`

**Nhóm D — Tách tên**
- [ ] 6 ví dụ trong sheet HƯỚNG DẪN đều ra đúng
- [ ] `Nguyễn Thế Anh` → `Thế Anh` (không bao giờ ra `real_name="Anh"`)
- [ ] `Bình Nguyễn` → bôi vàng + gợi ý `Bình`
- [ ] Sửa tay `Lê Minh Quân` → `Quân`, import lần 2 tự áp dụng override

**Nhóm E — Trùng**
- [ ] SĐT đã có ở tài khoản A → hiện **tên tài khoản A** + tên contact hiện tại
- [ ] SĐT có ở 3 tài khoản → badge `3 tài khoản`, mở rộng xem được
- [ ] `fill_empty`: `real_name` cũ **giữ nguyên**, `birthday` trống được điền
- [ ] `overwrite`: có confirm 2 bước, có snapshot, `rollback()` phục hồi đúng
- [ ] `notes` được **nối thêm** kèm dấu thời gian, không mất nội dung cũ
- [ ] SĐT trùng trong chính file → gộp, thông báo rõ
- [ ] SĐT đã quét ở lô cũ và không có Zalo → mặc định bỏ qua

**Nhóm F — Quét & merge**
- [ ] Quét tôn trọng 100/ngày · 30/giờ · jitter 3–8s
- [ ] Dùng `getMultiUsersByPhones` theo lô 100
- [ ] CSV có giới tính + Zalo cũng có → **CSV thắng**
- [ ] CSV không có giới tính + Zalo có → **Zalo bù vào**
- [ ] Cả hai không có → `null` → `salutation="Anh/Chị"`
- [ ] ☑ công thức lô → `alias = "VIN - Tùng Nguyễn - 0777778878"`
- [ ] ☐ không tích → `alias = "Tùng Nguyễn"`
- [ ] Chưa là bạn → `alias_sync_status='local_only'`, không crash

**Nhóm G — Hiệu năng & quy mô**
- [ ] File 10.000 dòng: parse < 30s, UI không đóng băng, bảng cuộn mượt
- [ ] `commit()` 5.000 dòng < 10s
- [ ] ETA hiển thị đúng theo số tài khoản khả dụng
- [ ] File 60.000 dòng → từ chối với thông báo rõ ràng (không treo)

**Nhóm H — Bảo mật (Boss/Nhân viên)**
- [ ] Import từ máy nhân viên → ghi vào DB Boss
- [ ] File 8MB từ nhân viên → chunked upload OK
- [ ] `filename='../../etc/passwd'` → lỗi 400
- [ ] `.exe` đổi tên `.csv` → từ chối (magic bytes)
- [ ] Boss offline → lỗi mềm, renderer không crash
- [ ] Nhân viên không import được vào tài khoản chưa được giao

**Nhóm I — Dữ liệu & tuân thủ**
- [ ] Không nhập được khi chưa khai **Nguồn dữ liệu**
- [ ] `full_name_raw`, `phone_raw` được lưu nguyên bản
- [ ] `field_sources_json` ghi đúng nguồn từng trường
- [ ] Mở DB cũ có dữ liệu thật → không mất bản ghi nào

**Nhóm J — UI**
- [ ] Dark + Light mode đều đúng
- [ ] **Không có màu tím ở bất kỳ đâu** (Purple Ban)
- [ ] `App.tsx` **không bị sửa**
- [ ] Tải báo cáo lỗi ra `.xlsx` có cột "Lý do"

### 14.3. Security scan
```bash
python .agents/skills/vulnerability-scanner/scripts/security_scan.py \
  src/services/crm/import/ src/services/http/
grep -rn "catch {}" src/services/crm/import/     # phải = 0 kết quả
grep -rn "success: true" src/services/crm/import/ # kiểm tra không hardcode
```

### 14.4. EXIT GATE
```
[ ] P-1 discovery đã báo cáo và được xác nhận
[ ] npm test         → toàn bộ suite PASS (cũ + mới)
[ ] npm run build:electron → 0 lỗi
[ ] nameSplitter     → 70/70 fixture PASS
[ ] Toàn bộ checklist nhóm A–J đã tick
[ ] Path traversal + magic bytes test → bị block
[ ] Mở DB production copy → không mất dữ liệu
[ ] Không sửa App.tsx, không refactor DatabaseService/PhoneScanService
```

---

## 15. ⛔ ANTI-PATTERNS — TUYỆT ĐỐI KHÔNG LÀM

| ❌ Không làm | Vì sao |
|---|---|
| Đăng ký IPC chỉ vào `ipcMain` | Boss sẽ không proxy được cho nhân viên |
| Hardcode `success: true` | Bug đã từng xảy ra trong dự án này |
| `catch {}` rỗng | Lỗi bị nuốt ngầm — đã có tiền lệ ở `HttpRelayService` |
| Ghi song song vào SQLite | `better-sqlite3` single writer → race condition |
| Đọc đường dẫn file của nhân viên trên Boss | Path của nhân viên không tồn tại trên Boss |
| `window.require('electron')` trong renderer | Vi phạm contextIsolation, rủi ro bảo mật dữ liệu khách |
| `useState` làm guard cho async submit | Dùng `useRef` (pattern đã ghi trong `patterns.md`) |
| Thêm code vào `App.tsx` | Đã 70KB — tách component riêng |
| Refactor `DatabaseService`/`PhoneScanService` | Ngoài phạm vi, rủi ro cao |
| Nới giới hạn 100/ngày · 30/giờ | Bảo vệ tài khoản Zalo khách hàng |
| Tự định nghĩa định dạng `birthday` mới | Sẽ hỏng `birthdayFilter` và workflow chúc sinh nhật |
| Suy `real_name` từ Tên Zalo | Đã bị loại khỏi spec theo quyết định nghiệp vụ |
| Tự đoán quy ước giới tính khi cột toàn số | Lỗi âm thầm nguy hiểm nhất của tính năng |
| Ghi đè `notes` khi trùng | Ghi chú là dữ liệu không thể tái tạo — phải APPEND |
| Xoá/ghi đè `full_name_raw`, `phone_raw` | Mất khả năng tái xử lý khi nâng thuật toán |
| Dùng màu tím ở UI | Purple Ban — quy định thương hiệu Zagi |
| Commit file `.xlsx` binary vào repo | Sinh runtime bằng thư viện |

---

## 16. GHI CHÚ CHO NGƯỜI GIAO VIỆC

**Cách dùng file này:**
1. Đặt file vào **thư mục gốc repo** với tên `csv-import-phone-scan.md` (đúng nơi các task plan khác của Zagi đang nằm: `security-bugfix.md`, `crm-name-salutation.md`, `scan-setup-auto-account.md`…)
2. Giao agent bằng prompt: *"Đọc `AGENTS.md` và `openwiki/patterns.md`, sau đó thực thi `csv-import-phone-scan.md`. Bắt đầu từ phase P-1 và DỪNG LẠI báo cáo sau khi xong P-1."*
3. **Duyệt kết quả P-1 trước khi cho chạy tiếp** — vì 2 giả định `[CẦN XÁC NHẬN]` (định dạng `birthday`, các cột `contacts`) có thể làm đổi thiết kế P0.

**Hai điểm mở chủ sản phẩm cần quyết:**
1. `SALUTATION_WORDS` = `{ Anh }` hay thêm `{ Em }`? (mặc định đang là `{ Anh }`)
2. Quy mô import thực tế mỗi lần — 500 / 5.000 / 50.000 dòng? Quyết định có cần streaming parser + job nền hay không.

**Bàn giao kèm:** file `zagi_name_split_v3.py` — reference implementation đã kiểm thử 70/70, dùng để port sang TypeScript và đối chiếu kết quả.
