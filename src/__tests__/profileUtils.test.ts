/**
 * profileUtils.test.ts — Unit tests cho profileUtils.ts
 */

import { extractUserProfile, resolveProfileFromResponse } from '../utils/profileUtils';

describe('profileUtils', () => {
  describe('extractUserProfile', () => {
    it('should return default empty structure when profile is null or undefined', () => {
      const expected = { displayName: '', avatar: '', phone: '', gender: null, birthday: null, alias: '' };
      expect(extractUserProfile(null)).toEqual(expected);
      expect(extractUserProfile(undefined)).toEqual(expected);
    });

    it('should extract basic details correctly', () => {
      const mockProfile = {
        displayName: 'Nguyen Van A',
        avatar: 'http://avatar.url',
        phoneNumber: '0987654321',
        friendAlias: 'A Than'
      };

      const result = extractUserProfile(mockProfile);
      expect(result.displayName).toBe('Nguyen Van A');
      expect(result.avatar).toBe('http://avatar.url');
      expect(result.phone).toBe('0987654321');
      expect(result.alias).toBe('A Than');
    });

    it('should fallback to alternate field names for names, avatars, and phones', () => {
      const mockProfile = {
        zaloName: 'Zalo User',
        avatarUrl: 'http://avatar.url/2',
        msisdn: '0901234567',
        alias: 'Bi-danh'
      };

      const result = extractUserProfile(mockProfile);
      expect(result.displayName).toBe('Zalo User');
      expect(result.avatar).toBe('http://avatar.url/2');
      expect(result.phone).toBe('0901234567');
      expect(result.alias).toBe('Bi-danh');

      const mockProfile2 = {
        name: 'Another Name',
        phone: '0123456789',
        nickName: 'Nick-name'
      };

      const result2 = extractUserProfile(mockProfile2);
      expect(result2.displayName).toBe('Another Name');
      expect(result2.phone).toBe('0123456789');
      expect(result2.alias).toBe('Nick-name');
    });

    describe('gender extraction', () => {
      it('should parse valid gender numbers', () => {
        expect(extractUserProfile({ gender: 0 }).gender).toBe(0);
        expect(extractUserProfile({ gender: 1 }).gender).toBe(1);
      });

      it('should return null for invalid or missing genders', () => {
        expect(extractUserProfile({}).gender).toBeNull();
        expect(extractUserProfile({ gender: 2 }).gender).toBeNull();
        expect(extractUserProfile({ gender: -1 }).gender).toBeNull();
        expect(extractUserProfile({ gender: 'Nam' }).gender).toBeNull();
      });
    });

    describe('birthday extraction', () => {
      it('should extract valid sdob string directly', () => {
        const result = extractUserProfile({ sdob: '15/08/1990' });
        expect(result.birthday).toBe('15/08/1990');

        const resultShort = extractUserProfile({ sdob: '15/08' });
        expect(resultShort.birthday).toBe('15/08');
      });

      it('should ignore invalid sdob strings and return null', () => {
        expect(extractUserProfile({ sdob: '00/00/0000' }).birthday).toBeNull();
        expect(extractUserProfile({ sdob: '00/00' }).birthday).toBeNull();
        expect(extractUserProfile({ sdob: '///' }).birthday).toBeNull();
      });

      it('should convert dob timestamp to DD/MM/YYYY format', () => {
        // Epoch time 636307200 is 1990-03-02 16:00:00 UTC, which depends on time zone.
        // Let's create a known date timestamp relative to local environment or mock Date
        const date = new Date(1995, 11, 25); // Dec 25, 1995
        const timestamp = Math.floor(date.getTime() / 1000);
        const result = extractUserProfile({ dob: timestamp });
        expect(result.birthday).toBe('25/12/1995');
      });

      it('should ignore dob if invalid or negative', () => {
        expect(extractUserProfile({ dob: -500 }).birthday).toBeNull();
        expect(extractUserProfile({ dob: 'not a timestamp' }).birthday).toBeNull();
      });
    });
  });

  describe('resolveProfileFromResponse', () => {
    it('should return null if response is empty', () => {
      expect(resolveProfileFromResponse(null, 'user123')).toBeNull();
      expect(resolveProfileFromResponse(undefined, 'user123')).toBeNull();
    });

    it('should resolve from changed_profiles first', () => {
      const mockResponse = {
        changed_profiles: {
          user123: { displayName: 'User A' }
        },
        data: {
          user123: { displayName: 'User B' }
        }
      };

      const result = resolveProfileFromResponse(mockResponse, 'user123');
      expect(result).toEqual({ displayName: 'User A' });
    });

    it('should fallback to data if changed_profiles does not have the key', () => {
      const mockResponse = {
        data: {
          user123: { displayName: 'User B' }
        }
      };

      const result = resolveProfileFromResponse(mockResponse, 'user123');
      expect(result).toEqual({ displayName: 'User B' });
    });

    it('should return null if key is not found in either', () => {
      const mockResponse = {
        changed_profiles: {},
        data: {}
      };

      expect(resolveProfileFromResponse(mockResponse, 'user123')).toBeNull();
    });
  });
});
