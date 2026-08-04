/**
 * ZaloErrorDictionary.ts
 * Từ điển và bộ phân loại mã lỗi Zalo API tập trung cho Zagi.
 * Giúp phân biệt chính xác nguyên nhân lỗi (Lỗi từ Nick bạn hay Lỗi từ Nick khách)
 * và gợi ý hướng xử lý trực quan cho người dùng.
 */

export type ZaloErrorCategory =
  | 'ACCOUNT_LIMIT'       // Lỗi do tài khoản của bạn chạm hạn ngạch / bị khóa tính năng
  | 'STRANGER_PRIVACY'    // Lỗi do phía khách hàng cài đặt quyền riêng tư (chặn người lạ, block)
  | 'CONTENT_SPAM'        // Lỗi do nội dung tin nhắn chứa link/từ khóa cấm
  | 'EXPIRED_SESSION'     // Lỗi do phiên đăng nhập Zalo bị hết hạn / checkpoint
  | 'UNKNOWN';            // Lỗi không xác định

export interface ZaloErrorDetail {
  code: number;
  category: ZaloErrorCategory;
  title: string;
  userMessage: string;
  actionableAdvice: string;
  shouldAutoPauseCampaign: boolean; // Tự động dừng chiến dịch để bảo vệ nick
}

export const ZALO_ERROR_DICTIONARY: Record<number, ZaloErrorDetail> = {
  // ── 1. Quét / Tìm kiếm SĐT ────────────────────────────────────────────────
  [-216]: {
    code: -216,
    category: 'ACCOUNT_LIMIT',
    title: 'Hết hạn ngạch quét SĐT',
    userMessage: 'Tài khoản Zalo hiện tại đã đạt giới hạn quét SĐT trong ngày (Mã -216).',
    actionableAdvice: 'Đổi sang nick Zalo khác để tiếp tục quét hoặc chờ qua 24h để reset hạn ngạch.',
    shouldAutoPauseCampaign: true,
  },
  [216]: {
    code: 216,
    category: 'ACCOUNT_LIMIT',
    title: 'Hết hạn ngạch quét SĐT',
    userMessage: 'Tài khoản Zalo hiện tại đã đạt giới hạn quét SĐT trong ngày (Mã 216).',
    actionableAdvice: 'Đổi sang nick Zalo khác để tiếp tục quét hoặc chờ qua 24h để reset hạn ngạch.',
    shouldAutoPauseCampaign: true,
  },
  [50004]: {
    code: 50004,
    category: 'ACCOUNT_LIMIT',
    title: 'Quét SĐT quá nhanh',
    userMessage: 'Tần suất tìm kiếm SĐT quá dồn dập trong thời gian ngắn (Mã 50004).',
    actionableAdvice: 'Tăng thời gian giãn cách (Delay) giữa các lượt quét từ 10s - 20s.',
    shouldAutoPauseCampaign: true,
  },
  [5001]: {
    code: 5001,
    category: 'STRANGER_PRIVACY',
    title: 'SĐT chưa đăng ký / Ẩn SĐT',
    userMessage: 'SĐT chưa đăng ký Zalo hoặc khách hàng bật cài đặt Tắt tìm kiếm qua SĐT.',
    actionableAdvice: 'Liên hệ khách hàng qua Cuộc gọi thoại hoặc tin nhắn SMS.',
    shouldAutoPauseCampaign: false,
  },
  [5004]: {
    code: 5004,
    category: 'STRANGER_PRIVACY',
    title: 'SĐT không tồn tại',
    userMessage: 'Không tìm thấy tài khoản Zalo gắn liền với SĐT này.',
    actionableAdvice: 'Bỏ qua hoặc kiểm tra lại định dạng số điện thoại.',
    shouldAutoPauseCampaign: false,
  },

  // ── 2. Gửi tin nhắn ───────────────────────────────────────────────────────
  [108]: {
    code: 108,
    category: 'ACCOUNT_LIMIT',
    title: 'Tài khoản bị giới hạn gửi tin',
    userMessage: 'Zalo tạm khóa tính năng gửi tin nhắn của tài khoản này do nghi ngờ Spam (Mã 108).',
    actionableAdvice: 'Tạm dừng chiến dịch 6h - 24h, tăng Delay gửi tin lên 60s - 120s và cá nhân hóa mẫu tin.',
    shouldAutoPauseCampaign: true,
  },
  [127]: {
    code: 127,
    category: 'ACCOUNT_LIMIT',
    title: 'Khóa gửi tin cho người lạ',
    userMessage: 'Tài khoản bị chặn gửi tin nhắn cho người lạ trong 24h-72h (Mã 127).',
    actionableAdvice: 'Đổi sang tài khoản Zalo phụ khác hoặc chỉ gửi tin cho danh bạ đã kết bạn.',
    shouldAutoPauseCampaign: true,
  },
  [-201]: {
    code: -201,
    category: 'STRANGER_PRIVACY',
    title: 'Khách chặn tin nhắn người lạ',
    userMessage: 'Người nhận bật cài đặt riêng tư "Không nhận tin nhắn từ người lạ".',
    actionableAdvice: 'Gửi lời mời kết bạn trước, khi đối phương chấp nhận mới tiến hành gửi tin.',
    shouldAutoPauseCampaign: false,
  },
  [201]: {
    code: 201,
    category: 'STRANGER_PRIVACY',
    title: 'Khách chặn tin nhắn người lạ',
    userMessage: 'Người nhận bật cài đặt riêng tư "Không nhận tin nhắn từ người lạ".',
    actionableAdvice: 'Gửi lời mời kết bạn trước, khi đối phương chấp nhận mới tiến hành gửi tin.',
    shouldAutoPauseCampaign: false,
  },
  [-202]: {
    code: -202,
    category: 'STRANGER_PRIVACY',
    title: 'Khách hàng đã chặn bạn',
    userMessage: 'Người nhận đã chủ động Chặn (Block) tài khoản Zalo của bạn.',
    actionableAdvice: 'Không thể tương tác. Bỏ qua liên hệ này.',
    shouldAutoPauseCampaign: false,
  },
  [202]: {
    code: 202,
    category: 'STRANGER_PRIVACY',
    title: 'Khách hàng đã chặn bạn',
    userMessage: 'Người nhận đã chủ động Chặn (Block) tài khoản Zalo của bạn.',
    actionableAdvice: 'Không thể tương tác. Bỏ qua liên hệ này.',
    shouldAutoPauseCampaign: false,
  },
  [3001]: {
    code: 3001,
    category: 'CONTENT_SPAM',
    title: 'Nội dung chứa từ cấm / link rác',
    userMessage: 'Nội dung tin nhắn chứa đường link hoặc từ khóa bị Zalo quét vi phạm chính sách.',
    actionableAdvice: 'Chỉnh sửa lại nội dung tin nhắn, rút gọn link hoặc đổi từ khóa.',
    shouldAutoPauseCampaign: true,
  },

  // ── 3. Kết bạn & Mời nhóm ─────────────────────────────────────────────────
  [300]: {
    code: 300,
    category: 'ACCOUNT_LIMIT',
    title: 'Hết hạn ngạch gửi lời mời kết bạn',
    userMessage: 'Đã đạt giới hạn gửi lời mời kết bạn trong ngày của tài khoản Zalo (Mã 300).',
    actionableAdvice: 'Thu hồi các lời mời đã gửi lâu chưa duyệt hoặc đổi sang tài khoản Zalo khác.',
    shouldAutoPauseCampaign: true,
  },
  [-300]: {
    code: -300,
    category: 'ACCOUNT_LIMIT',
    title: 'Hết hạn ngạch gửi lời mời kết bạn',
    userMessage: 'Đã đạt giới hạn gửi lời mời kết bạn trong ngày của tài khoản Zalo (Mã -300).',
    actionableAdvice: 'Thu hồi các lời mời đã gửi lâu chưa duyệt hoặc đổi sang tài khoản Zalo khác.',
    shouldAutoPauseCampaign: true,
  },
  [301]: {
    code: 301,
    category: 'ACCOUNT_LIMIT',
    title: 'Hàng chờ kết bạn bị đầy',
    userMessage: 'Danh sách lời mời kết bạn đang chờ vượt quá số lượng cho phép của Zalo.',
    actionableAdvice: 'Vào Zalo trên điện thoại ➔ Thu hồi bớt các lời mời kết bạn cũ chưa được chấp nhận.',
    shouldAutoPauseCampaign: true,
  },
  [-204]: {
    code: -204,
    category: 'STRANGER_PRIVACY',
    title: 'Khách chặn lời mời kết bạn',
    userMessage: 'Người nhận tắt tính năng nhận lời mời kết bạn từ người lạ.',
    actionableAdvice: 'Không thể gửi lời mời kết bạn qua SĐT.',
    shouldAutoPauseCampaign: false,
  },
  [204]: {
    code: 204,
    category: 'STRANGER_PRIVACY',
    title: 'Khách chặn lời mời kết bạn',
    userMessage: 'Người nhận tắt tính năng nhận lời mời kết bạn từ người lạ.',
    actionableAdvice: 'Không thể gửi lời mời kết bạn qua SĐT.',
    shouldAutoPauseCampaign: false,
  },
  [305]: {
    code: 305,
    category: 'STRANGER_PRIVACY',
    title: 'Đã là bạn bè',
    userMessage: 'Tài khoản này và người nhận đã là bạn bè trên Zalo từ trước.',
    actionableAdvice: 'Có thể chuyển thẳng sang gửi tin nhắn.',
    shouldAutoPauseCampaign: false,
  },
  [50012]: {
    code: 50012,
    category: 'ACCOUNT_LIMIT',
    title: 'Giới hạn mời vào nhóm',
    userMessage: 'Tài khoản bị dính giới hạn mời thành viên vào nhóm trong ngày.',
    actionableAdvice: 'Kết bạn trước khi mời vào nhóm hoặc gửi link tham gia nhóm cho khách.',
    shouldAutoPauseCampaign: true,
  },

  // ── 4. Phiên đăng nhập ────────────────────────────────────────────────────
  [-5000]: {
    code: -5000,
    category: 'EXPIRED_SESSION',
    title: 'Hết hạn phiên đăng nhập',
    userMessage: 'Phiên đăng nhập Zalo bị ngắt kết nối hoặc hết hạn.',
    actionableAdvice: 'Quét lại mã QR để đăng nhập lại tài khoản Zalo trên Zagi.',
    shouldAutoPauseCampaign: true,
  },
  [1001]: {
    code: 1001,
    category: 'EXPIRED_SESSION',
    title: 'Phiên đăng nhập không hợp lệ',
    userMessage: 'Phiên đăng nhập Zalo bị đăng xuất hoặc yêu cầu xác minh.',
    actionableAdvice: 'Đăng nhập lại tài khoản Zalo trên Zagi.',
    shouldAutoPauseCampaign: true,
  },
};

