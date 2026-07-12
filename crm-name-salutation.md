# Kế hoạch đồng bộ khái niệm Tên & Xưng hô trong CRM

Làm rõ và tách biệt 3 khái niệm:
1. **Tên Zalo (display_name):** Tên đăng ký gốc từ tài khoản Zalo của khách hàng.
2. **Biệt danh CRM (alias):** Tên do người dùng đặt riêng trong CRM.
3. **Xưng hô (salutation):** Tự động sinh từ `gender` (Anh/Chị/Bạn) nhưng cho phép người dùng tùy chỉnh/chỉnh sửa trong CRM.

---

## Open Questions

1. **Về việc chạy Migration tự động cho liên hệ cũ:**
   Có rất nhiều liên hệ đã tồn tại trong database có `gender` nhưng trường `salutation` đang bị trống/NULL. Chúng tôi đề xuất chạy một câu lệnh SQL tự động khi khởi động app để cập nhật:
   - `gender = 0` (Nam) và `salutation IS NULL` → `salutation = 'Anh'`
   - `gender = 1` (Nữ) và `salutation IS NULL` → `salutation = 'Chị'`
   - `gender` khác và `salutation IS NULL` → `salutation = 'Bạn'`
   *Ý kiến của bạn thế nào về đề xuất chạy cập nhật tự động này?*

2. **Cách hoạt động của biến `{alias}` khi gửi tin nhắn:**
   Theo quy định mới "không có thông tin thì không hiển thị mã", nếu bạn chèn `{alias}` vào tin nhắn nhưng liên hệ đó chưa được đặt biệt danh trong CRM, tin nhắn gửi đi sẽ để trống chỗ đó thay vì tự động lấy tên Zalo (tên thông minh `{name}` vẫn tự động fallback lấy tên Zalo).
   *Điều này đã đúng với mong muốn của bạn chưa?*

3. **Cập nhật danh sách biến trong Workflow:**
   Trong Workflow đang có các biến `$item.display_name` và `$item.alias`. Chúng ta sẽ thêm biến mới `$item.zalo_name` (chỉ lấy tên Zalo gốc) và đồng bộ logic lấy biến cho tương thích hoàn toàn với hệ thống chiến dịch.
   *Bạn có cần bổ sung thêm biến nào khác cho Workflow nữa không?*

---

## Proposed Changes

### 1. Database Layer (Tự động sinh Xưng hô từ Giới tính)

#### [MODIFY] [DatabaseService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/database/DatabaseService.ts)
- Cập nhật hàm `updateContactProfile`: Khi lưu/cập nhật thông tin profile từ Zalo, nếu `gender` được gửi lên và `salutation` đang trống (`NULL` hoặc `''`), tự động cập nhật `salutation` tương ứng:
  - `gender === 0` (Nam) → `salutation = 'Anh'`
  - `gender === 1` (Nữ) → `salutation = 'Chị'`
  - `gender` khác → `salutation = 'Bạn'`
- Bổ sung một đoạn migration khởi động (startup migration) trong `initDatabase` hoặc `checkMigrations` để quét và cập nhật tự động `salutation` cho các contact cũ đã có `gender` nhưng trống `salutation`.

---

### 2. Campaign Engine (Đồng bộ xử lý biến gửi tin)

#### [MODIFY] [CRMQueueService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/crm/CRMQueueService.ts)
- Cập nhật logic substitute:
  - `{name}`: Lấy `alias || display_name` (Smart Name - Tên ưu tiên).
  - `{zalo_name}`: Chỉ lấy tên Zalo gốc (`display_name`).
  - `{alias}`: Chỉ lấy biệt danh CRM (`alias`). Nếu trống, trả về `''` (sẽ được cleanup pass xóa sạch thay vì in ra `{alias}`).
  - `{salutation}`: Lấy trường `salutation` từ DB. Fallback về `gender` greeting (`Anh`/`Chị`/`Bạn`) chỉ khi DB hoàn toàn trống.
  - `{gender_greeting}`: Map trực tiếp về `{salutation}` để giữ tương thích ngược.

---

### 3. Workflow Engine

#### [MODIFY] [WorkflowEngineService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/workflow/WorkflowEngineService.ts)
- Cập nhật hàm enrich thông tin contact (`flatTrigger`):
  - `flatTrigger.zalo_name` / `flatTrigger.zaloName`: Gán bằng tên Zalo gốc (`contactRow?.display_name || friendRow?.display_name`).
  - `flatTrigger.alias`: Chỉ lấy biệt danh CRM (`contactRow?.alias`).
  - `flatTrigger.salutation`: Ưu tiên `contactRow?.salutation`, fallback sang giới tính greeting nếu trống.

---

### 4. UI/UX Campaign & Workflow Editors

#### [MODIFY] [campaignVars.ts](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/campaigns/campaignVars.ts)
- Cập nhật danh sách biến hiển thị:
  - Sửa mô tả `{name}` thành "Tên liên hệ (Ưu tiên biệt danh CRM, nếu không có dùng tên Zalo)".
  - Sửa mô tả `{alias}` thành "Chỉ lấy biệt danh CRM (để trống nếu chưa đặt)".
  - Thêm biến `{zalo_name}`: "Tên đăng ký Zalo gốc của khách hàng".
- Cập nhật hàm `substitutePreviewCampaign` hỗ trợ preview cho `{zalo_name}`.

#### [MODIFY] [CampaignCreateModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/campaigns/CampaignCreateModal.tsx)
- Cập nhật danh sách biến gợi ý nhanh (chips) và popup: thêm biến `{zalo_name}`.

#### [MODIFY] [TemplateVarPopup.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/TemplateVarPopup.tsx)
- Bổ sung biến `$item.zalo_name` vào danh mục biến hiển thị trong Workflow.
- Cập nhật label/mô tả của `$item.display_name` và `$item.alias` cho khớp với CRM.

#### [MODIFY] [SmartInput.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/SmartInput.tsx)
- Bổ sung biến `$item.zalo_name` và đồng bộ mô tả các biến.

#### [MODIFY] [templateVars.ts](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/templateVars.ts)
- Bổ sung khai báo `$trigger.zaloName` vào hệ thống định nghĩa biến của Workflow.

---

## Verification Plan

### Automated Tests
- Chạy `npm run build` để kiểm tra TypeScript compilation và Vite build.

### Manual Verification
- **Test 1:** Sync/cập nhật thông tin khách hàng từ Zalo, kiểm tra `contacts` database xem trường `salutation` có tự động điền "Anh"/"Chị" dựa theo gender không.
- **Test 2:** Tạo chiến dịch gửi tin nhắn sử dụng `{name}`, `{zalo_name}`, `{alias}`, `{salutation}`. Kiểm tra xem:
  - Khách hàng có biệt danh: `{name}` hiển thị biệt danh, `{zalo_name}` hiển thị tên Zalo.
  - Khách hàng không có biệt danh: `{name}` hiển thị tên Zalo, `{alias}` để trống sạch sẽ.
- **Test 3:** Chạy thử Workflow test gửi tin nhắn và xem log execution để đảm bảo các biến `$item.zalo_name`, `$item.alias` được phân giải chính xác.
