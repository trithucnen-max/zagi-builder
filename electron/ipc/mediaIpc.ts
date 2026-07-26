import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import AppModeManager from '../../src/utils/AppModeManager';
import FileStorageService from '../../src/services/file/FileStorageService';
import LibraryService from '../../src/services/library/LibraryService';
import Logger from '../../src/utils/Logger';
import { uploadEmployeeMedia } from './proxyHelper';
import { ipcHandlerRegistry } from './ipcRegistry';

export interface AcquireTokenParams {
    filePath?: string;
    dataUrl?: string;
    ext?: string;
    cdnUrl?: string;
    libraryUuid?: string;
    zaloId?: string;
}

export function registerMediaIpc() {
    const acquireTokenHandler = async (_event: any, params: AcquireTokenParams) => {
        try {
            const { filePath, dataUrl, ext, cdnUrl, libraryUuid, zaloId } = params || {};

            // 1. Library UUID
            if (libraryUuid) {
                const item = LibraryService.getInstance().getItem(libraryUuid);
                if (item) {
                    return { success: true, token: libraryUuid };
                }
                // Fallback: return libraryUuid anyway in case DB is on Boss
                return { success: true, token: libraryUuid };
            }

            // 2. Direct Local File Path
            if (filePath) {
                const mode = AppModeManager.getInstance().getMode();
                if (mode === 'employee') {
                    const absPath = FileStorageService.resolveAbsolutePath(filePath);
                    if (absPath && fs.existsSync(absPath)) {
                        const bossPaths = await uploadEmployeeMedia([absPath], zaloId);
                        if (bossPaths && bossPaths[0]) {
                            return { success: true, token: bossPaths[0] };
                        }
                    } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                        return { success: true, token: filePath };
                    }
                    return { success: true, token: filePath };
                } else {
                    const absPath = FileStorageService.resolveAbsolutePath(filePath);
                    return { success: true, token: absPath || filePath };
                }
            }

            // 3. Data URL (Base64 from clipboard/canvas)
            if (dataUrl) {
                const parts = dataUrl.split(',');
                const base64Data = parts.length > 1 ? parts[1] : parts[0];
                const buffer = Buffer.from(base64Data, 'base64');
                const fileExt = ext || 'png';
                const filename = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
                
                const mode = AppModeManager.getInstance().getMode();
                if (mode === 'employee') {
                    // Employee: save temp locally then upload to Boss
                    const dir = path.join(FileStorageService.getBaseDir(), '_temp');
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    const tempPath = path.join(dir, filename);
                    fs.writeFileSync(tempPath, buffer);

                    const bossPaths = await uploadEmployeeMedia([tempPath], zaloId);
                    try { fs.unlinkSync(tempPath); } catch {}

                    if (bossPaths && bossPaths[0]) {
                        return { success: true, token: bossPaths[0] };
                    }
                    return { success: false, error: 'Không thể upload ảnh dán lên Boss' };
                } else {
                    // Boss mode: Save directly to media dir
                    const targetZaloId = zaloId || 'default';
                    const savedPath = await FileStorageService.saveBuffer(targetZaloId, buffer, filename);
                    return { success: true, token: savedPath };
                }
            }

            // 4. CDN URL (Forwarding media)
            if (cdnUrl) {
                return { success: true, token: cdnUrl };
            }

            return { success: false, error: 'Không có thông tin nguồn media hợp lệ' };
        } catch (err: any) {
            Logger.error(`[mediaIpc] acquireToken error: ${err.message}`);
            return { success: false, error: err.message };
        }
    };

    ipcMain.handle('media:acquireToken', acquireTokenHandler);
    ipcHandlerRegistry.set('media:acquireToken', acquireTokenHandler);
}
