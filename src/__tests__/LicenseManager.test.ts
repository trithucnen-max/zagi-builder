import licenseManager, { LicenseInfo } from '../services/license/LicenseManager';
import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import axios from 'axios';

// Mock electron
jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(true),
    encryptString: jest.fn().mockImplementation((str) => Buffer.from(str)),
    decryptString: jest.fn().mockImplementation((buf) => buf.toString()),
  },
  app: {
    getPath: jest.fn().mockReturnValue('/mock/user-data'),
    isPackaged: true,
  },
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// Mock axios
jest.mock('axios');

describe('LicenseManager', () => {
  const mockLicense: LicenseInfo = {
    email: 'test@example.com',
    licenseKey: 'TRIAL-1234-5678',
    plan: 'trial',
    isLifetime: false,
    status: 'active',
    expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days later
    cachedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveLicense', () => {
    it('should save encrypted license if encryption is available', () => {
      licenseManager.saveLicense(mockLicense);
      expect(safeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(safeStorage.encryptString).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should save plain text if encryption is not available', () => {
      (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValueOnce(false);
      licenseManager.saveLicense(mockLicense);
      expect(safeStorage.encryptString).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('loadLicense', () => {
    it('should load decrypted license if encryption is available', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(mockLicense)));
      
      const loaded = licenseManager.loadLicense();
      
      expect(loaded).toEqual(mockLicense);
      expect(safeStorage.decryptString).toHaveBeenCalled();
    });

    it('should return null if file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const loaded = licenseManager.loadLicense();
      expect(loaded).toBeNull();
    });
  });

  describe('isCacheValid', () => {
    it('should return true for valid trial cache', () => {
      const valid = licenseManager.isCacheValid(mockLicense);
      expect(valid).toBe(true);
    });

    it('should return false if cached date is expired', () => {
      const expiredLicense = {
        ...mockLicense,
        cachedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago (max is 3)
      };
      const valid = licenseManager.isCacheValid(expiredLicense);
      expect(valid).toBe(false);
    });
  });

  describe('register', () => {
    it('should register and return license data', async () => {
      const mockResponse = {
        data: {
          success: true,
          pending: false,
          license: mockLicense,
        },
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const res = await licenseManager.register({
        email: 'test@example.com',
        fullName: 'Test User',
        phone: '0901234567',
        plan: 'trial',
      });

      expect(res.success).toBe(true);
      expect(res.license).toEqual(mockLicense);
    });

    it('should return payment details returned by server for paid plan (solo_6m)', async () => {
      const mockResponse = {
        data: {
          success: true,
          pending: true,
          licenseKey: 'SOLO-6M-KEY',
          duration: 'Gói Solo 6 tháng',
          paymentInfo: {
            bankName: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank) - CN Bờ Hồ',
            accountNumber: '63666999',
            accountName: 'CÔNG TY CỔ PHẦN BASAN',
            amount: 2450000,
            transferContent: 'ZAGI SOLO-6M-KEY',
            qrUrl: 'https://img.vietqr.io/image/...'
          }
        },
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const res = await licenseManager.register({
        email: 'test@example.com',
        fullName: 'Test User',
        phone: '0901234567',
        plan: 'solo_6m',
      });

      expect(res.success).toBe(true);
      expect(res.duration).toBe('Gói Solo 6 tháng');
      expect(res.paymentInfo.bankName).toContain('Techcombank');
      expect(res.paymentInfo.accountNumber).toBe('63666999');
      expect(res.paymentInfo.accountName).toBe('CÔNG TY CỔ PHẦN BASAN');
      expect(res.paymentInfo.amount).toBe(2450000);
      expect(res.paymentInfo.transferContent).toBe('ZAGI SOLO-6M-KEY');
    });

    it('should handle registration API error', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

      const res = await licenseManager.register({
        email: 'test@example.com',
        plan: 'trial',
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('Không thể kết nối server');
    });
  });

  describe('getPlans', () => {
    it('should fetch plans and bank configs from server', async () => {
      const mockResponse = {
        data: {
          success: true,
          plans: {
            'solo_6m': { name: 'Gói Solo 6 tháng', amount: 2450000 }
          },
          paymentConfig: {
            bankName: 'Techcombank'
          }
        }
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const res = await licenseManager.getPlans();
      expect(res.success).toBe(true);
      expect(res.plans['solo_6m'].name).toBe('Gói Solo 6 tháng');
      expect(res.paymentConfig.bankName).toBe('Techcombank');
    });

    it('should handle getPlans API error', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));
      const res = await licenseManager.getPlans();
      expect(res.success).toBe(false);
      expect(res.message).toContain('Không thể kết nối server');
    });
  });

  describe('verifyEmail', () => {
    it('should verify license online', async () => {
      const mockResponse = {
        data: {
          success: true,
          license: mockLicense,
        },
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const res = await licenseManager.verifyEmail('test@example.com', 'TRIAL-1234-5678');

      expect(res.success).toBe(true);
      expect(res.license).toEqual(mockLicense);
    });

    it('should return cached license offline if verification fails', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));
      // Mock loading license
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(mockLicense)));

      const res = await licenseManager.verifyEmail('test@example.com', 'TRIAL-1234-5678');

      expect(res.success).toBe(true);
      expect(res.offline).toBe(true);
      expect(res.license).toEqual(mockLicense);
    });
  });

  describe('isCacheValid edge cases', () => {
    it('should return false if cachedAt is missing', () => {
      const badLicense = { ...mockLicense, cachedAt: undefined };
      expect(licenseManager.isCacheValid(badLicense)).toBe(false);
    });

    it('should return true for lifetime plan even if expiry date is in the past', () => {
      const lifetimePastExpiry = {
        ...mockLicense,
        isLifetime: true,
        expiryDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // Expired expiryDate
        cachedAt: new Date().toISOString(),
      };
      expect(licenseManager.isCacheValid(lifetimePastExpiry)).toBe(true);
    });

    it('should return false for regular plan if expiry date is in the past', () => {
      const expiredRegular = {
        ...mockLicense,
        isLifetime: false,
        expiryDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        cachedAt: new Date().toISOString(),
      };
      expect(licenseManager.isCacheValid(expiredRegular)).toBe(false);
    });
  });

  describe('getCurrentLicense', () => {
    it('should set daysLeft to null and status to active for lifetime license', () => {
      const lifetime = {
        ...mockLicense,
        isLifetime: true,
        expiryDate: undefined,
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(lifetime)));

      const result = licenseManager.getCurrentLicense();
      expect(result).not.toBeNull();
      expect(result!.daysLeft).toBeNull();
      expect(result!.status).toBe('active');
    });

    it('should calculate daysLeft correctly for regular active license', () => {
      const tenDaysLater = new Date();
      tenDaysLater.setDate(tenDaysLater.getDate() + 10);
      const regular = {
        ...mockLicense,
        isLifetime: false,
        expiryDate: tenDaysLater.toISOString(),
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(regular)));

      const result = licenseManager.getCurrentLicense();
      expect(result).not.toBeNull();
      expect(result!.daysLeft).toBe(10);
      expect(result!.status).toBe('active');
    });

    it('should set status to expired if daysLeft is negative', () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const expired = {
        ...mockLicense,
        isLifetime: false,
        expiryDate: fiveDaysAgo.toISOString(),
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(expired)));

      const result = licenseManager.getCurrentLicense();
      expect(result).not.toBeNull();
      expect(result!.daysLeft).toBeLessThan(0);
      expect(result!.status).toBe('expired');
    });
  });

  describe('needsActivation', () => {
    it('should return false in development mode (app.isPackaged = false)', () => {
      // Temporarily change app.isPackaged
      const originalIsPackaged = app.isPackaged;
      (app as any).isPackaged = false;

      const needsAct = licenseManager.needsActivation();
      expect(needsAct).toBe(false);

      // Restore
      (app as any).isPackaged = originalIsPackaged;
    });

    it('should return true if no license is loaded', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const needsAct = licenseManager.needsActivation();
      expect(needsAct).toBe(true);
    });

    it('should return true if license status is expired (beyond grace period)', () => {
      // GRACE_PERIOD_DAYS = 7, phải hết hạn > 7 ngày để needsActivation = true
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      const dd = String(eightDaysAgo.getDate()).padStart(2, '0');
      const mm = String(eightDaysAgo.getMonth() + 1).padStart(2, '0');
      const yyyy = eightDaysAgo.getFullYear();
      const expired = {
        ...mockLicense,
        isLifetime: false,
        expiryDate: `${dd}/${mm}/${yyyy}`, // parseDateStr expects dd/MM/yyyy
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(expired)));

      const needsAct = licenseManager.needsActivation();
      expect(needsAct).toBe(true);
    });

    it('should trigger background verification and return false if license cache is invalid but license active', () => {
      const oldCached = {
        ...mockLicense,
        isLifetime: false,
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        cachedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago (max cache is 3)
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(oldCached)));

      const spyReVerify = jest.spyOn(licenseManager, 'reVerifyInBackground').mockImplementation(() => Promise.resolve());

      const needsAct = licenseManager.needsActivation();
      expect(needsAct).toBe(false);
      expect(spyReVerify).toHaveBeenCalledWith(oldCached.email, oldCached.licenseKey);

      spyReVerify.mockRestore();
    });
  });

  describe('getDisplayMessage', () => {
    it('should display lifetime message', () => {
      const msg = licenseManager.getDisplayMessage({
        ...mockLicense,
        isLifetime: true,
        daysLeft: null,
      });
      expect(msg).toBe('✨ Bản quyền Vĩnh viễn');
    });

    it('should display expired message if daysLeft is negative', () => {
      const msg = licenseManager.getDisplayMessage({
        ...mockLicense,
        isLifetime: false,
        daysLeft: -2,
        plan: '6m',
      });
      expect(msg).toBe('❌ Gói 6 tháng - Đã hết hạn');
    });

    it('should display expires today message if daysLeft is 0', () => {
      const msg = licenseManager.getDisplayMessage({
        ...mockLicense,
        isLifetime: false,
        daysLeft: 0,
        plan: '12m',
      });
      expect(msg).toBe('⚠️ Gói 1 năm - Hết hạn hôm nay');
    });

    it('should display warning message if daysLeft is 5 (<= 7)', () => {
      const msg = licenseManager.getDisplayMessage({
        ...mockLicense,
        isLifetime: false,
        daysLeft: 5,
        plan: 'trial',
      });
      expect(msg).toBe('⚠️ Dùng thử - Còn 5 ngày');
    });

    it('should display active message if daysLeft is 10 (> 7)', () => {
      const msg = licenseManager.getDisplayMessage({
        ...mockLicense,
        isLifetime: false,
        daysLeft: 10,
        plan: 'trial',
      });
      expect(msg).toBe('✅ Dùng thử - Còn 10 ngày');
    });
  });
});
