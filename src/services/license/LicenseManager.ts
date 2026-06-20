import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import Logger from '../../utils/Logger';

// ─── License API Configuration ────────────────────────────────────────────────
// Ưu tiên: runtime config (zagi-config.json) > env var (.env) > fallback mặc định
// Fallback được nhúng sẵn để production build hoạt động không cần .env
const LICENSE_CONFIG = {
  get apiUrl(): string {
    return LicenseManager._runtimeConfig?.apiUrl
      || process.env.LICENSE_API_URL
      || 'https://script.google.com/macros/s/AKfycbwfAp3H9lUTrFLDakhpCmLZB6h9V9bViGSmCTMtp49MbujLK-vT6aPbSQhsJZNs0T4qVg/exec';
  },
  get apiSecret(): string {
    // Production builds không có .env → dùng fallback mặc định
    return LicenseManager._runtimeConfig?.apiSecret
      || process.env.LICENSE_API_SECRET
      || 'YOUR_SECRET_KEY_HERE_hanoi@123a';
  },
};

const CACHE_DAYS = 3;
const GRACE_PERIOD_DAYS = 7;   // Số ngày ân hạn sau khi hết hạn
const EXPIRY_WARN_DAYS  = 7;   // Cảnh báo khi còn ≤ N ngày

/**
 * Parse ngày từ chuỗi, hỗ trợ cả 2 format:
 *   - dd/MM/yyyy  (Apps Script output)
 *   - yyyy-MM-dd  (ISO standard)
 *   - ISO string  (new Date().toISOString())
 */
function parseDateStr(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // dd/MM/yyyy hoặc d/M/yyyy
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
  }
  // Fallback: ISO / yyyy-MM-dd / any standard
  return new Date(dateStr);
}

export interface LicenseInfo {
  email: string;
  licenseKey: string;
  plan: string;
  expiryDate?: string;
  isLifetime: boolean;
  status: 'active' | 'expired' | 'pending';
  fullName?: string;
  phone?: string;
  cachedAt?: string;
  daysLeft?: number | null;
}

export interface RegisterParams {
  email: string;
  fullName?: string;
  phone?: string;
  plan: string;
}

export class LicenseManager {
  /** Runtime config được inject từ encrypted config file khi startup */
  static _runtimeConfig: { apiUrl?: string; apiSecret?: string } | null = null;

  /** Inject config từ encrypted source (gọi trong main process khi khởi động) */
  static setRuntimeConfig(config: { apiUrl?: string; apiSecret?: string }): void {
    LicenseManager._runtimeConfig = config;
  }

  /**
   * Google Apps Script trả về 302 redirect khi nhận POST.
   * Redirect URL chỉ nhận GET (không nhận POST lại).
   * Flow đúng: POST gốc → lấy Location URL → GET vào URL đó.
   */
  private async postWithRedirect(url: string, body: object, timeoutMs = 15000): Promise<any> {
    // Bước 1: POST đến URL gốc, KHÔNG follow redirect (để lấy Location)
    const firstRes = await axios.post(url, body, {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 0,
      validateStatus: (s) => s < 400 || s === 302 || s === 301,
    });

    // Bước 2: Nếu có redirect → GET vào Location URL (Apps Script pattern)
    if ((firstRes.status === 301 || firstRes.status === 302) && firstRes.headers['location']) {
      const redirectUrl = firstRes.headers['location'];
      Logger.log(`[LicenseManager] Following redirect (GET) to: ${redirectUrl}`);
      const secondRes = await axios.get(redirectUrl, {
        timeout: timeoutMs,
        maxRedirects: 5,
      });
      return secondRes.data;
    }

    return firstRes.data;
  }

  private getLicenseFile(): string {
    return path.join(app.getPath('userData'), 'license.dat');
  }

