import { normalizePhone, isValidVietnamPhone, formatPhone } from '../ui/utils/phoneUtils';

describe('Phone Utilities Normalization & Validation Tests', () => {
  describe('normalizePhone', () => {
    test('handles empty / null / undefined inputs', () => {
      expect(normalizePhone(null)).toBe('');
      expect(normalizePhone(undefined)).toBe('');
      expect(normalizePhone('')).toBe('');
      expect(normalizePhone('   ')).toBe('');
    });

    test('strips spaces, dashes, dots, parentheses', () => {
      expect(normalizePhone('091-234.5678')).toBe('0912345678');
      expect(normalizePhone('(091) 234 5678')).toBe('0912345678');
      expect(normalizePhone('+84 (091) 234-5678')).toBe('0912345678');
    });

    test('normalizes +84 prefix correctly', () => {
      expect(normalizePhone('+84912345678')).toBe('0912345678');
      expect(normalizePhone('+840912345678')).toBe('0912345678');
      expect(normalizePhone('+84381234567')).toBe('0381234567');
    });

    test('normalizes 84 prefix correctly', () => {
      expect(normalizePhone('84912345678')).toBe('0912345678');
      expect(normalizePhone('840912345678')).toBe('0912345678');
      expect(normalizePhone('84771234567')).toBe('0771234567');
    });

    test('auto-prepends missing leading 0 for 9-digit numbers starting with 3, 5, 7, 8, 9', () => {
      expect(normalizePhone('912345678')).toBe('0912345678');
      expect(normalizePhone('381234567')).toBe('0381234567');
      expect(normalizePhone('771234567')).toBe('0771234567');
      expect(normalizePhone('861234567')).toBe('0861234567');
      expect(normalizePhone('521234567')).toBe('0521234567');
    });

    test('returns standard 10-digit number as-is', () => {
      expect(normalizePhone('0912345678')).toBe('0912345678');
      expect(normalizePhone('0381234567')).toBe('0381234567');
    });
  });

  describe('isValidVietnamPhone', () => {
    test('validates valid 10-digit mobile numbers', () => {
      expect(isValidVietnamPhone('0912345678')).toBe(true);
      expect(isValidVietnamPhone('912345678')).toBe(true);
      expect(isValidVietnamPhone('+84912345678')).toBe(true);
      expect(isValidVietnamPhone('840912345678')).toBe(true);
      expect(isValidVietnamPhone('0381234567')).toBe(true);
      expect(isValidVietnamPhone('0771234567')).toBe(true);
      expect(isValidVietnamPhone('0861234567')).toBe(true);
      expect(isValidVietnamPhone('0521234567')).toBe(true);
    });

    test('validates valid landline numbers', () => {
      expect(isValidVietnamPhone('02838291234')).toBe(true);
      expect(isValidVietnamPhone('02438291234')).toBe(true);
    });

    test('rejects invalid numbers', () => {
      expect(isValidVietnamPhone('12345')).toBe(false);
      expect(isValidVietnamPhone('0123456789')).toBe(false); // 01 prefix is old 11-digit
      expect(isValidVietnamPhone('091234567')).toBe(false); // only 9 digits with 0
      expect(isValidVietnamPhone('abc')).toBe(false);
    });
  });

  describe('formatPhone', () => {
    test('formats phone to normalized standard format', () => {
      expect(formatPhone('+84912345678')).toBe('0912345678');
      expect(formatPhone('84912345678')).toBe('0912345678');
      expect(formatPhone('912345678')).toBe('0912345678');
    });
  });
});
