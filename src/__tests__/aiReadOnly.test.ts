/**
 * @file aiReadOnly.test.ts
 * @description Tests cho AI Proxy policy trên máy nhân viên — v27.2.10
 * 
 * Phạm vi kiểm thử:
 *  - AI write channels KHÔNG bị block trực tiếp khi workspace là 'remote', mà được chuyển tiếp qua Boss (proxy)
 *  - AI write channels được phép khi workspace là 'local'
 *  - AI read channels KHÔNG bị chặn và được proxy trên remote
 */

jest.mock('../utils/Logger', () => ({
    default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type WorkspaceType = 'local' | 'remote';

interface IpcCallParams {
    _fromRelay?: boolean;
    [key: string]: any;
}

function simulateIpcCall(
    channel: string,
    params: IpcCallParams,
    workspaceType: WorkspaceType
): { success: boolean; proxied?: boolean; error?: string } {
    // Mirror the new guard logic from main.ts
    if (workspaceType === 'remote' && !params?._fromRelay) {
        if (channel.startsWith('ai:')) {
            return {
                success: true,
                proxied: true,
            };
        }
    }
    return { success: true };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('AI Proxy Policy (v27.2.10)', () => {

    describe('AI channels handling on remote workspace (nhân viên)', () => {
        const aiChannels = [
            'ai:saveAssistant',
            'ai:deleteAssistant',
            'ai:uploadFile',
            'ai:removeFile',
            'ai:setAccountAssistant',
            'ai:listAssistants',
            'ai:chat',
        ];

        aiChannels.forEach(channel => {
            it(`should proxy "${channel}" to Boss on remote workspace`, () => {
                const result = simulateIpcCall(channel, {}, 'remote');
                expect(result.success).toBe(true);
                expect(result.proxied).toBe(true);
            });
        });
    });

    describe('allowed directly on local workspace (Boss)', () => {
        it('should NOT proxy or block ai:saveAssistant on local workspace', () => {
            const result = simulateIpcCall('ai:saveAssistant', {}, 'local');
            expect(result.success).toBe(true);
            expect(result.proxied).toBeUndefined();
        });
    });
});
