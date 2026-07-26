// Facebook Multi-Channel Feature Test Suite for Zagi
(global as any).window = {
  electronAPI: {
    erp: {},
    login: jest.fn(),
    db: {},
    zalo: {},
  }
};

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));
jest.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false }, app: { getPath: () => '/tmp' } }));

import { CHANNEL_CONFIG, getCapability } from '../configs/channelConfig';

describe('Facebook Multi-Channel Feature Suite', () => {

  describe('1. Channel Configuration & Capabilities', () => {
    it('should define facebook channel capability correctly', () => {
      const fbCap = getCapability('facebook');
      expect(fbCap).toBeDefined();
      expect(fbCap.id).toBe('facebook');
      expect(fbCap.supportsDM).toBe(true);
      expect(fbCap.supportsText).toBe(true);
      expect(fbCap.supportsImage).toBe(true);
    });

    it('should support cookie and credentials login methods for Facebook', () => {
      const fbCap = CHANNEL_CONFIG.facebook;
      expect(fbCap.loginMethods).toContain('cookie');
      expect(fbCap.loginMethods).toContain('credentials');
    });
  });

  describe('2. Facebook Group & Post URL Extraction Logic', () => {
    function parseGroupUrl(url: string): string {
      const trimmed = url.trim();
      const match = trimmed.match(/facebook\.com\/groups\/([^\/?#]+)/i);
      return match ? match[1] : '';
    }

    function parsePostUrl(url: string): string {
      const trimmed = url.trim();
      const match = trimmed.match(/story_fbid=([^&]+)/i) || trimmed.match(/\/posts\/([^/?#]+)/i);
      return match ? match[1] : '';
    }

    it('should extract group ID or slug from Facebook group URLs', () => {
      const url1 = 'https://www.facebook.com/groups/1234567890';
      expect(parseGroupUrl(url1)).toBe('1234567890');

      const url2 = 'https://facebook.com/groups/congdongzagi/';
      expect(parseGroupUrl(url2)).toBe('congdongzagi');
    });

    it('should extract post ID from Facebook post URLs', () => {
      const postUrl = 'https://www.facebook.com/permalink.php?story_fbid=99887766&id=11223344';
      expect(parsePostUrl(postUrl)).toBe('99887766');
    });
  });

  describe('3. Multi-Channel Data Structure Formatting', () => {
    it('should correctly format multi-channel account payload with channel tags', () => {
      const rawAccounts = [
        { zalo_id: '0912345678', full_name: 'Zalo Account', channel: 'zalo' },
        { zalo_id: 'fb_1000123456', full_name: 'Facebook Account', channel: 'facebook' },
      ];

      const formatted = rawAccounts.map(acc => ({
        zalo_id: acc.zalo_id,
        full_name: acc.full_name,
        channel: acc.channel || 'zalo',
      }));

      expect(formatted).toHaveLength(2);
      expect(formatted[0].channel).toBe('zalo');
      expect(formatted[1].channel).toBe('facebook');
    });
  });

});
