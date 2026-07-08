/**
 * @file UploadChunkService.test.ts
 * @description Tests cho dịch vụ upload file phân đoạn (Chunked Upload) — v27.2.6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Mock Logger ──────────────────────────────────────────────────────────────
jest.mock('../utils/Logger', () => ({
    __esModule: true,
    default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Mock FileStorageService ──────────────────────────────────────────────────
let mockBaseDir: string;
jest.mock('../services/file/FileStorageService', () => ({
    __esModule: true,
    default: {
        getBaseDir: () => mockBaseDir,
        saveBuffer: jest.fn(async (zaloId: string, buf: Buffer, name: string) => {
            const dir = path.join(mockBaseDir, '_media', zaloId);
            fs.mkdirSync(dir, { recursive: true });
            const p = path.join(dir, name);
            fs.writeFileSync(p, buf);
            return p;
        }),
    },
}));

import { UploadChunkService } from '../services/file/UploadChunkService';

function freshInstance(): UploadChunkService {
    (UploadChunkService as any).instance = undefined;
    return UploadChunkService.getInstance();
}

function setupTmpDir(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zagi-chunk-test-'));
    mockBaseDir = tmpDir;
    return tmpDir;
}

function teardown(dir: string): void {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

describe('UploadChunkService', () => {
    let tmpDir: string;
    let svc: UploadChunkService;

    beforeEach(() => {
        tmpDir = setupTmpDir();
        svc = freshInstance();
    });

    afterEach(() => {
        teardown(tmpDir);
        jest.clearAllMocks();
    });

    // ── 1. Singleton ────────────────────────────────────────────────────────
    describe('getInstance()', () => {
        it('should return the same instance every time', () => {
            const a = UploadChunkService.getInstance();
            const b = UploadChunkService.getInstance();
            expect(a).toBe(b);
        });
    });

    // ── 2. saveChunk() ──────────────────────────────────────────────────────
    describe('saveChunk()', () => {
        it('should create temp directory and write chunk file', () => {
            const buf = Buffer.from('CHUNK_DATA_0');
            svc.saveChunk('upload-abc', 0, 3, buf);
            const chunkPath = path.join(tmpDir, '_temp_uploads', 'upload-abc', 'chunk_0');
            expect(fs.existsSync(chunkPath)).toBe(true);
            expect(fs.readFileSync(chunkPath).toString()).toBe('CHUNK_DATA_0');
        });

        it('should save multiple chunks independently', () => {
            svc.saveChunk('u1', 0, 2, Buffer.from('AAA'));
            svc.saveChunk('u1', 1, 2, Buffer.from('BBB'));
            const dir = path.join(tmpDir, '_temp_uploads', 'u1');
            expect(fs.readFileSync(path.join(dir, 'chunk_0')).toString()).toBe('AAA');
            expect(fs.readFileSync(path.join(dir, 'chunk_1')).toString()).toBe('BBB');
        });

        it('should overwrite existing chunk if re-sent (retry safe)', () => {
            svc.saveChunk('u2', 0, 1, Buffer.from('OLD'));
            svc.saveChunk('u2', 0, 1, Buffer.from('NEW'));
            const chunkPath = path.join(tmpDir, '_temp_uploads', 'u2', 'chunk_0');
            expect(fs.readFileSync(chunkPath).toString()).toBe('NEW');
        });

        it('should handle binary buffer data correctly', () => {
            const binaryBuf = Buffer.from([0x00, 0xFF, 0x1A, 0x2B, 0x3C]);
            svc.saveChunk('binary-test', 0, 1, binaryBuf);
            const chunkPath = path.join(tmpDir, '_temp_uploads', 'binary-test', 'chunk_0');
            expect(fs.readFileSync(chunkPath)).toEqual(binaryBuf);
        });
    });

    // ── 3. mergeChunks() — không có zaloId ─────────────────────────────────
    describe('mergeChunks() without zaloId', () => {
        it('should merge 2 chunks into a single file with correct content', async () => {
            svc.saveChunk('m1', 0, 2, Buffer.from('HELLO_'));
            svc.saveChunk('m1', 1, 2, Buffer.from('WORLD'));
            const bossPath = await svc.mergeChunks('m1', 2, 'merged.txt');
            expect(fs.existsSync(bossPath)).toBe(true);
            expect(fs.readFileSync(bossPath).toString()).toBe('HELLO_WORLD');
        });

        it('should merge 5 chunks in correct sequential order', async () => {
            const parts = ['AA', 'BB', 'CC', 'DD', 'EE'];
            parts.forEach((p, i) => svc.saveChunk('m5', i, 5, Buffer.from(p)));
            const bossPath = await svc.mergeChunks('m5', 5, 'five.txt');
            expect(fs.readFileSync(bossPath).toString()).toBe('AABBCCDDEE');
        });

        it('should return bossPath inside _uploads directory', async () => {
            svc.saveChunk('path-test', 0, 1, Buffer.from('X'));
            const bossPath = await svc.mergeChunks('path-test', 1, 'file.txt');
            expect(bossPath).toContain('_uploads');
            expect(bossPath.endsWith('file.txt')).toBe(true);
        });

        it('should sanitize filename (remove spaces and special characters)', async () => {
            svc.saveChunk('san1', 0, 1, Buffer.from('data'));
            const bossPath = await svc.mergeChunks('san1', 1, 'my file (v2).txt');
            const basename = path.basename(bossPath);
            expect(basename).not.toContain(' ');
            expect(basename).not.toContain('(');
            expect(basename).not.toContain(')');
        });

        it('should clean up temp directory after successful merge', async () => {
            svc.saveChunk('cleanup-test', 0, 2, Buffer.from('X'));
            svc.saveChunk('cleanup-test', 1, 2, Buffer.from('Y'));
            await svc.mergeChunks('cleanup-test', 2, 'clean.txt');
            const tempDir = path.join(tmpDir, '_temp_uploads', 'cleanup-test');
            expect(fs.existsSync(tempDir)).toBe(false);
        });

        it('should reject with error if a chunk is missing during merge', async () => {
            svc.saveChunk('missing', 0, 3, Buffer.from('A'));
            // chunk_1 intentionally missing
            svc.saveChunk('missing', 2, 3, Buffer.from('C'));
            await expect(svc.mergeChunks('missing', 3, 'bad.txt')).rejects.toThrow(/Missing chunk_1/);
        });
    });

    // ── 4. mergeChunks() — với zaloId ──────────────────────────────────────
    describe('mergeChunks() with zaloId', () => {
        it('should call FileStorageService.saveBuffer with combined buffer', async () => {
            const FileStorageService = require('../services/file/FileStorageService').default;
            svc.saveChunk('zalo-up', 0, 2, Buffer.from('PART1_'));
            svc.saveChunk('zalo-up', 1, 2, Buffer.from('PART2'));
            await svc.mergeChunks('zalo-up', 2, 'img.png', 'zalo123');
            expect(FileStorageService.saveBuffer).toHaveBeenCalledWith(
                'zalo123',
                Buffer.from('PART1_PART2'),
                'img.png'
            );
        });

        it('should clean up temp after zaloId merge', async () => {
            svc.saveChunk('zalo-cleanup', 0, 1, Buffer.from('DATA'));
            await svc.mergeChunks('zalo-cleanup', 1, 'photo.jpg', 'z456');
            const tempDir = path.join(tmpDir, '_temp_uploads', 'zalo-cleanup');
            expect(fs.existsSync(tempDir)).toBe(false);
        });
    });

    // ── 5. Edge Cases ───────────────────────────────────────────────────────
    describe('Edge cases', () => {
        it('should handle single chunk (totalChunks=1)', async () => {
            svc.saveChunk('single', 0, 1, Buffer.from('ONLY_CHUNK'));
            const bossPath = await svc.mergeChunks('single', 1, 'single.txt');
            expect(fs.readFileSync(bossPath).toString()).toBe('ONLY_CHUNK');
        });

        it('should handle empty buffer chunk without crashing', async () => {
            svc.saveChunk('empty-chunk', 0, 2, Buffer.alloc(0));
            svc.saveChunk('empty-chunk', 1, 2, Buffer.from('DATA'));
            const bossPath = await svc.mergeChunks('empty-chunk', 2, 'empty.txt');
            expect(fs.readFileSync(bossPath).toString()).toBe('DATA');
        });

        it('should correctly handle large 10-chunk merge', async () => {
            const expected = Array.from({ length: 10 }, (_, i) => `CHUNK${i}`).join('');
            for (let i = 0; i < 10; i++) {
                svc.saveChunk('large-test', i, 10, Buffer.from(`CHUNK${i}`));
            }
            const bossPath = await svc.mergeChunks('large-test', 10, 'large.txt');
            expect(fs.readFileSync(bossPath).toString()).toBe(expected);
        });
    });
});
