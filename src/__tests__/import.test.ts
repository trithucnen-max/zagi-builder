// Define mock window before importing any modules
(global as any).window = {
  electronAPI: {
    erp: {},
    login: jest.fn(),
    db: {},
    zalo: {},
  }
};

// Mock zustand stores if needed
jest.mock('@/store/accountStore', () => ({
  useAccountStore: () => ({
    activeAccountId: 'test-zalo-id',
    getActiveAccount: () => ({ cookies: {}, imei: '', user_agent: '' }),
  })
}));

jest.mock('@/store/appStore', () => ({
  useAppStore: () => ({
    showNotification: jest.fn(),
    labels: {},
  })
}));

import { normalizePhone, isValidPhone, parseCSV } from '../ui/components/crm/contacts/CRMImportModal';

describe('CRM Import Logic & Phone Normalization', () => {
  describe('normalizePhone', () => {
    it('should normalize standard Vietnamese phone numbers starting with 0', () => {
      expect(normalizePhone('0912345678')).toBe('0912345678');
      expect(normalizePhone(' 0987654321 ')).toBe('0987654321');
    });

    it('should normalize international formats starting with +84', () => {
      expect(normalizePhone('+84912345678')).toBe('0912345678');
      expect(normalizePhone('+840912345678')).toBe('0912345678');
    });

    it('should normalize country code without plus sign', () => {
      expect(normalizePhone('84912345678')).toBe('0912345678');
      expect(normalizePhone('840912345678')).toBe('0912345678');
    });

    it('should strip spaces, dots, dashes, and parentheses', () => {
      expect(normalizePhone('091.234.5678')).toBe('0912345678');
      expect(normalizePhone('091-234-5678')).toBe('0912345678');
      expect(normalizePhone('(0912) 345 678')).toBe('0912345678');
      expect(normalizePhone('+84 (091) 234-5678')).toBe('0912345678');
    });

    it('should return raw if no country code or invalid prefix', () => {
      expect(normalizePhone('912345678')).toBe('912345678');
      expect(normalizePhone('123')).toBe('123');
    });
  });

  describe('isValidPhone', () => {
    it('should return true for valid 10-digit Vietnamese numbers', () => {
      expect(isValidPhone('0912345678')).toBe(true);
      expect(isValidPhone('0374445339')).toBe(true);
      expect(isValidPhone('0901234567')).toBe(true);
    });

    it('should return false for invalid length or characters', () => {
      expect(isValidPhone('912345678')).toBe(false); // missing leading 0
      expect(isValidPhone('09123456789')).toBe(false); // too long (11 digits)
      expect(isValidPhone('09123456')).toBe(false); // too short
      expect(isValidPhone('0912abc345')).toBe(false); // contains characters
    });
  });

  describe('parseCSV', () => {
    it('should parse standard comma-separated CSV with headers', () => {
      const csv = `Tên facebook,Số điện thoại,Giới tính,Link facebook\r\nNguyễn Văn A,0912345678,Nam,https://facebook.com/a\r\nTrần Thị B,0987654321,Nữ,https://facebook.com/b`;
      const parsed = parseCSV(csv);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].phone).toBe('0912345678');
      expect(parsed[0].fbName).toBe('Nguyễn Văn A');
      expect(parsed[0].fbLink).toBe('https://facebook.com/a');
      expect(parsed[0].gender).toBe('Nam');

      expect(parsed[1].phone).toBe('0987654321');
      expect(parsed[1].fbName).toBe('Trần Thị B');
    });

    it('should handle tab-separated CSV/TXT content', () => {
      const csv = `Tên facebook\tSố điện thoại\tGiới tính\tLink facebook\nNguyễn Văn A\t0912345678\tNam\thttps://facebook.com/a`;
      const parsed = parseCSV(csv);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].phone).toBe('0912345678');
      expect(parsed[0].fbName).toBe('Nguyễn Văn A');
    });

    it('should skip rows with empty phone values', () => {
      const csv = `Tên facebook,Số điện thoại,Giới tính,Link facebook\nNguyễn Văn A,,Nam,https://facebook.com/a`;
      const parsed = parseCSV(csv);
      expect(parsed).toHaveLength(0);
    });
  });
});