  // === ĐĂNG KÝ LICENSE MỚI ===
  async register({ email, fullName, phone, plan }: RegisterParams): Promise<any> {
    try {
      const result = await this.postWithRedirect(LICENSE_CONFIG.apiUrl, {
        secret: LICENSE_CONFIG.apiSecret,
        action: 'register',
        email: email.trim().toLowerCase(),
        fullName: fullName || '',
        phone: phone || '',
        plan: plan
      }, 15000);
      
      // Nếu là trial → auto activate luôn
      if (result.success && !result.pending && result.license) {
        this.saveLicense(result.license);
      }
      
      if (result && result.success) {
        return result;
      }
      throw new Error(result?.message || 'Invalid server response');
    } catch (err: any) {
      Logger.error('[LicenseManager] Register API error:', err.message);
      
      if (plan === 'trial') {
        return {
          success: false,
          message: 'Không thể kết nối server: ' + err.message
        };
      }
      
      // Cú pháp dự phòng khi đăng ký gói trả phí ngoại tuyến
      const shortKey = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                       Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                       Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                       Math.random().toString(36).substring(2, 6).toUpperCase();
      
      const amount = plan.includes('lifetime') ? (plan.startsWith('solo') ? 7450000 : 14900000) :
                     plan.includes('12m') ? (plan.startsWith('solo') ? 4450000 : 8900000) :
                     (plan.startsWith('solo') ? 2450000 : 4900000);
      const transferContent = 'ZAGI ' + shortKey.split('-').pop();
      
      return {
        success: true,
        pending: true,
        message: 'Đăng ký ngoại tuyến thành công! Vui lòng thanh toán để kích hoạt.',
        licenseKey: shortKey,
        plan: plan,
        duration: plan.includes('lifetime') ? 'Vĩnh viễn' : plan.includes('12m') ? '12 tháng' : '6 tháng',
        paymentInfo: {
          amount: amount,
          bankName: 'Techcombank',
          accountNumber: '63666999',
          accountName: 'CONG TY CO PHAN BASAN',
          transferContent: transferContent,
          companyAddress: 'Số SA 34, Khu đô thị FLC Garden City, Phường Tây Mỗ, Quận Nam Từ Liêm, Thành phố Hà Nội, Việt Nam',
          qrUrl: `https://img.vietqr.io/image/Techcombank-63666999-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent('CONG TY CO PHAN BASAN')}`
        }
      };
    }
  }

  // === LẤY DANH SÁCH GÓI VÀ CONFIG NGÂN HÀNG ===
  async getPlans(): Promise<any> {
    Logger.log(`[LicenseManager] Fetching plans from: ${LICENSE_CONFIG.apiUrl}`);
    Logger.log(`[LicenseManager] Using API secret: ${LICENSE_CONFIG.apiSecret ? '***' + LICENSE_CONFIG.apiSecret.slice(-4) : 'none'}`);
    try {
      const result = await this.postWithRedirect(LICENSE_CONFIG.apiUrl, {
        secret: LICENSE_CONFIG.apiSecret,
        action: 'get_plans'
      }, 10000);
      
      if (result && result.success && result.plans) {
        Logger.log('[LicenseManager] Fetch plans response:', JSON.stringify(result));
        return result;
      }
      throw new Error('Invalid server response structure');
    } catch (err: any) {
      Logger.error('[LicenseManager] Fetch plans error:', err.message);
      
      // Fallback bảng giá cục bộ khi không kết nối được máy chủ hoặc cấu hình sai
      Logger.log('[LicenseManager] Using local fallback configuration for plans');
      return { 
        success: true, 
        plans: {
          'solo_6m':       { name: 'Gói Solo 6 tháng',    amount: 2450000,  desc: 'Sử dụng đầy đủ trong 6 tháng', type: 'solo' },
          'solo_12m':      { name: 'Gói Solo 12 tháng',   amount: 4450000,  desc: 'Lựa chọn tối ưu cho 1 năm',    type: 'solo', popular: true },
          'solo_lifetime': { name: 'Gói Solo Vĩnh viễn',  amount: 7450000,  desc: 'Thanh toán một lần, dùng trọn đời', type: 'solo' },
          'team_6m':       { name: 'Gói Team 6 tháng',    amount: 4900000,  desc: 'Sử dụng đầy đủ trong 6 tháng', type: 'team' },
          'team_12m':      { name: 'Gói Team 12 tháng',   amount: 8900000,  desc: 'Lựa chọn tối ưu cho 1 năm',    type: 'team', popular: true },
          'team_lifetime': { name: 'Gói Team Vĩnh viễn',  amount: 14900000, desc: 'Thanh toán một lần, dùng trọn đời', type: 'team' }
        },
        bankConfig: {
          bankName: 'Techcombank',
          accountNumber: '63666999',
          accountName: 'CONG TY CO PHAN BASAN',
          companyAddress: 'Số SA 34, Khu đô thị FLC Garden City, Phường Tây Mỗ, Quận Nam Từ Liêm, Thành phố Hà Nội, Việt Nam'
        }
      };
    }
  }
  
