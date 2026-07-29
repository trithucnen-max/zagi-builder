/**
 * Backend Service — Giao tiếp với Backend Server (Premium features)
 *
 * Backend xử lý: quét nhóm ẩn, kiểm tra premium.
 * App chỉ gọi API, không chứa logic business.
 *
 * API endpoints:
 *   POST https://zagiapp.com/api/scan/premium-status  → kiểm tra premium
 *   POST https://zagiapp.com/api/scan/group            → quét thành viên nhóm
 */

const BACKEND_URL = 'https://zagiapp.com';
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
 * Mã hóa body bằng AES-128-CBC trước khi gửi lên backend.
 * Dùng crypto module của Node.js (có sẵn trong Electron main/preload).
 */
/**
 * Mã hóa body bằng AES-128-CBC trước khi gửi lên backend.
 * Dùng crypto module của Node.js (có sẵn trong Electron main/preload).
 */
async function encryptBody(body: object): Promise<string> {
  try {
    const g = globalThis as any;
    let cryptoModule: any;
    if (g?.window?.require) {
      cryptoModule = g.window.require('crypto');
    } else {
      const imported = await import('crypto');
      cryptoModule = imported.default || imported;
    }
    const key = Buffer.from(SECRET_KEY, 'hex').slice(0, 16);
    const iv = Buffer.alloc(16, 0);
    const createCipher = cryptoModule.createCipheriv || cryptoModule.default?.createCipheriv;
    if (typeof createCipher === 'function') {
      const cipher = createCipher.call(cryptoModule, 'aes-128-cbc', key, iv);
      let encrypted = cipher.update(JSON.stringify(body), 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return encrypted;
    }
    throw new Error('createCipheriv function unavailable');
  } catch (err) {
    console.warn('[backendService] encryptBody failed, fallback base64:', err);
    const g = globalThis as any;
    return g?.btoa ? g.btoa(JSON.stringify(body)) : Buffer.from(JSON.stringify(body)).toString('base64');
  }
}

/**
 * Gọi API backend với Timeout 6s.
 */
async function callBackend<T>(endpoint: string, body: object): Promise<T> {
  const url = `${BACKEND_URL}${endpoint}`;
  console.log(`[backendService] calling ${url}`, body);

  let encryptedBody: string;
  try {
    encryptedBody = await encryptBody(body);
  } catch (err) {
    console.error('[backendService] encryptBody error:', err);
    throw err;
  }

  const payload = {
    page_id: (body as any).page_id || '',
    body: encryptedBody,
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Máy chủ trả về mã lỗi HTTP ${res.status}`);
    }

    const data = await res.json();
    return data as T;
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  }
}

// ─── API Methods ────────────────────────────────────────────────────────────

/**
 * Lấy trạng thái Premium của page.
 * FE gọi lúc mở tab "Quét nâng cao" (lần đầu) hoặc ấn "Cập nhật"
 */
export async function getPremiumStatus(pageId: string): Promise<PremiumStatus> {
  try {
    const res = await callBackend<any>('/api/scan/premium-status', { page_id: pageId });
    return {
      isPremium: res?.is_premium ?? false,
      expiresAt: res?.premium_expires_at ?? null,
    };
  } catch (err) {
    console.warn('[backendService] getPremiumStatus unreachable:', err);
    return { isPremium: false, expiresAt: null };
  }
}

/**
 * Quét thành viên nhóm qua backend.
 * FE gọi khi user ấn "Quét" (sau khi đã check premium từ localStorage).
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
      error: '❌ Không thể kết nối tới máy chủ quét (zagiapp.com). Tên miền máy chủ không tồn tại hoặc ngắt kết nối DNS.'
    };
  }
}
