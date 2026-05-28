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
});
