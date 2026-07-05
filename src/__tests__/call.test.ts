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

import { formatDuration, formatTs } from '../ui/components/crm/contacts/CRMCallLogTab';
import { fmtDuration, fmtDay } from '../ui/components/analytics/CallAnalyticsTab';

describe('Call Log Helper Functions', () => {
  describe('CRMCallLogTab Helpers', () => {
    describe('formatDuration', () => {
      it('should format seconds into minutes and seconds', () => {
        expect(formatDuration(0)).toBe('');
        expect(formatDuration(-10)).toBe('');
        expect(formatDuration(45)).toBe('45s');
        expect(formatDuration(60)).toBe('1p 0s');
        expect(formatDuration(125)).toBe('2p 5s');
      });
    });

    describe('formatTs', () => {
      it('should format timestamps correctly', () => {
        const testDate = new Date(2026, 6, 5, 14, 30); // 2026-07-05 14:30
        const formatted = formatTs(testDate.getTime());
        expect(formatted).toContain('14:30');
      });
    });
  });

  describe('CallAnalyticsTab Helpers', () => {
    describe('fmtDuration', () => {
      it('should format durations correctly including hours', () => {
        expect(fmtDuration(0)).toBe('0s');
        expect(fmtDuration(-5)).toBe('0s');
        expect(fmtDuration(30)).toBe('30s');
        expect(fmtDuration(120)).toBe('2p 0s');
        expect(fmtDuration(3665)).toBe('1h 1p');
        expect(fmtDuration(7200)).toBe('2h 0p');
      });
    });

    describe('fmtDay', () => {
      it('should format YYYY-MM-DD day strings into DD/MM format', () => {
        expect(fmtDay('2026-07-05')).toBe('05/07');
        expect(fmtDay('2026-12-31')).toBe('31/12');
      });
    });
  });
});
