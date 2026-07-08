/**
 * @file aiReadOnly.test.ts
 * @description Tests cho AI Read-Only policy trên máy nhân viên — v27.2.6
 * 
 * Phạm vi kiểm thử:
 *  - AI write channels bị chặn khi workspace là 'remote'
 *  - AI write channels được phép khi workspace là 'local'
 *  - _fromRelay bypass hoạt động đúng (Boss gọi thay mặt employee)
 *  - AI read channels KHÔNG bị chặn trên remote
 *  - Danh sách AI_WRITE_CHANNELS đủ 5 channels
 */

jest.mock('../utils/Logger', () => ({
    default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Replicate the AI Read-Only guard from main.ts ────────────────────────────
const AI_WRITE_CHANNELS = new Set([
    'ai:saveAssistant',
    'ai:deleteAssistant',
    'ai:uploadFile',
    'ai:removeFile',
    'ai:setAccountAssistant',
]);

type WorkspaceType = 'local' | 'remote';

interface IpcCallParams {
    _fromRelay?: boolean;
    [key: string]: any;
}

function simulateIpcCall(
    channel: string,
    params: IpcCallParams,
    workspaceType: WorkspaceType
): { success: boolean; blocked?: boolean; error?: string } {
    // Mirror the guard logic from main.ts
    if (workspaceType === 'remote' && !params?._fromRelay) {
        if (AI_WRITE_CHANNELS.has(channel)) {
            return {
                success: false,
                blocked: true,
                error: `Chế độ nhân viên (Remote): Cấu hình Trợ lý AI chỉ được thực hiện trên máy Boss. Vui lòng liên hệ quản lý.`,
            };
        }
    }
    // Not blocked — execute normally
    return { success: true };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('AI Read-Only Policy (v27.2.6)', () => {

    // ── 1. AI_WRITE_CHANNELS completeness ──────────────────────────────────
    describe('AI_WRITE_CHANNELS definition', () => {
        it('should contain exactly 5 write channels', () => {
            expect(AI_WRITE_CHANNELS.size).toBe(5);
        });

        it('should contain all required write channels', () => {
            expect(AI_WRITE_CHANNELS.has('ai:saveAssistant')).toBe(true);
            expect(AI_WRITE_CHANNELS.has('ai:deleteAssistant')).toBe(true);
            expect(AI_WRITE_CHANNELS.has('ai:uploadFile')).toBe(true);
            expect(AI_WRITE_CHANNELS.has('ai:removeFile')).toBe(true);
            expect(AI_WRITE_CHANNELS.has('ai:setAccountAssistant')).toBe(true);
        });

        it('should NOT block ai:chat or ai:getAssistants (read operations)', () => {
            expect(AI_WRITE_CHANNELS.has('ai:chat')).toBe(false);
            expect(AI_WRITE_CHANNELS.has('ai:getAssistants')).toBe(false);
            expect(AI_WRITE_CHANNELS.has('ai:getMessages')).toBe(false);
        });
    });

    // ── 2. Blocking on remote workspace ────────────────────────────────────
    describe('blocking on remote workspace (nhân viên)', () => {
        const writeChannels = [
            'ai:saveAssistant',
            'ai:deleteAssistant',
            'ai:uploadFile',
            'ai:removeFile',
            'ai:setAccountAssistant',
        ];

        writeChannels.forEach(channel => {
            it(`should block "${channel}" on remote workspace`, () => {
                const result = simulateIpcCall(channel, {}, 'remote');
                expect(result.success).toBe(false);
                expect(result.blocked).toBe(true);
                expect(result.error).toContain('Chế độ nhân viên');
            });
        });

        it('should return meaningful Vietnamese error message', () => {
            const result = simulateIpcCall('ai:saveAssistant', {}, 'remote');
            expect(result.error).toContain('Boss');
            expect(result.error).toContain('Remote');
        });
    });

    // ── 3. Allowed on local workspace (Boss) ────────────────────────────────
    describe('allowed on local workspace (Boss)', () => {
        it('should NOT block ai:saveAssistant on local workspace', () => {
            const result = simulateIpcCall('ai:saveAssistant', {}, 'local');
            expect(result.success).toBe(true);
            expect(result.blocked).toBeUndefined();
        });

        it('should NOT block ai:uploadFile on local workspace', () => {
            const result = simulateIpcCall('ai:uploadFile', { file: 'doc.pdf' }, 'local');
            expect(result.success).toBe(true);
        });

        it('should NOT block ai:deleteAssistant on local workspace', () => {
            const result = simulateIpcCall('ai:deleteAssistant', { id: '123' }, 'local');
            expect(result.success).toBe(true);
        });
    });

    // ── 4. _fromRelay bypass ────────────────────────────────────────────────
    describe('_fromRelay bypass (Boss acting on behalf of employee)', () => {
        it('should allow ai:saveAssistant with _fromRelay=true even on remote', () => {
            const result = simulateIpcCall('ai:saveAssistant', { _fromRelay: true }, 'remote');
            expect(result.success).toBe(true);
            expect(result.blocked).toBeUndefined();
        });

        it('should allow ai:uploadFile with _fromRelay=true on remote', () => {
            const result = simulateIpcCall('ai:uploadFile', { _fromRelay: true, file: 'doc.pdf' }, 'remote');
            expect(result.success).toBe(true);
        });

        it('should still block if _fromRelay is false on remote', () => {
            const result = simulateIpcCall('ai:saveAssistant', { _fromRelay: false }, 'remote');
            expect(result.success).toBe(false);
            expect(result.blocked).toBe(true);
        });

        it('should still block if _fromRelay is undefined on remote', () => {
            const result = simulateIpcCall('ai:deleteAssistant', {}, 'remote');
            expect(result.success).toBe(false);
        });
    });

    // ── 5. Read operations NOT blocked on remote ────────────────────────────
    describe('AI read operations are allowed on remote', () => {
        const readChannels = ['ai:chat', 'ai:getAssistants', 'ai:getMessages', 'ai:listProviders'];

        readChannels.forEach(channel => {
            it(`should allow read channel "${channel}" on remote workspace`, () => {
                const result = simulateIpcCall(channel, {}, 'remote');
                expect(result.success).toBe(true);
                expect(result.blocked).toBeUndefined();
            });
        });
    });

    // ── 6. Non-AI channels not affected ────────────────────────────────────
    describe('non-AI channels are unaffected', () => {
        it('should not block zalo:sendMessage on remote (handled by proxy, not block)', () => {
            const result = simulateIpcCall('zalo:sendMessage', {}, 'remote');
            expect(result.success).toBe(true); // AI guard doesn't affect zalo channels
        });

        it('should not block erp:task:create on remote (handled by ERP proxy separately)', () => {
            const result = simulateIpcCall('erp:task:create', {}, 'remote');
            expect(result.success).toBe(true);
        });
    });
});
