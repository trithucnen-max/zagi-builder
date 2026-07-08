import * as fs from 'fs';
import * as path from 'path';
import Logger from '../../utils/Logger';
import FileStorageService from './FileStorageService';

export class UploadChunkService {
    private static instance: UploadChunkService;

    public static getInstance(): UploadChunkService {
        if (!UploadChunkService.instance) {
            UploadChunkService.instance = new UploadChunkService();
        }
        return UploadChunkService.instance;
    }

    private getTempDir(uploadId: string): string {
        const base = FileStorageService.getBaseDir();
        const tempDir = path.join(base, '_temp_uploads', uploadId);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        return tempDir;
    }

    public saveChunk(uploadId: string, chunkIndex: number, totalChunks: number, buffer: Buffer): void {
        const tempDir = this.getTempDir(uploadId);
        const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`);
        fs.writeFileSync(chunkPath, buffer);
        Logger.log(`[UploadChunkService] Saved chunk ${chunkIndex + 1}/${totalChunks} for uploadId=${uploadId}`);
    }

    public async mergeChunks(uploadId: string, totalChunks: number, filename: string, zaloId?: string): Promise<string> {
        const tempDir = this.getTempDir(uploadId);
        
        let targetPath: string;
        const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        
        if (zaloId) {
            const combinedBuffer = this.combineChunks(tempDir, totalChunks);
            targetPath = await FileStorageService.saveBuffer(zaloId, combinedBuffer, safeName);
        } else {
            const base = FileStorageService.getBaseDir();
            const dir = path.join(base, '_uploads');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            targetPath = path.join(dir, safeName);

            await new Promise<void>((resolve, reject) => {
                const writeStream = fs.createWriteStream(targetPath);
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `chunk_${i}`);
                    if (!fs.existsSync(chunkPath)) {
                        writeStream.destroy(new Error(`Missing chunk_${i} during merge`));
                        return;
                    }
                    writeStream.write(fs.readFileSync(chunkPath));
                }
                writeStream.end();
            });
        }

        // Cleanup temp files
        try {
            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(tempDir, `chunk_${i}`);
                if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
            }
            fs.rmdirSync(tempDir);
        } catch (err: any) {
            Logger.warn(`[UploadChunkService] Cleanup failed for uploadId=${uploadId}: ${err.message}`);
        }

        Logger.log(`[UploadChunkService] Successfully merged ${totalChunks} chunks into targetPath=${targetPath}`);
        return targetPath;
    }

    private combineChunks(tempDir: string, totalChunks: number): Buffer {
        const buffers: Buffer[] = [];
        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(tempDir, `chunk_${i}`);
            if (!fs.existsSync(chunkPath)) {
                throw new Error(`Missing chunk_${i} during merge`);
            }
            buffers.push(fs.readFileSync(chunkPath));
        }
        return Buffer.concat(buffers);
    }
}

export default UploadChunkService;