  // === VERIFY (giữ nguyên + thêm licenseKey) ===
  async verifyEmail(email: string, licenseKey: string | null = null): Promise<any> {
    try {
      const result = await this.postWithRedirect(LICENSE_CONFIG.apiUrl, {
        secret: LICENSE_CONFIG.apiSecret,
        action: 'verify',
        email: email.trim().toLowerCase(),
        licenseKey: licenseKey
      }, 10000);
      
      if (result.success) {
        // Server confirm status = 'expired' → không cho vào
        if (result.license.status === 'expired') {
          Logger.log('[LicenseManager][verifyEmail] Server confirm expired');
          return { 
            success: false, 
            message: 'License đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' 
          };
        }

        const existingLicense = this.loadLicense();
        const mergedLicense = { ...result.license };

        // Bảo vệ: chỉ fallback expiryDate cũ khi:
        //   1. Server không trả expiryDate, VÀ
        //   2. expiryDate cũ vẫn còn hạn (tránh merge ngày hết hạn → block gửi tin)
        // Nếu server xác nhận status='active' rõ ràng → KHÔNG dùng expiryDate cũ đã hết hạn
        if (!mergedLicense.expiryDate && existingLicense?.expiryDate) {
          const serverConfirmsActive = result.license.status === 'active';
          if (!serverConfirmsActive) {
            // Server chưa xác nhận active rõ ràng → dùng expiryDate cũ
            mergedLicense.expiryDate = existingLicense.expiryDate;
          } else {
            // Server đã xác nhận active → chỉ dùng expiryDate cũ nếu vẫn còn hạn
            const today = new Date();
            const oldExpiry = parseDateStr(existingLicense.expiryDate);
            const oldDaysLeft = Math.ceil((oldExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (oldDaysLeft >= 0 || existingLicense.isLifetime) {
              // expiryDate cũ vẫn hợp lệ → merge bình thường
              mergedLicense.expiryDate = existingLicense.expiryDate;
            } else {
              // expiryDate cũ đã hết hạn nhưng server vừa confirm active
              // → Không merge → để expiryDate = undefined → getCurrentLicense sẽ không block
              Logger.log(`[LicenseManager][verifyEmail] Server=active but old expiryDate expired (${oldDaysLeft}d). Clearing expiryDate to avoid false grace period.`);
            }
          }
        }

        // Kiểm tra lại chỉ khi server KHÔNG xác nhận status='active' rõ ràng
        // Nếu server trả status='active', ưu tiên tin tưởng server (đã gia hạn)
        if (result.license.status !== 'active' && !mergedLicense.isLifetime && mergedLicense.expiryDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expiry = parseDateStr(mergedLicense.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          Logger.log(`[LicenseManager][verifyEmail] Local expiryDate check: daysLeft=${daysLeft}`);
          // Chỉ từ chối nếu hết hạn QUÁ GRACE_PERIOD (server đã xác nhận không active)
          if (daysLeft < -GRACE_PERIOD_DAYS) {
            return {
              success: false,
              message: 'License đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.'
            };
          }
        }

        // Đảm bảo status được set đúng khi lưu
        mergedLicense.status = 'active';
        Logger.log(`[LicenseManager][verifyEmail] Saving active license: plan=${mergedLicense.plan} expiryDate=${mergedLicense.expiryDate}`);
        this.saveLicense(mergedLicense);
        return { success: true, license: mergedLicense };
      }
      
      return result;
    } catch (err: any) {
      const cached = this.getCurrentLicense();
      if (cached) {
        if (this.isCacheValid(cached)) {
          return { success: true, license: cached, offline: true };
        }
        // Offline nhưng vẫn trong grace period → cho phép vào app ở chế độ read-only
        if (cached.status === 'expired') {
          const daysLeft = cached.daysLeft ?? -999;
          if (daysLeft >= -GRACE_PERIOD_DAYS && daysLeft < 0) {
            Logger.log(`[LicenseManager][verifyEmail] Offline fallback: cached expired but within grace period (${daysLeft}d). Letting in read-only.`);
            return { success: true, license: cached, offline: true };
          }
        }
      }
      return { 
        success: false, 
        message: 'Không thể kết nối server. Vui lòng kiểm tra Internet.' 
      };
    }
  }
  
  // === Lưu / đọc license (bảo mật bằng safeStorage) ===
  saveLicense(license: LicenseInfo): void {
    try {
      const data = { ...license, cachedAt: new Date().toISOString() };
      const jsonStr = JSON.stringify(data);
      const filePath = this.getLicenseFile();
      
      // Tạo thư mục cha nếu chưa tồn tại
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(jsonStr);
        fs.writeFileSync(filePath, encrypted);
      } else {
        fs.writeFileSync(filePath, jsonStr);
      }
    } catch (err) {
      Logger.error('Save error:', err);
    }
  }
  
  loadLicense(): LicenseInfo | null {
    try {
      const filePath = this.getLicenseFile();
      if (!fs.existsSync(filePath)) return null;
      const buffer = fs.readFileSync(filePath);
      let jsonStr: string;
      if (safeStorage.isEncryptionAvailable()) {
        jsonStr = safeStorage.decryptString(buffer);
      } else {
        jsonStr = buffer.toString();
      }
      return JSON.parse(jsonStr) as LicenseInfo;
    } catch (err) {
      return null;
    }
  }
  
  isCacheValid(license: LicenseInfo): boolean {
    if (!license.cachedAt) {
      Logger.log('[LicenseManager][isCacheValid] FAIL: no cachedAt');
      return false;
    }
    const cachedDate = new Date(license.cachedAt);
    const now = new Date();
    const diffDays = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > CACHE_DAYS || diffDays < 0) {
      Logger.log(`[LicenseManager][isCacheValid] FAIL: cache too old (${diffDays.toFixed(1)} days)`);
      return false;
    }
    if (!license.isLifetime && license.expiryDate) {
      const expiry = parseDateStr(license.expiryDate);
      Logger.log(`[LicenseManager][isCacheValid] expiryDate=${license.expiryDate} → parsed=${expiry.toISOString()} valid=${!isNaN(expiry.getTime())}`);
      if (now > expiry) {
        Logger.log('[LicenseManager][isCacheValid] FAIL: license expired');
        return false;
      }
    }
    return true;
  }
  
  getCurrentLicense(): LicenseInfo | null {
    const license = this.loadLicense();
    if (!license) {
      Logger.log('[LicenseManager][getCurrentLicense] No license file found');
      return null;
    }
    Logger.log(`[LicenseManager][getCurrentLicense] Raw: plan=${license.plan} status=${license.status} isLifetime=${license.isLifetime} expiryDate=${license.expiryDate} cachedAt=${license.cachedAt}`);
    if (license.isLifetime) {
      license.daysLeft = null;
      license.status = 'active';
      Logger.log('[LicenseManager][getCurrentLicense] → LIFETIME active');
    } else if (license.expiryDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = parseDateStr(license.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      Logger.log(`[LicenseManager][getCurrentLicense] expiryDate=${license.expiryDate} → parsed=${expiry.toISOString()} isValidDate=${!isNaN(expiry.getTime())}`);
      const diffMs = expiry.getTime() - today.getTime();
      license.daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      license.status = license.daysLeft < 0 ? 'expired' : 'active';
      Logger.log(`[LicenseManager][getCurrentLicense] → daysLeft=${license.daysLeft} status=${license.status}`);
    } else {
      Logger.log(`[LicenseManager][getCurrentLicense] No expiryDate! plan=${license.plan} status_in_file=${license.status}`);
      if (license.plan === 'trial' || license.status === 'expired') {
        license.daysLeft = -999;
        license.status = 'expired';
        Logger.log('[LicenseManager][getCurrentLicense] → forced expired (trial/no-expiry)');
      }
    }
    return license;
  }
  
  needsActivation(): boolean {
    // Bỏ qua kiểm tra license khi chạy dev build để lập trình thuận tiện
    // if (!app.isPackaged) {
    //   return false;
    // }

    const license = this.getCurrentLicense();
    if (!license) return true;

    // Hết hạn: cho phép dùng thêm GRACE_PERIOD_DAYS ngày (grace period)
    if (license.status === 'expired') {
      const daysLeft = license.daysLeft ?? -999;
      if (daysLeft >= -GRACE_PERIOD_DAYS) {
        // Vẫn trong grace period → cho vào app nhưng ở chế độ read-only
        // Verify ngầm (có throttle) để tự động cập nhật nếu đã gia hạn
        const now = new Date();
        const cachedDate = license.cachedAt ? new Date(license.cachedAt) : new Date(0);
        const hoursSinceLastCheck = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastCheck > 24) {
          Logger.log(`[LicenseManager][needsActivation] Expired but in grace period (${daysLeft}d). Last check was ${hoursSinceLastCheck.toFixed(1)}h ago. Triggering online re-verify...`);
          this.reVerifyInBackground(license.email, license.licenseKey);
        } else {
          Logger.log(`[LicenseManager][needsActivation] Expired but in grace period (${daysLeft}d). Last check was ${hoursSinceLastCheck.toFixed(1)}h ago (throttled < 24h). Skipping online re-verify.`);
        }
        return false;
      }
      return true; // Hết grace period → chặn hoàn toàn
    }

    if (!this.isCacheValid(license)) this.reVerifyInBackground(license.email, license.licenseKey);
    return false;
  }

  /** Đang trong thời gian ân hạn (-GRACE_PERIOD_DAYS đến -1 ngày) */
  isInGracePeriod(): boolean {
    const license = this.getCurrentLicense();
    if (!license) {
      Logger.log('[LicenseManager][isInGracePeriod] No license → false');
      return false;
    }
    if (license.status !== 'expired') {
      Logger.log(`[LicenseManager][isInGracePeriod] status=${license.status} → false (not expired)`);
      return false;
    }
    const daysLeft = license.daysLeft ?? -999;
    const result = daysLeft >= -GRACE_PERIOD_DAYS && daysLeft < 0;
    Logger.log(`[LicenseManager][isInGracePeriod] status=expired daysLeft=${daysLeft} graceLimit=${-GRACE_PERIOD_DAYS} → ${result}`);
    return result;
  }

  /** Sắp hết hạn (còn ≤ EXPIRY_WARN_DAYS ngày, chưa hết) */
  isExpiringSoon(): boolean {
    const license = this.getCurrentLicense();
    if (!license || license.isLifetime) return false;
    if (license.status === 'expired') return false;
    const daysLeft = license.daysLeft ?? 999;
    return daysLeft >= 0 && daysLeft <= EXPIRY_WARN_DAYS;
  }
  
  async reVerifyInBackground(email: string, licenseKey: string): Promise<void> {
    try { 
      await this.verifyEmail(email, licenseKey); 
    } catch (err) {}
  }
  
  clearLicense(): void {
    try {
      const filePath = this.getLicenseFile();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {}
  }
  
  getDisplayMessage(license: LicenseInfo): string {
    if (!license) return 'Chưa kích hoạt';
    if (license.isLifetime) return '✨ Bản quyền Vĩnh viễn';
    const days = license.daysLeft ?? 0;
    const planName = this.getPlanName(license.plan);
    if (days < 0) return `❌ ${planName} - Đã hết hạn`;
    if (days === 0) return `⚠️ ${planName} - Hết hạn hôm nay`;
    if (days <= 7) return `⚠️ ${planName} - Còn ${days} ngày`;
    return `✅ ${planName} - Còn ${days} ngày`;
  }
  
  getPlanName(plan: string): string {
    const plans: Record<string, string> = { 
      'trial': 'Dùng thử', 
      '6m': 'Gói 6 tháng', 
      '12m': 'Gói 1 năm', 
      'lifetime': 'Vĩnh viễn',
      'solo_6m': 'Gói Solo 6 tháng',
      'solo_12m': 'Gói Solo 12 tháng',
      'solo_lifetime': 'Gói Solo Vĩnh viễn',
      'team_6m': 'Gói Team 6 tháng',
      'team_12m': 'Gói Team 12 tháng',
      'team_lifetime': 'Gói Team Vĩnh viễn'
    };
    return plans[plan] || plan;
  }
}

export default new LicenseManager();
