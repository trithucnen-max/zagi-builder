import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import Logger from '../../utils/Logger';
import TelemetryService from '../telemetry/TelemetryService';

// ─── Supabase License API Configuration ──────────────────────────────────────
const DEFAULT_SUPABASE_URL = 'https://paxejunvgfhjdyulzutb.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_lBfBOFuvMYCFxWl2X-yA3g_deMkL9Yo';

const CACHE_DAYS = 3;
const GRACE_PERIOD_DAYS = 7;   // Số ngày ân hạn sau khi hết hạn
const EXPIRY_WARN_DAYS  = 7;   // Cảnh báo khi còn ≤ N ngày

function parseDateStr(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
  }
  return new Date(dateStr);
}

export interface LicenseInfo {
  email: string;
  licenseKey: string;
  plan: string;
  expiryDate?: string;
  isLifetime: boolean;
  status: 'active' | 'expired' | 'pending' | 'blocked';
  fullName?: string;
  phone?: string;
  cachedAt?: string;
  daysLeft?: number | null;
  bossMachineId?: string;
  maxEmployees?: number;
  maxZaloAccounts?: number;
  lastVerifiedAt?: string;
}

export interface RegisterParams {
  email: string;
  fullName?: string;
  phone?: string;
  plan: string;
  referrer?: string;
}

export class LicenseManager {
  static _runtimeConfig: { apiUrl?: string; apiKey?: string; apiSecret?: string } | null = null;

  static setRuntimeConfig(config: { apiUrl?: string; apiKey?: string; apiSecret?: string }): void {
    LicenseManager._runtimeConfig = config;
  }

  private getSupabaseUrl(): string {
    return LicenseManager._runtimeConfig?.apiUrl || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  }

  private getSupabaseKey(): string {
    return LicenseManager._runtimeConfig?.apiKey || process.env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  }

  private getLicenseFile(): string {
    return path.join(app.getPath('userData'), 'license.dat');
  }

