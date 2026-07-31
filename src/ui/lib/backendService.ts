/**
 * Backend Service — Giao tiếp với Backend Server Deplao (Premium features)
 *
 * Backend xử lý: quét nhóm ẩn, kiểm tra premium.
 *
 * API endpoints:
 *   POST https://deplaoapp.com/api/scan/premium-status  → kiểm tra premium
 *   POST https://deplaoapp.com/api/scan/group            → quét thành viên nhóm
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

/**
 * Mã hóa / Base64 encode body trước khi gửi lên Deplao backend.
 */
async function encryptBody(body: object): Promise<string> {
  try {
    const jsonStr = JSON.stringify(body);
    const win = (globalThis as any).window;
    if (win && win.btoa) {
      return win.btoa(unescape(encodeURIComponent(jsonStr)));
    }
    return Buffer.from(jsonStr).toString('base64');
  } catch (err) {
    console.warn('[backendService] encryptBody fallback:', err);
    return Buffer.from(JSON.stringify(body)).toString('base64');
  }
}

/**
 * Gọi API backend Deplao.
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
    headers: { 'Content-Type': 'application/json' },
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
 * Quét thành viên nhóm qua backend Deplao.
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
      error: err.message || 'Lỗi kết nối backend Deplao',
    };
  }
}
