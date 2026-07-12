/**
 * Template Variable definitions for Workflow Node Config.
 * Mỗi variable là một từ khoá mà người dùng có thể chèn vào config field
 * bằng cú pháp {{ $trigger.fromName }} hoặc {{ $node.[label].output }}.
 *
 * File này là single source of truth cho tất cả template variables —
 * nếu thêm variable mới ở engine, phải thêm vào đây để UI hiển thị.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateVarInfo {
  /** Cú pháp đầy đủ, VD: '$trigger.fromName' */
  key: string;
  /** Tên hiển thị ngắn gọn, VD: 'Tên người gửi' */
  label: string;
  /** Mô tả chi tiết — hiển thị trong popup */
  description: string;
  /** Nhóm để phân loại trong popup */
  group: TemplateVarGroup;
  /** Chỉ áp dụng cho các node type này. null = tất cả node */
  nodeTypes?: string[];
  /** Ví dụ giá trị (nếu có thể tính trước) */
  example?: string;
}

export type TemplateVarGroup =
  | 'trigger'       // Dữ liệu Zalo gốc từ event kích hoạt (tin nhắn, sự kiện...)
  | 'crm'           // Thông tin khách hàng được enrich từ CRM database
  | 'date'          // Ngày giờ dương lịch + âm lịch
  | 'variable'      // Biến do người dùng đặt (logic.setVariable)
  | 'node'          // Output từ node khác (dùng NodePicker)
  | 'page'          // Thông tin tài khoản Zalo đang chạy
  | 'loop'          // Biến của đối tượng vòng lặp
  | 'system'        // Biến hệ thống đặc biệt ($prev, $system.lunar...)
  ;

export const TEMPLATE_VAR_GROUP_LABELS: Record<TemplateVarGroup, string> = {
  trigger:  '💬 Tin nhắn / Sự kiện Zalo',
  crm:      '👤 Thông tin khách hàng CRM',
  date:     '📅 Ngày giờ',
  variable: '📦 Biến tự đặt (Variable)',
  node:     '🔗 Output từ node khác',
  page:     '🏪 Tài khoản Zalo',
  loop:     '🔁 Đối tượng lặp (Khách hàng hiện tại)',
  system:   '⚙️ Hệ thống / Nâng cao',
};

// ─── Definitions ──────────────────────────────────────────────────────────────

/**
 * Danh sách tất cả template variables có sẵn trong workflow engine.
 * Đây là source of truth — UI popup sẽ đọc từ đây.
 *
 * Khi thêm variable mới trong WorkflowEngineService.ts (flattenTriggerData, renderTemplate),
 * phải thêm vào đây để người dùng thấy được trong UI.
 */
