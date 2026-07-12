/**
 * Campaign Template Variable definitions.
 * Cú pháp {xxx} — khác với workflow dùng {{ $trigger.xxx }}.
 *
 * Engine thay thế trong CRMQueueService.substitute().
 * UI hiển thị trong CampaignVarPopup.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignVarInfo {
  /** Cú pháp đầy đủ, VD: '{name}' */
  key: string;
  /** Tên hiển thị, VD: 'Tên Zalo' */
  label: string;
  /** Mô tả chi tiết */
  description: string;
  /** Nhóm phân loại */
  group: CampaignVarGroup;
  /** Ví dụ giá trị */
  example?: string;
}

export type CampaignVarGroup =
  | 'contact'    // Thông tin khách hàng CRM
  | 'datetime'   // Ngày giờ hiện tại
  | 'campaign'   // Thông tin chiến dịch
  ;

export const CAMPAIGN_VAR_GROUP_LABELS: Record<CampaignVarGroup, string> = {
  contact:  '👤 Thông tin khách hàng',
  datetime: '📅 Ngày giờ',
  campaign: '📣 Chiến dịch',
};

// ─── Definitions ──────────────────────────────────────────────────────────────

export const CAMPAIGN_VARS: CampaignVarInfo[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // 👤 CONTACT — Thông tin khách hàng CRM
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '{name}',
    label: 'Tên liên hệ',
    description: 'Tên liên hệ thông minh. Ưu tiên biệt danh CRM (alias) nếu có, ngược lại dùng tên hiển thị Zalo.',
    group: 'contact',
    example: 'Nguyễn Văn A',
  },
  {
    key: '{zalo_name}',
    label: 'Tên Zalo gốc',
    description: 'Tên đăng ký Zalo gốc của khách hàng. Không lấy biệt danh CRM tự đặt.',
    group: 'contact',
    example: 'Nguyễn Văn A',
  },
  {
    key: '{salutation}',
    label: 'Xưng hô (tùy chỉnh)',
    description: 'Danh xưng đã lưu trong CRM: "Anh", "Chị", "Cô", "Chú", "Em"... Tự động sinh từ giới tính nếu chưa được đặt.',
    group: 'contact',
    example: 'Anh',
  },
  {
    key: '{gender_greeting}',
    label: 'Anh/Chị (tự động)',
    description: 'Tự động xưng hô theo giới tính. (Đã đồng bộ trực tiếp với trường Xưng hô tùy chỉnh của bạn).',
    group: 'contact',
    example: 'Anh',
  },
  {
    key: '{alias}',
    label: 'Biệt danh CRM',
    description: 'Chỉ lấy biệt danh CRM bạn đã đặt riêng cho khách hàng. Sẽ để trống nếu khách hàng chưa được đặt biệt danh.',
    group: 'contact',
    example: 'Khách VIP HN',
  },
  {
    key: '{phone}',
    label: 'Số điện thoại',
    description: 'Số điện thoại của khách hàng lưu trong CRM hoặc danh bạ Zalo.',
    group: 'contact',
    example: '0901234567',
  },
  {
    key: '{userId}',
    label: 'ID Zalo',
    description: 'Mã định danh Zalo (UID) của người nhận.',
    group: 'contact',
    example: '1234567890',
  },
  {
    key: '{birthday}',
    label: 'Ngày sinh đầy đủ',
    description: 'Ngày sinh nhật đầy đủ theo định dạng dd/MM/yyyy.',
    group: 'contact',
    example: '15/08/1995',
  },
  {
    key: '{birthday_day}',
    label: 'Ngày sinh (số ngày)',
    description: 'Chỉ số ngày trong tháng sinh nhật. Hữu ích khi viết "Chúc mừng sinh nhật ngày {birthday_day}/{birthday_month}".',
    group: 'contact',
    example: '15',
  },
  {
    key: '{birthday_month}',
    label: 'Tháng sinh (số tháng)',
    description: 'Chỉ số tháng sinh nhật.',
    group: 'contact',
    example: '08',
  },
  {
    key: '{ai_profile}',
    label: 'Hồ sơ AI khách hàng',
    description: 'Bản tóm tắt hồ sơ khách hàng được AI phân tích từ lịch sử hội thoại. Phù hợp để cá nhân hoá tin nhắn nâng cao.',
    group: 'contact',
    example: 'Quan tâm sản phẩm X, thường hỏi về giá và khuyến mãi',
  },
  {
    key: '{extra.<field>}',
    label: 'Trường tùy chỉnh CRM',
    description: 'Truy cập trường custom field bất kỳ trong CRM. Thay <field> bằng tên trường. VD: {extra.maSoThue}, {extra.diaChi}.',
    group: 'contact',
    example: '{extra.maSoThue} → "123456"',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 📅 DATETIME — Ngày giờ
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '{date}',
    label: 'Ngày hôm nay',
    description: 'Ngày hiện tại khi tin nhắn được gửi, định dạng dd/MM/yyyy.',
    group: 'datetime',
    example: '12/07/2026',
  },
  {
    key: '{time}',
    label: 'Giờ gửi',
    description: 'Giờ hiện tại khi tin nhắn được gửi, định dạng HH:mm.',
    group: 'datetime',
    example: '14:30',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 📣 CAMPAIGN — Thông tin chiến dịch
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '{campaign_name}',
    label: 'Tên chiến dịch',
    description: 'Tên của chiến dịch đang gửi.',
    group: 'campaign',
    example: 'Tri ân sinh nhật tháng 7',
  },
];

/** Map để tra cứu nhanh */
export const CAMPAIGN_VAR_MAP = new Map<string, CampaignVarInfo>(
  CAMPAIGN_VARS.map(v => [v.key, v])
);

/**
 * Lấy biến theo nhóm
 */
export function getCampaignVarsByGroup(): Map<CampaignVarGroup, CampaignVarInfo[]> {
  const grouped = new Map<CampaignVarGroup, CampaignVarInfo[]>();
  for (const v of CAMPAIGN_VARS) {
    const list = grouped.get(v.group) || [];
    list.push(v);
    grouped.set(v.group, list);
  }
  return grouped;
}

/**
 * Thay thế các biến trong chuỗi mẫu — dùng cho PREVIEW (giá trị giả).
 * Logic thật nằm trong CRMQueueService.substitute().
 */
export function substitutePreviewCampaign(
  text: string,
  campaignName = 'Chiến dịch mẫu'
): string {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, '0');
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh  = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  return (text || '')
    .replace(/\{name\}/g,             'Nguyễn Văn A')
    .replace(/\{zalo_name\}/g,        'Hồng Hoa Zalo')
    .replace(/\{userId\}/g,           '0987654321')
    .replace(/\{gender_greeting\}/g,  'Anh')
    .replace(/\{salutation\}/g,       'Anh')
    .replace(/\{alias\}/g,            'Khách VIP')
    .replace(/\{phone\}/g,            '0901234567')
    .replace(/\{birthday\}/g,         '15/08/1995')
    .replace(/\{birthday_day\}/g,     '15')
    .replace(/\{birthday_month\}/g,   '08')
    .replace(/\{ai_profile\}/g,       'Quan tâm sản phẩm X, hay hỏi về giá')
    .replace(/\{extra\.[^}]+\}/g,     '(trường CRM)')
    .replace(/\{campaign_name\}/g,    campaignName)
    .replace(/\{date\}/g,             `${dd}/${mm}/${yyyy}`)
    .replace(/\{time\}/g,             `${hh}:${min}`);
}
