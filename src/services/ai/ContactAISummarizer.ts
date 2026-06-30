/**
 * ContactAISummarizer.ts
 *
 * Main-process singleton service that automatically summarizes customer profiles
 * using AI whenever a configured message-count threshold is reached.
 */

import DatabaseService from '../database/DatabaseService';
import AIAssistantService from './AIAssistantService';
import EventBroadcaster from '../event/EventBroadcaster';
import Logger from '../../utils/Logger';

// Track in-progress summarizations to avoid concurrent duplicate runs
const inProgress = new Set<string>(); // key = `${ownerZaloId}:${contactId}`

class ContactAISummarizer {
    private constructor() {}

    /**
     * Called by DatabaseService.saveMessage() for every 1-1 (non-group) message.
     * Runs asynchronously so it never blocks message saving.
     */
    public static async onNewMessage(ownerZaloId: string, contactId: string): Promise<void> {
        try {
            const db = DatabaseService.getInstance();
            const state = db.incrementContactMessageCounter(ownerZaloId, contactId);
            if (!state) return;

            const { counter, threshold, autoEnabled, assistantId, currentProfile } = state;
            if (!autoEnabled) return;
            if (counter < threshold) return;

            const key = `${ownerZaloId}:${contactId}`;
            if (inProgress.has(key)) return; // already running

            Logger.info(`[ContactAISummarizer] Threshold reached (${counter}/${threshold}) for contact=${contactId}. Starting auto-summary...`);
            await ContactAISummarizer.runAutoSummary(ownerZaloId, contactId, assistantId, currentProfile, threshold);
        } catch (err: any) {
            Logger.warn(`[ContactAISummarizer] onNewMessage error: ${err.message}`);
        }
    }

    /**
     * Core logic: fetch recent messages → build prompt → call AI → save → broadcast.
     * Can also be called manually from ai:triggerContactSummary IPC.
     */
    public static async runAutoSummary(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number = 30
    ): Promise<{ success: boolean; error?: string }> {
        const key = `${ownerZaloId}:${contactId}`;
        if (inProgress.has(key)) return { success: false, error: 'Already running' };
        inProgress.add(key);

        try {
            const db = DatabaseService.getInstance();
            const aiService = AIAssistantService.getInstance();
            const assistant = assistantId
                ? aiService.getAssistant(assistantId)
                : aiService.getDefaultAssistant();

            if (!assistant) {
                Logger.warn('[ContactAISummarizer] No AI assistant available. Skipping.');
                return { success: false, error: 'No AI assistant configured' };
            }

            const contactRow = db.queryOne<{ display_name: string; alias: string }>(
                `SELECT display_name, alias FROM contacts WHERE owner_zalo_id=? AND contact_id=?`,
                [ownerZaloId, contactId]
            );
            const contactName = contactRow?.alias || contactRow?.display_name || contactId;

            const recentMessages = db.getMessages(ownerZaloId, contactId, messageCount, 0);
            if (recentMessages.length === 0) {
                Logger.warn(`[ContactAISummarizer] No messages found for contact=${contactId}. Skipping.`);
                return { success: false, error: 'No messages found' };
            }

            const prompt = ContactAISummarizer.buildMergePrompt(contactName, currentProfile, recentMessages);
            const chatRes = await aiService.chat(assistant.id, [{ role: 'user', content: prompt }], false);
            if (!chatRes?.result) {
                Logger.warn('[ContactAISummarizer] AI returned empty response.');
                return { success: false, error: 'AI returned no response' };
            }

            const newProfile = chatRes.result.trim();
            db.updateContactAIProfile({ ownerZaloId, contactId, aiProfile: newProfile, resetCounter: true });

            Logger.info(`[ContactAISummarizer] Auto-summary complete for contact=${contactId}.`);
            EventBroadcaster.broadcastAIProfileUpdated(ownerZaloId, contactId, newProfile);
            return { success: true };
        } catch (err: any) {
            Logger.error(`[ContactAISummarizer] runAutoSummary error: ${err.message}`);
            return { success: false, error: err.message };
        } finally {
            inProgress.delete(key);
        }
    }

    private static buildMergePrompt(contactName: string, oldProfile: string | null, recentMessages: any[]): string {
        const messagesText = recentMessages
            .map((m: any) => {
                const sender = m.is_sent ? '[Nhân viên]' : `[${contactName}]`;
                const time = m.timestamp ? new Date(m.timestamp).toLocaleString('vi-VN') : '';
                let text = '';
                try {
                    const parsed = JSON.parse(m.content || '{}');
                    text = parsed.msg || parsed.message || parsed.title || '';
                } catch {
                    text = String(m.content || '');
                }
                if (!text) return null;
                return `${time} ${sender}: ${text}`;
            })
            .filter(Boolean)
            .join('\n');

        const profileSection = oldProfile
            ? `HO SO HIEN TAI:\n${oldProfile}`
            : 'HO SO HIEN TAI: (Chua co thong tin)';

        return `Ban la tro ly AI chuyen phan tich ho so khach hang.
Duoi day la ho so hien tai cua khach hang ten "${contactName}" va ${recentMessages.length} tin nhan trao doi gan nhat.

${profileSection}

${recentMessages.length} TIN NHAN MOI NHAT:
${messagesText}

YEU CAU:
- Cap nhat ho so bang cach tich hop thong tin moi tu cac tin nhan tren.
- Neu co thong tin MOI hoac THAY DOI (vi du: kha nang tai chinh tu 4 ty tang len 6 ty):
  -> Cap nhat thanh khoang gia moi (4-6 ty), uu tien gia moi nhat.
  -> Ghi them chu thich lich su: "(Truoc: 4 ty -> Cap nhat: 6 ty)"
- Neu thong tin TUONG DUONG hoac xac nhan them: bo sung hoac giu nguyen.
- Neu thong tin KHONG CO trong tin nhan moi: giu nguyen ho so cu, khong xoa.
- Khong xoa bat ky de muc nao da co trong ho so cu.
- Tra ve ho so hoan chinh da duoc cap nhat theo format de muc ro rang bang tieng Viet.`;
    }
}

export default ContactAISummarizer;
