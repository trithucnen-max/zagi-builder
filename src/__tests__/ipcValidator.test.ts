import {
  validateIpc,
  LoginQRSchema,
  EmployeeCreateSchema,
  EmployeeAssignAccountsSchema,
} from '../../electron/ipc/ipcValidator';

describe('IPC Zod Input Validation', () => {
  describe('LoginQRSchema', () => {
    it('should pass with valid tempId', () => {
      const result = validateIpc(LoginQRSchema, { tempId: 'temp_qr_token_123' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tempId).toBe('temp_qr_token_123');
      }
    });

    it('should fail with empty tempId', () => {
      const result = validateIpc(LoginQRSchema, { tempId: '' });
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.error).toContain('tempId');
      }
    });

    it('should fail with missing tempId', () => {
      const result = validateIpc(LoginQRSchema, {});
      expect(result.success).toBe(false);
    });

    it('should fail with overly long tempId', () => {
      const longId = 'a'.repeat(100); // Max is 64
      const result = validateIpc(LoginQRSchema, { tempId: longId });
      expect(result.success).toBe(false);
    });
  });

  describe('EmployeeCreateSchema', () => {
    it('should pass with valid employee details', () => {
      const validEmp = {
        username: 'john_doe',
        password: 'securePassword123',
        display_name: 'John Doe',
        avatar_url: 'https://example.com/avatar.png',
        role: 'employee' as const,
      };
      const result = validateIpc(EmployeeCreateSchema, validEmp);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid characters in username', () => {
      const invalidEmp = {
        username: 'john doe!', // Spaces and ! are not allowed
        password: 'securePassword123',
        display_name: 'John Doe',
      };
      const result = validateIpc(EmployeeCreateSchema, invalidEmp);
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.error).toContain('Username: chỉ dùng chữ, số, dấu _.-');
      }
    });

    it('should fail with too short password', () => {
      const invalidEmp = {
        username: 'johndoe',
        password: '123', // Min is 6
        display_name: 'John Doe',
      };
      const result = validateIpc(EmployeeCreateSchema, invalidEmp);
      expect(result.success).toBe(false);
    });

    it('should fail with invalid avatar_url format', () => {
      const invalidEmp = {
        username: 'johndoe',
        password: 'securePassword123',
        display_name: 'John Doe',
        avatar_url: 'not-a-url',
      };
      const result = validateIpc(EmployeeCreateSchema, invalidEmp);
      expect(result.success).toBe(false);
    });
  });

  describe('EmployeeAssignAccountsSchema', () => {
    it('should pass with valid inputs', () => {
      const validPayload = {
        employeeId: 'emp_123',
        zaloIds: ['123456', '789012'],
      };
      const result = validateIpc(EmployeeAssignAccountsSchema, validPayload);
      expect(result.success).toBe(true);
    });

    it('should fail if zaloIds has overly long strings', () => {
      const invalidPayload = {
        employeeId: 'emp_123',
        zaloIds: ['123456789012345678901'], // Length 21, max is 20
      };
      const result = validateIpc(EmployeeAssignAccountsSchema, invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should fail if zaloIds array is too large', () => {
      const invalidPayload = {
        employeeId: 'emp_123',
        zaloIds: Array(201).fill('123456'), // Max array size is 200
      };
      const result = validateIpc(EmployeeAssignAccountsSchema, invalidPayload);
      expect(result.success).toBe(false);
    });
  });
});
