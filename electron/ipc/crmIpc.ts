import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';
import CRMQueueService from '../../src/services/crm/CRMQueueService';
import EventBroadcaster from '../../src/services/event/EventBroadcaster';
import AppModeManager from '../../src/utils/AppModeManager';
import Logger from '../../src/utils/Logger';
import { proxyToBoss, uploadEmployeeMedia, proxyToBossAsync } from './proxyHelper';

export function registerCRMIpc(): void {


    // ─── Notes ─────────────────────────────────────────────────────────────
    ipcMain.handle('crm:getNotes', async (_e, { zaloId, contactId }: { zaloId: string; contactId: string }) => {
        try { return { success: true, notes: DatabaseService.getInstance().getCRMNotes(zaloId, contactId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:saveNote', async (_e, { zaloId, note }: { zaloId: string; note: any }) => {
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

    ipcMain.handle('crm:deleteNote', async (_e, { zaloId, noteId }: { zaloId: string; noteId: number }) => {
        try {
            DatabaseService.getInstance().deleteCRMNote(noteId, zaloId);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:noteChanged', { action: 'delete', ownerZaloId: zaloId, noteId });
            proxyToBoss('crm:deleteNote', { zaloId, noteId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Contacts ──────────────────────────────────────────────────────────
    ipcMain.handle('crm:getContacts', async (_e, { zaloId, opts }: { zaloId: string; opts?: any }) => {
        try { return { success: true, ...DatabaseService.getInstance().getCRMContacts(zaloId, opts || {}) }; }
        catch (e: any) { return { success: false, error: e.message, contacts: [], total: 0 }; }
    });

    ipcMain.handle('crm:previewWorkflowContacts', async (_e, { zaloId, cfg }: { zaloId: string; cfg: any }) => {
        try {
            let sql = `
              SELECT contact_id, display_name, avatar_url as avatar, phone, is_friend, contact_type, gender, birthday, pipeline_stage_id, channel, salutation, alias, ai_profile, extra_data
              FROM contacts
              WHERE owner_zalo_id = ?
            `;
            const params: any[] = [zaloId];

            if (cfg.channel && cfg.channel !== 'all') {
              sql += ` AND channel = ?`;
              params.push(cfg.channel);
            }

            if (cfg.gender !== undefined && cfg.gender !== null && cfg.gender !== '') {
              sql += ` AND gender = ?`;
              params.push(Number(cfg.gender));
            }

            if (cfg.salutation !== undefined && cfg.salutation !== null && cfg.salutation !== '') {
              sql += ` AND salutation LIKE ?`;
              params.push(`%${cfg.salutation}%`);
            }

            if (cfg.searchQuery !== undefined && cfg.searchQuery !== null && cfg.searchQuery !== '') {
              sql += ` AND (display_name LIKE ? OR alias LIKE ? OR contact_id LIKE ? OR phone LIKE ?)`;
              const queryParam = `%${cfg.searchQuery}%`;
              params.push(queryParam, queryParam, queryParam, queryParam);
            }

            if (cfg.pipelineStageId !== undefined && cfg.pipelineStageId !== null && cfg.pipelineStageId !== '') {
              sql += ` AND pipeline_stage_id = ?`;
              params.push(Number(cfg.pipelineStageId));
            }

            if (cfg.isFriend === 'friend') {
              sql += ` AND is_friend = 1`;
            } else if (cfg.isFriend === 'non_friend') {
              sql += ` AND is_friend = 0`;
            }

            if (cfg.localLabelIds && Array.isArray(cfg.localLabelIds) && cfg.localLabelIds.length > 0) {
              const placeholders = cfg.localLabelIds.map(() => '?').join(',');
              sql += ` AND contact_id IN (
                SELECT thread_id FROM local_label_threads 
                WHERE label_id IN (${placeholders})
              )`;
              params.push(...cfg.localLabelIds);
            }

            if (cfg.zaloLabelIds && Array.isArray(cfg.zaloLabelIds) && cfg.zaloLabelIds.length > 0) {
              const placeholders = cfg.zaloLabelIds.map(() => '?').join(',');
              sql += ` AND contact_id IN (
                SELECT thread_id FROM local_label_threads 
                WHERE label_id IN (${placeholders})
              )`;
              params.push(...cfg.zaloLabelIds);
            }

            if (cfg.tagIds && Array.isArray(cfg.tagIds) && cfg.tagIds.length > 0) {
              const placeholders = cfg.tagIds.map(() => '?').join(',');
              sql += ` AND contact_id IN (
                SELECT contact_id FROM crm_contact_tags 
                WHERE tag_id IN (${placeholders})
              )`;
              params.push(...cfg.tagIds);
            }

            let rows = DatabaseService.getInstance().query<any>(sql, params) || [];

            if (cfg.birthdayToday === true) {
              const today = new Date();
              const utc = today.getTime() + today.getTimezoneOffset() * 60000;
              const vnTime = new Date(utc + 3600000 * 7);
              const currentDay = vnTime.getDate();
              const currentMonth = vnTime.getMonth() + 1;

              rows = rows.filter((c: any) => {
                if (!c.birthday) return false;
                const parts = c.birthday.split('/');
                if (parts.length >= 2) {
                  const d = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10);
                  return d === currentDay && m === currentMonth;
                }
                return false;
              });
            }

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

    ipcMain.handle('crm:getContactStats', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, ...DatabaseService.getInstance().getContactStats(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message, total: 0, friendCount: 0, noteCount: 0 }; }
    });

    // ─── Campaigns ─────────────────────────────────────────────────────────
    ipcMain.handle('crm:getCampaigns', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, campaigns: DatabaseService.getInstance().getCRMCampaigns(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:saveCampaign', async (_e, { zaloId, campaign }: { zaloId: string; campaign: any }) => {
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

    ipcMain.handle('crm:deleteCampaign', async (_e, { zaloId, campaignId }: { zaloId: string; campaignId: number }) => {
        try {
            DatabaseService.getInstance().deleteCRMCampaign(campaignId, zaloId);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:campaignChanged', { action: 'delete', ownerZaloId: zaloId, campaignId });
            proxyToBoss('crm:deleteCampaign', { zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:cloneCampaign', async (_e, { zaloId, campaignId, includeContacts, newName }: { zaloId: string; campaignId: number; includeContacts: boolean; newName?: string }) => {
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

    ipcMain.handle('crm:restartCampaign', async (_e, { zaloId, campaignId }: { zaloId: string; campaignId: number }) => {
        try {
            const db = DatabaseService.getInstance();
            db.restartCRMCampaign(campaignId);
            CRMQueueService.getInstance().startForAccount(zaloId);
            EventBroadcaster.emit('crm:campaignChanged', { action: 'status', ownerZaloId: zaloId, campaignId, status: 'active' });
            proxyToBoss('crm:restartCampaign', { zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:retryFailedContacts', async (_e, { zaloId, campaignId }: { zaloId: string; campaignId: number }) => {
        try {
            const db = DatabaseService.getInstance();
            db.retryFailedCampaignContacts(campaignId);
            CRMQueueService.getInstance().startForAccount(zaloId);
            EventBroadcaster.emit('crm:campaignChanged', { action: 'status', ownerZaloId: zaloId, campaignId, status: 'active' });
            proxyToBoss('crm:retryFailedContacts', { zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:updateCampaignStatus', async (_e, { campaignId, status }: { campaignId: number; status: string }) => {
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

    ipcMain.handle('crm:addCampaignContacts', async (_e, { zaloId, campaignId, contacts }: { zaloId: string; campaignId: number; contacts: any[] }) => {
        try {
            const res = DatabaseService.getInstance().addCampaignContacts(campaignId, zaloId, contacts);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('crm:campaignChanged', { action: 'contactsAdded', ownerZaloId: zaloId, campaignId });
            proxyToBoss('crm:addCampaignContacts', { zaloId, campaignId, contacts });
            return { success: true, ...res };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:removeCampaignContacts', async (_e, { zaloId, campaignId, contactIds }: { zaloId: string; campaignId: number; contactIds: string[] }) => {
        try {
            DatabaseService.getInstance().removeCampaignContacts(campaignId, contactIds);
            EventBroadcaster.emit('crm:campaignChanged', { action: 'contactsRemoved', ownerZaloId: zaloId, campaignId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:getCampaignContacts', async (_e, { campaignId }: { campaignId: number }) => {
        try { return { success: true, contacts: DatabaseService.getInstance().getCampaignContacts(campaignId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Send Log ──────────────────────────────────────────────────────────
    ipcMain.handle('crm:getSendLog', async (_e, { zaloId, opts }: { zaloId: string; opts?: any }) => {
        try { return { success: true, logs: DatabaseService.getInstance().getSendLog(zaloId, opts || {}) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:getCampaignStats', async (_e, { zaloId, limit }: { zaloId: string; limit?: number }) => {
        try { return { success: true, stats: DatabaseService.getInstance().getTopCampaignStats(zaloId, limit || 10) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:getCampaignSafetyStats', async (_e, { zaloId }: { zaloId?: string }) => {
        try { return { success: true, data: DatabaseService.getInstance().getCampaignSafetyStats(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('crm:getActivityStats', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs?: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getActivityStats(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Queue status ──────────────────────────────────────────────────────────
    ipcMain.handle('crm:getQueueStatus', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, status: CRMQueueService.getInstance().getStatus(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Analytics / Reporting ─────────────────────────────────────────────────
    ipcMain.handle('analytics:dashboardOverview', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, ...DatabaseService.getInstance().getDashboardOverview(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:messageVolume', async (_e, { zaloId, sinceTs, untilTs, granularity, threadType }: { zaloId: string; sinceTs: number; untilTs: number; granularity: 'hour' | 'day'; threadType?: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getMessageVolume(zaloId, sinceTs, untilTs, granularity, threadType) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:peakHours', async (_e, { zaloId, sinceTs, untilTs, threadType }: { zaloId: string; sinceTs: number; untilTs: number; threadType?: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getPeakHoursHeatmap(zaloId, sinceTs, untilTs, threadType) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:contactGrowth', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, data: DatabaseService.getInstance().getContactGrowth(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:contactSegmentation', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, ...DatabaseService.getInstance().getContactSegmentation(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:campaignComparison', async (_e, { zaloId }: { zaloId: string }) => {
        try { return { success: true, data: DatabaseService.getInstance().getCampaignComparison(zaloId) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:friendRequests', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getFriendRequestAnalytics(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:workflowAnalytics', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getWorkflowAnalytics(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:aiAnalytics', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getAIAnalytics(sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:responseTime', async (_e, { zaloId, sinceTs, untilTs, threadType }: { zaloId: string; sinceTs: number; untilTs: number; threadType?: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getResponseTimeStats(zaloId, sinceTs, untilTs, threadType) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('analytics:labelUsage', async (_e, { zaloId, sinceTs, untilTs }: { zaloId: string; sinceTs: number; untilTs: number }) => {
        try { return { success: true, ...DatabaseService.getInstance().getLabelUsageAnalytics(zaloId, sinceTs, untilTs) }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });
}

