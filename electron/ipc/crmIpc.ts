import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';
import CRMQueueService from '../../src/services/crm/CRMQueueService';
import EventBroadcaster from '../../src/services/event/EventBroadcaster';
import AppModeManager from '../../src/utils/AppModeManager';
import Logger from '../../src/utils/Logger';
import { proxyToBoss, uploadEmployeeMedia, proxyToBossAsync } from './proxyHelper';
import WorkspaceManager from '../../src/utils/WorkspaceManager';
import { ipcHandlerRegistry } from './ipcRegistry';

function isEmployeeMode(): boolean {
    try {
        const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
        if (activeWs?.type === 'remote') return true;
    } catch {}
    return false;
}

const CUSTOM_EMPLOYEE_CHANNELS = new Set(['crm:saveNote', 'crm:saveCampaign', 'crm:cloneCampaign']);

function ipcHandle(channel: string, handler: any) {
    ipcMain.handle(channel, async (event: any, ...args: any[]) => {
        if (isEmployeeMode() && !CUSTOM_EMPLOYEE_CHANNELS.has(channel)) {
            return await proxyToBossAsync(channel, args[0]);
        }
        return handler(event, ...args);
    });
    ipcHandlerRegistry.set(channel, handler);
}

export function registerCRMIpc(): void {


    // ─── Notes ─────────────────────────────────────────────────────────────
    ipcHandle('crm:getNotes', async (_e, { zaloId, contactId }: { zaloId: string; contactId: string }) => {
        try { return { success: true, notes: DatabaseService.getInstance().getCRMNotes(zaloId, contactId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:saveNote', async (_e, { zaloId, note }: { zaloId: string; note: any }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                const res = await proxyToBossAsync('crm:saveNote', { zaloId, note });
                if (res?.success && res.id) {
                    DatabaseService.getInstance().saveCRMNote({ ...note, id: res.id, owner_zalo_id: zaloId });
                    DatabaseService.getInstance().save();
                    EventBroadcaster.emit('crm:noteChanged', { action: 'save', ownerZaloId: zaloId, id: res.id, note: { ...note, id: res.id } });
                    return res;
                } else {
                    return res || { success: false, error: 'Không thể lưu ghi chú trên máy chủ BOSS' };
                }
            }

            const id = DatabaseService.getInstance().saveCRMNote({ ...note, owner_zalo_id: zaloId });
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:noteChanged', { action: 'save', ownerZaloId: zaloId, id, note: { ...note, id } });
            return { success: true, id };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:deleteNote', async (_e, { zaloId, noteId }: { zaloId: string; noteId: number }) => {
        try {
            DatabaseService.getInstance().deleteCRMNote(noteId, zaloId);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:noteChanged', { action: 'delete', ownerZaloId: zaloId, noteId });
            proxyToBoss('crm:deleteNote', { zaloId, noteId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    function sanitizeCRMContactsOpts(rawOpts: any): any {
        if (!rawOpts || typeof rawOpts !== 'object') return {};
        const sanitized = { ...rawOpts };

        // 1. Sanitize tagIds (Local labels) - ensure valid number array
        if (sanitized.tagIds && Array.isArray(sanitized.tagIds)) {
            sanitized.tagIds = sanitized.tagIds
                .map((id: any) => {
                    const s = String(id).trim();
                    if (s.startsWith('local:')) return Number(s.split(':')[1]);
                    return Number(s);
                })
                .filter((id: number) => !isNaN(id));
        }

        // 2. Sanitize gender (handle both English and Vietnamese inputs)
        if (sanitized.gender) {
            const g = String(sanitized.gender).trim().toLowerCase();
            if (g === 'male' || g === 'nam' || g === '0') sanitized.gender = 'male';
            else if (g === 'female' || g === 'nữ' || g === 'nu' || g === '1') sanitized.gender = 'female';
            else if (g === 'unknown' || g === 'không xác định' || g === 'khong xac dinh') sanitized.gender = 'unknown';
            else if (g === 'all' || g === 'tất cả') sanitized.gender = 'all';
        }

        // 3. Sanitize birthdayFilter
        if (sanitized.birthdayFilter) {
            const b = String(sanitized.birthdayFilter).trim().toLowerCase();
            if (b === 'today' || b === 'hôm nay') sanitized.birthdayFilter = 'today';
            else if (b === 'this_week' || b === 'tuần này') sanitized.birthdayFilter = 'this_week';
            else if (b === 'this_month' || b === 'tháng này') sanitized.birthdayFilter = 'this_month';
            else if (b === 'has_birthday' || b === 'có sinh nhật') sanitized.birthdayFilter = 'has_birthday';
            else if (b === 'no_birthday' || b === 'chưa có sinh nhật') sanitized.birthdayFilter = 'no_birthday';
            else if (b === 'all' || b === 'tất cả') sanitized.birthdayFilter = 'all';
        }

        // 4. Sanitize salutation
        if (sanitized.salutation) {
            const s = String(sanitized.salutation).trim();
            if (s.toLowerCase() === 'all' || s === 'Tất cả') sanitized.salutation = undefined;
        }

        // 5. Sanitize boolean flags
        if (sanitized.hasPhone !== undefined) sanitized.hasPhone = Boolean(sanitized.hasPhone);
        if (sanitized.hasNotes !== undefined) sanitized.hasNotes = Boolean(sanitized.hasNotes);

        return sanitized;
    }

    // ─── Contacts ──────────────────────────────────────────────────────────
    ipcHandle('crm:getContacts', async (_e, { zaloId, opts }: { zaloId: string; opts?: any }) => {
        try {
            const cleanOpts = sanitizeCRMContactsOpts(opts || {});
            return { success: true, ...DatabaseService.getInstance().getCRMContacts(zaloId, cleanOpts) };
        }
        catch (e: any) { return { success: false, error: e.message, contacts: [], total: 0 }; }
    });

    async function resolveDbLabelIds(zaloId: string, localLabelIds?: string[], zaloLabelIds?: string[]): Promise<number[]> {
        const resolvedIds: number[] = [];

        if (localLabelIds && Array.isArray(localLabelIds)) {
            for (const val of localLabelIds) {
                const s = String(val).trim();
                if (!s) continue;
                if (s.startsWith('local:')) {
                    const id = Number(s.split(':')[1]);
                    if (!isNaN(id)) resolvedIds.push(id);
                } else {
                    const id = Number(s);
                    if (!isNaN(id)) resolvedIds.push(id);
                }
            }
        }

        if (zaloLabelIds && Array.isArray(zaloLabelIds)) {
            for (const val of zaloLabelIds) {
                const s = String(val).trim();
                if (!s) continue;
                if (s.startsWith('zalo:')) {
                    const parts = s.split(':');
                    if (parts.length >= 3) {
                        const id = Number(parts[2]);
                        if (!isNaN(id)) resolvedIds.push(id);
                    }
                } else {
                    const id = Number(s);
                    if (!isNaN(id)) resolvedIds.push(id);
                }
            }
        }

        return resolvedIds;
    }

    function getVietnamTime(): Date {
        const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: 'numeric', day: 'numeric' } as const;
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(new Date());
        const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
        const y = parseInt(partMap.year, 10);
        const m = parseInt(partMap.month, 10);
        const d = parseInt(partMap.day, 10);
        return new Date(y, m - 1, d, 12, 0, 0);
    }

    ipcHandle('crm:previewWorkflowContacts', async (_e, { zaloId, cfg }: { zaloId: string; cfg: any }) => {
        try {
            // Extract local and Zalo labels from unified labelIds or legacy fields
            const unifiedLocalIds = [
              ...(cfg.localLabelIds || []),
              ...(cfg.labelIds || []).filter((id: string) => String(id).startsWith('local:'))
            ];
            const unifiedZaloIds = [
              ...(cfg.zaloLabelIds || []),
              ...(cfg.labelIds || []).filter((id: string) => String(id).startsWith('zalo:'))
            ];

            const resolvedLocalLabelIds = await resolveDbLabelIds(zaloId, unifiedLocalIds, []);
            const resolvedZaloLabelIds = await resolveDbLabelIds(zaloId, [], unifiedZaloIds);

            // Fetch Zalo label contact IDs if any
            let selectedZaloLabelContactIds: string[] | undefined = undefined;
            if (resolvedZaloLabelIds.length > 0) {
              const placeholders = resolvedZaloLabelIds.map(() => '?').join(',');
              const threadIdsRows = DatabaseService.getInstance().query<any>(
                `SELECT thread_id FROM local_label_threads WHERE owner_zalo_id = ? AND label_id IN (${placeholders})`,
                [zaloId, ...resolvedZaloLabelIds]
              ) || [];
              selectedZaloLabelContactIds = threadIdsRows.map(r => String(r.thread_id).startsWith('g') ? String(r.thread_id).slice(1) : String(r.thread_id));
            }

            let birthdayFilter = cfg.birthdayFilter || '';
            if (cfg.birthdayToday === true && !birthdayFilter) {
              birthdayFilter = 'today';
            }

            const ctype = cfg.isFriend === 'friend' ? 'friend' : cfg.isFriend === 'non_friend' ? 'non_friend' : 'all';

            const opts = {
              search: cfg.searchQuery || undefined,
              tagIds: resolvedLocalLabelIds.length > 0 ? resolvedLocalLabelIds : undefined,
              contactIds: selectedZaloLabelContactIds,
              contactType: ctype as any,
              pipelineStageId: cfg.pipelineStageId || undefined,
              gender: cfg.gender || undefined,
              birthdayFilter: birthdayFilter || undefined,
              salutation: cfg.salutation || undefined,
              limit: 500, // Safe default preview limit
              offset: 0
            };

            const result = DatabaseService.getInstance().getCRMContacts(zaloId, opts);
            let rows = result.contacts || [];

            // Add labels to response
            if (rows.length > 0) {
              const labelRows = DatabaseService.getInstance().query<any>(
                `SELECT llt.thread_id as contact_id, ll.id, ll.name, ll.color, ll.text_color as textColor, ll.shortcut
                 FROM local_label_threads llt
                 JOIN local_labels ll ON llt.label_id = ll.id
                 WHERE llt.owner_zalo_id = ?`,
                [zaloId]
              ) || [];

              const labelMap: Record<string, any[]> = {};
              for (const lr of labelRows) {
                if (!labelMap[lr.contact_id]) labelMap[lr.contact_id] = [];
                labelMap[lr.contact_id].push({
                  id: lr.id,
                  name: lr.name,
                  color: lr.color,
                  textColor: lr.textColor,
                  shortcut: lr.shortcut
                });
              }

              for (const r of rows) {
                r.labels = labelMap[r.contact_id] || [];
              }
            }

            return { success: true, contacts: rows };
        } catch (e: any) {
            return { success: false, error: e.message, contacts: [] };
        }
    });

    ipcHandle('crm:getContactStats', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, ...DatabaseService.getInstance().getContactStats(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message, total: 0, friendCount: 0, noteCount: 0 }; }
    });

    // ─── Campaigns ─────────────────────────────────────────────────────────
    ipcHandle('crm:getCampaigns', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, campaigns: DatabaseService.getInstance().getCRMCampaigns(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:saveCampaign', async (_e, { zaloId, campaign }: { zaloId: string; campaign: any }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                // Upload embedded campaign images to Boss first so they exist on Boss filesystem and rewrite local paths
                if (campaign?.template_message) {
                    try {
                        const parsed = typeof campaign.template_message === 'string'
                            ? JSON.parse(campaign.template_message)
                            : campaign.template_message;
                        if (parsed?.blocks && Array.isArray(parsed.blocks)) {
                            let hasChanges = false;
                            for (const block of parsed.blocks) {
                                if (block.images && block.images.length > 0) {
                                    const bossPaths = await uploadEmployeeMedia(block.images, zaloId);
                                    block.images = bossPaths;
                                    hasChanges = true;
                                }
                            }
                            if (hasChanges) {
                                campaign.template_message = typeof campaign.template_message === 'string'
                                    ? JSON.stringify(parsed)
                                    : parsed;
                            }
                        }
                    } catch (uploadErr: any) {
                        Logger.warn(`[crmIpc] Upload campaign images failed: ${uploadErr.message}`);
                    }
                }

                // In Employee mode, proxy directly to Boss first to get the authoritative ID
                const res = await proxyToBossAsync('crm:saveCampaign', { zaloId, campaign });
                if (res?.success && res.id) {
                    // Save locally with the Boss's ID
                    DatabaseService.getInstance().saveCRMCampaign({ ...campaign, id: res.id, owner_zalo_id: zaloId });
                    DatabaseService.getInstance().save();
                    // Emit event locally with the Boss's ID
                    EventBroadcaster.emit('crm:campaignChanged', { action: 'save', ownerZaloId: zaloId, id: res.id, campaign: { ...campaign, id: res.id } });
                    return res;
                } else {
                    return res || { success: false, error: 'Không thể lưu chiến dịch trên máy chủ BOSS' };
                }
            }

            const id = DatabaseService.getInstance().saveCRMCampaign({ ...campaign, owner_zalo_id: zaloId });
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:campaignChanged', { action: 'save', ownerZaloId: zaloId, id, campaign: { ...campaign, id } });
            return { success: true, id };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:deleteCampaign', async (_e, { zaloId, campaignId }: { zaloId: string; campaignId: number }) => {
        try {
            DatabaseService.getInstance().deleteCRMCampaign(campaignId, zaloId);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:campaignChanged', { action: 'delete', ownerZaloId: zaloId, campaignId });
            proxyToBoss('crm:deleteCampaign', { zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:cloneCampaign', async (_e, { zaloId, campaignId, includeContacts, newName }: { zaloId: string; campaignId: number; includeContacts: boolean; newName?: string }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                const res = await proxyToBossAsync('crm:cloneCampaign', { zaloId, campaignId, includeContacts, newName });
                if (res?.success && res.id) {
                    const db = DatabaseService.getInstance();
                    db.cloneCRMCampaign(campaignId, zaloId, includeContacts, newName, res.id);
                    db.save();
                    EventBroadcaster.emit('crm:campaignChanged', { action: 'clone', ownerZaloId: zaloId, campaignId: res.id });
                    return res;
                } else {
                    return res || { success: false, error: 'Không thể nhân bản chiến dịch trên máy chủ BOSS' };
                }
            }

            const db = DatabaseService.getInstance();
            const newId = db.cloneCRMCampaign(campaignId, zaloId, includeContacts, newName);
            if (!newId) return { success: false, error: 'Không thể nhân bản chiến dịch' };
            db.save();
            EventBroadcaster.emit('crm:campaignChanged', { action: 'clone', ownerZaloId: zaloId, campaignId: newId });
            return { success: true, id: newId };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:restartCampaign', async (_e, { zaloId, campaignId }: { zaloId: string; campaignId: number }) => {
        try {
            const db = DatabaseService.getInstance();
            db.restartCRMCampaign(campaignId);
            CRMQueueService.getInstance().startForAccount(zaloId);
            EventBroadcaster.emit('crm:campaignChanged', { action: 'status', ownerZaloId: zaloId, campaignId, status: 'active' });
            proxyToBoss('crm:restartCampaign', { zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:retryFailedContacts', async (_e, { zaloId, campaignId }: { zaloId: string; campaignId: number }) => {
        try {
            const db = DatabaseService.getInstance();
            db.retryFailedCampaignContacts(campaignId);
            CRMQueueService.getInstance().startForAccount(zaloId);
            EventBroadcaster.emit('crm:campaignChanged', { action: 'status', ownerZaloId: zaloId, campaignId, status: 'active' });
            proxyToBoss('crm:retryFailedContacts', { zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:updateCampaignStatus', async (_e, { campaignId, status }: { campaignId: number; status: string }) => {
        try {
            const db = DatabaseService.getInstance();
            db.updateCRMCampaignStatus(campaignId, status as any);
            db.save();
            // Start/stop queue
            const campaign = db.getCRMCampaign(campaignId);
            if (campaign) {
                if (status === 'active') CRMQueueService.getInstance().startForAccount(campaign.owner_zalo_id);
                else if (status === 'paused' || status === 'done') CRMQueueService.getInstance().checkAndStopIfIdle(campaign.owner_zalo_id);
                EventBroadcaster.emit('crm:campaignChanged', { action: 'status', ownerZaloId: campaign.owner_zalo_id, campaignId, status });
                proxyToBoss('crm:updateCampaignStatus', { campaignId, status });
            }
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:addCampaignContacts', async (_e, { zaloId, campaignId, contacts }: { zaloId: string; campaignId: number; contacts: any[] }) => {
        try {
            const res = DatabaseService.getInstance().addCampaignContacts(campaignId, zaloId, contacts);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:campaignChanged', { action: 'contactsAdded', ownerZaloId: zaloId, campaignId });

            // Dùng proxyToBossAsync để phát hiện lỗi mạng LAN — root cause lỗi CRM trên máy nhân viên
            let bossSync = true;
            try {
                await proxyToBossAsync('crm:addCampaignContacts', { zaloId, campaignId, contacts });
            } catch (proxyErr: any) {
                bossSync = false;
                Logger.warn(`[CRM] addCampaignContacts: Boss sync failed — ${proxyErr.message}`);
            }

            return { success: true, ...res, bossSync };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:removeCampaignContacts', async (_e, { zaloId, campaignId, contactIds }: { zaloId: string; campaignId: number; contactIds: string[] }) => {
        try {
            DatabaseService.getInstance().removeCampaignContacts(campaignId, contactIds);
            EventBroadcaster.emit('crm:campaignChanged', { action: 'contactsRemoved', ownerZaloId: zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:getCampaignContacts', async (_e, { campaignId }: { campaignId: number }) => {
        try { return { success: true, contacts: DatabaseService.getInstance().getCampaignContacts(campaignId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Send Log ──────────────────────────────────────────────────────────
    ipcHandle('crm:getSendLog', async (_e, { zaloId, opts }: { zaloId: string; opts?: any }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:getSendLog', { zaloId, opts });
            }
            return { success: true, logs: DatabaseService.getInstance().getSendLog(zaloId, opts || {}) };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:clearSendLog', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:clearSendLog', { zaloId });
            }
            DatabaseService.getInstance().clearSendLog(zaloId);
            return { success: true };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:cleanupSendLog', async (_e, { zaloId, days }: { zaloId: string; days: number }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:cleanupSendLog', { zaloId, days });
            }
            DatabaseService.getInstance().cleanupSendLogOlderThan(zaloId, days);
            return { success: true };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:getSendLogCleanupSettings', async (_e, { zaloId }: { zaloId: string }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:getSendLogCleanupSettings', { zaloId });
            }
            const db = DatabaseService.getInstance();
            const days = db.getSetting(`crm_send_log_cleanup_days_${zaloId}`);
            return { success: true, days: days ? parseInt(days, 10) : 0 };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:setSendLogCleanupSettings', async (_e, { zaloId, days }: { zaloId: string; days: number }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:setSendLogCleanupSettings', { zaloId, days });
            }
            const db = DatabaseService.getInstance();
            db.setSetting(`crm_send_log_cleanup_days_${zaloId}`, String(days));
            if (days > 0) {
                db.cleanupSendLogOlderThan(zaloId, days);
            }
            return { success: true };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:getCampaignStats', async (_e, { zaloId, limit }: { zaloId: string; limit?: number }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:getCampaignStats', { zaloId, limit });
            }
            return { success: true, stats: DatabaseService.getInstance().getTopCampaignStats(zaloId, limit || 10) };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:getCampaignSafetyStats', async (_e, { zaloId }: { zaloId?: string }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:getCampaignSafetyStats', { zaloId });
            }
            return { success: true, data: DatabaseService.getInstance().getCampaignSafetyStats(zaloId) };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('crm:getActivityStats', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs?: number }) => {
        try {
            if (AppModeManager.getInstance().getMode() === 'employee') {
                return await proxyToBossAsync('crm:getActivityStats', { zaloId, sinceTs, untilTs });
            }
            return { success: true, ...DatabaseService.getInstance().getActivityStats(zaloId, sinceTs, untilTs) };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Queue status ──────────────────────────────────────────────────────────
    ipcHandle('crm:getQueueStatus', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, status: CRMQueueService.getInstance().getStatus(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Analytics / Reporting ─────────────────────────────────────────────────
    ipcHandle('analytics:dashboardOverview', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, ...DatabaseService.getInstance().getDashboardOverview(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:messageVolume', async (_e, { zaloId, sinceTs, untilTs, granularity, threadType }: { zaloId: string; sinceTs: number; untilTs: number; granularity: 'hour' | 'day'; threadType?: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getMessageVolume(zaloId, sinceTs, untilTs, granularity, threadType) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:peakHours', async (_e, { zaloId, sinceTs, untilTs, threadType }: { zaloId: string; sinceTs: number; untilTs: number; threadType?: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getPeakHoursHeatmap(zaloId, sinceTs, untilTs, threadType) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:contactGrowth', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getContactGrowth(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:contactSegmentation', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, ...DatabaseService.getInstance().getContactSegmentation(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:campaignComparison', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs?: number; untilTs?: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getCampaignComparison(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:friendRequests', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getFriendRequestAnalytics(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:workflowAnalytics', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getWorkflowAnalytics(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:aiAnalytics', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getAIAnalytics(sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:responseTime', async (_e, { zaloId, sinceTs, untilTs, threadType }: { zaloId: string; sinceTs: number; untilTs: number; threadType?: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getResponseTimeStats(zaloId, sinceTs, untilTs, threadType) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcHandle('analytics:labelUsage', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getLabelUsageAnalytics(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ── Scheduled Messages ───────────────────────────────────────────
    ipcHandle('crm:scheduleMessage', async (_e, { ownerZaloId, threadId, threadType, channel, message, attachments, sendAt }: any) => {
        try {
            const db = DatabaseService.getInstance();
            const id = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            db.run(
                `INSERT INTO scheduled_chat_messages (id, owner_zalo_id, thread_id, thread_type, channel, message, attachments, send_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, ownerZaloId, threadId, threadType, channel, message, attachments ? JSON.stringify(attachments) : null, sendAt, 'pending', Date.now(), Date.now()]
            );
            db.save();
            return { success: true, id };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:getScheduledMessages', async (_e, { ownerZaloId, threadId }: any) => {
        try {
            const db = DatabaseService.getInstance();
            const rows = db.query<any>(
                `SELECT * FROM scheduled_chat_messages WHERE owner_zalo_id = ? AND thread_id = ? AND status = 'pending' ORDER BY send_at ASC`,
                [ownerZaloId, threadId]
            );
            return { success: true, scheduledMessages: rows };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:cancelScheduledMessage', async (_e, { id }: any) => {
        try {
            const db = DatabaseService.getInstance();
            db.run(
                `DELETE FROM scheduled_chat_messages WHERE id = ?`,
                [id]
            );
            db.save();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Zalo Bulk Phone Scanner IPC Handlers ─────────────────────────────────────
    ipcHandle('crm:getPhoneScanBatches', async () => {
        try {
            const db = DatabaseService.getInstance();
            return { success: true, batches: db.getPhoneScanBatches() };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:getPhoneScanItems', async (_e, { batchId, limit, offset, status }: any) => {
        try {
            const db = DatabaseService.getInstance();
            const res = db.getPhoneScanItems(batchId, limit, offset, status);
            return { success: true, ...res };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:createPhoneScanBatch', async (_e, { name, assignedAccountId, autoTagIds, dailyLimit, hourlyLimit, priority, status, scheduledTime, skipCrmExisting, autoWorkflowId, phones }: any) => {
        try {
            const db = DatabaseService.getInstance();
            const batchId = db.createPhoneScanBatch({
                name,
                assignedAccountId,
                autoTagIds,
                dailyLimit,
                hourlyLimit,
                priority,
                status,
                scheduledTime,
                skipCrmExisting,
                autoWorkflowId,
                phones
            });
            if (batchId !== -1) {
                // Trigger background scheduler immediately to start scanning
                try {
                    const PhoneScanService = require('../../src/services/crm/PhoneScanService').default;
                    PhoneScanService.getInstance().triggerImmediateScan().catch(() => {});
                } catch {}
                return { success: true, batchId };
            }
            return { success: false, error: 'Could not create batch' };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:deletePhoneScanBatch', async (_e, { batchId }: any) => {
        try {
            const db = DatabaseService.getInstance();
            db.deletePhoneScanBatch(batchId);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:getPhoneScanLimitStatus', async () => {
        try {
            const db = DatabaseService.getInstance();
            const activeAccounts = db.getAccounts() || [];
            const zaloAccounts = activeAccounts.filter((a: any) => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));
            
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const startOfTodayTimestamp = startOfToday.getTime();
            const oneHourAgoTimestamp = Date.now() - 60 * 60 * 1000;
            
            const statusList = zaloAccounts.map((a: any) => {
                const todayCount = db.getDailyScanCountForAccount(a.zalo_id, startOfTodayTimestamp);
                const hourlyCount = db.getHourlyScanCountForAccount(a.zalo_id, oneHourAgoTimestamp);
                return {
                    zaloId: a.zalo_id,
                    fullName: a.full_name || a.zalo_id,
                    todayCount,
                    hourlyCount
                };
            });
            return { success: true, accountsStatus: statusList };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:updatePhoneScanBatchStatus', async (_e, { batchId, status }: any) => {
        try {
            const db = DatabaseService.getInstance();
            db.updatePhoneScanBatchStatus(batchId, status);
            // Trigger scanner immediately if resumed
            if (status === 'active') {
                try {
                    const PhoneScanService = require('../../src/services/crm/PhoneScanService').default;
                    PhoneScanService.getInstance().triggerImmediateScan().catch(() => {});
                } catch {}
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:updatePhoneScanBatchPriority', async (_e, { batchId, priority }: any) => {
        try {
            const db = DatabaseService.getInstance();
            db.updatePhoneScanBatchPriority(batchId, priority);
            // Trigger scanner immediately if prioritized
            if (priority > 0) {
                try {
                    const PhoneScanService = require('../../src/services/crm/PhoneScanService').default;
                    PhoneScanService.getInstance().triggerImmediateScan().catch(() => {});
                } catch {}
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcHandle('crm:startPhoneScanImmediate', async () => {
        try {
            const PhoneScanService = require('../../src/services/crm/PhoneScanService').default;
            await PhoneScanService.getInstance().triggerImmediateScan();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });
}

