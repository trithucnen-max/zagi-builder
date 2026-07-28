# ZAGI DESKTOP — CHUẨN THIẾT KẾ HỢP NHẤT (UNIFIED DESIGN STANDARD)

> **Phiên bản:** v27.2.9 | **Cập nhật:** 09/07/2026
> **Tài liệu này là nguồn chân lý duy nhất (Single Source of Truth).** Khi có mâu thuẫn với bất kỳ ghi chú cũ nào, tài liệu này thắng.
> **Từ khóa định hướng:** Chuyên nghiệp (Professional) · Tin cậy (Trustworthy) · Tốc độ (High-speed)
> **Nguyên tắc cốt lõi:** Kế thừa trải nghiệm Zalo PC · Giữ nguyên bố cục (No Layout Shift) · Nói KHÔNG với màu tím (Purple Ban)
> **Stack:** React + TypeScript · Tailwind CSS v3.4.16 (`data-theme`) · `lucide-react`

---

## 0. QUY TẮC BẮT BUỘC (HARD RULES — dành cho người & agent)

**MUST NOT**
1. **KHÔNG** dùng màu có Hue trong dải **255°–330°** (tím, violet, magenta, fuchsia, indigo tươi). Áp dụng mọi thành phần: nút, icon AI, avatar, nhãn, node, biểu đồ, gradient.
2. **KHÔNG** lặp lại giá trị HEX trong phần Component — chỉ tham chiếu tên token ở Tầng A.
3. **KHÔNG** dùng emoji cho icon chức năng — chỉ dùng Lucide đơn sắc.
4. **KHÔNG** thay đổi vị trí, thứ tự hay grid của các cột layout (No Layout Shift).
5. **KHÔNG** dùng font ngoài (Google Fonts…) — chỉ System Font Stack.

**MUST**
6. **PHẢI** đạt WCAG 2.1 AA: text thường ≥ 4.5:1, text lớn/icon nghĩa ≥ 3:1.
7. **PHẢI** có focus ring bàn phím: `outline: 2px solid var(--color-blue-primary); outline-offset: 2px`.
8. **PHẢI** tôn trọng `prefers-reduced-motion: reduce` (tắt mọi transition).
9. **PHẢI** dùng token blue trầm thay indigo: `navy-secondary` hoặc `blue-700`.
10. **PHẢI** dùng skeleton (không spinner) cho loading danh sách để giữ bố cục.

**DANH SÁCH ĐEN HEX (Purple Ban — chặn tuyệt đối):**
`#8B5CF6` · `#7C3AED` · `#6D28D9` · `#6366F1` · `#4F46E5` · `#4338CA` · `#A855F7` · `#9333EA` · `#D946EF` · `#C026D3` · `#DB2777` và mọi biến thể violet/indigo/fuchsia của Tailwind.

---

# TẦNG A — FOUNDATION (TOKENS)

## 1. MÀU SẮC (COLOR TOKENS)

### 1.1. Brand & Primary

| Token | HEX | Vai trò |
|---|---|---|
| `blue-primary` | `#0068FF` | Màu chính: sidebar, nút chính, link, icon active |
| `blue-hover` | `#005AE0` | Hover nút xanh |
| `blue-active` | `#0052CC` | Active (sidebar item, nút nhấn) |
| `blue-bubble-dark` | `#0A5BE0` | Nền bubble tin của tôi ở Dark Mode (đạt AA) |
| `blue-light` | `#E5F0FF` | Nền tin của tôi, hội thoại đang chọn (Light) |
| `blue-light-dark` | `#1A3B66` | Nền tin của tôi, hội thoại đang chọn (Dark) |
| `navy-secondary` | `#0A3064` | Thương hiệu phụ, tiêu đề lớn, tông trầm sang |
| `navy-dark` | `#072247` | Thanh trạng thái, chi tiết Dark Mode |
| `blue-700` | `#1D4ED8` | Tông blue đậm thay thế indigo |
| `blue-600` | `#2563EB` | Trigger Node, Haravan, nhãn Local |

### 1.2. Semantic / Status

| Token | Light | Dark | Nền mờ Light | Nền mờ Dark | Vai trò |
|---|---|---|---|---|---|
| `success` | `#16A34A` | `#22C55E` | `#F0FDF4` | `#052E16` | Gửi OK, đơn hoàn tất |
| `warning` | `#D97706` | `#F59E0B` | `#FFFBEB` | `#451A03` | Sắp hết hạn, cảnh báo |
| `danger` | `#DC2626` | `#F87171` | `#FEF2F2` | `#450A0A` | Lỗi, xóa, validation |
| `info` | `#0068FF` | `#3B82F6` | `#EFF6FF` | `#172554` | Thông báo trung tính |