  /**
   * Tạo License Key ngẫu nhiên giữ nguyên quy tắc cũ:
   * Dạng: ZAGI-XXXX-YYYY-ZZZZ (hoặc XXXX-XXXX-XXXX-XXXX)
   */
  public generateLicenseKey(): string {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ZAGI-${p1}-${p2}-${p3}`;
  }

  // === ĐĂNG KÝ LICENSE MỚI (Lưu lên Supabase) ===
  async register({ email, fullName, phone, plan, referrer }: RegisterParams): Promise<any> {
    try {
      const url = this.getSupabaseUrl();
      const apiKey = this.getSupabaseKey();
      const licenseKey = this.generateLicenseKey();
      const isLifetime = plan.includes('lifetime');

      // Tính ngày hết hạn
      let expiryDate: string | null = null;
      if (!isLifetime) {
        const exp = new Date();
        if (plan.includes('12m')) exp.setMonth(exp.getMonth() + 12);
        else if (plan.includes('6m')) exp.setMonth(exp.getMonth() + 6);
        else exp.setDate(exp.getDate() + 7); // Trial 7 ngày
        expiryDate = exp.toISOString();
      }

      // Giới hạn nhân viên & zalo account theo gói
      const maxEmployees = plan.startsWith('solo') ? 0 : plan.includes('lifetime') ? 20 : 5;
      const maxZaloAccounts = plan.startsWith('solo') ? 2 : plan.includes('lifetime') ? 100 : 10;

      const payload = {
        license_key: licenseKey,
        email: email.trim().toLowerCase(),
        full_name: fullName || '',
        phone: phone || '',
        plan: plan,
        referrer: referrer || '',
        expiry_date: expiryDate,
        is_lifetime: isLifetime,
        status: plan === 'trial' ? 'active' : 'pending',
        max_employees: maxEmployees,
        max_zalo_accounts: maxZaloAccounts,
        created_at: new Date().toISOString(),
      };

      const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/licenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const createdData = await res.json();
        const license = this.mapSupabaseRowToLicense(Array.isArray(createdData) ? createdData[0] : payload);
        if (plan === 'trial') {
          this.saveLicense(license);
        }

        const amount = plan.includes('lifetime') ? (plan.startsWith('solo') ? 7450000 : 14900000) :
                       plan.includes('12m') ? (plan.startsWith('solo') ? 4450000 : 8900000) :
                       (plan.startsWith('solo') ? 2450000 : 4900000);
        const transferContent = 'ZAGI ' + licenseKey.split('-').pop();

        // Gửi email thông báo tự động cho khách hàng ngầm (không làm chậm UI)
        this.sendRegistrationEmailNotification({
          email: email.trim().toLowerCase(),
          fullName: fullName || '',
          phone: phone || '',
          licenseKey,
          plan,
          amount,
          transferContent,
        });

        return {
          success: true,
          pending: plan !== 'trial',
          message: plan === 'trial' ? 'Kích hoạt gói dùng thử thành công!' : 'Đăng ký thành công! Vui lòng thanh toán để kích hoạt.',
          licenseKey: licenseKey,
          license: license,
          plan: plan,
          duration: isLifetime ? 'Vĩnh viễn' : plan.includes('12m') ? '12 tháng' : '6 tháng',
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

      const errText = await res.text();
      throw new Error(`Supabase Error ${res.status}: ${errText}`);
    } catch (err: any) {
      Logger.error('[LicenseManager] Register error:', err.message);

      if (plan === 'trial') {
        return { success: false, message: 'Không thể kết nối máy chủ bản quyền: ' + err.message };
      }

      // Offline fallback khi đăng ký trả phí
      const shortKey = this.generateLicenseKey();
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

  /** Gửi email thông báo cho khách hàng ngầm qua Google Apps Script */
  private async sendRegistrationEmailNotification(params: {
    email: string;
    fullName?: string;
    phone?: string;
    licenseKey: string;
    plan: string;
    amount?: number;
    transferContent?: string;
  }): Promise<void> {
    try {
      const scriptUrl = 'https://script.google.com/macros/s/AKfycbwfAp3H9lUTrFLDakhpCmLZB6h9V9bViGSmCTMtp49MbujLK-vT6aPbSQhsJZNs0T4qVg/exec';
      const secret = 'YOUR_SECRET_KEY_HERE_hanoi@123a';
      
      axios.post(scriptUrl, {
        secret,
        action: 'register',
        email: params.email,
        fullName: params.fullName || '',
        phone: params.phone || '',
        licenseKey: params.licenseKey,
        plan: params.plan,
        amount: params.amount || 0,
        transferContent: params.transferContent || ''
      }, { timeout: 10000 }).catch((err: any) => {
        Logger.warn(`[LicenseManager] Email notification background send info: ${err.message}`);
      });
    } catch (e: any) {
      Logger.warn(`[LicenseManager] sendRegistrationEmailNotification error: ${e.message}`);
    }
  }

  // === LẤY DANH SÁCH GÓI VÀ CONFIG NGÂN HÀNG ===
  async getPlans(): Promise<any> {
    return { 
      success: true, 
      plans: {
        'solo_6m':       { name: 'Gói Solo 6 tháng',    amount: 2450000,  desc: 'Sử dụng đầy đủ trong 6 tháng (1 Máy BOSS)', type: 'solo' },
        'solo_12m':      { name: 'Gói Solo 12 tháng',   amount: 4450000,  desc: 'Lựa chọn tối ưu cho 1 năm (1 Máy BOSS)',    type: 'solo', popular: true },
        'solo_lifetime': { name: 'Gói Solo Vĩnh viễn',  amount: 7450000,  desc: 'Thanh toán một lần, dùng trọn đời', type: 'solo' },
        'team_6m':       { name: 'Gói Team 6 tháng',    amount: 4900000,  desc: '1 Máy BOSS + Tối đa 5 Máy Nhân viên', type: 'team' },
        'team_12m':      { name: 'Gói Team 12 tháng',   amount: 8900000,  desc: '1 Máy BOSS + Tối đa 5 Máy Nhân viên', type: 'team', popular: true },
        'team_lifetime': { name: 'Gói Team Vĩnh viễn',  amount: 14900000, desc: '1 Máy BOSS + Tối đa 20 Máy Nhân viên', type: 'team' }
      },
      bankConfig: {
        bankName: 'Techcombank',
        accountNumber: '63666999',
        accountName: 'CONG TY CO PHAN BASAN',
        companyAddress: 'Số SA 34, Khu đô thị FLC Garden City, Phường Tây Mỗ, Quận Nam Từ Liêm, Thành phố Hà Nội, Việt Nam'
      }
    };
  }
  
  // === VERIFY (Xác thực License từ Supabase API) ===
  async verifyEmail(email: string, licenseKey: string | null = null): Promise<any> {
    try {
      const url = this.getSupabaseUrl();
      const apiKey = this.getSupabaseKey();
      const cleanEmail = email ? email.trim().toLowerCase() : '';
      const cleanKey = licenseKey ? licenseKey.trim().toUpperCase() : '';

      if (!cleanEmail && !cleanKey) {
        return { success: false, message: 'Vui lòng nhập Email hoặc License Key' };
      }

      // Query Supabase: So khớp email hoặc licenseKey
      let queryStr = '';
      if (cleanKey && cleanEmail) {
        queryStr = `or=(license_key.eq.${cleanKey},email.eq.${cleanEmail})`;
      } else if (cleanKey) {
        queryStr = `license_key=eq.${cleanKey}`;
      } else {
        queryStr = `email=eq.${cleanEmail}`;
      }

      const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/licenses?${queryStr}&select=*`, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (res.ok) {
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) {
          return { success: false, message: 'Không tìm thấy thông tin License hợp lệ.' };
        }

        const rawRow = rows[0];
        const license = this.mapSupabaseRowToLicense(rawRow);

        // Chặn nếu bị admin khóa thủ công
        if (license.status === 'blocked') {
          return { success: false, message: 'License của bạn đã bị khóa bởi Quản trị viên.' };
        }

        // Chặn nếu đã hết hạn
        if (license.status === 'expired') {
          return { success: false, message: 'License đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' };
        }

        // Kiểm tra & Khóa cứng theo máy BOSS
        const currentMachineId = TelemetryService.getDeviceInfo().machine_id;
        if (!rawRow.boss_machine_id) {
          // Gán cố định máy BOSS phần cứng hiện tại lên Supabase
          this.bindBossMachineId(rawRow.license_key, currentMachineId);
          license.bossMachineId = currentMachineId;
        } else if (rawRow.boss_machine_id !== currentMachineId) {
          Logger.warn(`[LicenseManager] Machine mismatch! Registered: ${rawRow.boss_machine_id}, Current: ${currentMachineId}`);
          // Vẫn cho phép nếu cùng tài khoản email hoặc thông báo
        }

        license.status = 'active';
        this.saveLicense(license);
        return { success: true, license: license };
      }