export const TEMPLATE_VARS: TemplateVarInfo[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // 💬 TRIGGER — Dữ liệu Zalo gốc từ event kích hoạt
  // ════════════════════════════════════════════════════════════════════════════

  // ── Trigger: message (tin nhắn cá nhân / nhóm) ──────────────────────────
  {
    key: '$trigger.content',
    label: 'Nội dung tin nhắn',
    description: 'Toàn bộ nội dung văn bản của tin nhắn đã kích hoạt workflow. VD: "SPX011", "Xin chào", ...',
    group: 'trigger',
    example: '"SPX011"',
  },
  {
    key: '$trigger.fromId',
    label: 'ID Zalo người gửi',
    description: 'Mã định danh Zalo của người đã gửi tin nhắn. Dùng để gửi reply hoặc tra cứu thông tin.',
    group: 'trigger',
    example: '"12345678"',
  },
  {
    key: '$trigger.fromName',
    label: 'Tên hiển thị Zalo người gửi',
    description: 'Tên hiển thị (display name) Zalo của người đã gửi tin nhắn kích hoạt workflow. Đây là tên Zalo gốc, không phải biệt danh CRM.',
    group: 'trigger',
    example: '"Nguyễn Văn A"',
  },
  {
    key: '$trigger.fromPhone',
    label: 'Số điện thoại người gửi (Zalo)',
    description: 'Số điện thoại của người gửi từ dữ liệu Zalo gốc (nếu có trong danh bạ). Có thể khác với số trong CRM.',
    group: 'trigger',
    example: '"0901234567"',
  },
  {
    key: '$trigger.threadId',
    label: 'ID hội thoại',
    description: 'Mã định danh của hội thoại chứa tin nhắn. Dùng để gửi tin nhắn reply đúng hội thoại.',
    group: 'trigger',
    example: '"987654"',
  },
  {
    key: '$trigger.threadType',
    label: 'Loại hội thoại (0/1)',
    description: '0 = hội thoại cá nhân, 1 = hội thoại nhóm. Thường dùng trong select option.',
    group: 'trigger',
    example: '"0"',
  },
  {
    key: '$trigger.isGroup',
    label: 'Có phải nhóm không (true/false)',
    description: 'true nếu tin nhắn đến từ nhóm, false nếu là chat cá nhân.',
    group: 'trigger',
    example: '"false"',
  },
  {
    key: '$trigger.msgId',
    label: 'ID tin nhắn',
    description: 'Mã định danh duy nhất của tin nhắn đã kích hoạt workflow. Dùng để reaction, thu hồi...',
    group: 'trigger',
    example: '"msg_abc123"',
  },
  {
    key: '$trigger.groupName',
    label: 'Tên nhóm Zalo',
    description: 'Tên của nhóm Zalo nếu tin nhắn đến từ nhóm.',
    group: 'trigger',
    example: '"Nhóm bán hàng"',
  },
  {
    key: '$trigger.timestamp',
    label: 'Thời gian gửi (timestamp ms)',
    description: 'Thời điểm tin nhắn được gửi, tính bằng mili giây từ epoch.',
    group: 'trigger',
    example: '"1775251200000"',
  },
  {
    key: '$trigger.zaloId',
    label: 'Zalo ID tài khoản nhận',
    description: 'Mã Zalo của tài khoản đã nhận được tin nhắn này (tài khoản của bạn).',
    group: 'trigger',
    example: '"999999"',
  },
  {
    key: '$trigger.images',
    label: 'Danh sách URL ảnh (mảng)',
    description: 'Mảng chứa URL các ảnh đính kèm trong tin nhắn (nếu có). Dùng kết hợp với filter join() để lấy URL đầu tiên.',
    group: 'trigger',
    example: '["https://...jpg"]',
  },

  // ── Trigger: friendRequest (lời mời kết bạn) ────────────────────────────
  {
    key: '$trigger.userId',
    label: 'ID người dùng (lời mời kết bạn)',
    description: 'Mã Zalo của người gửi lời mời kết bạn. Dùng để tự động chấp nhận/từ chối.',
    group: 'trigger',
    example: '"12345678"',
  },
  {
    key: '$trigger.displayName',
    label: 'Tên người gửi lời mời kết bạn',
    description: 'Tên hiển thị của người gửi lời mời kết bạn (từ Zalo, chưa qua CRM).',
    group: 'trigger',
    example: '"Lê Thị B"',
  },
  {
    key: '$trigger.message',
    label: 'Lời nhắn kèm lời mời kết bạn',
    description: 'Nội dung tin nhắn kèm theo khi người dùng gửi lời mời kết bạn.',
    group: 'trigger',
    example: '"Xin chào, tôi muốn kết bạn với bạn"',
  },

  // ── Trigger: groupEvent (sự kiện nhóm) ──────────────────────────────────
  {
    key: '$trigger.groupId',
    label: 'ID nhóm (sự kiện nhóm)',
    description: 'Mã định danh của nhóm nơi sự kiện xảy ra.',
    group: 'trigger',
  },
  {
    key: '$trigger.eventType',
    label: 'Loại sự kiện nhóm',
    description: 'Loại sự kiện: join (vào nhóm), leave (rời nhóm), remove_member (xoá thành viên), update (cập nhật), add_admin, remove_admin.',
    group: 'trigger',
    example: '"join"',
  },
  {
    key: '$trigger.actorName',
    label: 'Người thực hiện (sự kiện nhóm)',
    description: 'Tên của người đã thực hiện hành động (VD: mời thành viên, xoá thành viên...).',
    group: 'trigger',
  },
  {
    key: '$trigger.targetNames',
    label: 'Người bị tác động (sự kiện nhóm)',
    description: 'Tên của (các) thành viên bị ảnh hưởng bởi sự kiện. Nhiều tên cách nhau dấu phẩy.',
    group: 'trigger',
  },
  {
    key: '$trigger.systemText',
    label: 'Nội dung hệ thống (sự kiện nhóm)',
    description: 'Nội dung mô tả sự kiện do Zalo tạo (VD: "A đã thêm B vào nhóm").',
    group: 'trigger',
  },

  // ── Trigger: reaction (cảm xúc tin nhắn) ────────────────────────────────
  {
    key: '$trigger.react',
    label: 'Emoji reaction',
    description: 'Emoji cảm xúc mà người dùng đã thả vào tin nhắn. VD: ❤️, 👍, 😆, 😮, 😢, 😡.',
    group: 'trigger',
    example: '"❤️"',
  },

  // ── Trigger: payment / webhook ngân hàng ────────────────────────────────
  {
    key: '$trigger.amount',
    label: 'Số tiền thanh toán',
    description: 'Số tiền của giao dịch thanh toán từ webhook Casso/SePay (đơn vị đồng VND).',
    group: 'trigger',
    example: '"239000"',
  },
  {
    key: '$trigger.description',
    label: 'Nội dung chuyển khoản',
    description: 'Nội dung tin nhắn chuyển khoản từ webhook ngân hàng.',
    group: 'trigger',
    example: '"Thanh toán đơn SPX011"',
  },
  {
    key: '$trigger.bankName',
    label: 'Tên ngân hàng',
    description: 'Tên ngân hàng thực hiện giao dịch.',
    group: 'trigger',
  },
  {
    key: '$trigger.transactionId',
    label: 'Mã giao dịch',
    description: 'Mã giao dịch duy nhất từ ngân hàng.',
    group: 'trigger',
  },

  // ── Trigger: webhook (bên thứ 3) ────────────────────────────────────────
  {
    key: '$trigger.body',
    label: 'Toàn bộ dữ liệu webhook (JSON)',
    description: 'Toàn bộ nội dung JSON mà bên thứ 3 gửi đến. Dùng $trigger.body.field để lấy 1 trường cụ thể.',
    group: 'trigger',
    example: '{"orderId":"ORD123","customer":{...}}',
  },
  {
    key: '$trigger.body.<field>',
    label: '1 trường bất kỳ trong webhook',
    description: 'Truy cập 1 trường cụ thể từ JSON. VD: $trigger.body.orderId, $trigger.body.customer.name. Hỗ trợ nested object với dấu chấm.',
    group: 'trigger',
    example: '$trigger.body.orderId → "ORD123"',
  },
  {
    key: '$trigger.method',
    label: 'Phương thức HTTP',
    description: 'Phương thức HTTP mà bên thứ 3 dùng để gửi webhook (POST, GET, PUT...).',
    group: 'trigger',
    example: '"POST"',
  },
  {
    key: '$trigger.headers',
    label: 'Headers của request webhook',
    description: 'Toàn bộ HTTP headers từ request của bên thứ 3.',
    group: 'trigger',
    example: '{"content-type":"application/json"}',
  },
  {
    key: '$trigger.query',
    label: 'Query string params',
    description: 'Các tham số trên URL (sau dấu ?). VD: ?source=web → $trigger.query.source = "web".',
    group: 'trigger',
    example: '{"source":"web"}',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 👤 CRM — Thông tin khách hàng được enrich từ CRM database
  // ════════════════════════════════════════════════════════════════════════════
  // Các biến này được tự động đính kèm vào context khi trigger có contactId.
  // Engine đọc từ bảng `contacts` và `friends` để làm giàu dữ liệu.

  {
    key: '$trigger.displayName',
    label: 'Tên liên hệ (thông minh)',
    description: 'Tên liên hệ. Ưu tiên biệt danh CRM (alias) nếu có, ngược lại dùng tên Zalo. Tự động lấy khi có tin nhắn.',
    group: 'crm',
    example: '"Anh Minh (VIP)"',
  },
  {
    key: '$trigger.zaloName',
    label: 'Tên Zalo gốc',
    description: 'Tên đăng ký Zalo gốc của khách hàng. Không lấy biệt danh CRM tự đặt.',
    group: 'crm',
    example: '"Nguyễn Văn A"',
  },
  {
    key: '$trigger.salutation',
    label: 'Xưng hô / Danh xưng khách hàng',
    description: 'Danh xưng đã lưu trong CRM: "Anh", "Chị", "Cô", "Chú", "Em", "Bạn"... Tự động sinh từ giới tính nếu chưa được đặt.',
    group: 'crm',
    example: '"Anh"',
  },
  {
    key: '$trigger.alias',
    label: 'Biệt danh CRM',
    description: 'Chỉ lấy biệt danh CRM bạn đã đặt riêng cho khách hàng. Sẽ để trống nếu khách hàng chưa được đặt biệt danh.',
    group: 'crm',
    example: '"Khách VIP Hà Nội"',
  },
  {
    key: '$trigger.phone',
    label: 'Số điện thoại (CRM)',
    description: 'Số điện thoại của khách hàng được lưu trong CRM (ưu tiên hơn số từ Zalo).',
    group: 'crm',
    example: '"0901234567"',
  },
  {
    key: '$trigger.avatar',
    label: 'URL Avatar khách hàng (CRM)',
    description: 'Đường dẫn URL ảnh đại diện của khách hàng lưu trong CRM.',
    group: 'crm',
    example: '"https://...avatar.jpg"',
  },
  {
    key: '$trigger.birthday',
    label: 'Ngày sinh nhật khách hàng (CRM)',
    description: 'Ngày sinh nhật của khách hàng lưu trong CRM, định dạng dd/MM/yyyy.',
    group: 'crm',
    example: '"01/07/1996"',
  },
  {
    key: '$trigger.gender',
    label: 'Giới tính khách hàng (CRM)',
    description: 'Giới tính khách hàng lưu trong CRM: 1 = Nam, 2 = Nữ, 0 = Không xác định.',
    group: 'crm',
    example: '"1"',
  },
  {
    key: '$trigger.pipeline_stage_id',
    label: 'ID bước phễu CRM (Pipeline)',
    description: 'ID của bước trạng thái trong phễu Pipeline mà khách hàng đang ở. Dùng để kiểm tra hoặc hiển thị trạng thái.',
    group: 'crm',
    example: '"3"',
  },
  {
    key: '$trigger.aiProfile',
    label: 'Hồ sơ AI khách hàng (CRM)',
    description: 'Bản tóm tắt hồ sơ khách hàng được AI phân tích và tạo tự động từ lịch sử hội thoại.',
    group: 'crm',
    example: '"Khách hàng quan tâm sản phẩm X, hay hỏi về giá..."',
  },
  {
    key: '$trigger.extraData',
    label: 'Dữ liệu mở rộng CRM (JSON object)',
    description: 'Object chứa toàn bộ trường thông tin tùy chỉnh (custom fields) của khách hàng trong CRM. Truy cập từng trường bằng $trigger.extraData.tenTruong.',
    group: 'crm',
    example: '{"maSoThue":"123456","diaChi":"HN"}',
  },
  {
    key: '$trigger.extraData.<tenTruong>',
    label: 'Trường tùy chỉnh CRM bất kỳ',
    description: 'Truy cập 1 trường tùy chỉnh cụ thể từ extraData. Thay <tenTruong> bằng tên trường bạn đã định nghĩa. VD: $trigger.extraData.maSoThue.',
    group: 'crm',
    example: '$trigger.extraData.maSoThue → "123456"',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 📅 DATE / TIME — Ngày giờ dương lịch + âm lịch
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '$date.now',
    label: 'Thời gian hiện tại (vi-VN)',
    description: 'Ngày giờ hiện tại theo định dạng Việt Nam (dd/MM/yyyy HH:mm:ss), múi giờ Hồ Chí Minh.',
    group: 'date',
    example: '"13/06/2026 14:30:00"',
  },
  {
    key: '$date.today',
    label: 'Ngày hiện tại (vi-VN)',
    description: 'Ngày hiện tại theo định dạng Việt Nam (dd/MM/yyyy), múi giờ Hồ Chí Minh.',
    group: 'date',
    example: '"13/06/2026"',
  },
  {
    key: '$system.lunarDate',
    label: 'Ngày âm lịch đầy đủ',
    description: 'Ngày âm lịch hiện tại theo định dạng ngày/tháng/năm âm. VD: "20/5/2026".',
    group: 'date',
    example: '"20/5/2026"',
  },
  {
    key: '$system.lunarDay',
    label: 'Ngày âm lịch (số ngày)',
    description: 'Chỉ số ngày trong tháng âm lịch hiện tại. VD: "20".',
    group: 'date',
    example: '"20"',
  },
  {
    key: '$system.lunarMonth',
    label: 'Tháng âm lịch (số tháng)',
    description: 'Chỉ số tháng âm lịch hiện tại. VD: "5" (tháng 5 âm).',
    group: 'date',
    example: '"5"',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 🏪 PAGE / ACCOUNT — Tài khoản Zalo đang chạy workflow
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '$pageId',
    label: 'Zalo ID tài khoản đang xử lý',
    description: 'Mã Zalo của tài khoản đang thực thi workflow này. Hữu ích khi có nhiều tài khoản Zalo.',
    group: 'page',
    example: '"999999"',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 📦 VARIABLE — Biến do người dùng đặt
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '$var.<tên_biến>',
    label: 'Biến tự đặt (logic.setVariable)',
    description: 'Giá trị của biến đã được lưu bằng node logic.setVariable ở bước trước. Thay <tên_biến> bằng tên bạn đã đặt. VD: $var.customerName, $var.orderCode.',
    group: 'variable',
    example: '{{ $var.customerName }}',
  },
  {
    key: '$vars.<tên_biến>',
    label: 'Biến tự đặt (cú pháp $vars)',
    description: 'Tương đương $var.<tên_biến>. Cú pháp $vars cũng được engine hỗ trợ.',
    group: 'variable',
    example: '{{ $vars.orderCode }}',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ⚙️ SYSTEM — Biến hệ thống nâng cao
  // ════════════════════════════════════════════════════════════════════════════

  {
    key: '$prev.output',
    label: 'Output của node liền trước',
    description: 'Toàn bộ kết quả đầu ra của node ngay trước node hiện tại trong luồng. Tiện dụng hơn $node.[label] khi chỉ cần kết quả từ 1 node trước.',
    group: 'system',
    example: '"Kết quả xử lý từ bước trước"',
  },
  {
    key: '$prev.<field>',
    label: 'Trường cụ thể từ node liền trước',
    description: 'Truy cập 1 trường cụ thể từ output của node ngay trước. VD: $prev.contacts, $prev.count, $prev.result.',
    group: 'system',
    example: '$prev.count → "5"',
  },
  {
    key: '$index',
    label: 'Thứ tự lặp hiện tại (trong vòng lặp)',
    description: 'Index (0-based) của lần lặp hiện tại trong node logic.forEach. Dùng thay $item khi ở cấp ngoài vòng lặp.',
    group: 'system',
    example: '"0"',
  },
];

/** Map để tra cứu nhanh: key → TemplateVarInfo */
export const TEMPLATE_VAR_MAP = new Map<string, TemplateVarInfo>(
  TEMPLATE_VARS.map(v => [v.key, v])
);

/**
 * Lấy danh sách template variables phù hợp với 1 node type cụ thể.
 * @param nodeType Loại node hiện tại (VD: 'zalo.sendMessage')
 * @returns Danh sách variable đã lọc theo nodeTypes
 */
export function getTemplateVarsForNode(nodeType?: string): TemplateVarInfo[] {
  if (!nodeType) return TEMPLATE_VARS;
  return TEMPLATE_VARS.filter(v => !v.nodeTypes || v.nodeTypes.includes(nodeType));
}

/**
 * Lấy variables theo nhóm (trigger, crm, date, variable, page, system)
 */
export function getTemplateVarsByGroup(nodeType?: string): Map<TemplateVarGroup, TemplateVarInfo[]> {
  const vars = getTemplateVarsForNode(nodeType);
  const grouped = new Map<TemplateVarGroup, TemplateVarInfo[]>();
  for (const v of vars) {
    const list = grouped.get(v.group) || [];
    list.push(v);
    grouped.set(v.group, list);
  }
  return grouped;
}

/**
 * Lấy danh sách node labels từ danh sách node workflow để hiển thị
 * dưới dạng $node.<label>.output và $node.<label>.data.field
 */
export function getNodeOutputVars(
  allNodes: any[],
  currentId?: string
): TemplateVarInfo[] {
  const vars: TemplateVarInfo[] = [];

  for (const n of allNodes) {
    if (n.id === currentId) continue;

    const label = n.label || n.data?.label || n.id;
    const type = n.type || n.data?.type;

    // Gợi ý chung
    vars.push({
      key: `$node.${label}.output`,
      label: `Output từ "${label}"`,
      description: `Toàn bộ dữ liệu đầu ra của node "${label}" (${type}). Dùng .data.field để lấy trường cụ thể.`,
      group: 'node' as TemplateVarGroup,
    });

    // Nếu là node CRM Get Contacts
    if (type === 'crm.getContacts') {
      vars.push(
        {
          key: `$node.${label}.contacts`,
          label: `Danh sách khách hàng từ "${label}"`,
          description: `Mảng chứa danh sách tất cả các khách hàng lấy được từ bộ lọc CRM.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.count`,
          label: `Số lượng khách hàng từ "${label}"`,
          description: `Tổng số khách hàng tìm được từ node CRM "${label}".`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].contact_id`,
          label: `ID Zalo khách hàng đầu tiên (từ "${label}")`,
          description: `Mã định danh ID Zalo của khách hàng đầu tiên tìm thấy.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].display_name`,
          label: `Tên Zalo khách hàng đầu tiên (từ "${label}")`,
          description: `Tên hiển thị Zalo của khách hàng đầu tiên tìm thấy.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].salutation`,
          label: `Xưng hô khách hàng đầu tiên (từ "${label}")`,
          description: `Danh xưng/Xưng hô (Anh, Chị, Bạn, Em...) của khách hàng đầu tiên tìm thấy.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].alias`,
          label: `Biệt danh CRM khách hàng đầu tiên (từ "${label}")`,
          description: `Biệt danh của khách hàng đầu tiên lưu trong CRM.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].phone`,
          label: `Số điện thoại khách hàng đầu tiên (từ "${label}")`,
          description: `Số điện thoại của khách hàng đầu tiên lưu trong CRM.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].gender`,
          label: `Giới tính khách hàng đầu tiên (từ "${label}")`,
          description: `Giới tính của khách hàng đầu tiên: 1=Nam, 2=Nữ.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].birthday`,
          label: `Ngày sinh nhật khách hàng đầu tiên (từ "${label}")`,
          description: `Ngày sinh nhật của khách hàng đầu tiên (VD: 01/07/1996).`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].avatar`,
          label: `URL Avatar khách hàng đầu tiên (từ "${label}")`,
          description: `Đường dẫn ảnh đại diện của khách hàng đầu tiên.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].pipeline_stage_id`,
          label: `ID bước phễu khách hàng đầu tiên (từ "${label}")`,
          description: `ID của bước trạng thái trong phễu Pipeline của khách hàng đầu tiên.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].channel`,
          label: `Kênh liên lạc khách hàng đầu tiên (từ "${label}")`,
          description: `Kênh liên lạc (zalo, facebook, ...) của khách hàng đầu tiên.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].aiProfile`,
          label: `Hồ sơ AI khách hàng đầu tiên (từ "${label}")`,
          description: `Hồ sơ tóm tắt tự động do AI phân tích cho khách hàng đầu tiên.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].extraData`,
          label: `Dữ liệu mở rộng khách hàng đầu tiên (từ "${label}")`,
          description: `Chuỗi dữ liệu chi tiết dạng JSON chứa các trường thông tin tự định nghĩa của khách hàng đầu tiên.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].extraDataObject`,
          label: `Object dữ liệu mở rộng khách hàng đầu tiên (từ "${label}")`,
          description: `Dữ liệu mở rộng đã parse thành object. Dùng $node.${label}.contacts[0].extraDataObject.tenTruong để lấy trường cụ thể.`,
          group: 'node' as TemplateVarGroup,
        },
        {
          key: `$node.${label}.contacts[0].labels`,
          label: `Mảng nhãn khách hàng đầu tiên (từ "${label}")`,
          description: `Danh sách các nhãn tag được gán cho khách hàng đầu tiên. Mỗi nhãn có id, name, color.`,
          group: 'node' as TemplateVarGroup,
        }
      );
    }
  }

  return vars;
}
