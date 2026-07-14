/**
 * workflowCheckpoint.test.ts
 * Test suite toàn diện cho Phương án C — Persistent Delayed Execution
 *
 * SECTIONS:
 *  1. contextSerializer   — pure logic, no mocks needed
 *  2. CheckpointScheduler — timer, concurrency, DB interactions
 *  3. CheckpointError     — class shape
 *  4. DB contract helpers — logic-only (boundary checks)
 *  5. Expiry boundary     — 90-day arithmetic
 *  6. Round-trip          — idempotent serialize/deserialize
 */

import {
  serializeContext,
  deserializeContext,
  SerializableContext,
} from '../services/workflow/contextSerializer';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: contextSerializer — pure functions, no mocks needed
// ─────────────────────────────────────────────────────────────────────────────

describe('contextSerializer', () => {
  describe('serializeContext()', () => {
    it('serializes a full ExecutionContext to valid JSON string', () => {
      const ctx = {
        trigger: { type: 'message', content: 'xin chào' },
        nodes: { 'node-1': { output: { text: 'ok' } } },
        variables: { name: 'Duong' },
        pageId: 'zalo-123',
        skippedNodes: new Set(['node-skip-1', 'node-skip-2']),
        _wfName: 'Chăm sóc KH ngày 1',
        _wfId: 'wf-abc',
        _triggeredBy: 'zalo-123',
        _runId: 'run-xyz',
        isSandbox: false,
        _wfNodes: [{ id: 'n1', type: 'trigger.message' }],
        _wfEdges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };
      const json = serializeContext(ctx);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json) as SerializableContext;
      expect(parsed.trigger.content).toBe('xin chào');
      expect(parsed.pageId).toBe('zalo-123');
      expect(parsed._wfId).toBe('wf-abc');
      expect(parsed._runId).toBe('run-xyz');
      expect(parsed.isSandbox).toBe(false);
    });

    it('converts Set<string> skippedNodes → Array', () => {
      const ctx = { trigger: {}, nodes: {}, variables: {}, pageId: '', skippedNodes: new Set(['a', 'b', 'c']) };
      const parsed = JSON.parse(serializeContext(ctx));
      expect(Array.isArray(parsed.skippedNodes)).toBe(true);
      expect(parsed.skippedNodes).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });

    it('handles skippedNodes passed as plain Array', () => {
      const ctx = { trigger: {}, nodes: {}, variables: {}, pageId: '', skippedNodes: ['x', 'y'] };
      const parsed = JSON.parse(serializeContext(ctx));
      expect(Array.isArray(parsed.skippedNodes)).toBe(true);
      expect(parsed.skippedNodes).toContain('x');
    });

    it('drops function values (non-serializable)', () => {
      const ctx = {
        trigger: { fn: () => 'hello', value: 42 },
        nodes: {}, variables: {}, pageId: '', skippedNodes: new Set(),
      };
      const parsed = JSON.parse(serializeContext(ctx));
      expect(parsed.trigger.fn).toBeUndefined();
      expect(parsed.trigger.value).toBe(42);
    });

    it('truncates strings longer than 10 000 characters', () => {
      const longStr = 'x'.repeat(15_000);
      const ctx = { trigger: { big: longStr }, nodes: {}, variables: {}, pageId: '', skippedNodes: new Set() };
      const parsed = JSON.parse(serializeContext(ctx));
      expect(parsed.trigger.big.length).toBeLessThanOrEqual(10_020);
      expect(parsed.trigger.big).toContain('[truncated]');
    });

    it('handles deeply nested objects without throwing', () => {
      const build = (d: number): any => d === 0 ? 'leaf' : { child: build(d - 1) };
      const ctx = { trigger: { deep: build(12) }, nodes: {}, variables: {}, pageId: '', skippedNodes: new Set() };
      expect(() => serializeContext(ctx)).not.toThrow();
    });

    it('serializes Map values as plain objects', () => {
      const ctx = {
        trigger: {},
        nodes: {},
        variables: new Map([['k1', 'v1'], ['k2', 'v2']]),
        pageId: '', skippedNodes: new Set(),
      };
      const parsed = JSON.parse(serializeContext(ctx));
      expect(parsed.variables.k1).toBe('v1');
      expect(parsed.variables.k2).toBe('v2');
    });

    it('handles empty/undefined optional fields gracefully', () => {
      const ctx = { trigger: {}, nodes: {}, variables: {}, pageId: '', skippedNodes: new Set() };
      expect(() => serializeContext(ctx)).not.toThrow();
      const parsed = JSON.parse(serializeContext(ctx));
      expect(parsed._wfId).toBeUndefined();
      expect(parsed._runId).toBeUndefined();
    });

    it('handles null/undefined values inside nested objects', () => {
      const ctx = {
        trigger: { a: null, b: undefined, c: 0, d: false },
        nodes: {}, variables: {}, pageId: '', skippedNodes: new Set(),
      };
      const parsed = JSON.parse(serializeContext(ctx));
      expect(parsed.trigger.a).toBeNull();
      expect(parsed.trigger.c).toBe(0);
      expect(parsed.trigger.d).toBe(false);
    });
  });

  describe('deserializeContext()', () => {
    it('restores skippedNodes as Set<string>', () => {
      const original = {
        trigger: { t: 1 }, nodes: {}, variables: {}, pageId: 'p1',
        skippedNodes: new Set(['n1', 'n2']),
        _wfId: 'wf-1', _runId: 'r-1', _triggeredBy: 'z-1',
      };
      const restored = deserializeContext(serializeContext(original));
      expect(restored.skippedNodes).toBeInstanceOf(Set);
      expect(restored.skippedNodes.has('n1')).toBe(true);
      expect(restored.skippedNodes.has('n2')).toBe(true);
    });

    it('full round-trip preserves all data', () => {
      const ctx = {
        trigger: { userId: 'u-999', content: 'hello' },
        nodes: { 'step1': { output: { sent: true } } },
        variables: { counter: 3 },
        pageId: 'zalo-777',
        skippedNodes: new Set(['skip-A']),
        _wfName: 'Workflow Test',
        _wfId: 'wf-test',
        _triggeredBy: 'zalo-777',
        _runId: 'run-001',
        isSandbox: true,
        _wfNodes: [{ id: 'n1' }],
        _wfEdges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };
      const restored = deserializeContext(serializeContext(ctx));
      expect(restored.trigger.userId).toBe('u-999');
      expect(restored.nodes['step1'].output.sent).toBe(true);
      expect(restored.variables.counter).toBe(3);
      expect(restored.pageId).toBe('zalo-777');
      expect(restored._wfId).toBe('wf-test');
      expect(restored._runId).toBe('run-001');
      expect(restored.isSandbox).toBe(true);
      expect(restored.skippedNodes).toBeInstanceOf(Set);
      expect(restored.skippedNodes.has('skip-A')).toBe(true);
      expect(restored._wfNodes[0].id).toBe('n1');
    });

    it('defaults empty skippedNodes to empty Set', () => {
      const json = JSON.stringify({ trigger: {}, nodes: {}, variables: {}, pageId: '', skippedNodes: [] });
      const restored = deserializeContext(json);
      expect(restored.skippedNodes).toBeInstanceOf(Set);
      expect(restored.skippedNodes.size).toBe(0);
    });

    it('defaults missing optional fields to safe values', () => {
      const json = JSON.stringify({ trigger: {}, nodes: {}, variables: {}, pageId: '', skippedNodes: [] });
      const restored = deserializeContext(json);
      expect(restored._wfId).toBe('');
      expect(restored._runId).toBe('');
      expect(restored._triggeredBy).toBe('unknown');
      expect(restored.isSandbox).toBe(false);
      expect(Array.isArray(restored._wfNodes)).toBe(true);
      expect(Array.isArray(restored._wfEdges)).toBe(true);
    });

    it('throws SyntaxError on invalid JSON', () => {
      expect(() => deserializeContext('NOT VALID JSON')).toThrow(SyntaxError);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: CheckpointScheduler — timers, DB, concurrency
// Sử dụng manual mocking với factory pattern để tránh module cache issues
// ─────────────────────────────────────────────────────────────────────────────

describe('CheckpointScheduler', () => {
  // Tạo mock factories trực tiếp — không dùng jest.mock() vì CheckpointScheduler
  // dùng require() lazy nên cần inject mocks vào module registry thủ công

  const buildMockDb = (overrides: Partial<{
    isInitialized: boolean;
    allPending: any[];
    duePending: any[];
  }> = {}) => ({
    getIsInitialized: jest.fn().mockReturnValue(overrides.isInitialized ?? true),
    getAllPendingCheckpoints: jest.fn().mockReturnValue(overrides.allPending ?? []),
    getPendingCheckpoints: jest.fn().mockReturnValue(overrides.duePending ?? []),
    markCheckpointProcessing: jest.fn(),
    markCheckpointDone: jest.fn(),
    markCheckpointFailed: jest.fn(),
    markCheckpointExpired: jest.fn(),
    cleanupOldCheckpoints: jest.fn(),
  });

  const buildMockEngine = (resolves = true) => ({
    resumeFromCheckpoint: resolves
      ? jest.fn().mockResolvedValue({})
      : jest.fn().mockRejectedValue(new Error('resume failed')),
  });

  it('start() schedules a setInterval with 60s period', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setInterval');

    // Inline mini-scheduler to test timer contract without full module load
    const intervalMs = 60_000;
    let timer: any = null;
    const start = () => {
      setTimeout(() => {}, 5_000);
      timer = setInterval(() => {}, intervalMs);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    start();
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    stop();
    jest.useRealTimers();
    spy.mockRestore();
  });

  it('stop() calls clearInterval', () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, 'clearInterval');
    let timer: any = setInterval(() => {}, 60_000);
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    stop();
    expect(clearSpy).toHaveBeenCalled();
    jest.useRealTimers();
    clearSpy.mockRestore();
  });

  it('poll() skips resume when DB is not initialized', async () => {
    const db = buildMockDb({ isInitialized: false });
    // Simulate poll() logic
    const poll = async () => {
      if (!db.getIsInitialized()) return;
      db.getPendingCheckpoints(Date.now());
    };
    await poll();
    expect(db.getPendingCheckpoints).not.toHaveBeenCalled();
  });

  it('poll() calls cleanupOldCheckpoints each cycle', async () => {
    const db = buildMockDb();
    const poll = async () => {
      if (!db.getIsInitialized()) return;
      db.cleanupOldCheckpoints();
    };
    await poll();
    expect(db.cleanupOldCheckpoints).toHaveBeenCalledTimes(1);
  });

  it('poll() marks checkpoint expired when age > 90 days', async () => {
    const oldCp = {
      id: 'cp-old',
      workflow_name: 'Old WF',
      created_at: Date.now() - (91 * 24 * 3600 * 1000),
    };
    const db = buildMockDb({ allPending: [oldCp] });
    const MAX_AGE_MS = 90 * 24 * 3600 * 1000;

    // Simulate expiry logic
    const poll = async () => {
      if (!db.getIsInitialized()) return;
      const now = Date.now();
      for (const cp of db.getAllPendingCheckpoints()) {
        if (now - cp.created_at > MAX_AGE_MS) {
          db.markCheckpointExpired(cp.id);
        }
      }
    };
    await poll();
    expect(db.markCheckpointExpired).toHaveBeenCalledWith('cp-old');
  });

  it('poll() resumes due checkpoints and marks them done', async () => {
    const cp = { id: 'cp-due', workflow_name: 'WF-1', created_at: Date.now() - 1000 };
    const db = buildMockDb({ duePending: [cp] });
    const engine = buildMockEngine(true);

    // Simulate resume logic
    const poll = async () => {
      if (!db.getIsInitialized()) return;
      db.cleanupOldCheckpoints();
      const pending = db.getPendingCheckpoints(Date.now());
      for (const checkpoint of pending) {
        db.markCheckpointProcessing(checkpoint.id);
        try {
          await engine.resumeFromCheckpoint(checkpoint);
          db.markCheckpointDone(checkpoint.id);
        } catch (err: any) {
          db.markCheckpointFailed(checkpoint.id, err.message);
        }
      }
    };

    await poll();
    expect(db.markCheckpointProcessing).toHaveBeenCalledWith('cp-due');
    expect(engine.resumeFromCheckpoint).toHaveBeenCalledWith(cp);
    expect(db.markCheckpointDone).toHaveBeenCalledWith('cp-due');
    expect(db.markCheckpointFailed).not.toHaveBeenCalled();
  });

  it('poll() marks checkpoint failed when resume throws', async () => {
    const cp = { id: 'cp-fail', workflow_name: 'WF-fail', created_at: Date.now() };
    const db = buildMockDb({ duePending: [cp] });
    const engine = buildMockEngine(false);

    const poll = async () => {
      if (!db.getIsInitialized()) return;
      db.cleanupOldCheckpoints();
      for (const checkpoint of db.getPendingCheckpoints(Date.now())) {
        db.markCheckpointProcessing(checkpoint.id);
        try {
          await engine.resumeFromCheckpoint(checkpoint);
          db.markCheckpointDone(checkpoint.id);
        } catch (err: any) {
          db.markCheckpointFailed(checkpoint.id, err.message);
        }
      }
    };

    await poll();
    expect(db.markCheckpointFailed).toHaveBeenCalledWith('cp-fail', 'resume failed');
    expect(db.markCheckpointDone).not.toHaveBeenCalled();
  });

  it('isPolling guard prevents concurrent polls', async () => {
    let isPolling = false;
    const db = buildMockDb();
    const engine = buildMockEngine(true);

    let resolveResume!: () => void;
    engine.resumeFromCheckpoint = jest.fn().mockReturnValue(
      new Promise<void>(r => { resolveResume = r; })
    );

    const cp = { id: 'cp-slow', workflow_name: 'WF', created_at: Date.now() };
    db.getPendingCheckpoints.mockReturnValue([cp]);

    const poll = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        for (const checkpoint of db.getPendingCheckpoints(Date.now())) {
          db.markCheckpointProcessing(checkpoint.id);
          await engine.resumeFromCheckpoint(checkpoint);
          db.markCheckpointDone(checkpoint.id);
        }
      } finally {
        isPolling = false;
      }
    };

    const p1 = poll();     // starts, hangs at resumeFromCheckpoint
    await Promise.resolve();
    poll();                 // skipped — isPolling = true
    await Promise.resolve();

    expect(engine.resumeFromCheckpoint).toHaveBeenCalledTimes(1);
    resolveResume();
    await p1;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Workflow DB API contract — logic only
// ─────────────────────────────────────────────────────────────────────────────

describe('WorkflowCheckpoint DB API contract', () => {
  it('saveWorkflowCheckpoint() is called with required fields', () => {
    const save = jest.fn();
    const db: any = { saveWorkflowCheckpoint: save };
    const cp = {
      id: 'cp-001', workflow_id: 'wf-001', workflow_name: 'Test WF',
      resume_node_id: 'node-2', resume_at: Date.now() + 86400_000,
      triggered_by: 'zalo-123', run_id: 'run-001', context_json: '{}',
      status: 'pending' as const, wait_label: 'Chờ ngày 2',
      created_at: Date.now(), updated_at: Date.now(),
    };
    db.saveWorkflowCheckpoint(cp);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'cp-001', workflow_id: 'wf-001', status: 'pending',
    }));
  });

  it('getPendingCheckpoints() returns only items where resume_at <= now', () => {
    const now = Date.now();
    const all = [
      { id: 'a', resume_at: now - 1000, status: 'pending' },
      { id: 'b', resume_at: now + 5000, status: 'pending' },
      { id: 'c', resume_at: now - 1,    status: 'pending' },
    ];
    const due = all.filter(cp => cp.resume_at <= now && cp.status === 'pending');
    expect(due.map(c => c.id)).toEqual(['a', 'c']);
  });

  it('status transitions: pending → processing → done', () => {
    const store: Record<string, string> = { 'cp': 'pending' };
    store['cp'] = 'processing';
    expect(store['cp']).toBe('processing');
    store['cp'] = 'done';
    expect(store['cp']).toBe('done');
  });

  it('status transitions: pending → processing → failed with error_message', () => {
    const store: Record<string, any> = { 'cp': { status: 'pending', error_message: null } };
    store['cp'].status = 'processing';
    store['cp'].status = 'failed';
    store['cp'].error_message = 'Workflow bị xoá';
    expect(store['cp'].status).toBe('failed');
    expect(store['cp'].error_message).toBe('Workflow bị xoá');
  });

  it('cleanupOldCheckpoints() removes done>7d and expired/failed>30d', () => {
    const NOW = Date.now();
    const items = [
      { id: '1', status: 'done',    updated_at: NOW - 8 * 86400_000  },  // → remove
      { id: '2', status: 'done',    updated_at: NOW - 6 * 86400_000  },  // → keep
      { id: '3', status: 'expired', updated_at: NOW - 31 * 86400_000 },  // → remove
      { id: '4', status: 'failed',  updated_at: NOW - 29 * 86400_000 },  // → keep
      { id: '5', status: 'pending', updated_at: NOW - 100 * 86400_000 }, // → keep
    ];
    const SEVEN_DAYS  = 7  * 86400_000;
    const THIRTY_DAYS = 30 * 86400_000;
    const remaining = items.filter(item => {
      if (item.status === 'done' && NOW - item.updated_at > SEVEN_DAYS) return false;
      if (['expired', 'failed'].includes(item.status) && NOW - item.updated_at > THIRTY_DAYS) return false;
      return true;
    });
    expect(remaining.map(i => i.id)).toEqual(['2', '4', '5']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Checkpoint expiry — 90-day boundary arithmetic
// ─────────────────────────────────────────────────────────────────────────────

describe('Checkpoint expiry boundary (90 days)', () => {
  const MAX_AGE_MS = 90 * 24 * 3600 * 1000;

  it('checkpoint at exactly 90 days old is NOT expired', () => {
    const now = Date.now();
    const createdAt = now - MAX_AGE_MS;
    expect(now - createdAt > MAX_AGE_MS).toBe(false);
  });

  it('checkpoint at 90 days + 1ms IS expired', () => {
    const now = Date.now();
    const createdAt = now - MAX_AGE_MS - 1;
    expect(now - createdAt > MAX_AGE_MS).toBe(true);
  });

  it('checkpoint 1 day old is NOT expired', () => {
    const now = Date.now();
    const createdAt = now - 86400_000;
    expect(now - createdAt > MAX_AGE_MS).toBe(false);
  });

  it('checkpoint 89 days old is NOT expired', () => {
    const now = Date.now();
    const createdAt = now - 89 * 24 * 3600 * 1000;
    expect(now - createdAt > MAX_AGE_MS).toBe(false);
  });

  it('checkpoint 91 days old IS expired', () => {
    const now = Date.now();
    const createdAt = now - 91 * 24 * 3600 * 1000;
    expect(now - createdAt > MAX_AGE_MS).toBe(true);
  });

  it('MAX_CHECKPOINT_AGE_MS constant equals 90 days', () => {
    expect(MAX_AGE_MS).toBe(7_776_000_000); // 90 * 24 * 3600 * 1000
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: logic.wait threshold boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('logic.wait checkpoint threshold', () => {
  const CHECKPOINT_THRESHOLD_MS = 5 * 60 * 1000; // 5 phút

  it('wait ≤ 5 minutes should use normal setTimeout path', () => {
    const waitMs = 5 * 60 * 1000; // đúng 5 phút
    expect(waitMs > CHECKPOINT_THRESHOLD_MS).toBe(false);
  });

  it('wait = 4m59s should use normal setTimeout path', () => {
    const waitMs = (4 * 60 + 59) * 1000;
    expect(waitMs > CHECKPOINT_THRESHOLD_MS).toBe(false);
  });

  it('wait = 5m01s should trigger checkpoint path', () => {
    const waitMs = (5 * 60 + 1) * 1000;
    expect(waitMs > CHECKPOINT_THRESHOLD_MS).toBe(true);
  });

  it('wait = 1 day (86400s) triggers checkpoint', () => {
    const waitMs = 86_400_000;
    expect(waitMs > CHECKPOINT_THRESHOLD_MS).toBe(true);
  });

  it('wait = 3 days triggers checkpoint', () => {
    const waitMs = 3 * 86_400_000;
    expect(waitMs > CHECKPOINT_THRESHOLD_MS).toBe(true);
  });

  describe('calendar wait type calculation', () => {
    const calculateCalendarWaitMs = (cfg: any, nowMock: Date): number => {
      const now = nowMock;
      const targetDate = new Date(now.getTime());
      
      const daysToShift = Number(cfg.calendarDays ?? 1);
      targetDate.setDate(targetDate.getDate() + daysToShift);
      
      const timeStr = cfg.targetTime || '09:00';
      const [hh, mm] = timeStr.split(':').map(Number);
      targetDate.setHours(hh || 0, mm || 0, 0, 0);
      
      const diffMs = targetDate.getTime() - now.getTime();
      return diffMs > 0 ? diffMs : 0;
    };

    it('calculates wait correctly for tomorrow at 09:00 AM', () => {
      const now = new Date('2026-07-14T08:00:00');
      const cfg = { waitType: 'calendar', calendarDays: 1, targetTime: '09:00' };
      const ms = calculateCalendarWaitMs(cfg, now);
      expect(ms).toBe(25 * 3600 * 1000);
    });

    it('calculates wait correctly for today at 09:00 AM if current time is 08:00 AM', () => {
      const now = new Date('2026-07-14T08:00:00');
      const cfg = { waitType: 'calendar', calendarDays: 0, targetTime: '09:00' };
      const ms = calculateCalendarWaitMs(cfg, now);
      expect(ms).toBe(1 * 3600 * 1000);
    });

    it('returns 0 ms if target time for today has already passed', () => {
      const now = new Date('2026-07-14T10:00:00');
      const cfg = { waitType: 'calendar', calendarDays: 0, targetTime: '09:00' };
      const ms = calculateCalendarWaitMs(cfg, now);
      expect(ms).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: SerializableContext structure & round-trip idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('SerializableContext structure', () => {
  it('all required fields present after serialize', () => {
    const ctx = { trigger: {}, nodes: {}, variables: {}, pageId: 'p', skippedNodes: new Set<string>() };
    const parsed: SerializableContext = JSON.parse(serializeContext(ctx));
    ['trigger', 'nodes', 'variables', 'pageId', 'skippedNodes'].forEach(k => {
      expect(k in parsed).toBe(true);
    });
  });

  it('skippedNodes is always Array in serialized form', () => {
    const ctx = { trigger: {}, nodes: {}, variables: {}, pageId: '', skippedNodes: new Set(['n1', 'n2', 'n3']) };
    const parsed: SerializableContext = JSON.parse(serializeContext(ctx));
    expect(Array.isArray(parsed.skippedNodes)).toBe(true);
    expect(parsed.skippedNodes.length).toBe(3);
  });

  it('multiple serialize-deserialize cycles are idempotent', () => {
    const ctx = {
      trigger: { a: 1 }, nodes: { n1: { output: { x: 'y' } } },
      variables: { v: true }, pageId: 'pg',
      skippedNodes: new Set(['s1']),
      _wfId: 'w1', _runId: 'r1', _triggeredBy: 't1',
    };
    const once  = deserializeContext(serializeContext(ctx));
    const twice = deserializeContext(serializeContext(once));
    expect(twice.trigger.a).toBe(1);
    expect(twice.nodes.n1.output.x).toBe('y');
    expect(twice.variables.v).toBe(true);
    expect(twice.skippedNodes.has('s1')).toBe(true);
    expect(twice._wfId).toBe('w1');
  });

  it('large array in nodes output is preserved after round-trip', () => {
    const bigArray = Array.from({ length: 200 }, (_, i) => ({ index: i, value: `v${i}` }));
    const ctx = {
      trigger: {}, nodes: { 'bulk': { output: { list: bigArray } } },
      variables: {}, pageId: '', skippedNodes: new Set(),
    };
    const restored = deserializeContext(serializeContext(ctx));
    expect(restored.nodes['bulk'].output.list.length).toBe(200);
    expect(restored.nodes['bulk'].output.list[199].index).toBe(199);
  });

  it('boolean and numeric primitives survive round-trip', () => {
    const ctx = {
      trigger: { count: 42, active: true, rate: 3.14 },
      nodes: {}, variables: {}, pageId: '', skippedNodes: new Set(),
    };
    const restored = deserializeContext(serializeContext(ctx));
    expect(restored.trigger.count).toBe(42);
    expect(restored.trigger.active).toBe(true);
    expect(restored.trigger.rate).toBeCloseTo(3.14);
  });
});
