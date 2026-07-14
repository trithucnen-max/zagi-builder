// Mock external dependencies
const mockOpenExternal = jest.fn();
const mockGetAccounts = jest.fn();
const mockJoinGroupLink = jest.fn();
const mockConfirm = jest.fn();
const mockShowNotification = jest.fn();

// Mock window.confirm
if (typeof (global as any).window === 'undefined') {
  (global as any).window = { confirm: mockConfirm };
} else {
  (global as any).window.confirm = mockConfirm;
}

// Regex for Zalo group link matching
const matchZaloGroupLink = (url: string): boolean => {
  return /(?:zalo\.me\/g\/|chat\.zalo\.me\/g\/)([a-zA-Z0-9_-]+)/i.test(url);
};

// Simulate openExternalWrapper behavior
async function simulateOpenExternal(
  url: string,
  activeZaloId: string | null,
  accounts: any[] = []
): Promise<{ handled: boolean; proxiedToBrowser: boolean; success?: boolean; error?: string }> {
  mockOpenExternal.mockClear();
  mockJoinGroupLink.mockClear();
  mockConfirm.mockClear();
  mockShowNotification.mockClear();

  const isZaloGroup = matchZaloGroupLink(url);
  if (isZaloGroup) {
    if (activeZaloId) {
      const confirmJoin = window.confirm('Bạn có muốn tham gia nhóm Zalo này trực tiếp trên tài khoản Zagi đang hoạt động không?');
      if (confirmJoin) {
        try {
          const acc = accounts.find((a: any) => a.zalo_id === activeZaloId);
          const auth = acc?.cookies ? { cookies: acc.cookies, imei: acc.imei || '', userAgent: acc.user_agent || '' } : {};

          mockShowNotification('Đang gửi yêu cầu vào nhóm...', 'info');
          const result = await mockJoinGroupLink({ auth, zaloId: activeZaloId, link: url });

          if (result?.success || result?.response) {
            mockShowNotification('Tham gia nhóm thành công!', 'success');
            return { handled: true, proxiedToBrowser: false, success: true };
          } else {
            const err = result?.error || 'Lỗi không xác định';
            mockShowNotification(`Không thể tự động tham gia: ${err}`, 'error');
            mockOpenExternal(url);
            return { handled: true, proxiedToBrowser: true, success: false, error: err };
          }
        } catch (err: any) {
          mockShowNotification(`Lỗi: ${err.message}`, 'error');
          mockOpenExternal(url);
          return { handled: true, proxiedToBrowser: true, success: false, error: err.message };
        }
      }
    }
  }
  
  mockOpenExternal(url);
  return { handled: false, proxiedToBrowser: true };
}

describe('Zalo Group Join Interceptor (v27.2.12)', () => {
  describe('Zalo Group URL Matching Regex', () => {
    it('should match standard zalo.me group links', () => {
      expect(matchZaloGroupLink('https://zalo.me/g/abcdef')).toBe(true);
      expect(matchZaloGroupLink('http://zalo.me/g/xyz-123_abc')).toBe(true);
      expect(matchZaloGroupLink('zalo.me/g/group_id_here')).toBe(true);
    });

    it('should match chat.zalo.me group URLs', () => {
      expect(matchZaloGroupLink('https://chat.zalo.me/g/abcdef')).toBe(true);
      expect(matchZaloGroupLink('https://chat.zalo.me/g/xyz123')).toBe(true);
    });

    it('should NOT match non-group zalo.me links', () => {
      expect(matchZaloGroupLink('https://zalo.me/s/abcdef')).toBe(false); // short link
      expect(matchZaloGroupLink('https://zalo.me/123456789')).toBe(false); // user profile link
      expect(matchZaloGroupLink('https://google.com')).toBe(false);
    });
  });

  describe('openExternalWrapper Interception Flow', () => {
    const dummyAccounts = [
      { zalo_id: 'zalo-1', cookies: 'cook-1', imei: 'imei-1', user_agent: 'ua-1' },
      { zalo_id: 'zalo-2', cookies: 'cook-2', imei: 'imei-2', user_agent: 'ua-2' },
    ];

    it('should fallback to browser if url is not a Zalo group link', async () => {
      const result = await simulateOpenExternal('https://google.com', 'zalo-1', dummyAccounts);
      expect(result.handled).toBe(false);
      expect(result.proxiedToBrowser).toBe(true);
      expect(mockOpenExternal).toHaveBeenCalledWith('https://google.com');
      expect(mockJoinGroupLink).not.toHaveBeenCalled();
    });

    it('should fallback to browser if no Zalo account is active', async () => {
      const result = await simulateOpenExternal('https://zalo.me/g/abcdef', null, dummyAccounts);
      expect(result.handled).toBe(false);
      expect(result.proxiedToBrowser).toBe(true);
      expect(mockOpenExternal).toHaveBeenCalledWith('https://zalo.me/g/abcdef');
      expect(mockJoinGroupLink).not.toHaveBeenCalled();
    });

    it('should open browser if user declines confirmation', async () => {
      mockConfirm.mockReturnValueOnce(false); // decline
      const result = await simulateOpenExternal('https://zalo.me/g/abcdef', 'zalo-1', dummyAccounts);
      expect(result.handled).toBe(false);
      expect(result.proxiedToBrowser).toBe(true);
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockOpenExternal).toHaveBeenCalledWith('https://zalo.me/g/abcdef');
      expect(mockJoinGroupLink).not.toHaveBeenCalled();
    });

    it('should call joinGroupLink API and show success notification if user accepts and API succeeds', async () => {
      mockConfirm.mockReturnValueOnce(true); // accept
      mockJoinGroupLink.mockResolvedValueOnce({ success: true }); // API success

      const result = await simulateOpenExternal('https://zalo.me/g/abcdef', 'zalo-1', dummyAccounts);
      expect(result.handled).toBe(true);
      expect(result.proxiedToBrowser).toBe(false);
      expect(result.success).toBe(true);
      expect(mockJoinGroupLink).toHaveBeenCalledWith({
        auth: { cookies: 'cook-1', imei: 'imei-1', userAgent: 'ua-1' },
        zaloId: 'zalo-1',
        link: 'https://zalo.me/g/abcdef'
      });
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it('should fallback to browser if API fails', async () => {
      mockConfirm.mockReturnValueOnce(true); // accept
      mockJoinGroupLink.mockResolvedValueOnce({ success: false, error: 'Link expired' }); // API fail

      const result = await simulateOpenExternal('https://zalo.me/g/abcdef', 'zalo-1', dummyAccounts);
      expect(result.handled).toBe(true);
      expect(result.proxiedToBrowser).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Link expired');
      expect(mockOpenExternal).toHaveBeenCalledWith('https://zalo.me/g/abcdef');
    });
  });
});