### 1.3. Neutral, Surface & Text

| Vai trò | Light | Dark |
|---|---|---|
| Nền cửa sổ chat giữa (`app`) | `#F4F5F7` | `#111827` |
| Nền cột bên / header / input (`surface`) | `#FFFFFF` | `#1F2937` |
| Nền bubble tin của khách (`recipient`) | `#FFFFFF` | `#374151` |
| Border chính | `#E5E7EB` | `#374151` |
| Border phụ (nhẹ) | `#F1F2F4` | `#2D3748` |
| Text tiêu đề chính | `#0F172A` | `#F9FAFB` |
| Text nội dung phụ | `#475569` | `#9CA3AF` |
| Text trích đoạn (snippet) | `#5B6B7B` | `#8899A6` |
| Text disabled | `#94A3B8` | `#6B7280` |
| Text trên nền brand/blue | `#FFFFFF` | `#FFFFFF` |

### 1.4. Màu nền thương hiệu tích hợp (Tile — giữ nguyên cả 2 mode)

| Thương hiệu | Token | HEX |
|---|---|---|
| KiotViet | `brand-kiotviet` | `#F15A24` |
| Haravan | `brand-haravan` | `#2563EB` *(bỏ indigo)* |
| Sapo | `brand-sapo` | `#10B981` |
| Pancake POS / Casso | `brand-pancake` | `#3B82F6` |
| Nhanh.vn | `brand-nhanh` | `#E11D48` |
| GHN | `brand-ghn` | `#F97316` |
| GHTK | `brand-ghtk` | `#15803D` |
| SePay | `brand-sepay` | `#EF4444` |
| OpenAI | `brand-openai` | `#10A37F` |
| Gemini | `brand-gemini` | `#3B82F6` |
| Claude | `brand-claude` | `#C15F3C` |
| DeepSeek | `brand-deepseek` | `#0284C7` *(sky, không tím)* |
| Grok | `brand-grok` | `#0F172A` |
| OpenRouter | `brand-openrouter` | `#0068FF` |

Icon SVG bên trong tile luôn `text-white`. Tile GIỮ NGUYÊN màu brand ở cả Light/Dark.

## 2. TYPOGRAPHY

Font stack (`font-system`): `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

| Token | Size | Weight | Line-height | Dùng cho |
|---|---|---|---|---|
| `title` | 15px | 600 | 1.4 | Tên hội thoại, tiêu đề card |
| `body` | 14px | 400 | 1.5 | Nội dung tin nhắn, ghi chú |
| `snippet` | 13px | 400 | 1.4 | Trích đoạn tin mới nhất |
| `caption` | 12px | 500 | 1.4 | Thời gian, số tin chưa đọc |

## 3. SPACING / RADIUS / ELEVATION / MOTION / Z-INDEX

**Spacing (base 4px):** `1:4 · 2:8 · 3:12 · 4:16 · 5:20 · 6:24 · 8:32 · 10:40 · 12:48`

**Cột cố định (No Layout Shift):** Sidebar nav `64px` · Sidebar dự án `240px` · Chat list `320px` · Chat window `flex:1`

**Radius:** `sm:6px` · `md:8px` · `lg:12px` · `full:9999px`. Bubble bo 12px, góc đuôi 4px.

**Elevation:** `sm:0 1px 2px rgba(0,0,0,.05)` · `md:0 4px 8px rgba(0,0,0,.08)` · `lg:0 10px 24px rgba(0,0,0,.12)`

**Motion:** `fast:150ms` · `base:200ms` · easing `standard = cubic-bezier(0.4,0,0.2,1)`. Tôn trọng `prefers-reduced-motion`.

**Z-index:** `dropdown:1000 · sticky:1100 · modal-overlay:1200 · modal:1300 · toast:1400 · tooltip:1500`

## 4. ACCESSIBILITY BASELINE
WCAG 2.1 AA. Icon sidebar inactive `text-white/80`. Bubble Dark dùng `blue-bubble-dark`. Snippet dùng `snippet-light` (`#5B6B7B`).

## 4.1. DARK MODE — BẢNG CHUẨN HÓA

**Kích hoạt:** ghi `data-theme="dark"` lên `<html>` (xem **Mục 22 — Theme Resolution**). Mọi component PHẢI khai báo cặp Light/Dark.

### 4.1.1. Surface & Neutral