/**
 * Phân tích lỗi từ Zalo API response hoặc Catch Exception và trả về ZaloErrorDetail chuẩn hóa.
 */
export function parseZaloError(err: any, res?: any): ZaloErrorDetail {
  // Extract numeric code from error or response
  const rawCode = Number(
    err?.errorCode ?? err?.code ?? err?.error_code ??
    res?.errorCode ?? res?.code ?? res?.error_code ?? 0
  );

  // Extract raw error string
  const rawMsg = String(
    err?.message ?? err?.error ?? err ??
    res?.message ?? res?.error ?? res?.response?.error ?? ''
  ).toLowerCase();

  // 1. Direct match by numeric error code
  if (rawCode !== 0 && ZALO_ERROR_DICTIONARY[rawCode]) {
    return ZALO_ERROR_DICTIONARY[rawCode];
  }

  // 2. String pattern matching fallback
  if (rawMsg.includes('-216') || rawMsg.includes('216') || rawMsg.includes('search limit') || rawMsg.includes('find user limit') || rawMsg.includes('giới hạn tìm kiếm') || rawMsg.includes('quá số lần tìm') || rawMsg.includes('giới hạn quét') || rawMsg.includes('quét sđt')) {
    return ZALO_ERROR_DICTIONARY[-216];
  }
  if (rawMsg.includes('108') || rawMsg.includes('send message rate limit') || rawMsg.includes('giới hạn gửi tin')) {
    return ZALO_ERROR_DICTIONARY[108];
  }
  if (rawMsg.includes('127') || rawMsg.includes('chặn gửi tin nhắn người lạ')) {
    return ZALO_ERROR_DICTIONARY[127];
  }
  if (rawMsg.includes('300') || rawMsg.includes('friend request limit') || rawMsg.includes('giới hạn kết bạn')) {
    return ZALO_ERROR_DICTIONARY[300];
  }
  if (rawMsg.includes('50012') || rawMsg.includes('giới hạn mời nhóm')) {
    return ZALO_ERROR_DICTIONARY[50012];
  }
  if (rawMsg.includes('chặn') || rawMsg.includes('blocked') || rawMsg.includes('không nhận tin nhắn') || rawMsg.includes('người lạ')) {
    return ZALO_ERROR_DICTIONARY[-201];
  }
  if (rawMsg.includes('không tồn tại') || rawMsg.includes('không tìm thấy') || rawMsg.includes('chưa đăng ký')) {
    return ZALO_ERROR_DICTIONARY[5001];
  }

  // 3. Fallback Unknown Error
  return {
    code: rawCode || -1,
    category: 'UNKNOWN',
    title: 'Lỗi chưa xác định',
    userMessage: rawMsg ? `Zalo trả về lỗi: ${rawMsg}` : 'Đã xảy ra lỗi không xác định từ Zalo.',
    actionableAdvice: 'Kiểm tra lại kết nối mạng hoặc thử lại sau.',
    shouldAutoPauseCampaign: false,
  };
}
