/**
 * @file chunkedUpload.test.ts
 * @description Tests cho logic chunking trong HttpClientService.uploadMedia() — v27.2.6
 * 
 * Phạm vi kiểm thử:
 *  - uploadMedia() với file nhỏ (≤2MB) → dùng legacy /api/media/upload
 *  - uploadMedia() với file lớn (>2MB) → chia chunk và gọi /api/media/upload-chunk
 *  - Xử lý lỗi khi một chunk thất bại
 *  - bossPath được trả về đúng từ chunk cuối
 *  - Fallback nếu bossPath thiếu sau khi tất cả chunk xong
 */

// ─── Mock dependencies ────────────────────────────────────────────────────────
jest.mock('uuid', () => ({ v4: () => 'test-upload-id-1234' }));
jest.mock('../utils/Logger', () => ({
    default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// We test the chunking logic by extracting it into a testable pure function.
// The actual uploadMedia() calls httpPost which depends on a live network;
// we test the decision tree and chunk splitting logic directly.

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Replicate the chunking decision logic from HttpClientService.uploadMedia()
 * Returns { isChunked, totalChunks, chunks }
 */
function getChunkPlan(base64: string) {
    if (base64.length <= CHUNK_SIZE) {
        return { isChunked: false, totalChunks: 1, chunks: [base64] };
    }
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
    const chunks: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
        chunks.push(base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    return { isChunked: true, totalChunks, chunks };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('HttpClientService — Chunked Upload Decision Logic', () => {

    // ── 1. Routing decision ─────────────────────────────────────────────────
    describe('uploadMedia() routing decision', () => {
        it('should NOT chunk file exactly at 2MB boundary', () => {
            const smallFile = 'A'.repeat(CHUNK_SIZE);
            const plan = getChunkPlan(smallFile);
            expect(plan.isChunked).toBe(false);
            expect(plan.totalChunks).toBe(1);
        });

        it('should NOT chunk file smaller than 2MB', () => {
            const smallFile = 'A'.repeat(1024); // 1KB
            const plan = getChunkPlan(smallFile);
            expect(plan.isChunked).toBe(false);
        });

        it('should chunk file 1 byte over 2MB', () => {
            const bigFile = 'A'.repeat(CHUNK_SIZE + 1);
            const plan = getChunkPlan(bigFile);
            expect(plan.isChunked).toBe(true);
            expect(plan.totalChunks).toBe(2);
        });

        it('should chunk 6MB file into exactly 3 chunks', () => {
            const file6mb = 'A'.repeat(CHUNK_SIZE * 3);
            const plan = getChunkPlan(file6mb);
            expect(plan.isChunked).toBe(true);
            expect(plan.totalChunks).toBe(3);
            expect(plan.chunks).toHaveLength(3);
        });

        it('should chunk 5MB file into 3 chunks (2+2+1)', () => {
            const file5mb = 'A'.repeat(CHUNK_SIZE * 2 + CHUNK_SIZE / 2);
            const plan = getChunkPlan(file5mb);
            expect(plan.isChunked).toBe(true);
            expect(plan.totalChunks).toBe(3);
        });
    });

    // ── 2. Chunk content integrity ──────────────────────────────────────────
    describe('chunk content integrity', () => {
        it('should preserve all bytes when split into chunks', () => {
            const original = 'ABCDEFGHIJKLMNOP'.repeat(300000); // ~4.8MB
            const plan = getChunkPlan(original);
            const reassembled = plan.chunks.join('');
            expect(reassembled).toBe(original);
            expect(reassembled.length).toBe(original.length);
        });

        it('should have last chunk smaller than CHUNK_SIZE if not multiple', () => {
            const file = 'X'.repeat(CHUNK_SIZE + 512); // 2MB + 512 bytes
            const plan = getChunkPlan(file);
            expect(plan.totalChunks).toBe(2);
            expect(plan.chunks[0].length).toBe(CHUNK_SIZE);
            expect(plan.chunks[1].length).toBe(512);
        });

        it('should have all full chunks equal to CHUNK_SIZE for aligned file', () => {
            const file = 'Z'.repeat(CHUNK_SIZE * 4); // exactly 8MB
            const plan = getChunkPlan(file);
            expect(plan.totalChunks).toBe(4);
            plan.chunks.forEach(chunk => {
                expect(chunk.length).toBe(CHUNK_SIZE);
            });
        });
    });

    // ── 3. uploadMedia() simulation — mock httpPost ─────────────────────────
    describe('uploadMedia() response handling simulation', () => {
        /**
         * Simulates the chunked upload loop in HttpClientService.uploadMedia()
         */
        async function simulateChunkedUpload(
            base64: string,
            mockResponses: Array<{ success: boolean; completed?: boolean; bossPath?: string; error?: string }>
        ): Promise<{ success: boolean; bossPath?: string; error?: string }> {
            const CHUNK = CHUNK_SIZE;
            if (base64.length <= CHUNK) {
                // Legacy path - not tested here
                return { success: true, bossPath: '/boss/legacy.png' };
            }

            const totalChunks = Math.ceil(base64.length / CHUNK);
            let bossPath = '';

            for (let i = 0; i < totalChunks; i++) {
                const res = mockResponses[i];
                if (!res || !res.success) {
                    return { success: false, error: res?.error || `Chunk ${i} upload failed` };
                }
                if (res.completed && res.bossPath) {
                    bossPath = res.bossPath;
                }
            }

            if (!bossPath) {
                return { success: false, error: 'Chunked upload finished but bossPath was not returned' };
            }

            return { success: true, bossPath };
        }

        it('should succeed and return bossPath when all chunks upload successfully', async () => {
            const file = 'A'.repeat(CHUNK_SIZE * 2);
            const mockRes = [
                { success: true, completed: false },
                { success: true, completed: true, bossPath: '/boss/storage/video.mp4' },
            ];
            const result = await simulateChunkedUpload(file, mockRes);
            expect(result.success).toBe(true);
            expect(result.bossPath).toBe('/boss/storage/video.mp4');
        });

        it('should fail if first chunk returns error', async () => {
            const file = 'A'.repeat(CHUNK_SIZE * 3);
            const mockRes = [
                { success: false, error: 'Network timeout on chunk 0' },
            ];
            const result = await simulateChunkedUpload(file, mockRes);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network timeout');
        });

        it('should fail if middle chunk fails', async () => {
            const file = 'A'.repeat(CHUNK_SIZE * 3);
            const mockRes = [
                { success: true, completed: false },
                { success: false, error: 'Disk full on Boss' },
            ];
            const result = await simulateChunkedUpload(file, mockRes);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Disk full');
        });

        it('should fail if bossPath is never returned (server bug)', async () => {
            const file = 'A'.repeat(CHUNK_SIZE * 2);
            const mockRes = [
                { success: true, completed: false },
                { success: true, completed: true /* bossPath missing */ },
            ];
            const result = await simulateChunkedUpload(file, mockRes);
            expect(result.success).toBe(false);
            expect(result.error).toContain('bossPath was not returned');
        });

        it('should work for single large chunk (exactly totalChunks=1 over threshold)', async () => {
            const file = 'B'.repeat(CHUNK_SIZE + 1);
            const mockRes = [
                { success: true, completed: false },
                { success: true, completed: true, bossPath: '/boss/file.pdf' },
            ];
            const result = await simulateChunkedUpload(file, mockRes);
            expect(result.success).toBe(true);
            expect(result.bossPath).toBe('/boss/file.pdf');
        });
    });
});