| Vai trò | Light | Dark |
|---|---|---|
| Nền chat giữa | `#F4F5F7` | `#111827` |
| Nền cột bên / header / input | `#FFFFFF` | `#1F2937` |
| Nền popover / dropdown / menu / modal | `#FFFFFF` | `#1F2937` |
| Modal overlay | `rgba(15,23,42,0.45)` | `rgba(0,0,0,0.60)` |
| Border chính | `#E5E7EB` | `#374151` |
| Border phụ | `#F1F2F4` | `#2D3748` |

### 4.1.2. Interaction States

| Vai trò | Light | Dark |
|---|---|---|
| Hover dòng list | `#F1F2F4` | `#2D3748` |
| Active hội thoại | `#E5F0FF` | `#1A3B66` |
| Bubble tin của tôi | nền `#E5F0FF` / chữ `#0F172A` | nền `#0A5BE0` / chữ `#FFFFFF` |
| Bubble tin của khách | nền `#FFFFFF` + viền `#E5E7EB` / chữ `#0F172A` | nền `#374151` / chữ `#F9FAFB` |
| Popup AI | nền `#EFF6FF` / viền `#BFDBFE` | nền `#172554` / viền `#1E3A8A` |
| Sidebar nav nền | `#0068FF` | `#0068FF` |
| Sidebar item active | `#0052CC` | `#0052CC` |

### 4.1.3. Component nền tối cụ thể

| Component | Light | Dark |
|---|---|---|
| Kanban card | nền `#FFFFFF` viền `#E5E7EB` | nền `#1F2937` viền `#374151` |
| Kanban column bg | `#F4F5F7` | `#111827` |
| Node config panel | `#FFFFFF` | `#1F2937` |
| Preview grid item | `#F4F5F7` | `#374151` |
| Pill biến động | `bg-pill-bg-light text-pill-fg-light` | `bg-pill-bg-dark text-pill-fg-dark` |
| Icon chức năng inactive | nền `#E5E7EB` icon `#64748B` | nền `#374151` icon `#9CA3AF` |
| Icon chức năng active | nền `#0068FF` icon `#FFFFFF` | nền `#0068FF` icon `#FFFFFF` |
| Tile logo thương hiệu | *giữ màu brand* | *giữ màu brand* |

## 4.2. QUY CHUẨN ICON — LUCIDE

Toàn bộ icon dùng **Lucide** (`lucide-react`). KHÔNG trộn bộ khác, KHÔNG emoji cho icon chức năng.

**Thông số:** mặc định `20px` (`w-5 h-5`); nhỏ `16px`; sidebar `22px`. `strokeWidth: 2` (icon ≥28px có thể `1.5`). Màu luôn `stroke="currentColor"`.

**Ánh xạ icon chức năng**

| Chức năng | Lucide | Chức năng | Lucide |
|---|---|---|---|
| Trang chủ | `Home` | Xóa preview | `X` |
| Chat | `MessageCircle` | Trợ lý AI | `Sparkles` |
| CRM | `KanbanSquare` | Cảnh báo | `AlertTriangle` |
| Workflow | `Workflow` | Thành công | `CheckCircle2` |
| Cài đặt | `Settings` | Xem trước | `Eye` |
| Thêm mới | `Plus` | Gửi ảnh/tệp | `ImagePlus` |
| Bật/Tắt thông báo | `Bell`/`BellOff` | Ghim | `Pin` |
| Tạo nhóm | `Users` | Sửa thông tin | `Pencil` |

**Ánh xạ 12 icon dự án**

| Slug | Lucide | Slug | Lucide |
|---|---|---|---|
| `folder` | `Folder` | `home` | `Home` |
| `rocket` | `Rocket` | `fire` | `Flame` |
| `target` | `Target` | `bulb` | `Lightbulb` |
| `code` | `Code2` | `sparkles` | `Sparkles` |
| `palette` | `Palette` | `phone` | `Phone` |
| `chart` | `BarChart3` | `bag` | `ShoppingBag` |

Dữ liệu cũ dạng emoji: `getProjectDisplay()` fallback emoji (tương thích ngược 100%); component mới render Lucide qua map.

---

# TẦNG B — COMPONENT & PATTERN SPECS

## 5. LAYOUT SHELL
Giữ nguyên khung: Sidebar nav (`64px`) → Chat list (`320px`) → Chat window (`flex:1`) → Info panel (phải).

## 6. SIDEBAR ĐIỀU HƯỚNG
Nền `blue-primary`. Icon Lucide `text-white/80` (inactive). Hover: `bg-white/10`, icon trắng 100%. Active: nền `blue-active`, icon trắng.

