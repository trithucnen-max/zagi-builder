import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import Logger from '../../utils/Logger';

// ─── License API Configuration ────────────────────────────────────────────────
// Endpoint và secret được đọc từ file config mã hóa khi khởi động.
// Không bao giờ hardcode secret trong source code.
const LICENSE_CONFIG = {
  get apiUrl(): string {
    return LicenseManager._runtimeConfig?.apiUrl
      || process.env.LICENSE_API_URL
      || 'https://script.google.com/macros/s/AKfycbzhNIEpifUJuwquObVZWfNPHFTrQEOuFkJ0mctF7XLn_XGOYSWryg4AI3f_Ik-xvGLMMg/exec';
  },
  get apiSecret(): string {
    // Ưu tiên: runtime config (từ file mã hóa) > biến môi trường
    return LicenseManager._runtimeConfig?.apiSecret
      || process.env.LICENSE_API_SECRET
      || '';
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
  // dd/MM/yyyy
  const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
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
  private getLicenseFile(): string {
    return path.join(app.getPath('userData'), 'license.dat');
  }

  // === ĐĂNG KÝ LICENSE MỚI ===
  async register({ email, fullName, phone, plan }: RegisterParams): Promise<any> {
    try {
      const response = await axios.post(LICENSE_CONFIG.apiUrl, {
        secret: LICENSE_CONFIG.apiSecret,
        action: 'register',
        email: email.trim().toLowerCase(),
        fullName: fullName || '',
        phone: phone || '',
        plan: plan
      }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = response.data;
      
      // Nếu là trial → auto activate luôn
      if (result.success && !result.pending && result.license) {
        this.saveLicense(result.license);
      }
      
      return result;
    } catch (err: any) {
      return { 
        success: false, 
        message: 'Không thể kết nối server: ' + err.message 
      };
    }
  }

  // === LẤY DANH SÁCH GÓI VÀ CONFIG NGÂN HÀNG ===
  async getPlans(): Promise<any> {
    Logger.log(`[LicenseManager] Fetching plans from: ${LICENSE_CONFIG.apiUrl}`);
    Logger.log(`[LicenseManager] Using API secret: ${LICENSE_CONFIG.apiSecret ? '***' + LICENSE_CONFIG.apiSecret.slice(-4) : 'none'}`);
    try {
      const response = await axios.post(LICENSE_CONFIG.apiUrl, {
        secret: LICENSE_CONFIG.apiSecret,
        action: 'get_plans'
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      Logger.log('[LicenseManager] Fetch plans response:', JSON.stringify(response.data));
      return response.data;
    } catch (err: any) {
      Logger.error('[LicenseManager] Fetch plans error:', err.message);
      if (err.response) {
        Logger.error('[LicenseManager] Fetch plans error response:', JSON.stringify(err.response.data));
      }
      return { 
        success: false, 
        message: 'Không thể kết nối server: ' + err.message 
      };
    }
  }
  
  // === VERIFY (giữ nguyên + thêm licenseKey) ===
  async verifyEmail(email: string, licenseKey: string | null = null): Promise<any> {
    try {
      const response = await axios.post(LICENSE_CONFIG.apiUrl, {
        secret: LICENSE_CONFIG.apiSecret,
        action: 'verify',
        email: email.trim().toLowerCase(),
        licenseKey: licenseKey
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = response.data;
      
      if (result.success) {
        if (result.license.status === 'expired') {
          return { 
            success: false, 
            message: 'License đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' 
          };
        }

        // Bảo vệ: nếu server không trả về expiryDate thì giữ lại expiryDate đã lưu cục bộ
        const existingLicense = this.loadLicense();
        const mergedLicense = { ...result.license };
        if (!mergedLicense.expiryDate && existingLicense?.expiryDate) {
          mergedLicense.expiryDate = existingLicense.expiryDate;
        }

        // Kiểm tra lại trạng thái dựa trên expiryDate thực tế sau khi merge
        if (!mergedLicense.isLifetime && mergedLicense.expiryDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expiry = parseDateStr(mergedLicense.expiryDate); // Hỗ trợ dd/MM/yyyy từ Apps Script
          expiry.setHours(0, 0, 0, 0);
          const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          // Nếu thực tế đã hết hạn, không được ghi đè license với status 'active'
          if (daysLeft < -GRACE_PERIOD_DAYS) {
            return {
              success: false,
              message: 'License đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.'
            };
          }
        }

        this.saveLicense(mergedLicense);
        return { success: true, license: mergedLicense };
      }
      
      return result;
    } catch (err: any) {
      const cached = this.loadLicense();
      if (cached && this.isCacheValid(cached)) {
        return { success: true, license: cached, offline: true };
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
    if (!license.cachedAt) return false;
    const cachedDate = new Date(license.cachedAt);
    const now = new Date();
    const diffDays = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > CACHE_DAYS || diffDays < 0) return false;
    if (!license.isLifetime && license.expiryDate) {
      const expiry = parseDateStr(license.expiryDate); // Hỗ trợ dd/MM/yyyy từ Apps Script
      if (now > expiry) return false;
    }
    return true;
  }
  
  getCurrentLicense(): LicenseInfo | null {
    const license = this.loadLicense();
    if (!license) return null;
    if (license.isLifetime) {
      license.daysLeft = null;
      license.status = 'active';
    } else if (license.expiryDate) {
      // Tính lại daysLeft và status dựa trên expiryDate thực tế (không tin tưởng giá trị lưu trong file)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = parseDateStr(license.expiryDate); // Hỗ trợ dd/MM/yyyy từ Apps Script
      expiry.setHours(0, 0, 0, 0);
      const diffMs = expiry.getTime() - today.getTime();
      license.daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      license.status = license.daysLeft < 0 ? 'expired' : 'active';
    } else {
      // Không có expiryDate: đây là license cũ hoặc dữ liệu bị thiếu
      // Xem xét status đã lưu nhưng không tin tưởng hoàn toàn
      // Nếu plan là trial mà không có expiryDate → đây là trial đăng ký trước khi được cập nhật
      // Bắt buộc re-verify ngay khi startup
      if (license.plan === 'trial' || license.status === 'expired') {
        // Trial không có expiryDate = dự liệu thiếu → yêu cầu kích hoạt lại
        license.daysLeft = -999;
        license.status = 'expired';
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
    if (!license) return false;
    if (license.status !== 'expired') return false;
    const daysLeft = license.daysLeft ?? -999;
    return daysLeft >= -GRACE_PERIOD_DAYS && daysLeft < 0;
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
