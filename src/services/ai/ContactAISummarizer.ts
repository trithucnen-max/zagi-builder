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

// Cooldown tracking in memory to prevent LLM API spam when offline or rate-limited
const lastAttemptTime = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Background Concurrency Control Queue to avoid heavy concurrent LLM calls
 */
class SummaryQueue {
    private queue: Array<{
        ownerZaloId: string;
        contactId: string;
        assistantId: string | null;
        currentProfile: string | null;
        messageCount: number;
        resolve: (val: { success: boolean; error?: string }) => void;
        reject: (err: any) => void;
    }> = [];
    private running = 0;
    private maxConcurrency = 1;

    public push(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number
    ): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve, reject) => {
            this.queue.push({ ownerZaloId, contactId, assistantId, currentProfile, messageCount, resolve, reject });
            this.next();
        });
    }

    private next() {
        if (this.running >= this.maxConcurrency || this.queue.length === 0) return;
        this.running++;
        const item = this.queue.shift()!;
        ContactAISummarizer.executeSummaryDirect(
            item.ownerZaloId,
            item.contactId,
            item.assistantId,
            item.currentProfile,
            item.messageCount
        )
            .then(item.resolve)
            .catch(item.reject)
            .finally(() => {
                this.running--;
                this.next();
            });
    }
}

const summaryQueue = new SummaryQueue();

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

            // Cooldown check
            const lastAttempt = lastAttemptTime.get(key);
            if (lastAttempt && Date.now() - lastAttempt < COOLDOWN_MS) {
                Logger.info(`[ContactAISummarizer] Cooldown active for contact=${contactId}. Skipping auto-summary.`);
                return;
            }

            Logger.info(`[ContactAISummarizer] Threshold reached (${counter}/${threshold}) for contact=${contactId}. Queueing auto-summary...`);
            // Run inside background worker queue
            ContactAISummarizer.runAutoSummary(ownerZaloId, contactId, assistantId, currentProfile, threshold);
        } catch (err: any) {
            Logger.warn(`[ContactAISummarizer] onNewMessage error: ${err.message}`);
        }
    }

    /**
     * Entry point: delegates to SummaryQueue to throttle concurrent executions.
     */
    public static async runAutoSummary(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number = 30
    ): Promise<{ success: boolean; error?: string }> {
        return summaryQueue.push(ownerZaloId, contactId, assistantId, currentProfile, messageCount);
    }

    /**
     * Direct executor method triggered sequentially by SummaryQueue
     */
    public static async executeSummaryDirect(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number
    ): Promise<{ success: boolean; error?: string }> {
        const key = `${ownerZaloId}:${contactId}`;
        if (inProgress.has(key)) return { success: false, error: 'Already running' };

        // Final safeguard: Check cooldown right before executing
        const lastAttempt = lastAttemptTime.get(key);
        if (lastAttempt && Date.now() - lastAttempt < COOLDOWN_MS) {
            Logger.info(`[ContactAISummarizer] Cooldown active in executor for contact=${contactId}. Skipping execution.`);
            return { success: false, error: 'Cooldown active' };
        }

        inProgress.add(key);

        // Record attempt timestamp to implement cooldown
        lastAttemptTime.set(key, Date.now());

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

            const notes = db.getCRMNotes(ownerZaloId, contactId);
            if (notes.length === 0) {
                Logger.info(`[ContactAISummarizer] No notes found for contact=${contactId}. Clearing AI profile.`);
                db.updateContactAIProfile({ ownerZaloId, contactId, aiProfile: '', resetCounter: true });
                
                // Success: clear cooldown
                lastAttemptTime.delete(key);
                
                Logger.info(`[ContactAISummarizer] Auto-summary complete (cleared) for contact=${contactId}.`);
                EventBroadcaster.broadcastAIProfileUpdated(ownerZaloId, contactId, '');
                return { success: true };
            }

            const prompt = ContactAISummarizer.buildNotesPrompt(contactName, notes, assistant.systemPrompt || '');
            const chatRes = await aiService.chat(assistant.id, [{ role: 'user', content: prompt }], false);
            if (!chatRes?.result) {
                Logger.warn('[ContactAISummarizer] AI returned empty response.');
                return { success: false, error: 'AI returned no response' };
            }

            const newProfile = chatRes.result.trim();
            db.updateContactAIProfile({ ownerZaloId, contactId, aiProfile: newProfile, resetCounter: true });

            // Success: clear cooldown
            lastAttemptTime.delete(key);

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

    private static buildNotesPrompt(contactName: string, notes: any[], systemPrompt: string = ''): string {
        const notesText = notes
            .map((n: any) => `[Ngày ${new Date(n.created_at).toLocaleString('vi-VN')}]: ${n.content}`)
            .join('\n');

        const structureInstructions = systemPrompt
            ? `Hãy phân tích và tổng hợp thông tin dựa theo đúng cấu trúc tiêu chí được định nghĩa trong System Prompt của bạn.`
            : `Hãy trình bày rõ ràng theo các đề mục sau:
  * Nhu cầu
  * Mong muốn
  * Tình trạng hiện tại
  * Khả năng tài chính
  * Địa chỉ/Khu vực sinh sống
  * Khác (nếu có)
- Nếu đề mục nào không có thông tin trong ghi chú, ghi rõ "Chưa có thông tin".`;

        return `Dưới đây là các ghi chú về khách hàng tên "${contactName}". Hãy phân tích và tổng hợp thông tin từ các ghi chú này thành một bản hồ sơ phân tích khách hàng.
YÊU CẦU:
- Phân tích ngắn gọn, đi thẳng vào các ý chính.
- ${structureInstructions}
- Sử dụng tiếng Việt, phong cách chuyên nghiệp.
- Không tự ý bịa đặt hay suy diễn bất kỳ thông tin nào ngoài các ghi chú đã cung cấp.
- Loại bỏ hoàn toàn các thông tin cũ/trùng lặp không xuất hiện trong ghi chú hiện tại. Với nội dung cũ hãy xóa đi và chỉ cập nhật nội dung có trong ghi chú mới nhất.

Dữ liệu ghi chú khách hàng:
${notesText}`;
    }
}

export default ContactAISummarizer;


