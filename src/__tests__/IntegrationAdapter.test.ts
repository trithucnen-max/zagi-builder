/**
 * IntegrationAdapter.test.ts — Unit tests cho IntegrationAdapter abstract class
 * và các shared types/interfaces
 */

import { IntegrationAdapter, IntegrationConfig, TestResult } from '../services/integrations/IntegrationAdapter';

// Concrete implementation để test abstract class
class MockAdapter extends IntegrationAdapter {
  readonly type = 'mock';
  readonly name = 'Mock Integration';

  testConnectionResult: TestResult = { success: true, message: 'Connected' };
  executeActionResult: any = { ok: true };

  async testConnection(): Promise<TestResult> {
    return this.testConnectionResult;
  }

  async executeAction(action: string, params: Record<string, any>): Promise<any> {
    return { action, params, ...this.executeActionResult };
  }

  // Expose protected config for testing
  getConfig(): IntegrationConfig {
    return this.config;
  }
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'int-001',
    type: 'mock',
    name: 'Test Integration',
    enabled: true,
    credentials: { apiKey: 'test-key' },
    settings: { timeout: 5000 },
    createdAt: 1000000,
    updatedAt: 1000001,
    ...overrides,
  };
}

describe('IntegrationAdapter', () => {
  let adapter: MockAdapter;
  let config: IntegrationConfig;

  beforeEach(() => {
    config = makeConfig();
    adapter = new MockAdapter(config);
  });

  describe('constructor', () => {
    it('should store config correctly', () => {
      expect(adapter.getConfig()).toEqual(config);
    });

    it('should expose type and name', () => {
      expect(adapter.type).toBe('mock');
      expect(adapter.name).toBe('Mock Integration');
    });
  });

  describe('isEnabled()', () => {
    it('should return true when config.enabled is true', () => {
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should return false when config.enabled is false', () => {
      const disabledAdapter = new MockAdapter(makeConfig({ enabled: false }));
      expect(disabledAdapter.isEnabled()).toBe(false);
    });
  });

  describe('updateConfig()', () => {
    it('should update the internal config', () => {
      const newConfig = makeConfig({ name: 'Updated Name', enabled: false });
      adapter.updateConfig(newConfig);
      expect(adapter.getConfig().name).toBe('Updated Name');
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should update credentials', () => {
      const newConfig = makeConfig({ credentials: { apiKey: 'new-key', secret: 'new-secret' } });
      adapter.updateConfig(newConfig);
      expect(adapter.getConfig().credentials.apiKey).toBe('new-key');
      expect(adapter.getConfig().credentials.secret).toBe('new-secret');
    });
  });

  describe('testConnection()', () => {
    it('should return success result', async () => {
      const result = await adapter.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected');
    });

    it('should return failure result when connection fails', async () => {
      adapter.testConnectionResult = { success: false, message: 'Connection refused' };
      const result = await adapter.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection refused');
    });
  });

  describe('executeAction()', () => {
    it('should pass action and params through', async () => {
      const result = await adapter.executeAction('getOrders', { page: 1, limit: 10 });
      expect(result.action).toBe('getOrders');
      expect(result.params).toEqual({ page: 1, limit: 10 });
    });

    it('should handle empty params', async () => {
      const result = await adapter.executeAction('ping', {});
      expect(result.action).toBe('ping');
      expect(result.params).toEqual({});
    });

    it('should handle complex params', async () => {
      const params = { orderId: 'ORD-123', status: 'shipped', metadata: { tracking: 'VN123' } };
      const result = await adapter.executeAction('updateOrder', params);
      expect(result.params.orderId).toBe('ORD-123');
      expect(result.params.metadata.tracking).toBe('VN123');
    });
  });
});
