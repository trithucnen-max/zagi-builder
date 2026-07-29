/**
 * salutationUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Xử lý xưng hô thông minh cho tin nhắn tiếng Việt:
 *   1. isStartOfSentence     — phát hiện đầu câu (sau . ! ? … \n hoặc đầu chuỗi)
 *   2. SALUTATION_SELF_REF_MAP — mapping xưng hô → tự xưng phù hợp
 *   3. getSelfRef            — lấy tự xưng từ xưng hô
 *   4. applySmartSalutation  — thay thế {salutation}/{tu_xung} với auto-capitalize
 *
 * Tiêu chuẩn tiếng Việt:
 *   - Đầu câu / sau . ! ?   →  Hoa: "Chị ơi, em..."
 *   - Giữa câu              →  thường: "em chào chị"
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── 1. Capitalize theo vị trí ─────────────────────────────────────────────────

/**
 * Kiểm tra xem ký tự ở `index` trong `str` có đứng ở đầu câu không.
 *
 * Đầu câu được định nghĩa là:
 *  - Vị trí 0 (đầu chuỗi)
 *  - Sau dấu `.` `!` `?` `…` có thể theo sau bởi khoảng trắng / ngoặc
 *  - Sau ký tự xuống dòng `\n`
 *
 * Tình huống:
 * [1] "{salutation} ơi..."      → đầu chuỗi          → Hoa
 * [2] "...lại. {salutation}..." → sau dấu chấm       → Hoa
 * [3] "...vậy? {salutation}..." → sau dấu hỏi        → Hoa
 * [4] "Vui! {salutation}..."    → sau dấu than        → Hoa
 * [5] "Hmm… {salutation}..."    → sau ba chấm         → Hoa
 * [6] "Dạ,\n{salutation}..."   → sau xuống dòng      → Hoa
 * [7] "em chào {salutation},"   → sau dấu phẩy/chữ   → thường
 * [8] "gửi: {salutation}"       → sau dấu hai chấm   → thường
 */