## 7. DANH SÁCH HỘI THOẠI
Nền `surface`, border phân cách 1px. Hover: `hover-row`, `cursor-pointer`, `duration-fast`. Active: `blue-light`/`blue-light-dark`. Avatar tròn; nhóm dùng `GroupAvatar`. Loading: skeleton, không spinner.

## 8. KHUNG CHAT & BUBBLE
Nền khung `app`. Tin của tôi: Light `blue-light`/chữ tối; Dark `blue-bubble-dark`/chữ trắng; bo `lg`, góc dưới phải 4px. Tin của khách: `recipient`, Light thêm viền 1px; bo `lg`, góc dưới trái 4px. Nút AI (`Sparkles`) Lucide; hover popup nền AI-popup, `shadow-md`, z `dropdown`.

## 9. MỐC THỜI GIAN TIN NHẮN
Hiển thị trên bubble. Nhóm: `Tên   HH:mm`; 1-1: `HH:mm`; tin đi: `HH:mm` căn phải; màu text-secondary. Pill giữa chỉ khi sang ngày mới hoặc gián đoạn > 15 phút.

## 10. NÚT BẤM
Primary: `blue-primary` hover `blue-hover` chữ trắng, icon `Plus`. Secondary: xám. Danger: `red-600` hover `red-700` chữ trắng.

## 11. TAB LỌC & NHÃN
Bộ lọc Active: `blue-600`. Nhãn Local: `blue-600` (không indigo).

## 12. ICON CHỨC NĂNG (Lucide tròn)
Inactive: nền tròn xám, icon xám. Active: nền `blue-primary`, icon trắng.

## 13. CRM KANBAN & WORKFLOW
Kanban card: `radius-md`, `shadow-sm`. Workflow Nodes: Trigger → `blue-600`; Action → `blue-primary`; Logic/Filter → `warning`. Canvas grid xám mảnh.

## 14. NODE CONFIG PANEL
Form: bắt buộc `min-h-0` + `overflow-y-auto`. Node truy vấn (`crm.getContacts`): nút Preview cuối form; modal dùng `GroupAvatar`; trường việt hóa kèm icon.

## 15. GỬI ẢNH/TỆP (MultiImageSelector)
Nút "Chọn ảnh": `blue-600`. Dialog `multiSelect:true` + URL thủ công. Preview grid `radius-sm`, nút xóa icon `X` nền `danger` mờ. Checkbox "Gửi ngẫu nhiên 1 ảnh": tick `blue-primary`, đổi `sendMode`.

## 16. GLOBAL UI ZOOM
Điều chỉnh `fontSize` root `html` (rem) + CSS var `--zagi-font-scale` ghi đè `text-[Xpx]`. Scale `0.75x`–`1.5x`, không tràn khung.

## 17. STATE PATTERNS
Empty: icon xám + tiêu đề + 1 nút chính. Loading: skeleton khớp layout. Error tích hợp: banner nền `danger` mờ + nút "Kết nối lại". Dot trạng thái: `success`/`warning`/`danger`.

## 18. USER GUIDE
Tab `"userguide"` trong Cài đặt → Giới thiệu. 5 tab ngang. Tab active: chữ đậm + vạch chân `blue-primary` 2px. Render GitHub alert. Nền `surface`.

## 19. PROJECT ICON SYSTEM
Tên: `[slug] Tên dự án`. Regex `^\[([a-zA-Z0-9_-]+)\]\s*(.*)$`, fallback emoji. `renderProjectIcon()` + `React.cloneElement`. Sidebar icon `#FFFFFF`; dropdown `#9CA3AF`. Sidebar dự án always-colored: active `opacity:1` weight 600 viền `2px rgba(255,255,255,.4)`; inactive `opacity:0.6`.

---

# TẦNG C — PHỤ LỤC THỰC THI

Xem file riêng: `02-TAILWIND-CONFIG.md` (Mục 20) và `03-REFERENCE-IMPLEMENTATION.md` (Mục 21 + Mục 22 Theme Resolution).

---

## CHANGELOG

**v27.2.9 (09/07/2026)**
- Hợp nhất Design System + Interface Note thành Single Source of Truth.
- Sửa toàn bộ vi phạm Purple Ban (indigo → blue).
- Sửa 3 lỗi tương phản WCAG AA.
- Bổ sung Foundation tokens + chuẩn hóa Dark Mode đầy đủ.
- Thống nhất icon sang Lucide.
- **Đổi cơ chế Dark Mode sang `data-theme` (Mục 22 Theme Resolution).**

