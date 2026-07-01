import { DEFAULT_CONFIGS } from '../workflowConfig';
import { WorkflowTemplate } from './workflowTemplates';

export const REAL_ESTATE_TEMPLATES: WorkflowTemplate[] = [
  // ━━━━━ 1. Chúc mừng sinh nhật khách hàng VIP BĐS ━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-birthday',
    name: 'Chúc mừng sinh nhật khách hàng VIP',
    description: 'Tự động quét danh sách sinh nhật khách hàng hàng ngày trong CRM, gửi lời chúc cá nhân hóa kèm voucher giảm phí dịch vụ ký gửi BĐS.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'sinh nhật', 'VIP', 'chăm sóc'],
    icon: '🎂',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '9:00 Hàng ngày',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '0 9 * * *' }
      },
      {
        id: 'n2',
        type: 'crm.getContacts',
        label: 'Khách hàng có sinh nhật hôm nay',
        position: { x: 250, y: 190 },
        config: { ...DEFAULT_CONFIGS['crm.getContacts'], birthdayToday: true, birthdayFilter: 'today' }
      },
      {
        id: 'n3',
        type: 'logic.forEach',
        label: 'Lặp qua từng khách hàng',
        position: { x: 250, y: 330 },
        config: { array: '{{ $node.n2.output.contacts }}', itemVariable: 'item' }
      },
      {
        id: 'n4',
        type: 'zalo.sendMessage',
        label: 'Gửi tin nhắn chúc mừng',
        position: { x: 250, y: 470 },
        config: {
          threadId: '{{ $item.zaloId || $item.id }}',
          threadType: '0',
          message: 'Zagi Land kính chúc {{ $item.salutation }} {{ $item.display_name }} tuổi mới ngập tràn niềm vui, sức khoẻ dồi dào và vạn sự cát tường! 🌸\n\nĐể tri ân sự đồng hành của Anh/Chị, Zagi xin gửi tặng ưu đãi giảm 1% phí dịch vụ môi giới/ký gửi cho giao dịch tiếp theo. Rất hân hạnh được đồng hành cùng Anh/Chị! 🏠'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' }
    ]
  },

  // ━━━━━ 2. Chúc mùng 1 đầu tháng âm lịch (Chiêu Tài Lộc) ━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-lunar-first',
    name: 'Chúc mùng 1 đầu tháng Âm lịch',
    description: 'Chạy quét hàng ngày vào lúc 8:00 sáng. Nếu hôm nay là mùng 1 Âm lịch, hệ thống sẽ tự động gửi lời chúc hanh thông, tài lộc vào nhóm khách hàng.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'lịch âm', 'mùng 1', 'tài lộc'],
    icon: '🏮',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '8:00 Hàng ngày',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '0 8 * * *' }
      },
      {
        id: 'n2',
        type: 'logic.if',
        label: 'Hôm nay là mùng 1?',
        position: { x: 250, y: 190 },
        config: { left: '{{ $system.lunarDay }}', operator: 'equals', right: '1' }
      },
      {
        id: 'n3',
        type: 'zalo.sendMessage',
        label: 'Gửi tin chúc tài lộc',
        position: { x: 250, y: 330 },
        config: {
          threadIds: '[]',
          threadType: '1',
          message: 'Zagi Land kính chúc quý Anh/Chị và gia đình mùng 1 đầu tháng hanh thông, vạn sự cát tường, công việc thuận lợi và đầu tư đắc lợi! 🌟 Mọi dự định trong tháng mới đều gặt hái kết quả tốt đẹp! 🏠'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', sourceHandle: 'true', target: 'n3' }
    ]
  },

  // ━━━━━ 3. Chúc ngày rằm / Lễ Tết Âm lịch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-lunar-mid',
    name: 'Chúc mừng ngày Rằm',
    description: 'Chạy quét hàng ngày vào lúc 8:00 sáng. Nếu hôm nay là ngày 15 Âm lịch (Rằm), hệ thống sẽ gửi tin nhắn chúc bình an đến nhóm khách hàng.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'lịch âm', 'ngày rằm', 'bình an'],
    icon: '🌕',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '8:00 Hàng ngày',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '0 8 * * *' }
      },
      {
        id: 'n2',
        type: 'logic.if',
        label: 'Hôm nay là ngày rằm?',
        position: { x: 250, y: 190 },
        config: { left: '{{ $system.lunarDay }}', operator: 'equals', right: '15' }
      },
      {
        id: 'n3',
        type: 'zalo.sendMessage',
        label: 'Gửi tin chúc bình an',
        position: { x: 250, y: 330 },
        config: {
          threadIds: '[]',
          threadType: '1',
          message: 'Zagi Land kính chúc quý Anh/Chị cùng gia đình ngày Rằm tháng {{ $system.lunarMonth }} âm lịch ngập tràn niềm vui, ấm áp và bình an! 🏮 Chúc mọi dự định của Anh/Chị luôn trọn vẹn như ánh trăng rằm!'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', sourceHandle: 'true', target: 'n3' }
    ]
  },

  // ━━━━━ 4. Chúc mừng ngày Doanh nhân Việt Nam (13/10) ━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-businessman',
    name: 'Chúc mừng ngày Doanh nhân 13/10',
    description: 'Chạy quét hàng ngày lúc 8:30 sáng, nếu đúng ngày 13/10 Dương lịch sẽ gửi tin chúc mừng dành riêng cho tệp khách hàng đầu tư BĐS/chủ doanh nghiệp.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'doanh nhân', '13/10', 'khách VIP'],
    icon: '💼',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '8:30 Hàng ngày',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '30 8 * * *' }
      },
      {
        id: 'n2',
        type: 'data.dateFormat',
        label: 'Lấy ngày tháng (MM-DD)',
        position: { x: 250, y: 190 },
        config: { ...DEFAULT_CONFIGS['data.dateFormat'], format: 'MM-DD' }
      },
      {
        id: 'n3',
        type: 'logic.if',
        label: 'Hôm nay là 13/10?',
        position: { x: 250, y: 330 },
        config: { left: '{{ $node.n2.output }}', operator: 'equals', right: '10-13' }
      },
      {
        id: 'n4',
        type: 'zalo.sendMessage',
        label: 'Gửi tin chúc ngày doanh nhân',
        position: { x: 250, y: 470 },
        config: {
          threadIds: '[]',
          threadType: '1',
          message: 'Nhân ngày Doanh nhân Việt Nam 13/10, Zagi Land kính chúc quý Doanh nhân luôn vững tay chèo, gặt hái nhiều thành công rực rỡ và đưa doanh nghiệp ngày càng vươn xa! 💼 Chúc các dự án đầu tư của Anh/Chị luôn thắng lợi lớn! 🏠'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', sourceHandle: 'true', target: 'n4' }
    ]
  },

  // ━━━━━ 5. Giới thiệu dự án & giỏ hàng mới cho khách cũ (Bán đuôi) ━━━━━━━━━━
  {
    id: 'tpl-re-upsell-project',
    name: 'Gửi giỏ hàng / Dự án mới (Upsell)',
    description: 'Chạy thủ công khi có giỏ hàng mới. Tự động lấy danh sách khách cũ từng mua dự án tương đương và gửi tài liệu nội bộ sớm với chiết khấu tốt.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'dự án mới', 'upsell', 'bán đuôi'],
    icon: '🏢',
    difficulty: 'easy',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.manual',
        label: 'Kích hoạt thủ công',
        position: { x: 250, y: 50 },
        config: {}
      },
      {
        id: 'n2',
        type: 'crm.getContacts',
        label: 'Lấy khách hàng đã mua phân khúc cũ',
        position: { x: 250, y: 190 },
        config: { ...DEFAULT_CONFIGS['crm.getContacts'] }
      },
      {
        id: 'n3',
        type: 'logic.forEach',
        label: 'Lặp qua từng khách hàng',
        position: { x: 250, y: 330 },
        config: { array: '{{ $node.n2.output.contacts }}', itemVariable: 'item' }
      },
      {
        id: 'n4',
        type: 'zalo.sendMessage',
        label: 'Gửi tài liệu & ưu đãi sớm',
        position: { x: 250, y: 470 },
        config: {
          threadId: '{{ $item.zaloId || $item.id }}',
          threadType: '0',
          message: 'Chào {{ $item.salutation }} {{ $item.display_name }}! Zagi Land xin gửi tới Anh/Chị thông tin độc quyền về dự án Diamond Riverside sắp ra mắt vào cuối tháng này.\n\nLà khách hàng thân thiết của chúng tôi, Anh/Chị sẽ được ưu tiên nhận bảng giá suất nội bộ và chiết khấu thêm 1.5% đợt mở bán đầu tiên. Gửi Anh/Chị tài liệu chi tiết: https://zagi.vn/du-an-diamond 🏢'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' }
    ]
  },

  // ━━━━━ 6. Nhắc nhở đóng tiền tiến độ hợp đồng mua nhà ━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-payment-progress',
    name: 'Nhắc nhở nộp tiền tiến độ hợp đồng',
    description: 'Chạy định kỳ vào 9:00 sáng thứ Hai hàng tuần. Truy vấn những khách hàng sắp đến kỳ nộp tiền theo hợp đồng và gửi thông báo nhắc lịch tự động.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'tiến độ', 'nhắc nợ', 'hợp đồng'],
    icon: '💸',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '9:00 Thứ Hai hàng tuần',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '0 9 * * 1' }
      },
      {
        id: 'n2',
        type: 'crm.getContacts',
        label: 'Lấy KH nhãn "Đóng tiền tiến độ"',
        position: { x: 250, y: 190 },
        config: { ...DEFAULT_CONFIGS['crm.getContacts'] }
      },
      {
        id: 'n3',
        type: 'logic.forEach',
        label: 'Lặp qua từng khách hàng',
        position: { x: 250, y: 330 },
        config: { array: '{{ $node.n2.output.contacts }}', itemVariable: 'item' }
      },
      {
        id: 'n4',
        type: 'zalo.sendMessage',
        label: 'Gửi tin nhắn thông báo tiến độ',
        position: { x: 250, y: 470 },
        config: {
          threadId: '{{ $item.zaloId || $item.id }}',
          threadType: '0',
          message: 'Kính gửi {{ $item.salutation }} {{ $item.display_name }}, Zagi Land xin gửi thông báo nhắc lịch thanh toán đợt tiếp theo cho hợp đồng mua căn hộ tại dự án Grand Center.\n\n• Ngày đến hạn: {{ $item.paymentDueDate || "đầu tháng sau" }}\n• Số tiền: Theo phụ lục hợp đồng đã ký\n\nAnh/Chị vui lòng thanh toán đúng hạn để đảm bảo quyền lợi theo hợp đồng. Nếu có bất kỳ câu hỏi nào, vui lòng liên hệ hotline Zagi để được hỗ trợ nhé! 🙏'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' }
    ]
  },

  // ━━━━━ 7. Khảo sát chất lượng sau 30 ngày bàn giao nhà ━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-handover-survey',
    name: 'Khảo sát sau 30 ngày bàn giao nhà',
    description: 'Kích hoạt tự động khi khách hàng được gắn nhãn "Đã bàn giao căn hộ". Luồng sẽ chờ đúng 30 ngày rồi gửi tin nhắn thăm hỏi và link khảo sát.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'khảo sát', 'chăm sóc', 'bàn giao'],
    icon: '🔑',
    difficulty: 'easy',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.labelAssigned',
        label: 'Khi gắn nhãn "Đã bàn giao"',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.labelAssigned'], action: 'assigned' }
      },
      {
        id: 'n2',
        type: 'logic.wait',
        label: 'Chờ 30 ngày (2,592,000s)',
        position: { x: 250, y: 190 },
        config: { delaySeconds: 2592000 }
      },
      {
        id: 'n3',
        type: 'zalo.sendMessage',
        label: 'Gửi thăm hỏi & link khảo sát',
        position: { x: 250, y: 330 },
        config: {
          threadId: '{{ $trigger.threadId }}',
          threadType: '{{ $trigger.threadType }}',
          message: 'Xin chào Anh/Chị {{ $trigger.fromName }}! 👋\n\nVậy là Anh/Chị đã dọn về tổ ấm mới tại Grand Center tròn 1 tháng rồi. Zagi Land hy vọng Anh/Chị và gia đình đang có những trải nghiệm sống thật tuyệt vời tại đây. 🏡\n\nĐể không ngừng nâng cao chất lượng quản lý dịch vụ, Anh/Chị vui lòng dành ra 1 phút giúp Zagi đánh giá mức độ hài lòng tại link khảo sát này nhé: https://zagi.vn/khao-sat-dich-vu 🙏 Xin chân thành cảm ơn Anh/Chị!'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' }
    ]
  },

  // ━━━━━ 8. Gửi báo cáo phân tích thị trường định kỳ cho nhà đầu tư ━━━━━━━━━
  {
    id: 'tpl-re-market-report',
    name: 'Gửi báo cáo thị trường định kỳ',
    description: 'Chạy định kỳ vào lúc 9:00 sáng ngày mùng 1 Dương lịch hàng tháng. Tự động gửi link báo cáo phân tích biến động thị trường BĐS cho tệp nhà đầu tư.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'báo cáo', 'định kỳ', 'nhà đầu tư'],
    icon: '📈',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '9:00 ngày 1 hàng tháng',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '0 9 1 * *' }
      },
      {
        id: 'n2',
        type: 'crm.getContacts',
        label: 'Lấy khách hàng nhãn "Nhà đầu tư"',
        position: { x: 250, y: 190 },
        config: { ...DEFAULT_CONFIGS['crm.getContacts'] }
      },
      {
        id: 'n3',
        type: 'logic.forEach',
        label: 'Lặp qua từng khách hàng',
        position: { x: 250, y: 330 },
        config: { array: '{{ $node.n2.output.contacts }}', itemVariable: 'item' }
      },
      {
        id: 'n4',
        type: 'zalo.sendMessage',
        label: 'Gửi báo cáo phân tích tháng',
        position: { x: 250, y: 470 },
        config: {
          threadId: '{{ $item.zaloId || $item.id }}',
          threadType: '0',
          message: 'Kính gửi {{ $item.salutation }} {{ $item.display_name }}! Zagi Land gửi tới Anh/Chị báo cáo phân tích biến động thị trường Bất động sản và dự báo xu hướng đầu tư trong tháng mới.\n\nTài liệu phân tích chuyên sâu được thực hiện bởi đội ngũ R&D Zagi: https://zagi.vn/bao-cao-thi-truong-thang 📊 Chúc Anh/Chị có những quyết định đầu tư gặt hái nhiều lợi nhuận!'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' }
    ]
  },

  // ━━━━━ 9. Kịch bản BĐS: Chăm sóc sau sự kiện Mở bán ━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tpl-re-event-followup',
    name: 'Chăm sóc sau sự kiện Mở bán',
    description: 'Tự động chạy quét danh sách khách tham dự sự kiện ngày hôm trước, lặp gửi tin cảm ơn cá nhân hóa kèm tài liệu nội bộ, hẹn lịch xem nhà mẫu lần 2.',
    category: 'bat-dong-san',
    tags: ['bất động sản', 'sự kiện', 'mở bán', 'chăm sóc', 'nhà mẫu'],
    icon: '🏠',
    difficulty: 'medium',
    nodes: [
      {
        id: 'n1',
        type: 'trigger.schedule',
        label: '9:00 Hôm sau sự kiện',
        position: { x: 250, y: 50 },
        config: { ...DEFAULT_CONFIGS['trigger.schedule'], cronExpression: '0 9 * * *' }
      },
      {
        id: 'n2',
        type: 'crm.getContacts',
        label: 'Khách tham gia sự kiện',
        position: { x: 250, y: 190 },
        config: { ...DEFAULT_CONFIGS['crm.getContacts'] }
      },
      {
        id: 'n3',
        type: 'logic.forEach',
        label: 'Lặp qua từng khách',
        position: { x: 250, y: 330 },
        config: { array: '{{ $node.n2.output.contacts }}', itemVariable: 'item' }
      },
      {
        id: 'n4',
        type: 'zalo.sendMessage',
        label: 'Gửi cảm ơn & tài liệu BĐS',
        position: { x: 250, y: 470 },
        config: {
          threadId: '{{ $item.zaloId || $item.id }}',
          threadType: '0',
          message: 'Zagi Land cảm ơn {{ $item.salutation }} {{ $item.display_name }} đã dành thời gian quý báu tham dự buổi mở bán dự án ngày hôm qua. Zagi xin gửi {{ $item.salutation }} link tải tài liệu sơ đồ phân lô và giỏ hàng suất ngoại giao cập nhật mới nhất: https://zagi.vn/gio-hang-suat-ngoai-giao 🏢\n\nNếu {{ $item.salutation }} cần hỗ trợ thêm thông tin hoặc đặt lịch xem thực tế dự án, hãy phản hồi lại cho em nhé!'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' }
    ]
  }
];
