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

const PLAN_DETAILS: Record<string, { amount: number; durationName: string }> = {
  'solo_6m': { amount: 2450000, durationName: 'Gói Solo 6 tháng' },
  'solo_12m': { amount: 4450000, durationName: 'Gói Solo 12 tháng' },
  'solo_lifetime': { amount: 7450000, durationName: 'Gói Solo Vĩnh viễn' },
  'team_6m': { amount: 4900000, durationName: 'Gói Team 6 tháng' },
  'team_12m': { amount: 8900000, durationName: 'Gói Team 12 tháng' },
  'team_lifetime': { amount: 14900000, durationName: 'Gói Team Vĩnh viễn' },
  '6m': { amount: 499000, durationName: 'Gói 6 tháng (cũ)' },
  '12m': { amount: 799000, durationName: 'Gói 12 tháng (cũ)' },
  'lifetime': { amount: 2000000, durationName: 'Gói Vĩnh viễn (cũ)' }
};

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
      
      // Override payment details and pricing for paid plans
      if (result.success && result.pending) {
        const details = PLAN_DETAILS[plan];
        if (details) {
          const newAmount = details.amount;
          const transferContent = (result.paymentInfo && result.paymentInfo.transferContent)
            || `ZAGI ${result.licenseKey || email.split('@')[0].toUpperCase()}`;
          result.duration = details.durationName;
          result.paymentInfo = {
            bankName: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank) - CN Bờ Hồ',
            accountNumber: '63666999',
            accountName: 'CÔNG TY CỔ PHẦN BASAN',
            companyAddress: 'Số SA 34, Khu đô thị FLC Garden City, Phường Tây Mỗ, TP Hà Nội',
            amount: newAmount,
            transferContent: transferContent,
            qrUrl: `https://img.vietqr.io/image/Techcombank-63666999-compact2.png?amount=${newAmount}&addInfo=${encodeURIComponent(transferContent)}&accountName=CONG%20TY%20CO%20PHAN%20BASAN`
          };
        }
      }
      
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
        this.saveLicense(result.license);
        return { success: true, license: result.license };
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
      const expiry = new Date(license.expiryDate);
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(license.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      const diffMs = expiry.getTime() - today.getTime();
      license.daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      license.status = license.daysLeft < 0 ? 'expired' : 'active';
    }
    return license;
  }
  
  needsActivation(): boolean {
    // Bỏ qua kiểm tra license khi chạy dev build để lập trình thuận tiện
    if (!app.isPackaged) {
      return false;
    }

    const license = this.getCurrentLicense();
    if (!license) return true;
    if (license.status === 'expired') return true;
    if (!this.isCacheValid(license)) this.reVerifyInBackground(license.email, license.licenseKey);
    return false;
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