export function isStartOfSentence(str: string, index: number): boolean {
    if (index <= 0) return true;

    // Duyệt ngược qua khoảng trắng (trừ xuống dòng) và dấu mở ngoặc/nháy
    let i = index - 1;
    while (i >= 0) {
        const ch = str[i];
        if (ch === '\n') return true; // Xuống dòng luôn là đầu câu/đầu dòng mới
        if (/[ \t\r"'«(]/.test(ch)) {
            i--;
        } else {
            break;
        }
    }
    if (i < 0) return true; // toàn khoảng trắng/đầu chuỗi

    return /[.!?…\n]/.test(str[i]);
}

/** Viết hoa chữ đầu (hỗ trợ compound như "Anh/Chị" -> "Anh/Chị") */
export function capitalizeVietnamese(word: string): string {
    if (!word) return word;
    if (word.includes('/')) {
        return word.split('/').map(p => capitalizeVietnamese(p.trim())).join('/');
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Viết thường chữ đầu (hỗ trợ compound như "Anh/Chị" -> "anh/chị") */
export function lowercaseVietnamese(word: string): string {
    if (!word) return word;
    if (word.includes('/')) {
        return word.split('/').map(p => lowercaseVietnamese(p.trim())).join('/');
    }
    return word.charAt(0).toLowerCase() + word.slice(1);
}

// ── 2. Mapping xưng hô → tự xưng ─────────────────────────────────────────────

/**
 * Bảng mapping xưng hô KHÁCH → tự xưng NGƯỜI GỬI.
 *
 * Quy tắc tiếng Việt:
 *   Bố/Mẹ/Ba/Má          → Con
 *   Ông/Bà/Cụ             → Cháu
 *   Chú/Cô/Dì/Thím/Bác   → Con (hoặc Cháu tùy vùng, dùng Con làm mặc định)
 *   Anh/Chị               → Em
 *   Em (gửi đến người trẻ) → Anh (mặc định — người dùng có thể ghi đè)
 *   Bạn                   → Mình
 */
export const DEFAULT_SALUTATION_SELF_REF_MAP: Record<string, string> = {
    // Bậc trên (gia đình)
    'bố':        'con',
    'ba':        'con',
    'cha':       'con',
    'mẹ':        'con',
    'má':        'con',
    'ông':       'cháu',
    'bà':        'cháu',
    'cụ':        'cháu',

    // Họ hàng bậc trên
    'chú':       'con',
    'bác':       'cháu',
    'cô':        'con',
    'dì':        'con',
    'thím':      'con',
    'mợ':        'con',
    'cậu':       'con',

    // Ngang cấp / kính trên / gia đình
    'anh':       'em',
    'chị':       'em',
    'anh/chị':   'em',   // Mặc định cho giới tính chưa xác định
    'vợ':        'anh',
    'chồng':     'em',
    'bà xã':     'anh',
    'ông xã':    'em',
    'người yêu': 'anh',

    // Gửi đến người trẻ hơn / cấp dưới
    'em':        'anh',

    // Ngang hàng / bạn bè
    'bạn':       'mình',
    'tớ':        'cậu',

    // Formal / lịch sự
    'quý khách': 'chúng tôi',
    'quý anh':   'em',
    'quý chị':   'em',
};

// Map mặc định hiện tại
export const SALUTATION_SELF_REF_MAP = DEFAULT_SALUTATION_SELF_REF_MAP;

let activeSalutationMap: Record<string, string> = { ...DEFAULT_SALUTATION_SELF_REF_MAP };

/** Lấy map xưng hô hiện tại (bao gồm các quy tắc tùy chỉnh của người dùng) */
export function getEffectiveSalutationMap(): Record<string, string> {
    return { ...activeSalutationMap };
}

/** Cập nhật map xưng hô tùy chỉnh từ DB / UI */
export function setCustomSalutationMap(customMap?: Record<string, string> | null): void {
    if (customMap && typeof customMap === 'object' && Object.keys(customMap).length > 0) {
        // Lowercase tất cả keys để so khớp không phân biệt hoa thường
        const normalized: Record<string, string> = {};
        for (const [k, v] of Object.entries(customMap)) {
            if (k && typeof k === 'string' && v && typeof v === 'string') {
                normalized[k.trim().toLowerCase()] = v.trim();
            }
        }
        activeSalutationMap = normalized;
    } else {
        activeSalutationMap = { ...DEFAULT_SALUTATION_SELF_REF_MAP };
    }
}

/** Khôi phục map xưng hô về mặc định hệ thống */
export function resetSalutationMapToDefault(): Record<string, string> {
    activeSalutationMap = { ...DEFAULT_SALUTATION_SELF_REF_MAP };
    return getEffectiveSalutationMap();
}

/**
 * Lấy tự xưng phù hợp từ xưng hô của khách.
 * @param salutation  Xưng hô của khách (VD: "Anh", "Chị", "Bố"...)
 * @param fallback    Tự xưng dự phòng nếu không có trong map (mặc định: "em")
 */
export function getSelfRef(salutation: string, fallback = 'em'): string {
    if (!salutation) return fallback;
    const key = salutation.trim().toLowerCase();
    return activeSalutationMap[key] ?? fallback;
}

// ── 3. applySmartSalutation — thay thế thông minh ────────────────────────────

/**
 * Thay thế các biến xưng hô trong template với viết Hoa/thường tự động:
 *
 *   {salutation} / {xung_ho}   → xưng hô: Hoa đầu câu, thường giữa câu
 *   {gender_greeting}          → alias của {salutation} (xử lý giống nhau)
 *   {tu_xung}                  → tự xưng: Hoa đầu câu, thường giữa câu
 *   {salutation_cap}           → luôn viết Hoa (override thủ công)
 *   {salutation_lower}         → luôn viết thường (override thủ công)
 *   {tu_xung_cap}              → tự xưng luôn viết Hoa (override thủ công)
 *   {tu_xung_lower}            → tự xưng luôn viết thường (override thủ công)
 *
 * @param template   Template gốc
 * @param salutation Xưng hô của khách (VD: "chị")
 * @param selfRef    Tự xưng override (nếu không truyền, tự động lookup)
 */
export function applySmartSalutation(
    template: string,
    salutation: string,
    selfRef?: string
): string {
    if (!template) return template;

    const sal  = salutation?.trim() || '';
    const self = selfRef?.trim() || getSelfRef(sal);

    // {salutation}, {gender_greeting}, {xung_ho} — context-aware capitalize
    let result = template.replace(
        /\{salutation\}|\{gender_greeting\}|\{xung_ho\}/gi,
        (match, offset) => {
            if (!sal) return match;
            return isStartOfSentence(template, offset)
                ? capitalizeVietnamese(sal)
                : lowercaseVietnamese(sal);
        }
    );

    // {tu_xung} — tự xưng context-aware (dùng `result` sau khi đã thay salutation)
    result = result.replace(
        /\{tu_xung\}/gi,
        (_match, offset) => {
            if (!self) return '';
            return isStartOfSentence(result, offset)
                ? capitalizeVietnamese(self)
                : lowercaseVietnamese(self);
        }
    );

    // Override thủ công: {salutation_cap} / {salutation_lower} / {xung_ho_cap} / {xung_ho_lower}
    result = result
        .replace(/\{salutation_cap\}|\{xung_ho_cap\}|\{salutation_titlecase\}|\{xung_ho_titlecase\}/gi, capitalizeVietnamese(sal))
        .replace(/\{salutation_lower\}|\{xung_ho_lower\}/gi,  lowercaseVietnamese(sal))
        .replace(/\{tu_xung_cap\}|\{tu_xung_titlecase\}/gi,       capitalizeVietnamese(self))
        .replace(/\{tu_xung_lower\}/gi,     lowercaseVietnamese(self));

    return result;
}