      throw new Error(`Supabase query status ${res.status}`);
    } catch (err: any) {
      Logger.error(`[LicenseManager] verify error: ${err.message}`);
      const cached = this.getCurrentLicense();
      if (cached) {
        if (this.isCacheValid(cached)) {
          return { success: true, license: cached, offline: true };
        }
        if (cached.status === 'expired') {
          const daysLeft = cached.daysLeft ?? -999;
          if (daysLeft >= -GRACE_PERIOD_DAYS && daysLeft < 0) {
            return { success: true, license: cached, offline: true };
          }
        }
      }
      return { success: false, message: 'Không thể kết nối máy chủ bản quyền. Kiểm tra Internet.' };
    }
  }

  /** Gán cố định Mã máy BOSS phần cứng lên Supabase */
  private async bindBossMachineId(licenseKey: string, machineId: string): Promise<void> {
    try {
      const url = this.getSupabaseUrl();
      const apiKey = this.getSupabaseKey();
      await fetch(`${url.replace(/\/$/, '')}/rest/v1/licenses?license_key=eq.${licenseKey}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          boss_machine_id: machineId,
          last_verified_at: new Date().toISOString(),
        }),
      });
    } catch (err: any) {
      Logger.error(`[LicenseManager] bindBossMachineId error: ${err.message}`);
    }
  }

  /** Chuyển đổi dữ liệu Supabase row thành LicenseInfo */
  private mapSupabaseRowToLicense(row: any): LicenseInfo {
    const isLifetime = !!row.is_lifetime || row.plan?.includes('lifetime');
    let status: 'active' | 'expired' | 'pending' | 'blocked' = row.status || 'active';
    let daysLeft: number | null = null;

    if (!isLifetime && row.expiry_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const exp = new Date(row.expiry_date);
      exp.setHours(0, 0, 0, 0);
      const diffMs = exp.getTime() - today.getTime();
      daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (daysLeft < 0 && status !== 'blocked') {
        status = 'expired';
      }
    }

    return {
      email: row.email || '',
      licenseKey: row.license_key || '',
      plan: row.plan || 'solo_12m',
      expiryDate: row.expiry_date || undefined,
      isLifetime: isLifetime,
      status: status,
      fullName: row.full_name || '',
      phone: row.phone || '',
      daysLeft: daysLeft,
      bossMachineId: row.boss_machine_id || '',
      maxEmployees: row.max_employees !== undefined ? Number(row.max_employees) : (row.plan?.startsWith('solo') ? 0 : 5),
      maxZaloAccounts: row.max_zalo_accounts !== undefined ? Number(row.max_zalo_accounts) : 10,
      lastVerifiedAt: row.last_verified_at || new Date().toISOString(),
    };
  }
  
  // === Lưu / đọc license (bảo mật bằng safeStorage) ===
  saveLicense(license: LicenseInfo): void {
    try {
      const data = { ...license, cachedAt: new Date().toISOString() };
      const jsonStr = JSON.stringify(data);
      const filePath = this.getLicenseFile();
      
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
      const expiry = parseDateStr(license.expiryDate);
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
      const expiry = parseDateStr(license.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      const diffMs = expiry.getTime() - today.getTime();
      license.daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      license.status = license.daysLeft < 0 ? 'expired' : 'active';
    }
    return license;
  }
  
  needsActivation(): boolean {
    const license = this.getCurrentLicense();
    if (!license) return true;

    if (license.status === 'expired') {
      const daysLeft = license.daysLeft ?? -999;
      if (daysLeft >= -GRACE_PERIOD_DAYS) {
        const now = new Date();
        const cachedDate = license.cachedAt ? new Date(license.cachedAt) : new Date(0);
        const hoursSinceLastCheck = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastCheck > 24) {
          this.reVerifyInBackground(license.email, license.licenseKey);
        }
        return false;
      }
      return true;
    }

    if (!this.isCacheValid(license)) this.reVerifyInBackground(license.email, license.licenseKey);
    return false;
  }

  isInGracePeriod(): boolean {
    const license = this.getCurrentLicense();
    if (!license || license.status !== 'expired') return false;
    const daysLeft = license.daysLeft ?? -999;
    return daysLeft >= -GRACE_PERIOD_DAYS && daysLeft < 0;
  }

  isExpiringSoon(): boolean {
    const license = this.getCurrentLicense();
    if (!license || license.isLifetime || license.status === 'expired') return false;
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
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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
