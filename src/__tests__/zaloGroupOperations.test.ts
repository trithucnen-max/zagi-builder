describe('Zalo Group Operations & Prevention Tests', () => {
  // Test helper replicating cleanGroupId logic
  function cleanGroupId(groupId: string): string {
    return String(groupId).startsWith('g') ? String(groupId).slice(1) : String(groupId);
  }

  // Simulated ZaloService methods
  async function removeUserFromGroup(api: any, memberId: string | string[], groupId: string) {
    const cId = cleanGroupId(groupId);
    const res = await api.removeUserFromGroup(memberId, cId);
    if (res && typeof res === 'object' && res.error) {
      const errCode = res.error;
      const errMsg = res.message || res.error_message || `Lỗi ${errCode}`;
      throw new Error(errMsg);
    }
    return res;
  }

  async function addUserToGroup(api: any, memberId: string | string[], groupId: string) {
    const cId = cleanGroupId(groupId);
    try {
      const res = await api.addUserToGroup(memberId, cId);
      if (res && typeof res === 'object' && res.error) {
        const errCode = res.error;
        const errMsg = res.message || res.error_message || `Lỗi ${errCode}`;
        throw new Error(errMsg);
      }
      return res;
    } catch (error: any) {
      if (typeof memberId === 'string') {
        const res = await api.inviteUserToGroups(memberId, [cId]);
        if (res && typeof res === 'object' && res.error) {
          throw new Error(res.message || res.error_message || `Lỗi ${res.error}`);
        }
        return { success: true, ...res };
      }
      throw error;
    }
  }

  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      removeUserFromGroup: jest.fn(),
      addUserToGroup: jest.fn(),
      inviteUserToGroups: jest.fn(),
    };
  });

  test('removeUserFromGroup cleans groupId "g..." prefix before sending to Zalo API', async () => {
    mockApi.removeUserFromGroup.mockResolvedValue({ status: 0 });
    const res = await removeUserFromGroup(mockApi, 'user123', 'g392819280381');
    expect(mockApi.removeUserFromGroup).toHaveBeenCalledWith('user123', '392819280381');
    expect(res).toEqual({ status: 0 });
  });

  test('removeUserFromGroup throws Error when Zalo API returns error response object', async () => {
    mockApi.removeUserFromGroup.mockResolvedValue({ error: -201, message: 'Đăng nhập thất bại' });
    await expect(removeUserFromGroup(mockApi, 'user123', 'g392819280381')).rejects.toThrow('Đăng nhập thất bại');
  });

  test('addUserToGroup cleans groupId "g..." prefix and triggers inviteUserToGroups fallback if direct add returns error object', async () => {
    mockApi.addUserToGroup.mockResolvedValue({ error: -201, message: 'Đăng nhập thất bại' });
    mockApi.inviteUserToGroups.mockResolvedValue({ status: 0 });

    const res = await addUserToGroup(mockApi, 'user123', 'g392819280381');
    expect(mockApi.addUserToGroup).toHaveBeenCalledWith('user123', '392819280381');
    expect(mockApi.inviteUserToGroups).toHaveBeenCalledWith('user123', ['392819280381']);
    expect(res).toEqual({ success: true, status: 0 });
  });

  test('addUserToGroup succeeds directly when Zalo API returns success without error field', async () => {
    mockApi.addUserToGroup.mockResolvedValue({ status: 0 });
    const res = await addUserToGroup(mockApi, 'user123', '392819280381');
    expect(mockApi.addUserToGroup).toHaveBeenCalledWith('user123', '392819280381');
    expect(mockApi.inviteUserToGroups).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 0 });
  });
});
