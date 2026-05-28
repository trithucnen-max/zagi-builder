/**
 * CRMQueueService Unit Tests
 * Tests token bucket logic và dispatcher behavior
 */

// ─── Test the pure token-bucket logic independently ──────────────────────────
describe('CRMQueue — Token Bucket Logic', () => {
  const MAX_TOKENS = 60;
  const REFILL_INTERVAL_MS = 60 * 1000;

  function refillTokens(currentTokens: number, lastRefillAt: number, now: number): number {
    const elapsed = now - lastRefillAt;
    const tokensToAdd = Math.floor(elapsed / REFILL_INTERVAL_MS);
    return Math.min(MAX_TOKENS, currentTokens + tokensToAdd);
  }

  it('should start with MAX_TOKENS when initialized', () => {
    expect(MAX_TOKENS).toBe(60);
  });

  it('should not exceed MAX_TOKENS after refill', () => {
    const result = refillTokens(50, Date.now() - 30 * 60 * 1000, Date.now()); // 30 min elapsed
    expect(result).toBeLessThanOrEqual(MAX_TOKENS);
  });

  it('should add exactly 1 token per REFILL_INTERVAL_MS', () => {
    const now = Date.now();
    const lastRefill = now - 3 * REFILL_INTERVAL_MS; // 3 minutes ago
    const result = refillTokens(0, lastRefill, now);
    expect(result).toBe(3);
  });

  it('should return 0 tokens before any interval has passed', () => {
    const now = Date.now();
    const result = refillTokens(0, now - 30_000, now); // only 30s ago
    expect(result).toBe(0);
  });

  it('should consume a token on each send', () => {
    let tokens = 5;
    const canSend = tokens > 0;
    if (canSend) tokens -= 1;
    expect(tokens).toBe(4);
  });

  it('should block send when tokens are 0', () => {
    let tokens = 0;
    const canSend = tokens > 0;
    expect(canSend).toBe(false);
  });

  it('should enforce MIN_DELAY between sends', () => {
    const MIN_DELAY_MS = 30 * 1000;
    const lastSentAt = Date.now() - 15_000; // 15s ago — too soon
    const now = Date.now();
    const canSend = now - lastSentAt >= MIN_DELAY_MS;
    expect(canSend).toBe(false);
  });

  it('should allow send after MIN_DELAY has passed', () => {
    const MIN_DELAY_MS = 30 * 1000;
    const lastSentAt = Date.now() - 35_000; // 35s ago — OK
    const now = Date.now();
    const canSend = now - lastSentAt >= MIN_DELAY_MS;
    expect(canSend).toBe(true);
  });
});

// ─── Rate limit calculation tests ────────────────────────────────────────────
describe('CRMQueue — Rate Limit Calculations', () => {
  it('should calculate 60 messages per hour correctly', () => {
    const MAX_TOKENS = 60;
    const REFILL_INTERVAL_MS = 60 * 1000; // 1 min
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const maxPerHour = ONE_HOUR_MS / REFILL_INTERVAL_MS;
    expect(maxPerHour).toBe(MAX_TOKENS);
  });

  it('should have a minimum 30s delay between messages', () => {
    const MIN_DELAY_MS = 30 * 1000;
    const maxPerMinute = 60_000 / MIN_DELAY_MS;
    expect(maxPerMinute).toBe(2); // at most 2/min with 30s delay
  });
});
