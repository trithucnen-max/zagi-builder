/**
 * Backend Service — Giao tiếp với Backend Server (Premium features)
 *
 * Backend xử lý: quét nhóm ẩn, kiểm tra premium, thanh toán QR, chia sẻ nhóm.
 * App chỉ gọi API, không chứa logic business.
 *
 * API endpoints:
 *   POST https://deplaoapp.com/api/scan/premium-status  → kiểm tra premium
 *   POST https://deplaoapp.com/api/scan/group            → quét thành viên nhóm
 *   POST https://deplaoapp.com/api/payment/create-qr     → tạo QR thanh toán
 *   POST https://deplaoapp.com/api/payment/check-status  → kiểm tra trạng thái TT
 *   POST https://deplaoapp.com/api/shared-groups/submit   → chia sẻ nhóm
 *   GET  https://deplaoapp.com/api/shared-groups/list     → danh sách nhóm chung
 */

const BACKEND_URL = 'https://deplaoapp.com';
const SECRET_KEY = 'fb7457b7a39bdc9e742f08b657a8059a5e6a8fda6e32bfe0bfecf37eadf519eb';

export interface PremiumStatus {
  isPremium: boolean;
  expiresAt: string | null; // ISO date string
}

export interface ScanGroupResult {
  success: boolean;
  groupId: string;
  totalMembers: number;
  members: Array<{
    userId: string;
    displayName: string;
    zaloName: string;
    avatar: string;
    accountStatus: number;
    type: number;
    lastUpdateTime: number;
    globalId: string;
    id: string;
  }>;
  error?: string;
}

// ─── Shared Groups Types ────────────────────────────────────────────────────

export interface SharedGroupCategory {
  id: number;
  name: string;
  icon: string;
  count?: number;
}

export const DEFAULT_CATEGORIES: SharedGroupCategory[] = [
  { id: 1, name: 'Kinh doanh', icon: '💼' },
  { id: 2, name: 'Bất động sản', icon: '🏠' },
  { id: 3, name: 'Giáo dục', icon: '📚' },
  { id: 4, name: 'Công nghệ', icon: '💻' },
  { id: 5, name: 'Sức khỏe', icon: '🏥' },
  { id: 6, name: 'Du lịch', icon: '✈️' },
  { id: 7, name: 'Ẩm thực', icon: '🍜' },
  { id: 8, name: 'Thời trang', icon: '👗' },
  { id: 9, name: 'Mỹ phẩm', icon: '💄' },
  { id: 10, name: 'Thực phẩm chức năng', icon: '💊' },
  { id: 11, name: 'Mẹ và bé', icon: '👶' },
  { id: 12, name: 'Nội thất', icon: '🛋️' },
  { id: 13, name: 'Ô tô - Xe máy', icon: '🚗' },
  { id: 14, name: 'Điện tử', icon: '📱' },
  { id: 15, name: 'Thể thao', icon: '⚽' },
  { id: 16, name: 'Thú cưng', icon: '🐾' },
  { id: 17, name: 'Nhà hàng - Khách sạn', icon: '🏨' },
  { id: 99, name: 'Khác', icon: '📁' },
];

export interface SharedGroupItem {
  shareId: string;
  groupId: string;
  groupName: string;
  groupAvatar: string;
  groupLink: string;           // Link nhóm Zalo (https://zalo.me/g/...)
  memberCount: number;
  category: SharedGroupCategory;
  note?: string;               // Ghi chú khi chia sẻ
  submittedBy: string;         // Tên hiển thị
  submittedByUid?: string;     // UID Zalo
  submittedByAvatar?: string;  // Ảnh đại diện
  approvedAt?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface SharedGroupsListResponse {
  success: boolean;
  items: SharedGroupItem[];
  pagination: { page: number; limit: number; total: number };
  categories: SharedGroupCategory[];
}

/**
 * Mã hóa body bằng AES-128-CBC trước khi gửi lên backend.
 * Khóa bí mật là 16 bytes đầu từ hex SECRET_KEY, IV là 16 byte 0.
 */
async function encryptBody(body: object): Promise<string> {
  const jsonStr = JSON.stringify(body);

  // 1. Thử dùng crypto của Electron/Node nếu có
  try {
    const win = (globalThis as any).window;
    const nodeCrypto = win?.require ? win.require('crypto') : null;
    if (nodeCrypto) {
      const key = Buffer.from(SECRET_KEY, 'hex').slice(0, 16);
      const iv = Buffer.alloc(16, 0);
      const cipher = nodeCrypto.createCipheriv('aes-128-cbc', key, iv);
      let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return encrypted;
    }
  } catch (err) {
    console.warn('[backendService] Node crypto not available, trying Web Crypto:', err);
  }

  // 2. Web Crypto API (chuẩn Web / Vite renderer)
  try {
    const cryptoSubtle = globalThis.crypto?.subtle;
    if (cryptoSubtle) {
      const rawHex = SECRET_KEY.slice(0, 32);
      const keyBytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        keyBytes[i] = parseInt(rawHex.substr(i * 2, 2), 16);
      }
      const cryptoKey = await cryptoSubtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-CBC', length: 128 },
        false,
        ['encrypt']
      );
      const iv = new Uint8Array(16);
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(jsonStr);
      const encryptedBuffer = await cryptoSubtle.encrypt(
        { name: 'AES-CBC', iv },
        cryptoKey,
        encodedData
      );
      let binary = '';
      const bytes = new Uint8Array(encryptedBuffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const win = (globalThis as any).window;
      if (win?.btoa) {
        return win.btoa(binary);
      }
      return Buffer.from(bytes).toString('base64');
    }
  } catch (err) {
    console.warn('[backendService] WebCrypto encrypt failed:', err);
  }

