import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const API_URL = 'https://script.google.com/macros/s/AKfycbzhNIEpifUJuwquObVZWfNPHFTrQEOuFkJ0mctF7XLn_XGOYSWryg4AI3f_Ik-xvGLMMg/exec';
const API_SECRET = 'YOUR_SECRET_KEY_HERE_hanoi@123a';
const CACHE_DAYS = 3;

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

class LicenseManager {
  private getLicenseFile(): string {
    return path.join(app.getPath('userData'), 'license.dat');
  }

  // === ĐĂNG KÝ LICENSE MỚI ===
  async register({ email, fullName, phone, plan }: RegisterParams): Promise<any> {
    try {
      const response = await axios.post(API_URL, {
        secret: API_SECRET,
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
  
  // === VERIFY (giữ nguyên + thêm licenseKey) ===
  async verifyEmail(email: string, licenseKey: string | null = null): Promise<any> {
    try {
      const response = await axios.post(API_URL, {
        secret: API_SECRET,
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
      console.error('Save error:', err);
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
      'lifetime': 'Vĩnh viễn' 
    };
    return plans[plan] || plan;
  }
}

export default new LicenseManager();
