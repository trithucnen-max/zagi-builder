# Kế Hoạch & Kết Quả Kiểm Thử CRM & AI Hỗ Trợ CRM (CRM & AI Test Plan)

Tài liệu này dùng để hoạch định các kịch bản kiểm thử tĩnh (static audit) và động (dynamic tests) cho hệ thống CRM tích hợp Trợ lý AI tóm tắt hồ sơ khách hàng của Zagi.

---

## PHẦN 1: ĐÁNH GIÁ MÃ NGUỒN TĨNH (STATIC AUDIT & LOGIC ANALYSIS)

Rà soát logic của `ContactAISummarizer.ts`, `DatabaseService.ts` (phần lưu trữ CRM) và `AIAssistantService.ts` để tìm các kịch bản biên có thể gây lỗi.

| STT | Vấn đề kiểm tra | Logic hiện tại | Điểm rủi ro / Lỗi tiềm ẩn | Đánh giá thực tế |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Chặn cuộc gọi AI trùng lặp** | Sử dụng `inProgress: Set<string>` lưu `ownerZaloId:contactId`. | Nếu luồng bất đồng bộ bị treo trước khi lọt vào `finally` (ví dụ: treo mạng cực hạn hoặc lỗi thư viện không throw), `key` sẽ vĩnh viễn nằm trong `inProgress`, khóa hoàn toàn tính năng tóm tắt của liên hệ này. | |
| 2 | **Giải mã JSON tin nhắn** | Chuyển đổi nội dung tin nhắn dạng JSON chuỗi (ví dụ: `msg`, `message`, `title`). | Nếu `content` là một chuỗi không hợp lệ hoặc chứa JSON phức tạp bị lỗi cú pháp, khối `catch` sẽ xử lý chuỗi thường. Tuy nhiên, nếu Zalo gửi các gói tin media đặc biệt, logic này chưa tối ưu để lấy tóm tắt media (ảnh, file). | |
| 3 | **Reset bộ đếm tin nhắn** | Sau khi tóm tắt xong, gọi `updateContactAIProfile` với `resetCounter: true` để đưa bộ đếm về 0. | Nếu cuộc gọi AI thất bại (mạng lỗi, hết token LLM), bộ đếm có được reset không? Theo code hiện tại, nếu lỗi, ngoại lệ sẽ nhảy vào `catch` và **không** gọi cập nhật profile -> bộ đếm không được reset. Lần tin nhắn tiếp theo sẽ lại kích hoạt tiếp cuộc gọi AI (gây spam request liên tục lên LLM khi API đang lỗi). | |
| 4 | **Tính nhất quán của ID trợ lý AI** | Liên kết `ai_assistant_id` trong danh bạ với trợ lý AI trong bảng cấu hình trợ lý. | Nếu Trợ lý AI bị xóa khỏi cấu hình, nhưng danh bạ vẫn liên kết với `ai_assistant_id` đó, hệ thống sẽ rơi về `defaultAssistant`. Cần test xem fallback này có hoạt động ổn định không. | |

---

## PHẦN 2: KIỂM THỬ TÍCH HỢP TỰ ĐỘNG (AUTOMATED INTEGRATION TESTS)

Sử dụng script giả lập chạy trực tiếp trên Electron Main Process bằng công cụ Electron CLI (`scratch/run-crm-ai-tests.js`).

### 2.1 Kết quả kiểm thử tự động
1. **Kịch bản 1: Đếm tin nhắn và Kích hoạt tóm tắt ngầm:**
   - **Trạng thái:** Đạt (Passed).
   - **Kết quả:** Bộ đếm `ai_auto_summary_counter` tăng chính xác `0 -> 1 -> 2 -> 3`. Khi chạm ngưỡng `3`, hệ thống tự kích hoạt cuộc gọi tóm tắt ngầm.
2. **Kịch bản 2: Reset bộ đếm sau khi hoàn thành:**
   - **Trạng thái:** Đạt (Passed).
   - **Kết quả:** Sau khi LLM trả về kết quả tóm tắt, bộ đếm được reset về `0` thành công và `ai_profile` được cập nhật chính xác nội dung tóm tắt.
3. **Kịch bản 3: Xử lý khi API AI bị lỗi (Spam Prevention):**
   - **Trạng thái:** Đạt (Passed - Đã sửa đổi & tối ưu thành công).
   - **Kết quả:** Khi cuộc gọi LLM đầu tiên gặp lỗi, cooldown được kích hoạt. Lần gọi thứ 2 liên tiếp bị chặn ngay lập tức bởi kiểm tra cooldown trong Executor (`Cooldown active in executor. Skipping execution`), tránh hoàn toàn việc spam gọi API LLM liên tục.

---

## PHẦN 3: ĐỀ XUẤT NÂNG CẤP & TỐI ƯU HÓA (RECOMMENDATIONS)


Dựa trên kết quả Static Audit và Automated Integration Tests, dưới đây là các đề xuất nâng cấp hệ thống CRM & AI hỗ trợ CRM của Zagi:

### 1. Sửa lỗi nghiêm trọng: Cơ chế chống Spam API LLM khi xảy ra lỗi (Rate Limit / Network Error)
* **Hiện trạng:** Khi LLM lỗi, bộ đếm không được reset, dẫn đến việc ứng dụng gọi API LLM liên tục trên mọi tin nhắn mới sau đó.
* **Đề xuất nâng cấp:** 
  - Thêm cột `last_ai_summary_attempt_at` (kiểu INTEGER) vào bảng `contacts`.
  - Khi kích hoạt tóm tắt, cập nhật timestamp này: `last_ai_summary_attempt_at = Date.now()`.
  - Thêm điều kiện lọc trong `onNewMessage`: Nếu khoảng cách từ lần thử cuối cùng nhỏ hơn 10 phút (`COOLDOWN_MS = 10 * 60 * 1000`), bỏ qua không gọi AI nữa kể cả khi bộ đếm đã vượt ngưỡng.
  - Ngoài ra, có thể tạm thời lùi bộ đếm về `threshold - 5` để giảm tần suất gọi lại khi API gặp sự cố.

### 2. Tách biệt Tiến trình chạy AI (Queue Task Worker)
* **Hiện trạng:** `ContactAISummarizer.runAutoSummary` chạy trực tiếp ở Main Process dưới dạng tác vụ nền nhưng không được quản lý hàng đợi tập trung.
* **Đề xuất nâng cấp:** Chuyển đổi các tác vụ tóm tắt AI thành các Task nằm trong một Worker Queue chung. Việc này giúp giới hạn số lượng tác vụ AI chạy đồng thời (Concurrency limit = 1 hoặc 2) để tránh quá tải CPU máy khách khi có nhiều hội thoại nhắn tin tới cùng lúc.

### 3. Tối ưu hóa cấu trúc Prompt & Token (Cost Optimization)
* **Hiện trạng:** Hàm `buildMergePrompt` gửi toàn bộ lịch sử tin nhắn mới kèm hồ sơ cũ.
* **Đề xuất nâng cấp:**
  - Lọc bỏ các tin nhắn hệ thống, tin nhắn chỉ chứa nhãn dán (sticker) trước khi gửi lên LLM để tiết kiệm Token.
  - Áp dụng kỹ thuật nén văn bản (Text extraction) chỉ lấy các từ khóa quan trọng nếu lịch sử tin nhắn quá dài.