  // Fallback (base64 plain)
  try {
    const win = (globalThis as any).window;
    if (win?.btoa) {
      return win.btoa(unescape(encodeURIComponent(jsonStr)));
    }
    return Buffer.from(jsonStr).toString('base64');
  } catch {
    return Buffer.from(jsonStr).toString('base64');
  }
}

/**
 * Gọi API backend.
 */
async function callBackend<T>(endpoint: string, body: object): Promise<T> {
  const url = `${BACKEND_URL}${endpoint}`;

  let encryptedBody: string;
  try {
    encryptedBody = await encryptBody(body);
  } catch (err) {
    console.error('[backendService] encryptBody error:', err);
    throw err;
  }

  const payload = {
    page_id: (body as any).page_id || (body as any).pageId || '',
    body: encryptedBody,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SECRET_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data: any = await res.json().catch(() => ({}));

  if (!res.ok && !data?.error) {
    throw new Error(`Lỗi kết nối máy chủ quét (HTTP ${res.status}). Vui lòng thử lại sau.`);
  }

  return data as T;
}

// ─── API Methods ────────────────────────────────────────────────────────────

/**
 * Lấy trạng thái Premium của page/account.
 */
export async function getPremiumStatus(pageId: string): Promise<PremiumStatus> {
  try {
    const res = await callBackend<any>('/api/scan/premium-status', { page_id: pageId });
    return {
      isPremium: res?.is_premium ?? false,
      expiresAt: res?.premium_expires_at ?? null,
    };
  } catch (err) {
    console.error('[backendService] getPremiumStatus error:', err);
    return { isPremium: false, expiresAt: null };
  }
}

/**
 * Quét thành viên nhóm qua backend.
 */
export async function scanGroupViaBackend(params: {
  pageId: string;
  cookie: string;
  imei: string;
  groupId: string;
}): Promise<ScanGroupResult> {
  try {
    const res = await callBackend<ScanGroupResult>('/api/scan/group', {
      page_id: params.pageId,
      cookie: params.cookie,
      imei: params.imei,
      groupId: params.groupId,
    });
    return res;
  } catch (err: any) {
    console.error('[backendService] scanGroupViaBackend error:', err);
    return {
      success: false,
      groupId: params.groupId,
      totalMembers: 0,
      members: [],
      error: err.message || 'Lỗi kết nối backend',
    };
  }
}

// ─── Shared Groups API ──────────────────────────────────────────────────────

/**
 * Chia sẻ nhóm lên hệ thống (chờ admin duyệt).
 */
export async function submitSharedGroup(params: {
  pageId: string;
  groupId: string;
  groupName: string;
  groupAvatar: string;
  groupLink: string;
  memberCount: number;
  categoryId: number;
  note?: string;
}): Promise<{ success: boolean; shareId: string; status: string; message: string }> {
  const url = `${BACKEND_URL}/api/shared-groups/submit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SECRET_KEY,
    },
    body: JSON.stringify({
      page_id: params.pageId,
      group_id: params.groupId,
      group_name: params.groupName,
      group_avatar: params.groupAvatar,
      group_link: params.groupLink,
      member_count: params.memberCount,
      category_id: params.categoryId,
      note: params.note || '',
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  return {
    success: Boolean(data?.success),
    shareId: data?.share_id || '',
    status: data?.status || '',
    message: data?.message || '',
  };
}

/**
 * Lấy danh sách nhóm chung (đã được admin duyệt).
 */
export async function getSharedGroups(params: {
  pageId: string;
  categoryId?: number;
  page?: number;
  limit?: number;
}): Promise<SharedGroupsListResponse> {
  const query = new URLSearchParams({
    page_id: params.pageId,
    ...(params.categoryId ? { category_id: String(params.categoryId) } : {}),
    ...(params.page ? { page: String(params.page) } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
  }).toString();
  const res = await fetch(`${BACKEND_URL}/api/shared-groups/list?${query}`, {
    headers: { 'x-api-key': SECRET_KEY },
  });
  const data: any = await res.json().catch(() => ({}));

  // Map BE response (snake_case) → FE (camelCase)
  return {
    success: Boolean(data?.success),
    items: (data?.items || []).map((item: any) => ({
      shareId: item.share_id,
      groupId: item.group_id,
      groupName: item.group_name,
      groupAvatar: item.group_avatar,
      groupLink: item.group_link || `https://zalo.me/g/${item.group_id}`,
      memberCount: item.member_count,
      category: item.category,
      note: item.note,
      submittedBy: item.submitted_by,
      submittedByUid: item.submitted_by_uid,
      submittedByAvatar: item.submitted_by_avatar,
      approvedAt: item.approved_at,
      status: item.status,
    })),
    pagination: data.pagination,
    categories: data.categories,
  } as SharedGroupsListResponse;
}
