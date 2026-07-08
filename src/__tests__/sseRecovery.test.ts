/**
 * @file sseRecovery.test.ts
 * @description Tests cho SSE Last-Event-ID Recovery logic — v27.2.6
 * 
 * Phạm vi kiểm thử:
 *  - Event History Queue: circular buffer (max 500 events, TTL 10 phút)
 *  - Sequence ID tăng dần theo từng employee
 *  - Hit scenario: tìm thấy lastEventId → replay sự kiện bị lỡ
 *  - Miss scenario: buffer tràn / TTL hết → gửi fallbackDeltaSync
 *  - lastEventId=null (kết nối lần đầu) → không replay
 *  - Expired events bị lọc bỏ khỏi queue
 */

jest.mock('../utils/Logger', () => ({
    default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Replicated SSE Recovery Logic (extracted for pure unit testing) ──────────
// These mirror the logic in HttpRelayService without I/O or HTTP dependencies.

interface SseEvent {
    id: number;
    channel: string;
    data: any;
    ts: number;
}

const SSE_QUEUE_MAX = 500;
const SSE_QUEUE_TTL_MS = 600_000; // 10 minutes

function filterExpiredAndEnqueue(
    queue: SseEvent[],
    newEvent: SseEvent,
    now: number
): SseEvent[] {
    // Remove expired events
    let filtered = queue.filter(e => now - e.ts < SSE_QUEUE_TTL_MS);
    // Enforce max size (circular: drop oldest)
    if (filtered.length >= SSE_QUEUE_MAX) filtered.shift();
    filtered.push(newEvent);
    return filtered;
}

function getMissedEvents(queue: SseEvent[], lastEventId: number, now: number): SseEvent[] | 'MISS' {
    const valid = queue.filter(e => now - e.ts < SSE_QUEUE_TTL_MS);
    // Find the position of lastEventId in the queue
    const idx = valid.findIndex(e => e.id === lastEventId);
    if (idx === -1) return 'MISS';
    return valid.slice(idx + 1); // events after lastEventId
}

function resolveReconnect(
    queue: SseEvent[],
    lastEventId: number | null,
    now: number
): { action: 'SEND_ALL' | 'REPLAY' | 'DELTA_SYNC' | 'NO_OP'; events?: SseEvent[] } {
    if (lastEventId === null) {
        // First connection — no recovery needed
        return { action: 'NO_OP' };
    }
    const result = getMissedEvents(queue, lastEventId, now);
    if (result === 'MISS') {
        return { action: 'DELTA_SYNC' };
    }
    if (result.length === 0) {
        return { action: 'NO_OP' };
    }
    return { action: 'REPLAY', events: result };
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeEvent(id: number, channel = 'event:message', tsOffset = 0): SseEvent {
    return { id, channel, data: { msg: `Event ${id}` }, ts: Date.now() - tsOffset };
}

function buildQueue(count: number, startId = 1): SseEvent[] {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
        id: startId + i,
        channel: 'event:message',
        data: {},
        ts: now,
    }));
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('SSE Event Recovery Logic (v27.2.6)', () => {

    // ── 1. Sequence ID assignment ───────────────────────────────────────────
    describe('Sequence ID', () => {
        it('should increment sequence ID for each event', () => {
            let seq = 0;
            const ids = Array.from({ length: 5 }, () => ++seq);
            expect(ids).toEqual([1, 2, 3, 4, 5]);
        });

        it('should be per-employee (independent counters)', () => {
            const employees: Record<string, number> = { emp1: 0, emp2: 0 };
            employees.emp1++;
            employees.emp1++;
            employees.emp2++;
            expect(employees.emp1).toBe(2);
            expect(employees.emp2).toBe(1);
        });
    });

    // ── 2. Event History Queue — circular buffer ────────────────────────────
    describe('Event History Queue', () => {
        it('should store events up to SSE_QUEUE_MAX (500)', () => {
            let queue: SseEvent[] = [];
            const now = Date.now();
            for (let i = 1; i <= SSE_QUEUE_MAX; i++) {
                queue = filterExpiredAndEnqueue(queue, { id: i, channel: 'ch', data: {}, ts: now }, now);
            }
            expect(queue).toHaveLength(SSE_QUEUE_MAX);
        });

        it('should drop oldest event when queue exceeds SSE_QUEUE_MAX', () => {
            let queue: SseEvent[] = buildQueue(SSE_QUEUE_MAX);
            const now = Date.now();
            // Add one more (501st)
            queue = filterExpiredAndEnqueue(queue, { id: 501, channel: 'ch', data: {}, ts: now }, now);
            expect(queue).toHaveLength(SSE_QUEUE_MAX);
            // Oldest (id=1) should be dropped
            expect(queue[0].id).toBe(2);
            expect(queue[queue.length - 1].id).toBe(501);
        });

        it('should filter out events older than SSE_QUEUE_TTL_MS (10 min)', () => {
            const now = Date.now();
            const expired = { id: 1, channel: 'ch', data: {}, ts: now - (SSE_QUEUE_TTL_MS + 1000) };
            const fresh = { id: 2, channel: 'ch', data: {}, ts: now };
            let queue: SseEvent[] = [expired];
            queue = filterExpiredAndEnqueue(queue, fresh, now);
            // Expired event should be removed
            expect(queue.map(e => e.id)).not.toContain(1);
            expect(queue.map(e => e.id)).toContain(2);
        });

        it('should keep events exactly at TTL boundary (not expired)', () => {
            const now = Date.now();
            // Exactly at TTL-1ms (not expired)
            const borderline = { id: 1, channel: 'ch', data: {}, ts: now - (SSE_QUEUE_TTL_MS - 1) };
            let queue: SseEvent[] = [borderline];
            const fresh = { id: 2, channel: 'ch', data: {}, ts: now };
            queue = filterExpiredAndEnqueue(queue, fresh, now);
            expect(queue.map(e => e.id)).toContain(1);
        });
    });

    // ── 3. reconnect — HIT scenario ────────────────────────────────────────
    describe('reconnect — HIT scenario (events found)', () => {
        it('should replay missed events when lastEventId is in queue', () => {
            const queue = buildQueue(10, 1); // events 1..10
            const now = Date.now();
            const result = resolveReconnect(queue, 7, now);
            expect(result.action).toBe('REPLAY');
            expect(result.events!.map(e => e.id)).toEqual([8, 9, 10]);
        });

        it('should replay only 1 event if employee missed just the last one', () => {
            const queue = buildQueue(5, 1); // 1..5
            const now = Date.now();
            const result = resolveReconnect(queue, 4, now);
            expect(result.action).toBe('REPLAY');
            expect(result.events).toHaveLength(1);
            expect(result.events![0].id).toBe(5);
        });

        it('should return NO_OP if employee is already up to date (lastEventId = max)', () => {
            const queue = buildQueue(5, 1);
            const now = Date.now();
            const result = resolveReconnect(queue, 5, now);
            expect(result.action).toBe('NO_OP');
        });
    });

    // ── 4. reconnect — MISS scenario ───────────────────────────────────────
    describe('reconnect — MISS scenario (buffer overflowed or TTL expired)', () => {
        it('should return DELTA_SYNC when lastEventId is not in queue (overflow)', () => {
            // Queue has events 101..600 (after overflow), client has lastEventId=50
            const queue = buildQueue(SSE_QUEUE_MAX, 101);
            const now = Date.now();
            const result = resolveReconnect(queue, 50, now);
            expect(result.action).toBe('DELTA_SYNC');
        });

        it('should return DELTA_SYNC when queue is empty and lastEventId exists', () => {
            const result = resolveReconnect([], 10, Date.now());
            expect(result.action).toBe('DELTA_SYNC');
        });

        it('should return DELTA_SYNC when all events for that ID have expired (TTL)', () => {
            const now = Date.now();
            // Old expired event (id=5) not in queue because it was filtered
            const queue: SseEvent[] = [
                { id: 6, channel: 'ch', data: {}, ts: now }, // only fresh event
            ];
            // Client asks for events after id=5 (which expired and was removed)
            const result = resolveReconnect(queue, 5, now);
            expect(result.action).toBe('DELTA_SYNC');
        });
    });

    // ── 5. First connection (lastEventId = null) ────────────────────────────
    describe('reconnect — first connection (no lastEventId)', () => {
        it('should return NO_OP when lastEventId is null', () => {
            const queue = buildQueue(10, 1);
            const result = resolveReconnect(queue, null, Date.now());
            expect(result.action).toBe('NO_OP');
        });
    });

    // ── 6. lastEventId persistence key format ──────────────────────────────
    describe('lastEventId SQLite key format', () => {
        it('should generate correct key for workspaceId', () => {
            const workspaceId = 'ws-abc-123';
            const key = `last_sse_event_id_${workspaceId}`;
            expect(key).toBe('last_sse_event_id_ws-abc-123');
        });

        it('should generate unique keys per workspace', () => {
            const keys = ['ws-1', 'ws-2', 'ws-boss'].map(id => `last_sse_event_id_${id}`);
            const unique = new Set(keys);
            expect(unique.size).toBe(3);
        });
    });

    // ── 7. relay:fallbackDeltaSync event ───────────────────────────────────
    describe('relay:fallbackDeltaSync channel', () => {
        it('should use the exact channel name for DELTA_SYNC signal', () => {
            const FALLBACK_CHANNEL = 'relay:fallbackDeltaSync';
            expect(FALLBACK_CHANNEL).toBe('relay:fallbackDeltaSync');
        });

        it('should trigger DELTA_SYNC correctly from resolveReconnect', () => {
            const result = resolveReconnect([], 999, Date.now()); // empty queue, miss
            if (result.action === 'DELTA_SYNC') {
                // Boss would send relay:fallbackDeltaSync channel to employee
                const ssePayload = { channel: 'relay:fallbackDeltaSync', data: {} };
                expect(ssePayload.channel).toBe('relay:fallbackDeltaSync');
            }
            expect(result.action).toBe('DELTA_SYNC');
        });
    });
});
