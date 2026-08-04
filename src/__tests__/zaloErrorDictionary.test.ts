import { parseZaloError, ZALO_ERROR_DICTIONARY } from '../services/crm/ZaloErrorDictionary';

describe('ZaloErrorDictionary Tests', () => {
  test('should correctly parse numeric error code -216 (Quét SĐT limit)', () => {
    const err = { errorCode: -216, message: 'User search limit reached' };
    const parsed = parseZaloError(err);
    expect(parsed.code).toBe(-216);
    expect(parsed.category).toBe('ACCOUNT_LIMIT');
    expect(parsed.shouldAutoPauseCampaign).toBe(true);
  });

  test('should correctly parse numeric error code 108 (Send message rate limit)', () => {
    const err = { code: 108, message: 'Message rate limit' };
    const parsed = parseZaloError(err);
    expect(parsed.code).toBe(108);
    expect(parsed.category).toBe('ACCOUNT_LIMIT');
    expect(parsed.shouldAutoPauseCampaign).toBe(true);
  });

  test('should correctly parse numeric error code -201 (Stranger blocked message)', () => {
    const err = { code: -201, message: 'Stranger blocked' };
    const parsed = parseZaloError(err);
    expect(parsed.code).toBe(-201);
    expect(parsed.category).toBe('STRANGER_PRIVACY');
    expect(parsed.shouldAutoPauseCampaign).toBe(false);
  });

  test('should fallback to string pattern matching when numeric code is missing', () => {
    const err = { message: 'Lỗi gửi tin: Tài khoản dính giới hạn quét SĐT' };
    const parsed = parseZaloError(err);
    expect(parsed.code).toBe(-216);
    expect(parsed.category).toBe('ACCOUNT_LIMIT');
  });

  test('should handle unknown error gracefully', () => {
    const err = { message: 'Some random network failure' };
    const parsed = parseZaloError(err);
    expect(parsed.category).toBe('UNKNOWN');
    expect(parsed.shouldAutoPauseCampaign).toBe(false);
  });
});
