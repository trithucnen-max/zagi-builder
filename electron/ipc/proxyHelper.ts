import AppModeManager from '../../src/utils/AppModeManager';
import Logger from '../../src/utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Fire-and-forget proxy: send a DB/CRM mutation to the Boss when running in Employee mode.
 * The Boss executes the same IPC handler on its own DB, then relays the resulting
 * event back to all connected employees via SSE.
 *
 * In Boss / standalone mode this is a no-op.
 */
export function proxyToBoss(channel: string, params: any): void {
    try {
        if (AppModeManager.getInstance().getMode() !== 'employee') return;

        const HCM = require('../../src/services/http/HttpConnectionManager').default;
        const hcmInstance = HCM.getInstance();

        // Find any workspace that is actively connected to Boss
        let activeWsId: string | null = null;
        for (const [wsId, entry] of hcmInstance.clients.entries()) {
            if (entry.service.getStatus().connected) {
                activeWsId = wsId;
                break;
            }
        }

        // Fallback to active workspace if no client is marked connected yet
        if (!activeWsId) {
            const WsMgr = require('../../src/utils/WorkspaceManager').default;
            const activeWs = WsMgr.getInstance().getActiveWorkspace();
            if (activeWs) activeWsId = activeWs.id;
        }

        if (!activeWsId) {
            Logger.warn(`[proxyToBoss] Không tìm thấy Workspace nào hoạt động để gửi action: ${channel}`);
            return;
        }

        hcmInstance.proxyAction(activeWsId, channel, params).catch((err: any) => {
            Logger.warn(`[proxyToBoss] ${channel} failed for ws=${activeWsId}: ${err.message}`);
        });
    } catch (err: any) {
        Logger.error(`[proxyToBoss] Error: ${err.message}`);
    }
}

/**
 * Upload media files from Employee machine to Boss machine.
 * Used when Employee's local file path is not valid on Boss (cross-platform paths).
 * Each file is read on Employee, sent as base64 via HTTP, saved on Boss,
 * and the Boss-resolved absolute path is returned.
 *
 * @param filePaths  - Local file paths on Employee machine
 * @param zaloId     - Zalo account ID for organizing media storage on Boss
 * @returns Boss-resolved absolute file paths (preserves order)
 */
export async function uploadEmployeeMedia(filePaths: string[], zaloId?: string): Promise<string[]> {
    if (AppModeManager.getInstance().getMode() !== 'employee') return filePaths;

    const HCM = require('../../src/services/http/HttpConnectionManager').default;
    const hcmInstance = HCM.getInstance();

    // Find actively connected workspace
    let activeWsId: string | null = null;
    for (const [wsId, entry] of hcmInstance.clients.entries()) {
        if (entry.service.getStatus().connected) {
            activeWsId = wsId;
            break;
        }
    }

    if (!activeWsId) {
        const WsMgr = require('../../src/utils/WorkspaceManager').default;
        const activeWs = WsMgr.getInstance().getActiveWorkspace();
        if (activeWs) activeWsId = activeWs.id;
    }

    if (!activeWsId) throw new Error('Không tìm thấy kết nối Boss đang hoạt động');

    const client = hcmInstance.getServiceForWorkspace(activeWsId);
    if (!client) throw new Error('Không thể khởi tạo dịch vụ truyền dẫn với Boss');

    const bossPaths: string[] = new Array(filePaths.length);

    // Upload parallel all files để giảm thời gian chờ
    const uploadTasks = filePaths.map(async (fp, index) => {
        if (!fp) { bossPaths[index] = fp; return; }
        if (!fs.existsSync(fp)) {
            Logger.warn(`[uploadEmployeeMedia] File not found on Employee: ${fp}`);
            bossPaths[index] = fp;
            return;
        }
        const buffer = fs.readFileSync(fp);
        const base64 = buffer.toString('base64');
        const filename = path.basename(fp);
        try {
            const result = await client.uploadMedia(base64, filename, zaloId);
            if (result.success && result.bossPath) {
                bossPaths[index] = result.bossPath;
                Logger.log(`[uploadEmployeeMedia] ✅ ${fp} → ${result.bossPath}`);
            } else {
                throw new Error(result.error || 'Upload thất bại');
            }
        } catch (err: any) {
            throw new Error(`Không thể upload file ${fp}: ${err.message}`);
        }
    });

    await Promise.all(uploadTasks);
    return bossPaths;
}

