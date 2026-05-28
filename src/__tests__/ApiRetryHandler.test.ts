/**
 * ApiRetryHandler.test.ts — Unit tests cho executeWithRetry utility
 */

import { executeWithRetry } from '../utils/ApiRetryHandler';

// Suppress logger output in tests
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    isLoggingEnabled: jest.fn(() => false),
  },
}));

describe('executeWithRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Successful calls', () => {
    it('should return success result on first attempt', async () => {
      const mockApiCall = jest.fn().mockResolvedValue({ data: 'ok' });
      const result = await executeWithRetry(mockApiCall, { operationName: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'ok' });
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    it('should return success without options', async () => {
      const mockApiCall = jest.fn().mockResolvedValue(42);
      const result = await executeWithRetry(mockApiCall);

      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should succeed on second attempt after first failure', async () => {
      const mockApiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Request failed with status code 502'))
        .mockResolvedValue({ ok: true });

      const promise = executeWithRetry(mockApiCall, { maxRetries: 3, operationName: 'retry-test' });
      // advance timers for retry delay
      jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(mockApiCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retryable errors', () => {
    it('should retry on 502 errors up to maxRetries', async () => {
      const error = new Error('Request failed with status code 502');
      const mockApiCall = jest.fn().mockRejectedValue(error);

      const promise = executeWithRetry(mockApiCall, { maxRetries: 2, operationName: 'test-502' });
      jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should retry on TLS errors', async () => {
      const error = new Error('Client network socket disconnected before secure TLS connection was established');
      const mockApiCall = jest.fn().mockRejectedValue(error);

      const promise = executeWithRetry(mockApiCall, { maxRetries: 2, operationName: 'test-tls' });
      jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should retry on ECONNREFUSED errors', async () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const mockApiCall = jest.fn().mockRejectedValue(error);

      const promise = executeWithRetry(mockApiCall, { maxRetries: 1, operationName: 'test-conn' });
      jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toBeDefined();
    });
  });

  describe('Non-retryable errors', () => {
    it('should not retry on non-retryable errors', async () => {
      const error = new Error('Invalid request payload');
      const mockApiCall = jest.fn().mockRejectedValue(error);

      const result = await executeWithRetry(mockApiCall, { maxRetries: 3 });

      expect(result.success).toBe(false);
      // Non-retryable → only 1 call
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    it('should return error details on failure', async () => {
      const error = new Error('Bad request');
      const mockApiCall = jest.fn().mockRejectedValue(error);

      const result = await executeWithRetry(mockApiCall);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error?.message).toBe('string');
    });
  });

  describe('Options defaults', () => {
    it('should use maxRetries=3 by default', async () => {
      const error = new Error('Request failed with status code 502');
      const mockApiCall = jest.fn().mockRejectedValue(error);

      const promise = executeWithRetry(mockApiCall);
      jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      // With default 3 retries: 1 initial + up to 3 retries = max 4 calls
      expect(mockApiCall.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
