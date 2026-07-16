import EventBroadcaster from '../event/EventBroadcaster';
import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import { FacebookService } from '../facebook/FacebookService';
import { FacebookSendService } from '../facebook/FacebookSendService';
import Logger from '../../utils/Logger';
import IntegrationRegistry from '../integrations/IntegrationRegistry';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { google } from 'googleapis';
import { parseStructuredResponse, isValidStructuredResponse } from '../../utils/aiUtils';
import { getLunarDate } from '../../utils/lunarCalendar';
import { serializeContext, deserializeContext } from './contextSerializer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeType =
  | 'trigger.message' | 'trigger.friendRequest' | 'trigger.groupEvent'
  | 'trigger.reaction' | 'trigger.undo' | 'trigger.schedule' | 'trigger.manual'
  | 'trigger.labelAssigned' | 'trigger.webhook'
  | 'crm.getContacts'
  | 'zalo.sendMessage' | 'zalo.sendImage' | 'zalo.sendFile' | 'zalo.sendVoice' | 'zalo.sendVideo'
  | 'zalo.forwardMessage' | 'zalo.addReaction' | 'zalo.undoMessage'
  | 'zalo.sendTyping'
  | 'zalo.findUser' | 'zalo.getUserInfo' | 'zalo.sendFriendRequest' | 'zalo.sendBankCard' | 'zalo.sendCard'
  | 'zalo.acceptFriendRequest' | 'zalo.rejectFriendRequest'
  | 'zalo.addToGroup' | 'zalo.removeFromGroup' | 'zalo.createPoll'
  | 'zalo.getMessageHistory' | 'zalo.setMute'
  | 'zalo.assignLabel' | 'zalo.removeLabel'
  | 'logic.if' | 'logic.switch' | 'logic.wait' | 'logic.forEach'
  | 'logic.setVariable' | 'logic.stopIf'
  | 'data.textFormat' | 'data.jsonParse' | 'data.dateFormat' | 'data.randomPick'
  | 'sheets.appendRow' | 'sheets.readValues' | 'sheets.updateCell'
  | 'ai.generateText' | 'ai.classify'
  | 'notify.telegram' | 'notify.discord' | 'notify.email' | 'notify.notion'
  | 'output.httpRequest' | 'output.log'
  // P0 integrations
  | 'trigger.payment'
  | 'kiotviet.lookupCustomer' | 'kiotviet.lookupOrder' | 'kiotviet.createOrder' | 'kiotviet.lookupProduct'
  | 'haravan.lookupCustomer' | 'haravan.lookupOrder' | 'haravan.createOrder' | 'haravan.lookupProduct'
  | 'sapo.lookupCustomer'    | 'sapo.lookupOrder'    | 'sapo.createOrder'    | 'sapo.lookupProduct'    | 'sapo.getInventory'
  | 'nhanh.lookupCustomer'   | 'nhanh.lookupOrder'   | 'nhanh.createOrder'   | 'nhanh.lookupProduct'
  | 'pancake.lookupCustomer' | 'pancake.lookupOrder' | 'pancake.createOrder' | 'pancake.lookupProduct'
  | 'payment.getTransactions'
  | 'ghn.createOrder' | 'ghn.getTracking' | 'ghn.getProvinces' | 'ghn.getDistricts' | 'ghn.getWards' | 'ghn.getServices'
  | 'ghtk.createOrder' | 'ghtk.getTracking'
  // Facebook
  | 'fb.trigger.message' | 'fb.trigger.image' | 'fb.trigger.video' | 'fb.trigger.file' | 'fb.trigger.sticker' | 'fb.trigger.reaction'
  | 'fb.trigger.unsend' | 'fb.trigger.groupEvent'
  | 'fb.action.sendMessage' | 'fb.action.sendTyping' | 'fb.action.addReaction'
  | 'fb.action.markAsRead' | 'fb.action.forward' | 'fb.action.pin' | 'fb.action.unpin'
  | 'fb.action.createPoll' | 'fb.action.block' | 'fb.action.unsend' | 'fb.action.editMessage'
  | 'fb.action.changeName' | 'fb.action.changeEmoji' | 'fb.action.changeNickname'
  | 'fb.action.sendImage';

export type WorkflowChannel = 'zalo' | 'facebook';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label?: string;
  position: { x: number; y: number };
  config: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  channel: WorkflowChannel;
  /** @deprecated use pageIds */
  pageId?: string;
  /** Danh sách zalo_id mà workflow này áp dụng. Rỗng = áp dụng cho tất cả pages. */
  pageIds: string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRunLog {
  id: string;
  workflowId: string;
  workflowName: string;
  triggeredBy: string;
  startedAt: number;
  finishedAt: number;
  status: 'success' | 'error' | 'partial' | 'waiting';
  errorMessage?: string;
  nodeResults: NodeResult[];
}

export interface NodeResult {
  nodeId: string;
  nodeType: NodeType;
  label?: string;
  status: 'success' | 'error' | 'skipped';
  input: Record<string, any>;
  output: Record<string, any>;
  durationMs: number;
  error?: string;
}

interface ExecutionContext {
  trigger: any;
  nodes: Record<string, { output: Record<string, any> }>;
  variables: Record<string, any>;
  pageId: string;
  /** nodeIds that should be skipped because they're on the wrong branch of an IF/switch */
  skippedNodes: Set<string>;
  /** Full node list — used by renderTemplate to match $node.Label.field by label name */
  _wfNodes: WorkflowNode[];
  _wfEdges?: WorkflowEdge[];
  _wfName: string;
  isSandbox?: boolean;
  /** Persistent Checkpoint metadata */
  _triggeredBy?: string;
  _runId?: string;
  _wfId?: string;
}

/** Sentinel error: workflow đã lưu checkpoint và thoát sớm — không phải lỗi thật */
class CheckpointError extends Error {
  constructor(public readonly checkpointId: string, public readonly resumeAt: number) {
    super('__CHECKPOINT__');
    this.name = 'CheckpointError';
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

class WorkflowEngineService {
  private static instance: WorkflowEngineService;
  private workflows: Map<string, Workflow> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();

  /** Debounce timers for trigger.message — key = workflowId:threadId */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Buffered message events for debounce — key = workflowId:threadId */
  private debounceBuffers: Map<string, any[]> = new Map();

  public static getInstance(): WorkflowEngineService {
    if (!this.instance) this.instance = new WorkflowEngineService();
    return this.instance;
  }

  public async initialize(): Promise<void> {
    this.loadWorkflows();
    this.registerZaloEventListeners();
    this.registerFacebookEventListeners();
    this.registerCronJobs();
    
    // Cleanup stale debounce entries every 5 minutes
    setInterval(() => {
      try {
        for (const key of this.debounceTimers.keys()) {
          if (!this.debounceBuffers.has(key)) {
            this.debounceTimers.delete(key);
          }
        }
      } catch (err: any) {
        Logger.warn(`[WorkflowEngine] Debounce timers cleanup error: ${err.message}`);
      }
    }, 5 * 60 * 1000);

    Logger.log(`[WorkflowEngine] Initialized — ${this.workflows.size} workflows loaded`);
  }

  public handleWorkspaceSwitch(): void {
    try {
      // 1. Stop all cron jobs
      for (const job of this.cronJobs.values()) {
        try { job.stop(); } catch {}
      }
      this.cronJobs.clear();

      // 2. Reload workflows from the newly switched database
      this.loadWorkflows();

      // 3. Re-register cron jobs
      this.registerCronJobs();

      // 4. Re-register event listeners (hooks) on EventBroadcaster
      this.registerZaloEventListeners();
      this.registerFacebookEventListeners();
      
      Logger.log(`[WorkflowEngine] Workspace switched: reloaded ${this.workflows.size} workflows and re-registered hooks/cron`);
    } catch (err: any) {
      Logger.error(`[WorkflowEngine] Failed to handle workspace switch: ${err.message}`);
    }
  }

  private normalizeWorkflowChannel(channel?: string): WorkflowChannel {
    return channel === 'facebook' ? 'facebook' : 'zalo';
  }

  private resolveThreadType(ownerZaloId: string | undefined, tid: string, defaultType: number): number {
    try {
      const db = DatabaseService.getInstance();
      if (!db || !(db as any).initialized) return defaultType;

      // 1. Check in friends table
      if (ownerZaloId) {
        const friendExists = (db as any).query(
          `SELECT 1 FROM friends WHERE owner_zalo_id = ? AND user_id = ? LIMIT 1`,
          [ownerZaloId, tid]
        );
        if (friendExists && friendExists.length > 0) return 0; // User/Friend
      }

      // 2. Check in contacts table (with owner filter when available)
      const contactRow = ownerZaloId
        ? (db as any).query(
            `SELECT contact_type FROM contacts WHERE owner_zalo_id = ? AND contact_id = ? LIMIT 1`,
            [ownerZaloId, tid]
          )?.[0]
          ?? (db as any).query(
            `SELECT contact_type FROM contacts WHERE contact_id = ? LIMIT 1`,
            [tid]
          )?.[0]
        : (db as any).query(
            `SELECT contact_type FROM contacts WHERE contact_id = ? LIMIT 1`,
            [tid]
          )?.[0];
      if (contactRow) {
        return contactRow.contact_type === 'group' ? 1 : 0;
      }
    } catch (err) {
      Logger.error(`[WorkflowEngine] resolveThreadType error:`, err);
    }
    // 3. Fallback to defaultType
    return defaultType;
  }

  /**
   * Tìm đúng API cho một threadId cụ thể.
   * Khi pageId của workflow rỗng hoặc account không sở hữu nhóm đó,
   * hệ thống tìm trong bảng contacts xem account nào có group này và đang connected.
   */
  private resolveApiForThread(tid: string, fallbackApi: any): any {
    try {
      const db = DatabaseService.getInstance();
      if (!db || !(db as any).initialized) return fallbackApi;

      // Tìm tất cả owner_zalo_id có hội thoại này
      const rows = (db as any).query(
        `SELECT DISTINCT owner_zalo_id FROM contacts WHERE contact_id = ? LIMIT 10`,
        [tid]
      ) as Array<{ owner_zalo_id: string }>;

      for (const row of (rows || [])) {
        const conn = ConnectionManager.getConnection(row.owner_zalo_id);
        if (conn?.connected && conn?.api) {
          Logger.info(`[WorkflowEngine] resolveApiForThread: using account ${row.owner_zalo_id} for thread ${tid}`);
          return conn.api;
        }
      }
    } catch (err) {
      Logger.error(`[WorkflowEngine] resolveApiForThread error:`, err);
    }
    return fallbackApi;
  }

  private isRunnableWorkflow(wf: Workflow): boolean {
    const ch = this.normalizeWorkflowChannel(wf.channel);
    return ch === 'zalo' || ch === 'facebook';
  }

  /**
   * Resolve Facebook account ID về internal UUID để tìm đúng instance trong FacebookService.
   * FacebookService.instances map dùng UUID làm key, nhưng workflow trigger gửi numeric FB UID.
   * Nếu không resolve, getInstance() sẽ tạo instance mới + connect() mất ~10s không cần thiết.
   */
  private resolveFBAccountId(rawId: string): string {
    if (!rawId) return '';
    // Nếu đã là UUID (có dấu gạch ngang) → trả về nguyên
    if (rawId.includes('-')) return rawId;
    // Nếu là Facebook UID (all digits) → tìm UUID từ DB
    if (/^\d+$/.test(rawId)) {
      try {
        const fbAcc = DatabaseService.getInstance().getFBAccountByFacebookId(rawId);
        if (fbAcc?.id) return fbAcc.id;
      } catch {}
    }
    return rawId;
  }

  // ─── Load ─────────────────────────────────────────────────────────────────

  private loadWorkflows(): void {
    const rows = DatabaseService.getInstance().getWorkflows();
    this.workflows.clear();
    for (const row of rows) {
      try {
        const pageIdsRaw: string = row.page_ids || row.page_id || '';
        const wf: Workflow = {
          id: row.id, name: row.name, description: row.description || '',
          enabled: row.enabled === 1 || row.enabled === true,
          channel: this.normalizeWorkflowChannel(row.channel),
          pageId: pageIdsRaw.split(',').filter(Boolean)[0] || '',
          pageIds: pageIdsRaw.split(',').filter(Boolean),
          nodes: JSON.parse(row.nodes_json || '[]'),
          edges: JSON.parse(row.edges_json || '[]'),
          createdAt: row.created_at, updatedAt: row.updated_at,
        };
        this.workflows.set(wf.id, wf);
      } catch (e: any) {
        Logger.error(`[WorkflowEngine] Failed to parse workflow ${row.id}: ${e.message}`);
      }
    }
  }

  public reloadWorkflow(workflowId: string): void {
    const row = DatabaseService.getInstance().getWorkflowById(workflowId);
    if (!row) { this.workflows.delete(workflowId); this.unregisterCron(workflowId); return; }
    try {
      const pageIdsRaw: string = row.page_ids || row.page_id || '';
      const wf: Workflow = {
        id: row.id, name: row.name, description: row.description || '',
        enabled: row.enabled === 1 || row.enabled === true,
        channel: this.normalizeWorkflowChannel(row.channel),
        pageId: pageIdsRaw.split(',').filter(Boolean)[0] || '',
        pageIds: pageIdsRaw.split(',').filter(Boolean),
        nodes: JSON.parse(row.nodes_json || '[]'),
        edges: JSON.parse(row.edges_json || '[]'),
        createdAt: row.created_at, updatedAt: row.updated_at,
      };
      this.workflows.set(wf.id, wf);
      this.unregisterCron(workflowId);
      if (wf.enabled && this.isRunnableWorkflow(wf)) this.registerCronForWorkflow(wf);
    } catch (e: any) {
      Logger.error(`[WorkflowEngine] reloadWorkflow ${workflowId}: ${e.message}`);
    }
  }

  public removeWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
    this.unregisterCron(workflowId);
    // Clean up debounce timers/buffers for this workflow
    this.clearDebounceForWorkflow(workflowId);
  }

  /** Clear all debounce timers and buffers whose key starts with workflowId: */
  private clearDebounceForWorkflow(workflowId: string): void {
    const prefix = workflowId + ':';
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
        this.debounceBuffers.delete(key);
      }
    }
  }

  private zaloEventUnsubscribes: Array<() => void> = [];
  private fbEventUnsubscribes: Array<() => void> = [];

  private registerZaloEventListeners(): void {
    // Unsubscribe existing listeners to prevent duplicate registration
    for (const unsub of this.zaloEventUnsubscribes) {
      try { unsub(); } catch {}
    }
    this.zaloEventUnsubscribes = [];

    const EVENT_MAP: Record<string, string> = {
      'event:message':       'trigger.message',
      'event:friendRequest': 'trigger.friendRequest',
      'event:groupEvent':    'trigger.groupEvent',
      'event:reaction':      'trigger.reaction',
      'event:undo':          'trigger.undo',
      'event:labelAssigned': 'trigger.labelAssigned',
      'integration:payment': 'trigger.payment',
    };
    for (const [channel, triggerType] of Object.entries(EVENT_MAP)) {
      const unsub = EventBroadcaster.onBeforeSend(channel, (data: any) => {
        this.triggerWorkflows(triggerType, data);
      });
      this.zaloEventUnsubscribes.push(unsub);
    }
  }

  /** Bridge Facebook events to workflow triggers */
  private registerFacebookEventListeners(): void {
    // Unsubscribe existing listeners to prevent duplicate registration
    for (const unsub of this.fbEventUnsubscribes) {
      try { unsub(); } catch {}
    }
    this.fbEventUnsubscribes = [];

    // Simple 1:1 mapping for standalone Facebook events
    const SIMPLE_EVENTS: Record<string, string> = {
      'fb:onReaction':   'fb.trigger.reaction',
      'fb:onUnsend':     'fb.trigger.unsend',
      'fb:onGroupEvent': 'fb.trigger.groupEvent',
    };
    for (const [channel, triggerType] of Object.entries(SIMPLE_EVENTS)) {
      const unsub = EventBroadcaster.onBeforeSend(channel, (data: any) => {
        this.triggerWorkflows(triggerType, data);
      });
      this.fbEventUnsubscribes.push(unsub);
    }

    // Message event — determine specific trigger type from attachment data
    const unsubMsg = EventBroadcaster.onBeforeSend('fb:onMessage', (data: any) => {
      // Always trigger the base text-message workflow
      this.triggerWorkflows('fb.trigger.message', data);

      // Route to media-specific triggers based on attachment type
      const msg = data?.message || {};
      const att = msg.attachments || {};
      const attType = (att.attachmentType || '').toLowerCase();

      if (attType === 'image' || attType === 'photo') {
        this.triggerWorkflows('fb.trigger.image', data);
      } else if (attType === 'video') {
        this.triggerWorkflows('fb.trigger.video', data);
      } else if (attType === 'file' || attType === 'audio') {
        this.triggerWorkflows('fb.trigger.file', data);
      } else if (attType === 'sticker') {
        this.triggerWorkflows('fb.trigger.sticker', data);
      }
    });
    this.fbEventUnsubscribes.push(unsubMsg);
  }

  /**
   * Gọi từ main process khi renderer emit 'workflow:labelEvent'.
   * Bridge: renderer (ChatHeader) → ipcMain → engine.
   */
  public triggerLabelEvent(data: {
    zaloId: string;
    threadId: string;
    threadType: number;
    labelId: number;
    labelText: string;
    labelColor: string;
    labelEmoji: string;
    labelSource?: 'local' | 'zalo';
    action: 'assigned' | 'removed';
  }): void {
    this.triggerWorkflows('trigger.labelAssigned', data);
  }

  // ─── Cron ─────────────────────────────────────────────────────────────────

  private registerCronJobs(): void {
    try {
      const WorkspaceManager = require('../../utils/WorkspaceManager').default;
      const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
      if (activeWs?.type === 'remote') {
        Logger.log('[WorkflowEngine] Remote workspace (employee side) — skipping cron registration to prevent duplicate triggers');
        return;
      }
    } catch (e) {
      // Safe default: continue cron registration
    }
    for (const wf of this.workflows.values()) {
      if (wf.enabled && this.isRunnableWorkflow(wf)) this.registerCronForWorkflow(wf);
    }
  }

  private registerCronForWorkflow(wf: Workflow): void {
    if (!this.isRunnableWorkflow(wf)) return;
    const scheduleNode = wf.nodes.find(n => n.type === 'trigger.schedule');
    if (!scheduleNode) return;
    const expr: string = scheduleNode.config.cronExpression || '';
    if (!expr || !cron.validate(expr)) return;

    const tz = scheduleNode.config.timezone || 'Asia/Ho_Chi_Minh';
    const task = cron.schedule(expr, () => {
      this.executeWorkflow(wf, {}, 'trigger.schedule').catch(err => {
        Logger.error(`[WorkflowEngine] Cron error in "${wf.name}": ${err.message}`);
      });
    }, { timezone: tz });
    this.cronJobs.set(wf.id, task);
    Logger.log(`[WorkflowEngine] Cron registered for "${wf.name}" — ${expr}`);
  }

  private unregisterCron(workflowId: string): void {
    const job = this.cronJobs.get(workflowId);
    if (job) { job.stop(); this.cronJobs.delete(workflowId); }
  }

  // ─── Trigger matching ─────────────────────────────────────────────────────

  private triggerWorkflows(triggerType: string, eventData: any): void {
    Logger.log(`[WorkflowEngine] triggerWorkflows: Evaluating ${this.workflows.size} workflows for event type '${triggerType}'`);
    for (const wf of this.workflows.values()) {
      if (!wf.enabled) {
        Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) is disabled, skipping`);
        continue;
      }
      if (!this.isRunnableWorkflow(wf)) {
        Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) channel is not runnable (${wf.channel}), skipping`);
        continue;
      }
      const triggerNode = wf.nodes.find(n => n.type === triggerType);
      if (!triggerNode) {
        Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) does not contain trigger type '${triggerType}', skipping`);
        continue;
      }
      // pageIds: rỗng = áp dụng cho tất cả; có giá trị = chỉ chạy cho page khớp
      if (wf.pageIds.length > 0) {
        const accountId = eventData.zaloId || eventData.fbAccountId || '';
        if (accountId && !wf.pageIds.includes(accountId)) {
          Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) pageIds mismatch (accountId=${accountId}, pageIds=${wf.pageIds}), skipping`);
          continue;
        }
      }
      
      Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) matching filter conditions...`);
      if (!this.matchesTriggerFilter(triggerNode, eventData)) {
        Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) filter match failed. Config: ${JSON.stringify(triggerNode.config)}, Event: ${JSON.stringify(eventData)}`);
        continue;
      }
      
      Logger.log(`[WorkflowEngine] Workflow "${wf.name}" (${wf.id}) matched filter successfully! Running...`);

      // ─── Debounce for message triggers: gom tin nhắn liên tiếp ────────
      const debounceSeconds = Number(triggerNode.config.debounceSeconds || 0);
      if ((triggerType === 'trigger.message' || triggerType === 'fb.trigger.message') && debounceSeconds > 0) {
        const msg = eventData.data || eventData.message || {};
        const threadId = (msg as any).threadId || eventData.threadId || '';
        const debounceKey = `${wf.id}:${threadId}`;

        // Buffer the event
        if (!this.debounceBuffers.has(debounceKey)) {
          this.debounceBuffers.set(debounceKey, []);
        }
        this.debounceBuffers.get(debounceKey)!.push(eventData);

        // Clear existing timer and set new one
        const existingTimer = this.debounceTimers.get(debounceKey);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          this.debounceTimers.delete(debounceKey);
          const buffered = this.debounceBuffers.get(debounceKey) || [];
          this.debounceBuffers.delete(debounceKey);

          if (buffered.length === 0) return;

          // Merge all buffered messages: take the LAST event as base, combine contents
          const lastEvent = buffered[buffered.length - 1];
          if (buffered.length > 1) {
            // Extract content from each buffered message and join
            const mergedContents: string[] = [];
            for (const evt of buffered) {
              const m = evt.data || evt.message || {};
              const md = (m as any).data || {};
              const rawContent = md.content || (m as any).content || evt.content;
              const text = String((rawContent as any)?.msg || (typeof rawContent === 'string' ? rawContent : '') || '').trim();
              if (text) mergedContents.push(text);
            }
            // Inject merged content into last event's message data
            const lastMsg = lastEvent.data || lastEvent.message || {};
            const lastMsgData = (lastMsg as any).data || {};
            const mergedText = mergedContents.join('\n');
            if (lastMsgData.content && typeof lastMsgData.content === 'object') {
              lastMsgData.content = { ...lastMsgData.content, msg: mergedText };
            } else {
              lastMsgData.content = mergedText;
            }
            Logger.info(`[WorkflowEngine] Debounce merged ${buffered.length} messages for "${wf.name}": "${mergedText.substring(0, 200)}"`);
          }

          this.executeWorkflow(wf, lastEvent, triggerType).catch(err => {
            Logger.error(`[WorkflowEngine] Error in workflow "${wf.name}" (debounced): ${err.message}`);
          });
        }, debounceSeconds * 1000);

        this.debounceTimers.set(debounceKey, timer);

        // Cap debounce entries to prevent unbounded memory growth
        if (this.debounceTimers.size > 500) {
          const oldestKey = this.debounceTimers.keys().next().value;
          if (oldestKey) {
            clearTimeout(this.debounceTimers.get(oldestKey)!);
            this.debounceTimers.delete(oldestKey);
            this.debounceBuffers.delete(oldestKey);
          }
        }

        Logger.info(`[WorkflowEngine] Debounce: buffered message for "${wf.name}" (${debounceKey}), wait ${debounceSeconds}s`);
        continue;
      }

      this.executeWorkflow(wf, eventData, triggerType).catch(err => {
        Logger.error(`[WorkflowEngine] Error in workflow "${wf.name}": ${err.message}`);
      });
    }
  }

  /**
   * Find an enabled workflow with a trigger.webhook node matching the given token.
   */
  private findWorkflowByWebhookToken(token: string): Workflow | null {
    for (const wf of this.workflows.values()) {
      if (!wf.enabled) continue;
      const triggerNode = wf.nodes.find(n => n.type === 'trigger.webhook');
      if (!triggerNode) continue;
      if (triggerNode.config?.webhookToken === token) return wf;
    }
    return null;
  }

  /**
   * Handle an incoming webhook request from WebhookGatewayService.
   * Looks up the workflow by webhook token, verifies method, then triggers execution.
   */
  public async handleWebhook(token: string, req: {
    method: string;
    body: any;
    headers: Record<string, string>;
    query: Record<string, string>;
    rawBody: string;
    remoteIp?: string;
  }): Promise<{ status: number; body: any }> {
    const wf = this.findWorkflowByWebhookToken(token);
    if (!wf) {
      Logger.warn('[WorkflowEngine] Webhook token not found: ' + token);
      return { status: 404, body: { success: false, error: 'Webhook not found' } };
    }

    const triggerNode = wf.nodes.find(n => n.type === 'trigger.webhook')!;
    const cfg = triggerNode.config || {};

    // Method check
    const allowedMethod = (cfg.method || 'POST').toUpperCase();
    if (allowedMethod !== 'ANY' && req.method.toUpperCase() !== allowedMethod) {
      Logger.warn('[WorkflowEngine] Webhook ' + token + ': method ' + req.method + ' not allowed (expected ' + allowedMethod + ')');
      return { status: 405, body: { success: false, error: 'Method not allowed' } };
    }

    // IP whitelist check
    if (cfg.allowedIps) {
      const allowedIps = String(cfg.allowedIps).split(',').map(s => s.trim()).filter(Boolean);
      if (allowedIps.length > 0 && req.remoteIp) {
        if (!allowedIps.includes(req.remoteIp)) {
          Logger.warn('[WorkflowEngine] Webhook ' + token + ': IP ' + req.remoteIp + ' not allowed');
          return { status: 403, body: { success: false, error: 'IP not allowed' } };
        }
      }
    }

    // Build event data for triggerWorkflows
    const eventData = {
      webhookToken: token,
      body: req.body || {},
      headers: req.headers || {},
      method: req.method,
      query: req.query || {},
      rawBody: req.rawBody || '',
    };

    // Fire and forget - run workflow async
    this.triggerWorkflows('trigger.webhook', eventData);

    return {
      status: 200,
      body: { success: true, workflowId: wf.id, workflowName: wf.name },
    };
  }

  private matchesTriggerFilter(triggerNode: WorkflowNode, data: any): boolean {
    const cfg = triggerNode.config;

    if (triggerNode.type === 'trigger.message') {
      // data = { zaloId, message } where message is a zca-js UserMessage | GroupMessage:
      //   { type: 0|1, data: TMessage, threadId: string, isSelf: boolean }
      // All payload fields (uidFrom, msgId, ts, dName, content) live inside message.data (msgData)
      const msg  = data.data || data.message || {};           // UserMessage | GroupMessage
      const msgData = (msg as any).data || {};                // TMessage — uidFrom, content, msgId, ts, dName ...
      // type === 1 (ThreadType.Group) is the ONLY reliable group indicator in zca-js
      const isGroup = (msg as any).type === 1 || !!(msg as any).isGroup;
      if (cfg.threadType !== undefined && cfg.threadType !== 'all') {
        if (String(cfg.threadType) === '0' && isGroup) return false;
        if (String(cfg.threadType) === '1' && !isGroup) return false;
      }
      if (cfg.fromId) {
        const uid = String(msgData.uidFrom || (msg as any).uidFrom || data.fromId || '');
        if (!this.matchFilterId(uid, cfg.fromId)) return false;
      }
      if (cfg.groupId) {
        const gid = String((msg as any).threadId || data.threadId || '');
        if (!this.matchFilterId(gid, cfg.groupId)) return false;
      }
      if (cfg.ignoreOwn !== false) {
        const uid = String(msgData.uidFrom || (msg as any).uidFrom || data.fromId || '');
        const ownerZaloId = String(data.zaloId || '');
        const isSelf = !!((msg as any).isSelf || data.isSelf || uid === '0' || (ownerZaloId && uid === ownerZaloId));
        if (isSelf) return false;
      }
      if (cfg.onlyOwn) {
        const uid = String(msgData.uidFrom || (msg as any).uidFrom || data.fromId || '');
        const ownerZaloId = String(data.zaloId || '');
        const isSelf = !!((msg as any).isSelf || data.isSelf || uid === '0' || (ownerZaloId && uid === ownerZaloId));
        if (!isSelf) return false;
      }
      if (cfg.keyword) {
        const rawContent = msgData.content || (msg as any).content || data.content;
        const content = String((rawContent as any)?.msg || (typeof rawContent === 'string' ? rawContent : '') || '').toLowerCase();
        const kws: string[] = String(cfg.keyword).split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        const mode = cfg.keywordMode || 'contains_any';
        if (mode === 'contains_any' && !kws.some(k => content.includes(k))) return false;
        if (mode === 'contains_all' && !kws.every(k => content.includes(k))) return false;
        if (mode === 'equals' && !kws.includes(content)) return false;
        if (mode === 'starts_with' && !kws.some(k => content.startsWith(k))) return false;
        if (mode === 'regex') {
          try { if (!new RegExp(cfg.keyword, 'i').test(content)) return false; } catch { return false; }
        }
      }
    }

    if (triggerNode.type === 'trigger.groupEvent') {
      if (cfg.groupId) {
        const gid = String(data.groupId || '');
        if (!this.matchFilterId(gid, cfg.groupId)) return false;
      }
      if (cfg.eventType && cfg.eventType !== 'all' && data.eventType !== cfg.eventType) return false;
    }

    if (triggerNode.type === 'trigger.reaction') {
      const rx = data.reaction || {};
      const rData = rx.data || {};
      const threadId = String(rx.threadId || rData.threadId || data.threadId || '');
      if (cfg.threadId && threadId !== cfg.threadId) return false;
      if (cfg.reactionType && cfg.reactionType !== 'any') {
        const rawIcon = String(rData.content?.rIcon || rx.content?.rIcon || rx.rIcon || rData.rIcon || '');
        const emoji = rx.react || rx.reactionType || '';
        const EMOJI_TO_TYPE: Record<string, string> = {
          '👍': '1', '❤️': '2', '😂': '3', '😆': '3', '😮': '4', '😢': '5', '😭': '5', '😡': '6'
        };
        const ICON_TO_TYPE: Record<string, string> = {
          '/-strong': '1', '/-heart': '2', ':>': '3', ":')": '3', ':))': '3', ':o': '4', ':-((': '5', ':((': '5', ':-h': '6'
        };
        const eventReactionType = ICON_TO_TYPE[rawIcon] || EMOJI_TO_TYPE[emoji] || emoji || '';
        if (String(eventReactionType) !== String(cfg.reactionType)) return false;
      }
    }

    if (triggerNode.type === 'trigger.labelAssigned') {
      // action filter: 'any' | 'assigned' | 'removed'
      if (cfg.action && cfg.action !== 'any' && data.action !== cfg.action) return false;
      // source filter: 'any' | 'local' | 'zalo'
      if (cfg.labelSource && cfg.labelSource !== 'any') {
        const source = String(data.labelSource || 'zalo');
        if (source !== String(cfg.labelSource)) return false;
      }
      // New: labelIds array — contains "source:id" strings
      if (Array.isArray(cfg.labelIds) && cfg.labelIds.length > 0) {
        const eventSrc = String(data.labelSource || 'zalo');
        const matches = cfg.labelIds.some((item: string) => {
          if (typeof item === 'string' && item.includes(':')) {
            const [src, id] = item.split(':');
            return String(data.labelId) === String(id) && eventSrc === src;
          }
          return String(data.labelId) === String(item);
        });
        if (!matches) return false;
      } else {
        // Backward-compat: old single labelId / labelText fields
        if (cfg.labelId && String(data.labelId) !== String(cfg.labelId)) return false;
        if (cfg.labelText) {
          const needle = String(cfg.labelText).toLowerCase().trim();
          if (!String(data.labelText || '').toLowerCase().includes(needle)) return false;
        }
      }
    }

    if (triggerNode.type === 'trigger.payment') {
      const tx = data.transaction || data;
      // Filter by integration id
      if (cfg.integrationId && data.integrationId !== cfg.integrationId) return false;
      // Filter by minimum amount
      const amount = Number(tx.amount || tx.in || tx.amount_in || tx.amountIn || tx.transferAmount || 0);
      if (cfg.minAmount && amount < Number(cfg.minAmount)) return false;
      // Filter by description keyword
      if (cfg.descContains) {
        const desc = String(tx.description || tx.memo || tx.content || tx.transaction_content || tx.transactionContent || '').toLowerCase();
        if (!desc.includes(String(cfg.descContains).toLowerCase())) return false;
      }
    }

    if (triggerNode.type === 'trigger.webhook') {
      // Method filter - already checked in handleWebhook, but double-check
      if (cfg.method && cfg.method !== 'ANY' && data.method !== cfg.method) return false;
    }

    // ── Facebook trigger matching ───────────────────────────────────────────
    if (triggerNode.type === 'fb.trigger.message') {
      // Filter by threadId
      if (cfg.threadId && data.threadId !== cfg.threadId) return false;
      // Filter by threadType (DM vs Group) — Facebook group threads often have '_' in ID
      if (cfg.threadType !== undefined && cfg.threadType !== 'all') {
        const isGroup = !!(data.threadId && data.threadId.includes('_'));
        if (String(cfg.threadType) === '0' && isGroup) return false;
        if (String(cfg.threadType) === '1' && !isGroup) return false;
      }
      // Filter by sender (fromId)
      if (cfg.fromId) {
        const senderId = String(data.fromId || (data.message || {}).userID || '');
        if (!this.matchFilterId(senderId, cfg.fromId)) return false;
      }
      // Filter by group (groupId)
      if (cfg.groupId) {
        const gid = String(data.threadId || '');
        if (!this.matchFilterId(gid, cfg.groupId)) return false;
      }
      // Ignore own messages (default true)
      if (cfg.ignoreOwn !== false) {
        const msg = data.message || {};
        const senderId = String(data.fromId || msg.userID || '');
        const fbAccountId = String(data.fbAccountId || '');
        const isSelf = !!(msg.isSelf || data.isSelf || (fbAccountId && senderId === fbAccountId));
        if (isSelf) return false;
      }
      // Only own messages
      if (cfg.onlyOwn) {
        const msg = data.message || {};
        const senderId = String(data.fromId || msg.userID || '');
        const fbAccountId = String(data.fbAccountId || '');
        const isSelf = !!(msg.isSelf || data.isSelf || (fbAccountId && senderId === fbAccountId));
        if (!isSelf) return false;
      }
      // Keyword filter
      if (cfg.keyword) {
        const content = String(data.content || data.message?.body || '').toLowerCase();
        const kws: string[] = String(cfg.keyword).split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        const mode = cfg.keywordMode || 'contains_any';
        if (mode === 'contains_any' && !kws.some(k => content.includes(k))) return false;
        if (mode === 'contains_all' && !kws.every(k => content.includes(k))) return false;
        if (mode === 'equals' && !kws.includes(content)) return false;
        if (mode === 'starts_with' && !kws.some(k => content.startsWith(k))) return false;
      }
    }

    // ── Facebook media attachment triggers ────────────────────────────────
    if (['fb.trigger.image', 'fb.trigger.video', 'fb.trigger.file', 'fb.trigger.sticker'].includes(triggerNode.type)) {
      if (cfg.threadId && data.threadId !== cfg.threadId) return false;
      // Also verify the message actually has the matching attachment type
      const msg = data?.message || {};
      const att = msg.attachments || {};
      const attType = (att.attachmentType || '').toLowerCase();
      const expectedType = triggerNode.type.split('.').pop(); // image | video | file | sticker
      if (expectedType === 'file' && attType !== 'file' && attType !== 'audio') return false;
      if (expectedType === 'image' && attType !== 'image' && attType !== 'photo') return false;
      if (expectedType !== 'file' && expectedType !== 'image' && attType !== expectedType) return false;
    }

    // ── Facebook reaction trigger ─────────────────────────────────────────
    if (triggerNode.type === 'fb.trigger.reaction') {
      if (cfg.threadId && data.threadId !== cfg.threadId) return false;
      if (cfg.reactionType && cfg.reactionType !== 'any') {
        // FB event uses 'emoji' field; Zalo uses 'react'/'reactionType'
        const actualEmoji = data.emoji || data.react || data.reactionType || '';
        if (String(actualEmoji) !== String(cfg.reactionType)) return false;
      }
    }

    // ── Facebook unsend trigger ───────────────────────────────────────────
    if (triggerNode.type === 'fb.trigger.unsend') {
      if (cfg.threadId && data.threadId !== cfg.threadId) return false;
    }

    // ── Facebook group event trigger ──────────────────────────────────────
    if (triggerNode.type === 'fb.trigger.groupEvent') {
      if (cfg.threadId && data.threadId !== cfg.threadId) return false;
      if (cfg.eventType && cfg.eventType !== 'all' && data.type !== cfg.eventType) return false;
    }

    return true;
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  public async executeWorkflow(
    wf: Workflow,
    triggerData: any,
    triggeredBy: string = 'manual',
    isSandbox: boolean = false
  ): Promise<WorkflowRunLog> {
    if (!this.isRunnableWorkflow(wf)) {
      throw new Error('Workflow không hỗ trợ chạy (channel unknown)');
    }

    const runId = uuidv4();
    const startedAt = Date.now();
    const nodeResults: NodeResult[] = [];

    // Flatten trigger data for template access
    const flatTrigger = this.flattenTriggerData(triggerData, triggeredBy);

    // Tự động tìm tên nhóm (groupName) từ DB nếu threadId/groupId là nhóm chat
    const groupId = flatTrigger.groupId || flatTrigger.threadId;
    if (groupId && typeof groupId === 'string' && groupId.startsWith('g')) {
      try {
        const db = DatabaseService.getInstance();
        if (db && (db as any).initialized) {
          const groupRow = (db as any).query(
            `SELECT display_name FROM contacts WHERE contact_id = ? LIMIT 1`,
            [groupId]
          )?.[0];
          if (groupRow) {
            flatTrigger.groupName = groupRow.display_name;
          }
        }
      } catch (err: any) {
        Logger.error(`[WorkflowEngine] Failed to fetch group name from DB:`, err.message);
      }
    }

    // Tự động làm giàu dữ liệu (enrich) cho Trigger từ CRM nếu có thông tin khách hàng (contactId)
    // Nếu threadId bắt đầu bằng 'g' (nhóm), contactId chính là fromId hoặc userId của người gửi/thành viên
    let contactId = '';
    if (flatTrigger.threadId && typeof flatTrigger.threadId === 'string' && !flatTrigger.threadId.startsWith('g')) {
      contactId = flatTrigger.threadId;
    } else {
      contactId = flatTrigger.fromId || flatTrigger.userId || '';
    }

    if (contactId && typeof contactId === 'string' && !contactId.startsWith('g')) {
      try {
        const db = DatabaseService.getInstance();
        if (db && (db as any).initialized) {
          const ownerZaloId = wf.pageIds[0] || wf.pageId || flatTrigger.zaloId || triggerData?.zaloId || '';
          
          let contactRow = null;
          if (ownerZaloId) {
            contactRow = (db as any).query(
              `SELECT display_name, alias, phone, salutation, avatar_url, gender, birthday, pipeline_stage_id, ai_profile, extra_data FROM contacts WHERE owner_zalo_id = ? AND contact_id = ? LIMIT 1`,
              [ownerZaloId, contactId]
            )?.[0];
          } else {
            contactRow = (db as any).query(
              `SELECT display_name, alias, phone, salutation, avatar_url, gender, birthday, pipeline_stage_id, ai_profile, extra_data FROM contacts WHERE contact_id = ? LIMIT 1`,
              [contactId]
            )?.[0];
          }
          
          let friendRow = null;
          if (ownerZaloId) {
            friendRow = (db as any).query(
              `SELECT display_name, avatar, phone FROM friends WHERE owner_zalo_id = ? AND user_id = ? LIMIT 1`,
              [ownerZaloId, contactId]
            )?.[0];
          } else {
            friendRow = (db as any).query(
              `SELECT display_name, avatar, phone FROM friends WHERE user_id = ? LIMIT 1`,
              [contactId]
            )?.[0];
          }

          if (contactRow || friendRow) {
            const genderVal = contactRow?.gender;
            const genderGreeting = genderVal === 0 ? 'Anh' : (genderVal === 1 ? 'Chị' : 'Bạn');

            flatTrigger.salutation = contactRow?.salutation || genderGreeting;
            flatTrigger.alias = contactRow?.alias || '';
            flatTrigger.zalo_name = contactRow?.display_name || friendRow?.display_name || flatTrigger.fromName || '';
            flatTrigger.zaloName = flatTrigger.zalo_name;
            flatTrigger.aiProfile = contactRow?.ai_profile || '';
            flatTrigger.displayName = contactRow?.alias || contactRow?.display_name || friendRow?.display_name || flatTrigger.fromName || flatTrigger.displayName || '';
            flatTrigger.display_name = flatTrigger.displayName;
            flatTrigger.fromName = flatTrigger.displayName;
            flatTrigger.phone = contactRow?.phone || friendRow?.phone || flatTrigger.fromPhone || flatTrigger.phone || '';
            flatTrigger.fromPhone = flatTrigger.phone;
            flatTrigger.avatar = contactRow?.avatar_url || friendRow?.avatar || '';
            flatTrigger.birthday = contactRow?.birthday || '';
            flatTrigger.gender = contactRow?.gender !== undefined ? contactRow.gender : '';
            flatTrigger.pipeline_stage_id = contactRow?.pipeline_stage_id || '';
            
            if (contactRow?.extra_data) {
              try {
                const parsed = JSON.parse(contactRow.extra_data);
                flatTrigger.extraData = parsed;
                Object.assign(flatTrigger, parsed);
              } catch (e) {
                flatTrigger.extraData = {};
              }
            } else {
              flatTrigger.extraData = {};
            }
          }
        }
      } catch (err: any) {
        Logger.error(`[WorkflowEngine] Failed to enrich trigger with CRM data:`, err.message);
      }
    }

    // Fallback displayName/display_name từ event data nếu chưa có
    if (!flatTrigger.displayName) {
      flatTrigger.displayName = flatTrigger.actorName || flatTrigger.targetNames || '';
      flatTrigger.display_name = flatTrigger.displayName;
    }

    const context: ExecutionContext = {
      trigger: flatTrigger,
      nodes: {},
      variables: {},
      pageId: wf.pageIds[0] || wf.pageId || triggerData?.zaloId || '',
      skippedNodes: new Set(),
      _wfNodes: wf.nodes,
      _wfEdges: wf.edges,
      _wfName: wf.name,
      isSandbox,
      _triggeredBy: triggeredBy,
      _runId: runId,
      _wfId: wf.id,
    };

    const order = this.topologicalSort(wf);
    let status: 'success' | 'error' | 'partial' = 'success';
    let errorMessage: string | undefined;

    for (const nodeId of order) {
      const node = wf.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const t0 = Date.now();

      if (context.skippedNodes.has(nodeId)) {
        nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'skipped', input: {}, output: { _skipped: true }, durationMs: 0 });
        // Propagate skip to downstream nodes
        this.markDownstreamSkipped(nodeId, wf, context.skippedNodes);
        continue;
      }

      let renderedConfig: Record<string, any> = {};
      try {
        renderedConfig = this.renderConfig(node.config, context, nodeId);
        
        // Coerce message field to string for message-sending nodes to prevent crashes if an object is passed
        if (node.type === 'zalo.sendMessage' || node.type === 'fb.action.sendMessage') {
          if (renderedConfig.message !== undefined && renderedConfig.message !== null && typeof renderedConfig.message !== 'string') {
            renderedConfig.message = typeof renderedConfig.message === 'object' ? JSON.stringify(renderedConfig.message) : String(renderedConfig.message);
          }
        }

        if (node.type === 'zalo.sendMessage') {
          const rawMsg = typeof node.config.message === 'string' ? node.config.message : JSON.stringify(node.config.message || '');
          const rendMsg = typeof renderedConfig.message === 'string' ? renderedConfig.message : JSON.stringify(renderedConfig.message || '');
          Logger.info(`[WorkflowEngine] sendMessage BEFORE: raw="${rawMsg.substring(0, 300)}" → rendered="${rendMsg.substring(0, 300)}"`);
        }
        
        let output: Record<string, any> = {};
        if (node.type === 'logic.forEach') {
          output = await this.executeNode(node, renderedConfig, context, wf);
          context.nodes[nodeId] = { output };

          const items = output.items || [];
          const itemVar = node.config.itemVariable || 'item';
          const downstreamIds = this.getDownstreamNodes(nodeId, wf);
          const loopOrder = order.filter(id => downstreamIds.has(id));

          // Thêm các node hạ nguồn vào skippedNodes để vòng lặp cha bỏ qua chúng
          for (const id of downstreamIds) {
            context.skippedNodes.add(id);
          }

          Logger.info(`[WorkflowEngine] Entering forEach loop "${node.label}" with ${items.length} items. Downstream nodes: ${loopOrder.join(', ')}`);

          // Chạy lặp qua từng phần tử
          for (let index = 0; index < items.length; index++) {
            const item = items[index];
            context.variables[itemVar] = item;
            context.variables['index'] = index;

            // Khởi tạo tập hợp các node bị bỏ qua cho riêng lần lặp này
            const iterationSkipped = new Set<string>();
            for (const sk of context.skippedNodes) {
              if (!downstreamIds.has(sk)) {
                iterationSkipped.add(sk);
              }
            }

            for (const childNodeId of loopOrder) {
              const childNode = wf.nodes.find(n => n.id === childNodeId);
              if (!childNode) continue;
              const childT0 = Date.now();

              if (iterationSkipped.has(childNodeId)) {
                nodeResults.push({
                  nodeId: childNodeId,
                  nodeType: childNode.type,
                  label: `${childNode.label} (Lần ${index + 1})`,
                  status: 'skipped',
                  input: {},
                  output: { _skipped: true },
                  durationMs: 0
                });
                this.markDownstreamSkipped(childNodeId, wf, iterationSkipped);
                continue;
              }

              let childRenderedConfig: Record<string, any> = {};
              try {
                childRenderedConfig = this.renderConfig(childNode.config, context, childNodeId);
                const childOutput = await this.executeNode(childNode, childRenderedConfig, context, wf);
                context.nodes[childNodeId] = { output: childOutput };

                if (childNode.type === 'logic.if') {
                  const res = childOutput.result as boolean;
                  for (const edge of wf.edges.filter(e => e.source === childNodeId)) {
                    if (edge.sourceHandle === 'true' && !res) {
                      iterationSkipped.add(edge.target);
                      this.markDownstreamSkipped(edge.target, wf, iterationSkipped);
                    }
                    if (edge.sourceHandle === 'false' && res) {
                      iterationSkipped.add(edge.target);
                      this.markDownstreamSkipped(edge.target, wf, iterationSkipped);
                    }
                  }
                }

                if (childNode.type === 'logic.switch') {
                  const matchedHandle = childOutput.matchedHandle as string;
                  for (const edge of wf.edges.filter(e => e.source === childNodeId)) {
                    if (edge.sourceHandle !== matchedHandle) {
                      iterationSkipped.add(edge.target);
                      this.markDownstreamSkipped(edge.target, wf, iterationSkipped);
                    }
                  }
                }

                nodeResults.push({
                  nodeId: childNodeId,
                  nodeType: childNode.type,
                  label: `${childNode.label} (Lần ${index + 1})`,
                  status: 'success',
                  input: this.truncateData(childRenderedConfig),
                  output: this.truncateData(childOutput),
                  durationMs: Date.now() - childT0
                });
              } catch (childErr: any) {
                if (childErr.message === '__STOP__') {
                  nodeResults.push({
                    nodeId: childNodeId,
                    nodeType: childNode.type,
                    label: `${childNode.label} (Lần ${index + 1})`,
                    status: 'success',
                    input: this.truncateData(childRenderedConfig),
                    output: { stopped: true },
                    durationMs: Date.now() - childT0
                  });
                  break;
                }
                const errorOutput: Record<string, any> = {};
                errorOutput._errorType = 'execution_error';
                if (childErr.response) {
                  errorOutput._errorType = 'http_error';
                  errorOutput._httpStatus = childErr.response.status;
                  errorOutput._httpStatusText = childErr.response.statusText;
                  errorOutput._responseData = this.truncateData(childErr.response.data);
                  errorOutput._responseHeaders = childErr.response.headers;
                } else if (childErr.request) {
                  errorOutput._errorType = 'network_error';
                  errorOutput._requestSummary = `${childErr.request.method || ''} ${childErr.request.url || ''}`;
                }
                if (childErr.code) errorOutput._errorCode = childErr.code;
                if (childErr.message) errorOutput._errorMessage = childErr.message;
                nodeResults.push({
                  nodeId: childNodeId,
                  nodeType: childNode.type,
                  label: `${childNode.label} (Lần ${index + 1})`,
                  status: 'error',
                  input: this.truncateData(childRenderedConfig),
                  output: this.truncateData(errorOutput),
                  durationMs: Date.now() - childT0,
                  error: childErr.message
                });
                if (!childNode.config.continueOnError) {
                  throw childErr;
                }
              }
            }
          }
        } else {
          output = await this.executeNode(node, renderedConfig, context, wf);
          context.nodes[nodeId] = { output };
        }

        if (node.type === 'ai.generateText') {
          Logger.info(`[WorkflowEngine] AI chat output stored: keys=${output ? Object.keys(output).join(',') : 'null'}, result="${typeof output === 'object' && output ? (output.result || '').substring(0, 200) : String(output).substring(0, 200)}"`);
        }

        // If this is an IF node, mark the wrong branch as skipped
        if (node.type === 'logic.if') {
          const result = output.result as boolean;
          for (const edge of wf.edges.filter(e => e.source === nodeId)) {
            if (edge.sourceHandle === 'true' && !result) {
              context.skippedNodes.add(edge.target);
              this.markDownstreamSkipped(edge.target, wf, context.skippedNodes);
            }
            if (edge.sourceHandle === 'false' && result) {
              context.skippedNodes.add(edge.target);
              this.markDownstreamSkipped(edge.target, wf, context.skippedNodes);
            }
          }
        }

        // switch node: mark all non-matching cases
        if (node.type === 'logic.switch') {
          const matchedHandle = output.matchedHandle as string;
          for (const edge of wf.edges.filter(e => e.source === nodeId)) {
            if (edge.sourceHandle !== matchedHandle) {
              context.skippedNodes.add(edge.target);
              this.markDownstreamSkipped(edge.target, wf, context.skippedNodes);
            }
          }
        }

        nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'success', input: this.truncateData(renderedConfig), output: this.truncateData(output), durationMs: Date.now() - t0 });
      } catch (err: any) {
        // logic.stopIf signals a graceful stop — treat as success, halt loop
        if (err.message === '__STOP__') {
          nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'success', input: this.truncateData(renderedConfig), output: { stopped: true }, durationMs: Date.now() - t0 });
          break;
        }
        // Checkpoint saved — workflow tạm dừng, không phải lỗi
        if (err instanceof CheckpointError) {
          nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'success', input: this.truncateData(renderedConfig), output: { _checkpoint: err.checkpointId, resumeAt: err.resumeAt }, durationMs: Date.now() - t0 });
          const waitingLog: WorkflowRunLog = {
            id: runId, workflowId: wf.id, workflowName: wf.name,
            triggeredBy, startedAt, finishedAt: Date.now(),
            status: 'waiting',
            errorMessage: `Đang chờ — resume lúc ${new Date(err.resumeAt).toLocaleString('vi-VN')}`,
            nodeResults,
          };
          DatabaseService.getInstance().saveWorkflowRunLog(waitingLog);
          EventBroadcaster.emit('workflow:executed', { workflowId: wf.id, runId, status: 'waiting' });
          return waitingLog;
        }
        // Build rich error output from axios/HTTP errors
        const errorOutput: Record<string, any> = {};
        errorOutput._errorType = 'execution_error';
        if (err.response) {
          errorOutput._errorType = 'http_error';
          errorOutput._httpStatus = err.response.status;
          errorOutput._httpStatusText = err.response.statusText;
          errorOutput._responseData = this.truncateData(err.response.data);
          errorOutput._responseHeaders = err.response.headers;
        } else if (err.request) {
          errorOutput._errorType = 'network_error';
          errorOutput._requestSummary = `${err.request.method || ''} ${err.request.url || ''}`;
        }
        if (err.code) errorOutput._errorCode = err.code;
        if (err.message) errorOutput._errorMessage = err.message;
        if (err.stack) errorOutput._stackTrace = err.stack.split('\n').slice(0, 6).join('\n');
        nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'error', input: this.truncateData(renderedConfig), output: this.truncateData(errorOutput), durationMs: Date.now() - t0, error: err.message });
        if (node.config.continueOnError) {
          status = 'partial';
        } else {
          status = 'error';
          errorMessage = `Node "${node.label || node.type}" lỗi: ${err.message}`;
          break;
        }
      }
    }

    const log: WorkflowRunLog = {
      id: runId, workflowId: wf.id, workflowName: wf.name,
      triggeredBy, startedAt, finishedAt: Date.now(),
      status, errorMessage, nodeResults,
    };

    DatabaseService.getInstance().saveWorkflowRunLog(log);
    EventBroadcaster.emit('workflow:executed', { workflowId: wf.id, runId, status });
    return log;
  }

  /**
   * Resume một workflow từ checkpoint đã lưu trong DB.
   * Được gọi bởi CheckpointScheduler mỗi phút.
   */
  public async resumeFromCheckpoint(cp: {
    id: string;
    workflow_id: string;
    workflow_name: string;
    triggered_by: string;
    run_id: string;
    resume_at: number;
    created_at: number;
    resume_node_id: string;
    wait_label: string;
    context_json: string;
  }): Promise<WorkflowRunLog | null> {
    const db = DatabaseService.getInstance();

    // Kiểm tra workflow còn tồn tại và đang enabled
    const wf = this.workflows.get(cp.workflow_id);
    if (!wf || !wf.enabled) {
      const reason = !wf ? 'Workflow đã bị xóa' : 'Workflow đang tắt (disabled)';
      Logger.warn(`[WorkflowEngine] Checkpoint ${cp.id}: ${reason}`);
      db.markCheckpointFailed(cp.id, reason);
      // Gửi thông báo đến renderer
      EventBroadcaster.emit('workflow:checkpointCancelled', {
        checkpointId: cp.id,
        workflowName: cp.workflow_name,
        reason,
      });
      return null;
    }

    const startedAt = Date.now();
    const nodeResults: NodeResult[] = [];
    let status: 'success' | 'error' | 'partial' | 'waiting' = 'success';
    let errorMessage: string | undefined;

    try {
      // Deserialize context từ checkpoint
      const ctx: ExecutionContext = deserializeContext(cp.context_json);
      // Restore wf snapshot từ context (đã được lưu lúc serialize)
      if (!ctx._wfNodes || ctx._wfNodes.length === 0) {
        ctx._wfNodes = wf.nodes;
        ctx._wfEdges = wf.edges;
      }
      ctx._triggeredBy = cp.triggered_by;
      ctx._runId = cp.run_id;

      // Tính thứ tự topological từ snapshot nodes/edges
      const snapshotWf: Workflow = {
        ...wf,
        nodes: ctx._wfNodes as WorkflowNode[],
        edges: (ctx._wfEdges || wf.edges) as WorkflowEdge[],
      };
      const order = this.topologicalSort(snapshotWf);

      // Tìm vị trí resume: bắt đầu từ node SAU logic.wait
      const waitIndex = order.indexOf(cp.resume_node_id);
      // resume_node_id là node đầu tiên cần chạy sau khi wait xong
      const remainingOrder = waitIndex >= 0 ? order.slice(waitIndex) : order;

      Logger.log(`[WorkflowEngine] Resuming checkpoint ${cp.id} for "${wf.name}" — ${remainingOrder.length} nodes remaining`);

      for (const nodeId of remainingOrder) {
        const node = snapshotWf.nodes.find(n => n.id === nodeId);
        if (!node) continue;
        const t0 = Date.now();

        if (ctx.skippedNodes.has(nodeId)) {
          nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'skipped', input: {}, output: { _skipped: true }, durationMs: 0 });
          this.markDownstreamSkipped(nodeId, snapshotWf, ctx.skippedNodes);
          continue;
        }

        let renderedConfig: Record<string, any> = {};
        try {
          renderedConfig = this.renderConfig(node.config, ctx, nodeId);
          const output = await this.executeNode(node, renderedConfig, ctx, snapshotWf);
          ctx.nodes[nodeId] = { output };

          if (node.type === 'logic.if') {
            const result = output.result as boolean;
            for (const edge of snapshotWf.edges.filter(e => e.source === nodeId)) {
              if (edge.sourceHandle === 'true'  && !result) { ctx.skippedNodes.add(edge.target); this.markDownstreamSkipped(edge.target, snapshotWf, ctx.skippedNodes); }
              if (edge.sourceHandle === 'false' && result)  { ctx.skippedNodes.add(edge.target); this.markDownstreamSkipped(edge.target, snapshotWf, ctx.skippedNodes); }
            }
          }
          if (node.type === 'logic.switch') {
            const matchedHandle = output.matchedHandle as string;
            for (const edge of snapshotWf.edges.filter(e => e.source === nodeId)) {
              if (edge.sourceHandle !== matchedHandle) { ctx.skippedNodes.add(edge.target); this.markDownstreamSkipped(edge.target, snapshotWf, ctx.skippedNodes); }
            }
          }

          nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'success', input: this.truncateData(renderedConfig), output: this.truncateData(output), durationMs: Date.now() - t0 });
        } catch (err: any) {
          if (err.message === '__STOP__') {
            nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'success', input: this.truncateData(renderedConfig), output: { stopped: true }, durationMs: Date.now() - t0 });
            break;
          }
          // Nested checkpoint (wait bên trong resume) — lưu checkpoint mới
          if (err instanceof CheckpointError) {
            const log: WorkflowRunLog = {
              id: cp.run_id, workflowId: wf.id, workflowName: wf.name,
              triggeredBy: cp.triggered_by, startedAt, finishedAt: Date.now(),
              status: 'waiting',
              errorMessage: `Đang chờ tiếp — resume lúc ${new Date(err.resumeAt).toLocaleString('vi-VN')}`,
              nodeResults,
            };
            db.saveWorkflowRunLog(log);
            db.markCheckpointDone(cp.id);
            return log;
          }
          nodeResults.push({ nodeId, nodeType: node.type, label: node.label, status: 'error', input: this.truncateData(renderedConfig), output: { _errorMessage: err.message }, durationMs: Date.now() - t0, error: err.message });
          if (!node.config?.continueOnError) {
            status = 'error';
            errorMessage = `Node "${node.label || node.type}" lỗi: ${err.message}`;
            break;
          }
          status = 'partial';
        }
      }
    } catch (err: any) {
      status = 'error';
      errorMessage = err.message;
      Logger.error(`[WorkflowEngine] resumeFromCheckpoint ${cp.id} error: ${err.message}`);
    }

    const log: WorkflowRunLog = {
      id: cp.run_id, workflowId: wf.id, workflowName: wf.name,
      triggeredBy: cp.triggered_by, startedAt, finishedAt: Date.now(),
      status: (['error', 'success', 'partial'] as const).includes(status as any) ? (status as 'error' | 'success' | 'partial') : 'success',
      errorMessage,
      nodeResults,
    };
    db.saveWorkflowRunLog(log);
    EventBroadcaster.emit('workflow:executed', { workflowId: wf.id, runId: cp.run_id, status });
    return log;
  }

  private markDownstreamSkipped(nodeId: string, wf: Workflow, skipped: Set<string>): void {
    for (const edge of wf.edges.filter(e => e.source === nodeId)) {
      if (!skipped.has(edge.target)) {
        skipped.add(edge.target);
        this.markDownstreamSkipped(edge.target, wf, skipped);
      }
    }
  }

  private getDownstreamNodes(nodeId: string, wf: Workflow): Set<string> {
    const result = new Set<string>();
    const traverse = (currentId: string) => {
      for (const edge of wf.edges.filter(e => e.source === currentId)) {
        if (!result.has(edge.target)) {
          result.add(edge.target);
          traverse(edge.target);
        }
      }
    };
    traverse(nodeId);
    return result;
  }

  private flattenTriggerData(data: any, triggerType: string): Record<string, any> {
    if (!data) return {};
    if (triggerType === 'trigger.message' || triggerType.startsWith('event:message')) {
      // data = { zaloId, message } where message is zca-js UserMessage | GroupMessage:
      //   { type: 0|1 (ThreadType), data: TMessage, threadId: string, isSelf: boolean }
      // All payload fields live inside message.data (msgData), NOT at top-level of message.
      const msg     = data.data || data.message || {};           // UserMessage | GroupMessage
      const msgData = (msg as any).data || {};                   // TMessage: uidFrom, msgId, ts, dName, content...
      // type === 1 (ThreadType.Group) is the ONLY reliable group indicator in zca-js
      const isGroup   = (msg as any).type === 1 || !!(msg as any).isGroup || !!(data.isGroup);
      const threadType = data.threadType !== undefined
        ? Number(data.threadType)
        : (isGroup ? 1 : 0);
      const rawContent = msgData.content || (msg as any).content || data.content;
      const msgType = String(msgData.msgType || (msg as any).msgType || '');
      let content = String((rawContent as any)?.msg || (typeof rawContent === 'string' ? rawContent : '') || '');
      // Link cards (chat.recommended) often store user text inside content.title, not content.msg.
      if (!content && rawContent && typeof rawContent === 'object') {
        if (msgType === 'chat.recommended' || msgType === 'chat.link') {
          content = String((rawContent as any).title || (rawContent as any).href || '');
        } else {
          content = String((rawContent as any).title || '');
        }
      }
      // Extract image URLs from message content for $trigger.images
      const images: string[] = [];
      if (rawContent && typeof rawContent === 'object') {
        let params: any = (rawContent as any).params;
        if (typeof params === 'string') { try { params = JSON.parse(params); } catch { params = null; } }
        const hdUrl = params?.hd || params?.rawUrl || '';
        if (hdUrl) images.push(hdUrl);
        const thumbUrl = (rawContent as any).thumb || (rawContent as any).normalUrl || (rawContent as any).hdUrl || '';
        if (thumbUrl && !images.includes(thumbUrl)) images.push(thumbUrl);
      }
      return {
        fromId:      msgData.uidFrom    || (msg as any).uidFrom    || data.fromId    || '',
        fromName:    data.fromName      || msgData.dName            || (msg as any).fromName || '',
        fromPhone:   data.fromPhone     || (msg as any).fromPhone   || '',
        content,
        images,
        threadId:    (msg as any).threadId || data.threadId        || msgData.idTo   || '',
        threadType,
        isGroup,
        groupName:   data.groupName     || (msg as any).groupName  || '',
        msgId:       msgData.msgId      || (msg as any).msgId       || data.msgId    || '',
        timestamp:   Number(msgData.ts) || Number((msg as any).ts) || data.timestamp || Date.now(),
        isSelf:      !!((msg as any).isSelf || data.isSelf || (msgData.uidFrom && data.zaloId && String(msgData.uidFrom) === String(data.zaloId)) || msgData.uidFrom === '0'),
        zaloId:      data.zaloId || '',
      };
    }
    if (triggerType === 'trigger.friendRequest' || triggerType.startsWith('event:friendRequest')) {
      const d = data.requester || data.data || data;
      const userId = String(d.userId || d.uid || data.userId || data.threadId || '');
      return {
        userId,
        threadId: userId,
        threadType: 0,
        isGroup: false,
        displayName: d.displayName || d.dName || data.displayName || data.fromName || 'Người Dùng Thử Nghiệm',
        phone: d.phone || d.phoneNumber || data.phone || '',
        message: d.msg || d.message || data.message || '',
        zaloId: data.zaloId || '',
      };
    }
    if (triggerType === 'trigger.groupEvent' || triggerType.startsWith('event:groupEvent')) {
      const d = data.data || data;
      let members: any[] = d.updateMembers || [];
      if (members.length === 0 && data.threadId) {
        members = [{ dName: 'Thành Viên Thử Nghiệm', id: 'mock_member_123' }];
      }
      const groupId = String(data.groupId || d.groupId || data.threadId || '');
      const memberId = members[0]?.id || members[0]?.uid || members[0]?.userId || '';
      return {
        groupId,
        threadId: groupId,
        threadType: 1,
        isGroup: true,
        eventType: data.eventType || 'join',
        fromId: memberId,
        userId: memberId,
        actorName: members[0]?.dName || members[0]?.zaloName || '',
        targetNames: members.map((m: any) => m.dName || m.zaloName || m.id || '').filter(Boolean).join(', '),
        systemText: data.systemText || '',
        zaloId: data.zaloId || '',
      };
    }
    if (triggerType === 'trigger.reaction' || triggerType.startsWith('event:reaction')) {
      const rx = data.reaction || {};
      const rData = rx.data || {};
      const rawIcon = String(rData.content?.rIcon || rx.content?.rIcon || rx.rIcon || rData.rIcon || '');
      const ICON_MAP: Record<string, string> = {
        '/-heart': '❤️', '/-strong': '👍', ':>': '😆', ':o': '😮',
        ':-((':  '😢', ':-h': '😡', ':-*': '😘', ":')": '😂',
        '/-shit': '💩', '/-rose': '🌹', '/-break': '💔', '/-weak': '👎',
        ';xx': '😍', ';-/': '😕', ';-)': '😉', '/-fade': '🥱',
        '_()_': '🙏', '/-no': '🙅', '/-ok': '👌', '/-v': '✌️',
        '/-thanks': '🙏', '/-punch': '👊', ':-bye': '👋', ':((': '😭',
        ':))': '😁', '$-)': '🤑',
      };
      const emoji = ICON_MAP[rawIcon] || rx.react || rx.reactionType || rawIcon || '';
      const rMsg = rData.content?.rMsg || rx.content?.rMsg || [];
      const targetMsgId = rMsg.length > 0
        ? String(rMsg[0].gMsgID || rMsg[0].cMsgID || '')
        : String(rData.msgId || rx.msgId || data.msgId || '');
      const threadId = String(rx.threadId || rData.threadId || data.threadId || '');
      const isGroup = threadId.startsWith('g');
      const threadType = isGroup ? 1 : 0;
      return {
        fromId: String(rData.uidFrom || rx.uidFrom || data.fromId || ''),
        fromName: data.fromName || rData.dName || rx.fromName || 'Người Dùng Thử Nghiệm',
        msgId: targetMsgId,
        threadId,
        threadType,
        isGroup,
        react: emoji,
        reactionType: emoji,
        zaloId: data.zaloId || '',
      };
    }
    if (triggerType === 'trigger.labelAssigned') {
      return {
        zaloId:      data.zaloId || '',
        threadId:    data.threadId || '',
        threadType:  data.threadType ?? 0,
        labelId:     data.labelId ?? '',
        labelText:   data.labelText || '',
        labelColor:  data.labelColor || '',
        labelEmoji:  data.labelEmoji || '',
        labelSource: data.labelSource || 'zalo',
        action:      data.action || 'assigned',   // 'assigned' | 'removed'
      };
    }
    if (triggerType === 'trigger.webhook') {
      return {
        webhookToken: data.webhookToken || '',
        body:         data.body || {},
        headers:      data.headers || {},
        method:       data.method || 'POST',
        query:        data.query || {},
        rawBody:      data.rawBody || '',
      };
    }
    if (triggerType === 'trigger.payment' || triggerType === 'integration:payment') {
      const tx = data.transaction || data;
      return {
        integrationId:   data.integrationId || '',
        integrationType: data.integrationType || '',
        amount:          tx.amount || tx.in || tx.amount_in || tx.amountIn || tx.transferAmount || 0,
        description:     tx.description || tx.memo || tx.content || tx.transaction_content || tx.transactionContent || '',
        bankName:        tx.bankName || tx.bank_name || tx.gateway || '',
        accountNumber:   tx.accountNumber || tx.bank_acc_id || tx.account_number || '',
        transactionId:   tx.id || tx.transaction_id || tx.tid || '',
        transactionDate: tx.when || tx.transactionDate || tx.created_at || tx.transaction_date || '',
        when:            tx.when || tx.transactionDate || tx.created_at || tx.transaction_date || '',
        fromAccount:     tx.fromAccount || tx.from_account || tx.senderAccount || tx.sender_account || '',
        toAccount:       tx.toAccount || tx.to_account || tx.accountNumber || tx.account_number || tx.bank_acc_id || '',
        raw:             tx,
      };
    }
    if (triggerType === 'fb.trigger.unsend') {
      // fb:onUnsend: { fbAccountId, messageId }
      return {
        fbAccountId: data.fbAccountId || '',
        messageId: data.messageId || '',
        threadId: data.threadId || '',
        fromId: '',
        content: '',
        body: '',
        attachments: null,
        isSelf: false,
        emoji: '',
        timestamp: Date.now(),
      };
    }
    if (triggerType === 'fb.trigger.groupEvent') {
      // fb:onGroupEvent: { fbAccountId, threadId, type, participantId, participants, actorFbId }
      return {
        fbAccountId: data.fbAccountId || '',
        messageId: '',
        threadId: data.threadId || '',
        fromId: data.actorFbId || '',
        content: '',
        body: '',
        groupEventType: data.type || '',
        participantId: data.participantId || '',
        participants: data.participants || [],
        actorFbId: data.actorFbId || '',
        attachments: null,
        isSelf: false,
        emoji: '',
        timestamp: Date.now(),
      };
    }
    if (triggerType.startsWith('fb.trigger.')) {
      const msg = data.message || {};
      return {
        fbAccountId: data.fbAccountId || '',
        messageId: data.messageId || '',
        threadId: data.threadId || msg.threadId || msg.replyToID || '',
        fromId: msg.userID || data.userId || data.fromId || '',
        content: msg.body || '',
        body: msg.body || '',
        attachments: msg.attachments || null,
        isSelf: !!(msg.isSelf || data.isSelf),
        emoji: data.emoji || '',
        timestamp: Number(msg.timestamp || data.timestamp || msg.timestamp_precise || Date.now()),
      };
    }
    return { ...data };
  }

  private executeSandboxNode(
    node: WorkflowNode,
    cfg: Record<string, any>,
    ctx: ExecutionContext
  ): Record<string, any> | null {
    if (!ctx.isSandbox) return null;

    const type = node.type;
    
    // AI Actions
    if (type === 'ai.generateText') {
      return { result: `[Sandbox AI Mock] Trả lời giả lập cho prompt: "${cfg.prompt || ''}"`, totalTokens: 100, model: 'sandbox-model', _sandbox: true };
    }
    if (type === 'ai.classify') {
      const categories: string[] = String(cfg.categories || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      const matchedCategory = categories[0] || 'default';
      return { category: matchedCategory, input: cfg.input || '', _sandbox: true };
    }

    // Logic wait & Zalo getProfile mock for sandbox testing
    if (type === 'logic.wait') {
      let ms = 0;
      if (cfg.delayMs !== undefined && cfg.delayMs !== null) {
        ms = Number(cfg.delayMs);
      } else if (cfg.delaySeconds !== undefined && cfg.delaySeconds !== null && cfg.delaySeconds !== '') {
        ms = Number(cfg.delaySeconds) * 1000;
      } else {
        const d = Number(cfg.days || 0);
        const h = Number(cfg.hours || 0);
        const m = Number(cfg.minutes || 0);
        const s = Number(cfg.seconds || 0);
        ms = (d * 86400 + h * 3600 + m * 60 + s) * 1000;
      }
      return { waited: ms, _sandbox: true };
    }
    if (type === 'zalo.getUserInfo') {
      return {
        userId: cfg.userId || 'mock_user_id',
        displayName: 'Khách Hàng Sandbox',
        avatarUrl: 'https://avatar.talk.zdn.vn/default',
        phone: '0901234567',
        isFriend: 1,
        _sandbox: true
      };
    }
    if (type === 'zalo.getMessageHistory') {
      return {
        output: 'Khách hàng: Chào shop, shop có sản phẩm A không?\nShop: Dạ shop có ạ, giá sản phẩm A là 200k ạ.\nKhách hàng: Ship cho mình 1 cái đến quận 1 nhé.',
        messages: [
          { senderId: 'customer', senderName: 'Khách hàng', content: 'Chào shop, shop có sản phẩm A không?', timestamp: Date.now() - 10000 },
          { senderId: 'shop', senderName: 'Shop', content: 'Dạ shop có ạ, giá sản phẩm A là 200k ạ.', timestamp: Date.now() - 8000 },
          { senderId: 'customer', senderName: 'Khách hàng', content: 'Ship cho mình 1 cái đến quận 1 nhé.', timestamp: Date.now() - 5000 }
        ],
        _sandbox: true
      };
    }
    if (type === 'payment.getTransactions') {
      return {
        transactions: [
          { transactionId: 'TX1001', amount: 200000, description: 'ZAGI SPX1', bankName: 'Vietcombank', timestamp: Date.now() },
          { transactionId: 'TX1002', amount: 350000, description: 'ZAGI SPX2', bankName: 'Techcombank', timestamp: Date.now() }
        ],
        count: 2,
        totalAmount: 550000,
        _sandbox: true
      };
    }
    
    // Zalo Actions
    if (type === 'zalo.sendMessage') {
      return { msgId: `mock_zalo_msg_${Date.now()}`, success: true, _sandbox: true };
    }
    if (type === 'zalo.sendTyping') {
      return { success: true, delayMs: 100, _sandbox: true };
    }
    if (type === 'zalo.sendImage' || type === 'zalo.sendFile' || type === 'zalo.sendVoice') {
      return { msgId: `mock_zalo_media_${Date.now()}`, success: true, _sandbox: true };
    }
    if (type === 'zalo.forwardMessage') {
      return { success: true, _sandbox: true };
    }
    if (type === 'zalo.undoMessage') {
      return { success: true, _sandbox: true };
    }
    if (type === 'zalo.addReaction') {
      return { success: true, _sandbox: true };
    }
    if (type === 'zalo.acceptFriendRequest' || type === 'zalo.rejectFriendRequest' || type === 'zalo.sendFriendRequest') {
      return { success: true, _sandbox: true };
    }
    if (type === 'zalo.addToGroup' || type === 'zalo.removeFromGroup' || type === 'zalo.createPoll' || type === 'zalo.setMute') {
      return { success: true, _sandbox: true };
    }
    if (type === 'zalo.assignLabel' || type === 'zalo.removeLabel') {
      return { success: true, _sandbox: true };
    }

    // Facebook Actions
    if (type.startsWith('fb.action.')) {
      return { success: true, messageId: `mock_fb_msg_${Date.now()}`, _sandbox: true };
    }

    // Google Sheets Actions
    if (type === 'sheets.appendRow' || type === 'sheets.updateCell') {
      return { success: true, updatedCells: 1, _sandbox: true };
    }
    if (type === 'sheets.readValues') {
      return { success: true, values: [['Dòng mẫu 1', 'Dữ liệu mẫu 2'], ['Dòng mẫu 2', 'Dữ liệu mẫu 3']], _sandbox: true };
    }

    // Notifications
    if (type.startsWith('notify.')) {
      return { success: true, messageId: `mock_notify_${Date.now()}`, _sandbox: true };
    }

    // HTTP Output
    if (type === 'output.httpRequest') {
      return { success: true, status: 200, data: { status: 'success', message: 'Sandbox mock response' }, _sandbox: true };
    }

    // POS / CRM / Shipping
    if (type.startsWith('kiotviet.') || type.startsWith('haravan.') || type.startsWith('sapo.') || type.startsWith('nhanh.') || type.startsWith('pancake.')) {
      if (type.endsWith('.createOrder')) {
        return { success: true, orderId: `mock_order_${Date.now()}`, code: `MOCK-ORD-${Date.now()}`, _sandbox: true };
      }
      return { success: true, result: { id: `mock_id`, name: 'Khách Hàng Giả Lập' }, _sandbox: true };
    }
    if (type.startsWith('ghn.') || type.startsWith('ghtk.')) {
      if (type.endsWith('.createOrder')) {
        return { success: true, orderCode: `MOCK-SHIP-${Date.now()}`, label: 'MOCK-SHIP-LABEL', _sandbox: true };
      }
      return { success: true, status: 'delivering', tracking: [], _sandbox: true };
    }

    return null;
  }

  // ─── Node Executor ────────────────────────────────────────────────────────

  private async executeNode(
    node: WorkflowNode,
    cfg: Record<string, any>,
    ctx: ExecutionContext,
    _wf: Workflow
  ): Promise<Record<string, any>> {
    const sandboxResult = this.executeSandboxNode(node, cfg, ctx);
    if (sandboxResult !== null) {
      return sandboxResult;
    }

    switch (node.type) {

      // ── Trigger nodes (just pass-through — already matched) ──────────────
      case 'trigger.message':
      case 'trigger.friendRequest':
      case 'trigger.groupEvent':
      case 'trigger.reaction':
      case 'trigger.undo':
      case 'trigger.schedule':
      case 'trigger.manual':
      case 'trigger.webhook':
        return { ...ctx.trigger };

      // ── CRM Actions ─────────────────────────────────────────────────────
      case 'crm.getContacts': {
        let sql = `
          SELECT contact_id, display_name, display_name AS zalo_name, avatar_url as avatar, phone, is_friend, contact_type, gender, birthday, pipeline_stage_id, channel, salutation, alias, ai_profile, extra_data
          FROM contacts
          WHERE 1=1
        `;
        const params: any[] = [];

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

        // Execute query
        let rows = DatabaseService.getInstance().query<any>(sql, params) || [];

        // Apply birthday filter in JS if enabled
        let birthdayFilter = cfg.birthdayFilter || '';
        if (cfg.birthdayToday === true && !birthdayFilter) {
          birthdayFilter = 'today';
        }

        if (birthdayFilter) {
          const today = new Date();
          // Convert date to UTC+7 offset for Vietnam timezone
          const utc = today.getTime() + today.getTimezoneOffset() * 60000;
          const vnTime = new Date(utc + 3600000 * 7);

          rows = rows.filter((c: any) => {
            if (!c.birthday) return false;
            const parts = c.birthday.split('/');
            if (parts.length < 2) return false;
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (isNaN(d) || isNaN(m)) return false;

            if (birthdayFilter === 'today') {
              const currentDay = vnTime.getDate();
              const currentMonth = vnTime.getMonth() + 1;
              return d === currentDay && m === currentMonth;
            }

            if (birthdayFilter === 'this_week') {
              const dayOfWeek = vnTime.getDay();
              const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
              const monday = new Date(vnTime.getTime());
              monday.setDate(vnTime.getDate() + diffToMonday);

              const weekDays = new Set<string>();
              for (let i = 0; i < 7; i++) {
                const day = new Date(monday.getTime());
                day.setDate(monday.getDate() + i);
                weekDays.add(`${day.getDate()}/${day.getMonth() + 1}`);
              }
              return weekDays.has(`${d}/${m}`);
            }

            if (birthdayFilter === 'this_month') {
              const currentMonth = vnTime.getMonth() + 1;
              return m === currentMonth;
            }

            return false;
          });
        }

        // Bổ sung: Lấy nhãn (local & Zalo) của các liên hệ
        if (rows.length > 0) {
          const ownerZaloId = _wf.pageIds?.[0] || _wf.pageId || ctx.trigger?.zaloId || '';
          if (ownerZaloId) {
            try {
              const labelRows = DatabaseService.getInstance().query<any>(
                `SELECT llt.thread_id as contact_id, ll.id, ll.name, ll.color, ll.text_color as textColor, ll.shortcut
                 FROM local_label_threads llt
                 JOIN local_labels ll ON llt.label_id = ll.id
                 WHERE llt.owner_zalo_id = ?`,
                [ownerZaloId]
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
                r.salutation = r.salutation || '';
                r.alias = r.alias || '';
                r.aiProfile = r.ai_profile || '';
                r.extraData = r.extra_data || '';
                try {
                  r.extraDataObject = r.extra_data ? JSON.parse(r.extra_data) : {};
                } catch {
                  r.extraDataObject = {};
                }
              }
            } catch (err: any) {
              Logger.error(`[WorkflowEngine] crm.getContacts labels fetch error: ${err.message}`);
            }
          }
        }

        Logger.info(`[WorkflowEngine] crm.getContacts: matched ${rows.length} contacts`);
        return {
          contacts: rows,
          count: rows.length
        };
      }

      // ── Zalo Actions ─────────────────────────────────────────────────────
      case 'zalo.sendMessage': {
        const defaultApi = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;   // guard NaN → 0
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;
        Logger.info(`[WorkflowEngine] sendMessage: message="${(cfg.message || '').substring(0, 300)}", threadIds=${JSON.stringify(targetThreadIds)}, threadType=${threadType}, isEmpty=${!cfg.message?.trim()}`);

        // ─── Structured AI response handling ─────────────────────────────
        // Detect AI structured JSON: [{type:"text",content:"..."}, {type:"image",content:["url",...]}]
        const segments = parseStructuredResponse(cfg.message);
        if (segments) {
          Logger.info(`[WorkflowEngine] Structured AI response: ${segments.length} segments`);
          let lastMsgId = '';
          for (const tid of targetThreadIds) {
            try {
              const activeApi = this.resolveApiForThread(tid, defaultApi);
              const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
              for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                if (seg.type === 'text' && seg.content) {
                  if (i > 0) await new Promise(r => setTimeout(r, 600));
                  try {
                    const destType = activeThreadType === 0 ? 3 : undefined;
                    await activeApi.sendTypingEvent(tid, activeThreadType, destType);
                  } catch {}
                  const typingDelay = Math.min(Math.max(String(seg.content).length * 30, 800), 3000);
                  await new Promise(r => setTimeout(r, typingDelay));
                  const res = await activeApi.sendMessage({ msg: String(seg.content) }, tid, activeThreadType);
                  lastMsgId = (res as any)?.message?.msgId || lastMsgId;
                } else if (seg.type === 'image') {
                  const urls = Array.isArray(seg.content) ? seg.content : [seg.content];
                  for (const url of urls) {
                    if (!url || typeof url !== 'string') continue;
                    if (i > 0 || urls.indexOf(url) > 0) await new Promise(r => setTimeout(r, 500));
                    try {
                      const tempPath = await this.downloadUrlToTempFile(String(url));
                      try {
                        const res = await activeApi.sendMessage({ msg: '', attachments: [tempPath] }, tid, activeThreadType);
                        lastMsgId = (res as any)?.attachment?.[0]?.msgId || (res as any)?.message?.msgId || lastMsgId;
                      } finally {
                        try { fs.unlinkSync(tempPath); } catch {}
                      }
                    } catch (e: any) {
                      Logger.warn(`[WorkflowEngine] Failed to send image ${url}: ${e.message}`);
                      await activeApi.sendMessage({ msg: String(url) }, tid, activeThreadType);
                    }
                  }
                }
              }
            } catch (err: any) {
              Logger.warn(`[WorkflowEngine] sendMessage to ${tid} failed: ${err.message}`);
              if (!continueOnError) throw err;
            }
          }
          return { msgId: lastMsgId, success: true, structured: true, segmentCount: segments.length };
        }

        // ─── Plain text: loop qua nhiều thread ────────────────────────────
        let lastResult: any = { success: false, error: 'Không gửi được đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          try {
            const activeApi = this.resolveApiForThread(tid, defaultApi);
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
            const result = await activeApi.sendMessage({ msg: cfg.message }, tid, activeThreadType);
            lastResult = result;
            Logger.log(`[WorkflowEngine] zalo.sendMessage to ${tid}: success=true, msgId=${(result as any)?.message?.msgId}`);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] zalo.sendMessage to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          msgId: (lastResult as any)?.message?.msgId || '',
          success: true,
          _targetCount: targetThreadIds.length,
        };
      }

      case 'zalo.sendTyping': {
        // Gửi sự kiện "đang gõ" rồi chờ delay trước khi bước tiếp theo chạy.
        // Mục đích: đặt thẻ này TRƯỚC zalo.sendMessage để tạo hiệu ứng tự nhiên.
        //   threadType 0 = DM (cần destType=3), 1 = Group (không cần destType)
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const destType   = threadType === 0 ? 3 : undefined; // DestType.User=3
        const threadIds = this.resolveTargetIds(cfg, 'threadId', ctx);
        for (const threadId of threadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, threadId, threadType);
            const activeDestType = activeThreadType === 0 ? 3 : undefined;
            await api.sendTypingEvent(threadId, activeThreadType, activeDestType);
          } catch (e: any) {
            Logger.warn(`[WorkflowEngine] sendTypingEvent warning for ${threadId}: ${e.message}`);
          }
        }
        const delayMs = Number(cfg.delaySeconds || 3) * 1000;
        await new Promise(r => setTimeout(r, Math.min(delayMs, 30_000)));
        return { success: true, delayMs };
      }

      case 'zalo.sendImage': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;

        const sendMode = cfg.sendMode || 'single';
        let attachments: string[] = [];
        if (sendMode === 'single') {
          if (cfg.filePath) attachments.push(cfg.filePath.trim());
        } else {
          const paths = (cfg.filePaths || '').split('\n').map((p: string) => p.trim()).filter(Boolean);
          if (sendMode === 'random') {
            if (paths.length > 0) {
              const randomPath = paths[Math.floor(Math.random() * paths.length)];
              attachments.push(randomPath);
            }
          } else {
            attachments = paths;
          }
        }

        if (attachments.length === 0) {
          throw new Error("Danh sách đường dẫn ảnh gửi trống");
        }

        let lastResult: any = { success: false, error: 'Không gửi được ảnh đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
            const result = await api.sendMessage({ msg: cfg.message || '', attachments }, tid, activeThreadType, 'file');
            lastResult = result;
            Logger.log(`[WorkflowEngine] zalo.sendImage to ${tid}: success=true`);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] zalo.sendImage to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          msgId: (lastResult as any)?.attachment?.[0]?.msgId || '',
          success: lastResult && lastResult.success !== false,
          _targetCount: targetThreadIds.length,
          error: lastResult?.error
        };
      }

      case 'zalo.sendVideo': {
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;

        const sendMode = cfg.sendMode || 'single';
        let videos: string[] = [];
        if (sendMode === 'single') {
          if (cfg.videoUrl) videos.push(cfg.videoUrl.trim());
        } else {
          const paths = (cfg.videoUrls || '').split('\n').map((p: string) => p.trim()).filter(Boolean);
          if (sendMode === 'random') {
            if (paths.length > 0) {
              videos.push(paths[Math.floor(Math.random() * paths.length)]);
            }
          } else {
            videos = paths;
          }
        }

        if (videos.length === 0) {
          throw new Error("Danh sách đường dẫn video gửi trống");
        }

        // Dùng ZaloService thay vì raw zca-js API để hỗ trợ upload đường dẫn cục bộ
        const zaloId = ctx.pageId || ctx.trigger?.zaloId || '';
        const ZaloService = require('../zalo/ZaloService').default;
        const zaloSvc = ZaloService.getInstanceByZaloId(zaloId);
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);

        let lastResult: any = { success: false, error: 'Không gửi được video đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
          for (const vPath of videos) {
            try {
              const options = {
                videoUrl: vPath,
                thumbnailUrl: cfg.thumbnailUrl || '',
                duration: cfg.duration ? Number(cfg.duration) : undefined,
                width: cfg.width ? Number(cfg.width) : undefined,
                height: cfg.height ? Number(cfg.height) : undefined,
                msg: cfg.msg || undefined,
                ttl: cfg.ttl ? Number(cfg.ttl) : 0,
              };
              let result: any;
              if (zaloSvc) {
                // Gọi ZaloService để hỗ trợ upload tệp cục bộ và chuẩn hóa URL
                result = await zaloSvc.sendVideo(options, tid, activeThreadType, null);
              } else {
                result = await api.sendVideo(options, tid, activeThreadType);
              }
              lastResult = result;
              Logger.log(`[WorkflowEngine] zalo.sendVideo to ${tid} (${vPath}): success=true`);
            } catch (err: any) {
              Logger.warn(`[WorkflowEngine] zalo.sendVideo to ${tid} (${vPath}) failed: ${err.message}`);
              lastResult = { success: false, error: err.message };
              if (!continueOnError) throw err;
            }
          }
        }
        return {
          success: true,
          msgId: lastResult?.msgId || '',
          _targetCount: targetThreadIds.length,
        };
      }

      case 'zalo.sendVoice': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;

        const options = {
          voiceUrl: cfg.voiceUrl,
          ttl: cfg.ttl ? Number(cfg.ttl) : 0,
        };

        let lastResult: any = { success: false, error: 'Không gửi được voice đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
            const result = await api.sendVoice(options, tid, activeThreadType);
            lastResult = result;
            Logger.log(`[WorkflowEngine] zalo.sendVoice to ${tid}: success=true`);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] zalo.sendVoice to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          success: true,
          msgId: lastResult?.msgId || '',
          _targetCount: targetThreadIds.length,
        };
      }

      case 'zalo.sendBankCard': {
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;

        // Hàm helper chuẩn hóa nội dung chuyển khoản y hệt VietQR
        const sanitizeDesc = (str: string): string => {
          if (!str) return '';
          return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .replace(/[^a-zA-Z0-9\s-_]/g, '')
            .toUpperCase()
            .trim()
            .substring(0, 25);
        };

        const resolvedAmount = cfg.amount || '';
        const resolvedDesc = cfg.description || '';

        const bankPayload = {
          binBank: cfg.binBank,
          numAccBank: cfg.numAccBank,
          nameAccBank: (cfg.nameAccBank || '').toUpperCase(),
          amount: resolvedAmount ? Number(resolvedAmount) : undefined,
          description: resolvedDesc ? sanitizeDesc(resolvedDesc) : undefined,
        };

        // Gọi ZaloService để chuẩn hóa tham số (parseInt binBank, convertThreadType)
        const bankZaloId = ctx.pageId || ctx.trigger?.zaloId || '';
        const ZaloServiceBank = require('../zalo/ZaloService').default;
        const zaloSvcBank = ZaloServiceBank.getInstanceByZaloId(bankZaloId);
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);

        let lastResult: any = { success: false, error: 'Không gửi được thẻ ngân hàng đến hội thoại nào' };
        const ownerZaloId = ctx.pageId || ctx.trigger?.zaloId || '';
        for (const tid of targetThreadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);

            // [Fix A1] Emit bankCardCached TRƯỚC khi gọi API (tránh race condition):
            // Webhook Zalo echo có thể đến renderer trước API response trả về
            try {
              const EventBroadcaster = require('../event/EventBroadcaster').default;
              EventBroadcaster.emit('zalo:bankCardCached', {
                ownerZaloId,
                threadId: tid,
                binBank: Number(bankPayload.binBank),
                numAccBank: String(bankPayload.numAccBank),
                nameAccBank: String(bankPayload.nameAccBank),
                amount: bankPayload.amount,
                description: bankPayload.description,
              });
            } catch (e: any) {
              Logger.warn(`[WorkflowEngine] bankCardCached pre-emit failed: ${e.message}`);
            }

            let result: any;
            if (zaloSvcBank) {
              result = await zaloSvcBank.sendBankCard(JSON.stringify(bankPayload), tid, activeThreadType);
            } else {
              result = await api.sendBankCard(JSON.stringify(bankPayload), tid, activeThreadType);
            }
            lastResult = result;
            Logger.log(`[WorkflowEngine] zalo.sendBankCard to ${tid}: success=true`);

            // [Fix B] Gửi companion text khi có amount/description vì Zalo recipient chỉ thấy số TK
            const hasPaymentInfo = (bankPayload.amount && Number(bankPayload.amount) > 0) || !!bankPayload.description;
            if (hasPaymentInfo && zaloSvcBank) {
              try {
                const lines: string[] = ['💳 Thông tin chuyển khoản:'];
                if (bankPayload.amount && Number(bankPayload.amount) > 0) {
                  lines.push(`💰 Số tiền: ${Number(bankPayload.amount).toLocaleString('vi-VN')}đ`);
                }
                if (bankPayload.description) {
                  lines.push(`📝 Nội dung: ${bankPayload.description}`);
                }
                await zaloSvcBank.sendMessage(lines.join('\n'), tid, activeThreadType);
                Logger.log(`[WorkflowEngine] Sent companion payment text to ${tid}`);
              } catch (compErr: any) {
                Logger.warn(`[WorkflowEngine] Companion text send failed: ${compErr.message}`);
              }
            }
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] zalo.sendBankCard to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          success: true,
          _targetCount: targetThreadIds.length,
        };
      }

      case 'zalo.sendCard': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;

        let lastResult: any = { success: false, error: 'Không gửi được danh thiếp đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
            const result = await api.sendCard([{
              options: {
                userId: cfg.userId,
                phoneNumber: cfg.phoneNumber || undefined,
                ttl: cfg.ttl ? Number(cfg.ttl) : 0,
              },
              threadId: tid,
              type: activeThreadType,
            }]);
            lastResult = result?.[0] || result;
            Logger.log(`[WorkflowEngine] zalo.sendCard to ${tid}: success=true`);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] zalo.sendCard to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          success: true,
          msgId: lastResult?.msgId || '',
          _targetCount: targetThreadIds.length,
        };
      }

      case 'zalo.sendFile': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        const continueOnError = cfg.continueOnError === true;

        const sendMode = cfg.sendMode || 'single';
        let attachments: string[] = [];
        if (sendMode === 'single') {
          if (cfg.filePath) attachments.push(cfg.filePath.trim());
        } else {
          const paths = (cfg.filePaths || '').split('\n').map((p: string) => p.trim()).filter(Boolean);
          if (sendMode === 'random') {
            if (paths.length > 0) {
              attachments.push(paths[Math.floor(Math.random() * paths.length)]);
            }
          } else {
            attachments = paths;
          }
        }

        if (attachments.length === 0) {
          throw new Error("Danh sách đường dẫn file gửi trống");
        }

        let lastResult: any = { success: false, error: 'Không gửi được file đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, tid, threadType);
            const result = await api.sendMessage({ msg: '', attachments }, tid, activeThreadType, 'file');
            lastResult = result;
            Logger.log(`[WorkflowEngine] zalo.sendFile to ${tid}: success=true`);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] zalo.sendFile to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          success: true,
          _targetCount: targetThreadIds.length,
        };
      }

      case 'zalo.findUser': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const result: any = await api.findUser(cfg.phone);
        return {
          userId: result?.data?.uid || '', displayName: result?.data?.displayName || '',
          avatar: result?.data?.avatar || '', isFriend: !!(result?.data?.isFriend),
        };
      }

      case 'zalo.getUserInfo': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const result: any = await api.getUserInfo({ userId: cfg.userId } as any);
        return result?.data || {};
      }

      case 'zalo.acceptFriendRequest': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        await api.acceptFriendRequest(cfg.userId);
        return { success: true };
      }

      case 'zalo.rejectFriendRequest': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        await api.rejectFriendRequest(cfg.userId);
        return { success: true };
      }

      case 'zalo.sendFriendRequest': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        await api.sendFriendRequest(cfg.message || '', cfg.userId);
        return { success: true };
      }

      case 'zalo.addToGroup': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const groupIds = this.resolveTargetIds(cfg, 'groupId', ctx);
        for (const groupId of groupIds) {
          try {
            await api.addUserToGroup({ groupId, members: [cfg.userId] } as any);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] addToGroup error for group ${groupId}: ${err.message}`);
          }
        }
        return { success: true };
      }

      case 'zalo.removeFromGroup': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const groupIds = this.resolveTargetIds(cfg, 'groupId', ctx);
        for (const groupId of groupIds) {
          try {
            await api.removeUserFromGroup({ groupId, members: [cfg.userId] } as any);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] removeFromGroup error for group ${groupId}: ${err.message}`);
          }
        }
        return { success: true };
      }

      case 'zalo.undoMessage': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const threadIds = this.resolveTargetIds(cfg, 'threadId', ctx);
        for (const threadId of threadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, threadId, threadType);
            await api.undo({ msgId: cfg.msgId, threadId, threadType: activeThreadType } as any);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] undoMessage error for ${threadId}: ${err.message}`);
          }
        }
        return { success: true };
      }

      case 'zalo.setMute': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.threadType) === 1 ? 1 : 0;
        const threadIds = this.resolveTargetIds(cfg, 'threadId', ctx);
        for (const threadId of threadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, threadId, threadType);
            await api.setMute(threadId, activeThreadType, cfg.duration ?? 0, cfg.action === 'mute' ? 1 : 0);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] setMute error for ${threadId}: ${err.message}`);
          }
        }
        return { success: true };
      }

      case 'zalo.getMessageHistory': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const result: any = await api.getGroupChatHistory({
          groupId: cfg.threadId,
          lastMsgId: cfg.lastMsgId || '',
          count: Number(cfg.count ?? 20),
        } as any);
        return { messages: result?.data || [] };
      }

      case 'zalo.forwardMessage': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const threadType = Number(cfg.toThreadType ?? 0);
        const threadIds = this.resolveTargetIds(cfg, 'toThreadId', ctx);
        if (threadIds.length === 0) throw new Error('[zalo.forwardMessage] toThreadId / toThreadIds required');

        const message = cfg.message || ctx.trigger?.content || '';
        const msgId = cfg.msgId || ctx.trigger?.msgId || '';

        // Tra DB lấy local_paths + msg_type từ tin nhắn gốc (giống chat sendOneForward)
        let localPaths: Record<string, string> = {};
        let dbMsgType = '';
        const triggerZaloId = ctx.trigger?.zaloId || ctx.pageId;
        if (msgId && triggerZaloId) {
          try {
            const stored = DatabaseService.getInstance().getMessageById(triggerZaloId, msgId);
            if (stored) {
              dbMsgType = stored.msg_type || '';
              if (stored.local_paths) {
                const parsed = typeof stored.local_paths === 'string'
                  ? JSON.parse(stored.local_paths)
                  : stored.local_paths;
                if (parsed && typeof parsed === 'object') localPaths = parsed;
              }
            }
          } catch {}
        }

        // Ưu tiên gửi media (ảnh/file/video) trước — giống sendOneForward
        const mediaPath = localPaths.file || localPaths.video || localPaths.main || localPaths.hd || '';
        for (const threadId of threadIds) {
          try {
            const activeThreadType = this.resolveThreadType(ctx.trigger?.zaloId, threadId, threadType);
            if (mediaPath) {
              // Gửi media + text (caption) trong 1 lần
              await api.sendMessage({ msg: message, attachments: [mediaPath] }, threadId, activeThreadType);
            } else if (message) {
              // Chỉ có text
              await api.sendMessage({ msg: message, attachments: [] }, threadId, activeThreadType);
            } else {
              throw new Error('[zalo.forwardMessage] Missing message content');
            }
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] forwardMessage error for ${threadId}: ${err.message}`);
          }
        }

        return { success: true, msgId };
      }

      case 'zalo.createPoll': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        const options = String(cfg.options || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
        const groupIds = this.resolveTargetIds(cfg, 'groupId', ctx);
        for (const groupId of groupIds) {
          try {
            await api.createPoll({
              question: cfg.question,
              options,
              allowMultiChoices: !!cfg.allowMultiple,
              expiredTime: Number(cfg.expireTime ?? 0),
            }, groupId);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] createPoll error for group ${groupId}: ${err.message}`);
          }
        }
        return { success: true };
      }

      case 'zalo.addReaction': {
        const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
        await api.addReaction({ msgId: cfg.msgId, clientMsgId: cfg.clientMsgId || '' } as any, Number(cfg.reactionType ?? 1));
        return { success: true };
      }

      case 'zalo.assignLabel': {
        const threadIds = this.resolveTargetIds(cfg, 'threadId', ctx);

        // Giải mã labelIds: mảng "source:id" (new) hoặc fallback về labelId/labelSource cũ
        const rawIds: string[] = Array.isArray(cfg.labelIds) && cfg.labelIds.length > 0
          ? cfg.labelIds
          : (cfg.labelId ? [`${cfg.labelSource || 'local'}:${cfg.labelId}`] : []);

        const localIds = rawIds
          .filter(v => typeof v === 'string' && v.startsWith('local:'))
          .map(v => Number(v.split(':')[1]))
          .filter(Boolean);

        const zaloEntries = rawIds.filter(v => typeof v === 'string' && v.startsWith('zalo:'));

        for (const threadId of threadIds) {
          // Gán nhãn Local
          for (const labelId of localIds) {
            DatabaseService.getInstance().assignLocalLabelToThread(ctx.pageId, labelId, threadId);
          }

          // Gán nhãn Zalo
          if (zaloEntries.length > 0) {
            try {
              const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
              const labelsRes = await (api as any).getLabels();
              const labelData = labelsRes?.labelData || labelsRes?.data?.labelData || [];
              const version = labelsRes?.version || labelsRes?.data?.version || 0;

              let modified = false;
              for (const zaloEntry of zaloEntries) {
                const parts = zaloEntry.split(':');
                const zaloRawId = parts.length > 2 ? parts[2] : parts[1];
                const label = labelData.find((l: any) => String(l.id) === String(zaloRawId));
                if (label) {
                  const existingMembers = label.memberIds || [];
                  if (!existingMembers.includes(threadId)) {
                    label.memberIds = [...existingMembers, threadId];
                    modified = true;
                  }
                }
              }

              if (modified) {
                await (api as any).updateLabels({ labelData, version });
              }
            } catch (err: any) {
              Logger.warn(`[WorkflowEngine] Zalo assignLabel error for ${threadId}: ${err.message}`);
            }
          }
        }

        return { success: true };
      }

      case 'zalo.removeLabel': {
        const threadIds = this.resolveTargetIds(cfg, 'threadId', ctx);

        // Giải mã labelIds: mảng "source:id" (new) hoặc fallback về labelId/labelSource cũ
        const rawIds: string[] = Array.isArray(cfg.labelIds) && cfg.labelIds.length > 0
          ? cfg.labelIds
          : (cfg.labelId ? [`${cfg.labelSource || 'local'}:${cfg.labelId}`] : []);

        const localIds = rawIds
          .filter(v => typeof v === 'string' && v.startsWith('local:'))
          .map(v => Number(v.split(':')[1]))
          .filter(Boolean);

        const zaloEntries = rawIds.filter(v => typeof v === 'string' && v.startsWith('zalo:'));

        for (const threadId of threadIds) {
          // Gỡ nhãn Local
          for (const labelId of localIds) {
            DatabaseService.getInstance().removeLocalLabelFromThread(ctx.pageId, labelId, threadId);
          }

          // Gỡ nhãn Zalo
          if (zaloEntries.length > 0) {
            try {
              const api = this.getApi(ctx.pageId, ctx.trigger?.zaloId);
              const labelsRes = await (api as any).getLabels();
              const labelData = labelsRes?.labelData || labelsRes?.data?.labelData || [];
              const version = labelsRes?.version || labelsRes?.data?.version || 0;

              let modified = false;
              for (const zaloEntry of zaloEntries) {
                const parts = zaloEntry.split(':');
                const zaloRawId = parts.length > 2 ? parts[2] : parts[1];
                const label = labelData.find((l: any) => String(l.id) === String(zaloRawId));
                if (label) {
                  const existingMembers = label.memberIds || [];
                  if (existingMembers.includes(threadId)) {
                    label.memberIds = existingMembers.filter((id: string) => id !== threadId);
                    modified = true;
                  }
                }
              }

              if (modified) {
                await (api as any).updateLabels({ labelData, version });
              }
            } catch (err: any) {
              Logger.warn(`[WorkflowEngine] Zalo removeLabel error for ${threadId}: ${err.message}`);
            }
          }
        }

        return { success: true };
      }

      // ── Logic Nodes ──────────────────────────────────────────────────────
      case 'logic.if': {
        const left  = String(cfg.left  ?? '');
        const right = String(cfg.right ?? '');
        const op    = cfg.operator ?? 'equals';
        let result = false;
        switch (op) {
          case 'equals':       result = left === right; break;
          case 'not_equals':   result = left !== right; break;
          case 'contains':     result = left.includes(right); break;
          case 'not_contains': result = !left.includes(right); break;
          case 'starts_with':  result = left.startsWith(right); break;
          case 'ends_with':    result = left.endsWith(right); break;
          case 'greater_than': result = this.compareValues(left, right) > 0; break;
          case 'less_than':    result = this.compareValues(left, right) < 0; break;
          case 'is_empty':     result = !left || left.trim() === ''; break;
          case 'not_empty':    result = !!left && left.trim() !== ''; break;
          case 'regex':
            try { result = new RegExp(right, 'i').test(left); } catch { result = false; } break;
        }
        ctx.variables[`__if_${node.id}`] = result;
        return { result, branch: result ? 'true' : 'false' };
      }

      case 'logic.switch': {
        const val = String(cfg.value ?? '');
        const cases: Array<{ match: string; label: string }> = cfg.cases || [];
        let matchedHandle = cfg.defaultLabel || 'default';
        for (const c of cases) {
          if (String(c.match) === val) { matchedHandle = c.label; break; }
        }
        ctx.variables[`__switch_${node.id}`] = matchedHandle;
        return { value: val, matchedHandle };
      }

      case 'logic.wait': {
        let ms = 0;
        if (cfg.waitType === 'calendar') {
          const now = new Date();
          const targetDate = new Date(now.getTime());
          
          // Dịch chuyển số ngày thực tế
          const daysToShift = Number(cfg.calendarDays ?? 1);
          targetDate.setDate(targetDate.getDate() + daysToShift);
          
          // Thiết lập giờ và phút đích
          const timeStr = cfg.targetTime || '09:00';
          const [hh, mm] = timeStr.split(':').map(Number);
          targetDate.setHours(hh || 0, mm || 0, 0, 0);
          
          const diffMs = targetDate.getTime() - now.getTime();
          ms = diffMs > 0 ? diffMs : 0;
        } else if (cfg.delayMs !== undefined && cfg.delayMs !== null) {
          ms = Number(cfg.delayMs);
        } else if (cfg.delaySeconds !== undefined && cfg.delaySeconds !== null && cfg.delaySeconds !== '') {
          ms = Number(cfg.delaySeconds) * 1000;
        } else {
          const d = Number(cfg.days || 0);
          const h = Number(cfg.hours || 0);
          const m = Number(cfg.minutes || 0);
          const s = Number(cfg.seconds || 0);
          ms = (d * 86400 + h * 3600 + m * 60 + s) * 1000;
        }

        // Giới hạn 90 ngày (7,776,000,000 ms)
        const MAX_WAIT_MS = 90 * 24 * 3600 * 1000;
        ms = Math.min(ms, MAX_WAIT_MS);

        // Nếu delay > 5 phút VÀ không phải sandbox → lưu Persistent Checkpoint
        if (ms > 300_000 && !ctx.isSandbox) {
          const cpId = uuidv4();
          const resumeAt = Date.now() + ms;

          // Tìm node tiếp theo sau wait node trong topological order
          const currentWf: Workflow = {
            id: (ctx as any)._wfId || '',
            name: ctx._wfName || '',
            enabled: true,
            channel: 'zalo',
            pageIds: ctx.pageId ? [ctx.pageId] : [],
            nodes: ctx._wfNodes as WorkflowNode[],
            edges: (ctx._wfEdges || []) as WorkflowEdge[],
            createdAt: 0, updatedAt: 0,
          };
          const order = this.topologicalSort(currentWf);
          const waitIdx = order.indexOf(node.id);
          const resumeNodeId = waitIdx >= 0 && waitIdx + 1 < order.length ? order[waitIdx + 1] : '';

          // Lưu checkpoint vào SQLite
          DatabaseService.getInstance().saveWorkflowCheckpoint({
            id: cpId,
            workflowId: (ctx as any)._wfId || '',
            workflowName: ctx._wfName || '',
            triggeredBy: ctx._triggeredBy || 'unknown',
            runId: ctx._runId || uuidv4(),
            resumeAt,
            createdAt: Date.now(),
            resumeNodeId,
            waitLabel: node.label || 'logic.wait',
            contextJson: serializeContext(ctx),
          });

          Logger.log(`[WorkflowEngine] Checkpoint saved: ${cpId} — resume at ${new Date(resumeAt).toLocaleString('vi-VN')} (node: ${resumeNodeId})`);
          EventBroadcaster.emit('workflow:checkpointCreated', {
            checkpointId: cpId,
            workflowName: ctx._wfName,
            resumeAt,
            waitLabel: node.label || 'Chờ',
          });

          throw new CheckpointError(cpId, resumeAt);
        }

        // Delay ngắn (≤ 5 phút): giữ nguyên hành vi cũ
        await new Promise(r => setTimeout(r, ms));
        return { waited: ms };
      }

      case 'logic.setVariable': {
        ctx.variables[cfg.name] = cfg.value;
        return { [cfg.name]: cfg.value };
      }

      case 'logic.stopIf': {
        const left  = String(cfg.left  ?? '');
        const right = String(cfg.right ?? '');
        const op    = cfg.operator ?? 'equals';
        let stop = false;
        switch (op) {
          case 'equals':       stop = left === right; break;
          case 'not_equals':   stop = left !== right; break;
          case 'contains':     stop = left.includes(right); break;
          case 'not_contains': stop = !left.includes(right); break;
          case 'starts_with':  stop = left.startsWith(right); break;
          case 'ends_with':    stop = left.endsWith(right); break;
          case 'greater_than': stop = this.compareValues(left, right) > 0; break;
          case 'less_than':    stop = this.compareValues(left, right) < 0; break;
          case 'is_empty':     stop = !left || left.trim() === ''; break;
          case 'not_empty':    stop = !!left && left.trim() !== ''; break;
          case 'regex':
            try { stop = new RegExp(right, 'i').test(left); } catch { stop = false; } break;
        }
        if (stop) throw new Error('__STOP__');
        return { stopped: false };
      }

      case 'logic.forEach': {
        let arr: any[] = [];
        try { arr = Array.isArray(cfg.array) ? cfg.array : JSON.parse(cfg.array || '[]'); } catch {}
        return { items: arr, count: arr.length };
      }

      // ── Data Nodes ───────────────────────────────────────────────────────
      case 'data.textFormat':
        return { result: cfg.template || '' };

      case 'data.jsonParse': {
        try {
          const parsed = typeof cfg.input === 'string' ? JSON.parse(cfg.input) : cfg.input;
          return { data: parsed };
        } catch {
          return { data: null, error: 'JSON parse failed' };
        }
      }

      case 'data.dateFormat': {
        const d = cfg.date ? new Date(cfg.date) : new Date();
        const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Ho_Chi_Minh' };
        if (cfg.format === 'full') { opts.dateStyle = 'full'; opts.timeStyle = 'short'; }
        else if (cfg.format === 'date') { opts.dateStyle = 'short'; }
        else if (cfg.format === 'time') { opts.timeStyle = 'short'; }
        else { opts.dateStyle = 'short'; opts.timeStyle = 'short'; }
        return { result: new Intl.DateTimeFormat('vi-VN', opts).format(d), timestamp: d.getTime() };
      }

      case 'data.randomPick': {
        const options = String(cfg.options || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
        const picked = options.length > 0 ? options[Math.floor(Math.random() * options.length)] : '';
        return { result: picked };
      }

      // ── Output Nodes ─────────────────────────────────────────────────────
      case 'output.httpRequest': {
        let headers: Record<string, any> = {};
        let body: any = undefined;
        let params: any = undefined;
        const method = (cfg.method || 'POST').toUpperCase();
        const url = cfg.url || '';
        try { headers = cfg.headers ? (typeof cfg.headers === 'string' ? JSON.parse(cfg.headers) : cfg.headers) : {}; } catch {}
        try { body = cfg.body ? (typeof cfg.body === 'string' ? JSON.parse(cfg.body) : cfg.body) : undefined; } catch { body = cfg.body; }
        try { params = cfg.params ? (typeof cfg.params === 'string' ? JSON.parse(cfg.params) : cfg.params) : undefined; } catch {}
        const startTime = Date.now();
        try {
          const response = await axios({
            method,
            url,
            headers,
            data: body,
            params,
            timeout: Number(cfg.timeout ?? 10000),
            // Accept all HTTP status codes — 4xx/5xx are valid business responses,
            // not node errors. Let the workflow logic (e.g. logic.if) decide success/failure.
            validateStatus: () => true,
          });
          return {
            status: response.status,
            statusText: response.statusText,
            data: response.data,
            headers: response.headers,
            _request: { method, url, headers, body, params },
            _durationMs: Date.now() - startTime,
          };
        } catch (axiosErr: any) {
          // Network errors (ECONNREFUSED, DNS, timeout) — don't throw, return
          // structured error response so downstream nodes can always access output.
          const isTimeout = axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout');
          const isConnRefused = axiosErr.code === 'ECONNREFUSED';
          const isDns = axiosErr.code === 'ENOTFOUND' || axiosErr.code === 'EAI_AGAIN';
          return {
            status: 0,
            statusText: '',
            data: null,
            _error: true,
            _errorType: isTimeout ? 'timeout' : isConnRefused ? 'connection_refused' : isDns ? 'dns_error' : 'network_error',
            _errorMessage: axiosErr.message,
            _request: { method, url, headers, body, params },
            _durationMs: Date.now() - startTime,
          };
        }
      }

      case 'output.log': {
        const level = cfg.level || 'info';
        const msg = `[Workflow "${ctx._wfName}"] ${cfg.message}`;
        if (level === 'error') Logger.error(msg);
        else if (level === 'warn') Logger.warn(msg);
        else Logger.log(msg);
        return { logged: cfg.message };
      }

      // ── Google Sheets ────────────────────────────────────────────────────
      case 'sheets.appendRow': {
        if (!cfg.spreadsheetId) throw new Error('[sheets.appendRow] spreadsheetId required');
        if (!cfg.serviceAccountPath) throw new Error('[sheets.appendRow] serviceAccountPath required');
        const auth = new google.auth.GoogleAuth({
          keyFile: cfg.serviceAccountPath,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        let rowValues: any[][];
        try {
          const parsed = typeof cfg.values === 'string' ? JSON.parse(cfg.values) : cfg.values;
          rowValues = Array.isArray(parsed[0]) ? parsed : [parsed];
        } catch {
          // JSON parse failed (e.g., template vars contain special chars) → split by newline or single cell
          const raw = String(cfg.values ?? '');
          const lines = raw.split('\n').filter(Boolean);
          rowValues = lines.length > 0 ? [lines] : [[raw]];
        }
        const res = await sheets.spreadsheets.values.append({
          spreadsheetId: cfg.spreadsheetId,
          range: `${cfg.sheetName || 'Sheet1'}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: rowValues },
        }, { timeout: 30000 });
        return {
          success: true,
          updatedRange: res.data.updates?.updatedRange || '',
          updatedRows: res.data.updates?.updatedRows || 0,
        };
      }

      case 'sheets.readValues': {
        if (!cfg.spreadsheetId) throw new Error('[sheets.readValues] spreadsheetId required');
        if (!cfg.serviceAccountPath) throw new Error('[sheets.readValues] serviceAccountPath required');
        const auth = new google.auth.GoogleAuth({
          keyFile: cfg.serviceAccountPath,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const range = cfg.range || 'Sheet1!A1:Z1000';
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: cfg.spreadsheetId,
          range,
        }, { timeout: 30000 });
        const rows: any[][] = res.data.values || [];
        return { rows, count: rows.length, firstRow: rows[0] || [] };
      }

      case 'sheets.updateCell': {
        if (!cfg.spreadsheetId) throw new Error('[sheets.updateCell] spreadsheetId required');
        if (!cfg.serviceAccountPath) throw new Error('[sheets.updateCell] serviceAccountPath required');
        if (!cfg.range) throw new Error('[sheets.updateCell] range required');
        const auth = new google.auth.GoogleAuth({
          keyFile: cfg.serviceAccountPath,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.update({
          spreadsheetId: cfg.spreadsheetId,
          range: cfg.range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[cfg.value]] },
        }, { timeout: 30000 });
        return { success: true, range: cfg.range };
      }

      // ── AI (Multi-platform: OpenAI, Gemini, Deepseek, Grok) ─────────────
      case 'ai.generateText': {
        // If assistantId is provided, delegate to AIAssistantService
        if (cfg.assistantId) {
          try {
            const AIAssistantService = (await import('../ai/AIAssistantService')).default;
            const chatMsgs: { role: string; content: string }[] = [];

            // Add chat history if provided, otherwise auto-load from DB
            if (cfg.chatHistory) {
              try {
                let history: any[] = typeof cfg.chatHistory === 'string' && cfg.chatHistory.trim()
                  ? JSON.parse(cfg.chatHistory) : (Array.isArray(cfg.chatHistory) ? cfg.chatHistory : []);
                const maxMsgs = Number(cfg.maxHistoryMessages ?? 20);
                if (history.length > maxMsgs) history = history.slice(-maxMsgs);
                for (const msg of history) {
                  if (msg?.role && msg?.content) {
                    chatMsgs.push({ role: msg.role, content: String(msg.content) });
                  } else if (msg && typeof msg === 'object') {
                    const content = msg.content?.msg || (typeof msg.content === 'string' ? msg.content : '');
                    if (content.trim()) chatMsgs.push({ role: msg.isSelf ? 'assistant' : 'user', content });
                  }
                }
              } catch {}
            } else {
              // Auto-load Zalo/Facebook chat history from DB if not explicitly provided
              const threadId = ctx.trigger.threadId || ctx.trigger.fromId || '';
              const zaloId = ctx.pageId || '';
              if (threadId && zaloId) {
                try {
                  const db = DatabaseService.getInstance();
                  const maxMsgs = Number(cfg.maxHistoryMessages ?? 20);
                  const dbMsgs = db.getMessages(zaloId, threadId, maxMsgs);
                  dbMsgs.reverse();
                  const currentMsgId = String(ctx.trigger.msgId || '');
                  for (const msg of dbMsgs) {
                    if (msg.msg_id === currentMsgId) continue;
                    if (msg.content && msg.content.trim()) {
                      chatMsgs.push({
                        role: msg.is_sent === 1 ? 'assistant' : 'user',
                        content: msg.content.trim()
                      });
                    }
                  }
                } catch (err: any) {
                  Logger.warn(`[WorkflowEngine] Auto-loading chat history failed: ${err.message}`);
                }
              }
            }

            const promptContent = (cfg.prompt && cfg.prompt.trim()) || String(ctx.trigger.content || '') || 'Xin chào';
            chatMsgs.push({ role: 'user', content: promptContent });
            
            const result = await AIAssistantService.getInstance().chatForWorkflow(cfg.assistantId, chatMsgs);
            Logger.info(`[WorkflowEngine] AI assistant response: success=${!!result.result}, length=${result.result?.length || 0}, preview="${(result.result || '').substring(0, 200)}", tokens=${result.totalTokens}`);
            return { result: result.result, totalTokens: result.totalTokens, model: 'assistant' };
          } catch (e: any) {
            throw new Error(`Trợ lý AI lỗi: ${e.message}`);
          }
        }

        const messages: any[] = [];
        if (cfg.systemPrompt) messages.push({ role: 'system', content: cfg.systemPrompt });

        // ── Chat history (ngữ cảnh cuộc hội thoại) ────────────────────────
        if (cfg.chatHistory) {
          try {
            let history: any[] = [];
            if (typeof cfg.chatHistory === 'string' && cfg.chatHistory.trim()) {
              history = JSON.parse(cfg.chatHistory);
            } else if (Array.isArray(cfg.chatHistory)) {
              history = cfg.chatHistory;
            }
            const maxMsgs = Number(cfg.maxHistoryMessages ?? 20);
            // Trim to maxMsgs (most recent)
            if (history.length > maxMsgs) history = history.slice(-maxMsgs);
            for (const msg of history) {
              if (msg && typeof msg === 'object') {
                if (msg.role && msg.content) {
                  // Already OpenAI format { role, content }
                  messages.push({ role: msg.role, content: String(msg.content) });
                } else {
                  // Zalo message format – convert automatically
                  const content = msg.content?.msg
                    || (typeof msg.content === 'string' ? msg.content : '')
                    || '';
                  if (content.trim()) {
                    // isSelf = true → bot/assistant sent it; false → user sent it
                    messages.push({ role: msg.isSelf ? 'assistant' : 'user', content });
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors — just proceed without history
          }
        } else {
          // Auto-load Zalo/Facebook chat history from DB
          const threadId = ctx.trigger.threadId || ctx.trigger.fromId || '';
          const zaloId = ctx.pageId || '';
          if (threadId && zaloId) {
            try {
              const db = DatabaseService.getInstance();
              const maxMsgs = Number(cfg.maxHistoryMessages ?? 20);
              const dbMsgs = db.getMessages(zaloId, threadId, maxMsgs);
              dbMsgs.reverse();
              const currentMsgId = String(ctx.trigger.msgId || '');
              for (const msg of dbMsgs) {
                if (msg.msg_id === currentMsgId) continue;
                if (msg.content && msg.content.trim()) {
                  messages.push({
                    role: msg.is_sent === 1 ? 'assistant' : 'user',
                    content: msg.content.trim()
                  });
                }
              }
            } catch (err: any) {
              Logger.warn(`[WorkflowEngine] Auto-loading chat history failed: ${err.message}`);
            }
          }
        }

        const promptContent = (cfg.prompt && cfg.prompt.trim()) || String(ctx.trigger.content || '') || 'Xin chào';
        messages.push({ role: 'user', content: promptContent });

        const platform = cfg.platform || 'openai';
        const rawModel = cfg.model || 'gpt-5.4-mini';
        const model = this.normalizeModelName(rawModel);
        const maxTokens = Number(cfg.maxTokens || 500);
        const temperature = Number(cfg.temperature ?? 0.7);

        if (platform === 'gemini') {
          // Google Gemini API
          const geminiContents = this.openaiMessagesToGemini(messages);
          const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
            {
              contents: geminiContents,
              generationConfig: {
                maxOutputTokens: maxTokens,
                temperature,
              },
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
          );
          const result = res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          const totalTokens = (res.data.usageMetadata?.promptTokenCount || 0) + (res.data.usageMetadata?.candidatesTokenCount || 0);
          return { result, totalTokens, model };
        } else if (platform === 'claude') {
          // Anthropic Claude Messages API
          const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
          const claudeMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));
          const res = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model,
              max_tokens: maxTokens,
              ...(systemText ? { system: systemText } : {}),
              messages: claudeMessages,
            },
            {
              headers: {
                'x-api-key': cfg.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              timeout: 60000,
            }
          );
          const result = res.data.content?.[0]?.text?.trim() || '';
          const totalTokens = (res.data.usage?.input_tokens || 0) + (res.data.usage?.output_tokens || 0);
          return { result, totalTokens, model };
        } else {
          // OpenAI-compatible API (OpenAI, Deepseek, Grok/xAI, Mistral, OpenRouter)
          const apiUrl = this.getOpenAICompatibleUrl(platform);
          const tokenParam = platform === 'openai'
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens };
          const res = await axios.post(
            apiUrl,
            {
              model,
              messages,
              ...tokenParam,
              temperature,
            },
            {
              headers: {
                Authorization: `Bearer ${cfg.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 60000,
            }
          );
          const result = res.data.choices?.[0]?.message?.content?.trim() || '';
          return {
            result,
            totalTokens: res.data.usage?.total_tokens || 0,
            model: res.data.model || model,
          };
        }
      }

      case 'ai.classify': {
        const categories: string[] = String(cfg.categories || '')
          .split(',').map((s: string) => s.trim()).filter(Boolean);
        const systemMsg = `Bạn là bộ phân loại văn bản. Hãy phân loại đoạn văn bản đầu vào vào MỘT trong các danh mục sau: ${categories.join(', ')}. Chỉ trả về đúng tên danh mục, không giải thích thêm.`;

        // If assistantId is provided, delegate to AIAssistantService
        if (cfg.assistantId) {
          try {
            const AIAssistantService = (await import('../ai/AIAssistantService')).default;
            const chatMsgs = [
              { role: 'system', content: systemMsg },
              { role: 'user', content: cfg.input },
            ];
            const result = await AIAssistantService.getInstance().chat(cfg.assistantId, chatMsgs);
            const category = (result.result || '').trim();
            return { category, input: cfg.input };
          } catch (e: any) {
            throw new Error(`Trợ lý AI lỗi: ${e.message}`);
          }
        }

        const platform = cfg.platform || 'openai';
        const model = this.normalizeModelName(cfg.model || 'gpt-5.4-mini');
        const classifyMessages = [
          { role: 'system' as const, content: systemMsg },
          { role: 'user' as const, content: cfg.input },
        ];

        if (platform === 'gemini') {
          const geminiContents = this.openaiMessagesToGemini(classifyMessages);
          const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
            {
              contents: geminiContents,
              generationConfig: { maxOutputTokens: 30, temperature: 0 },
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          const category = res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          return { category, input: cfg.input };
        } else if (platform === 'claude') {
          // Anthropic Claude Messages API
          const claudeMessages = classifyMessages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: 'user' as const, content: m.content }));
          const res = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model,
              max_tokens: 30,
              system: systemMsg,
              messages: claudeMessages,
            },
            {
              headers: {
                'x-api-key': cfg.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              timeout: 15000,
            }
          );
          const category = res.data.content?.[0]?.text?.trim() || '';
          return { category, input: cfg.input };
        } else {
          // OpenAI-compatible API (OpenAI, Deepseek, Grok/xAI, Mistral, OpenRouter)
          const apiUrl = this.getOpenAICompatibleUrl(platform);
          const tokenParam = platform === 'openai'
            ? { max_completion_tokens: 30 }
            : { max_tokens: 30 };
          const res = await axios.post(
            apiUrl,
            { model, messages: classifyMessages, ...tokenParam, temperature: 0 },
            {
              headers: {
                Authorization: `Bearer ${cfg.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 15000,
            }
          );
          const category = res.data.choices?.[0]?.message?.content?.trim() || '';
          return { category, input: cfg.input };
        }
      }

      // ── Notify: Telegram ─────────────────────────────────────────────────
      case 'notify.telegram': {
        const payload: Record<string, any> = {
          chat_id: cfg.chatId,
          text: cfg.message,
        };
        if (cfg.parseMode) payload.parse_mode = cfg.parseMode;
        const res = await axios.post(
          `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
          payload,
          { timeout: 10000 }
        );
        return {
          success: true,
          messageId: res.data.result?.message_id || '',
        };
      }

      // ── Notify: Discord ───────────────────────────────────────────────────
      case 'notify.discord': {
        const payload: Record<string, any> = {
          content: cfg.message,
          username: cfg.username || 'Zagi Bot',
        };
        if (cfg.avatarUrl) payload.avatar_url = cfg.avatarUrl;
        await axios.post(cfg.webhookUrl, payload, { timeout: 10000 });
        return { success: true };
      }

      // ── Notify: Email ─────────────────────────────────────────────────────
      case 'notify.email': {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: cfg.smtpHost || 'smtp.gmail.com',
          port: Number(cfg.smtpPort || 587),
          secure: Number(cfg.smtpPort) === 465,
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
          tls: { rejectUnauthorized: false },
        });
        const info = await transporter.sendMail({
          from: cfg.from || cfg.smtpUser,
          to: cfg.to,
          subject: cfg.subject,
          ...(cfg.isHtml ? { html: cfg.body } : { text: cfg.body }),
        });
        return { success: true, messageId: info.messageId || '' };
      }

      // ── Notify: Notion ────────────────────────────────────────────────────
      case 'notify.notion': {
        let properties: any = {};
        try {
          properties = typeof cfg.properties === 'string'
            ? JSON.parse(cfg.properties)
            : (cfg.properties || {});
        } catch {
          properties = {};
        }
        const res = await axios.post(
          'https://api.notion.com/v1/pages',
          { parent: { database_id: cfg.databaseId }, properties },
          {
            headers: {
              Authorization: `Bearer ${cfg.apiKey}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );
        return {
          success: true,
          pageId: res.data.id || '',
          url: res.data.url || '',
        };
      }

      // ── P0: trigger.payment (pass-through like other triggers) ──────────────
      case 'trigger.payment':
        return { ...ctx.trigger };

      // ── P0: KiotViet POS ─────────────────────────────────────────────────
      case 'kiotviet.lookupCustomer': {
        const result = await IntegrationRegistry.executeActionByType('kiotviet', 'lookupCustomer', {
          phone: cfg.phone,
        });
        const customers: any[] = result.customers || [];
        return { customers, found: customers.length > 0, firstCustomer: customers[0] || null };
      }

      case 'kiotviet.lookupOrder': {
        const result = await IntegrationRegistry.executeActionByType('kiotviet', 'lookupOrder', {
          phone: cfg.phone,
          orderId: cfg.orderId,
        });
        const orders: any[] = result.orders || (result.order ? [result.order] : []);
        return { orders, order: result.order || orders[0] || null, found: orders.length > 0 };
      }

      case 'kiotviet.createOrder': {
        let orderObj: any = {};
        try {
          orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : (cfg.order || {});
        } catch {}
        if (!cfg.order || Object.keys(orderObj || {}).length === 0) {
          let orderDetails: any[] = [];
          try {
            orderDetails = Array.isArray(cfg.orderDetails)
              ? cfg.orderDetails
              : JSON.parse(String(cfg.orderDetails || '[]'));
          } catch {}
          orderObj = {
            ...(cfg.branchId ? { branchId: Number(cfg.branchId) } : {}),
            ...(cfg.customerId ? { customerId: cfg.customerId } : {}),
            orderDetails,
            discount: Number(cfg.discount || 0),
            description: cfg.note || undefined,
          };
        }
        const result = await IntegrationRegistry.executeActionByType('kiotviet', 'createOrder', orderObj);
        return { order: result.order || result, success: true };
      }
      case 'kiotviet.lookupProduct': {
        const result = await IntegrationRegistry.executeActionByType('kiotviet', 'lookupProduct', {
          keyword: cfg.keyword, code: cfg.code, limit: Number(cfg.limit || 10),
        });
        return { products: result.products || [], found: result.found };
      }

      // ── P0: Haravan POS ──────────────────────────────────────────────────
      case 'haravan.lookupCustomer': {
        const result = await IntegrationRegistry.executeActionByType('haravan', 'lookupCustomer', { phone: cfg.phone });
        return { customers: result.customers || [], found: result.found, firstCustomer: result.firstCustomer || null };
      }
      case 'haravan.lookupOrder': {
        const result = await IntegrationRegistry.executeActionByType('haravan', 'lookupOrder', { phone: cfg.phone, orderId: cfg.orderId });
        const orders: any[] = result.orders || (result.order ? [result.order] : []);
        return { orders, order: result.order || orders[0] || null, found: orders.length > 0 };
      }
      case 'haravan.createOrder': {
        let orderObj: any = {};
        try { orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : cfg.order; } catch {}
        const result = await IntegrationRegistry.executeActionByType('haravan', 'createOrder', { order: orderObj });
        return { order: result.order || result, success: true };
      }
      case 'haravan.lookupProduct': {
        const result = await IntegrationRegistry.executeActionByType('haravan', 'lookupProduct', {
          keyword: cfg.keyword, limit: Number(cfg.limit || 10),
        });
        return { products: result.products || [], found: result.found };
      }

      // ── P0: Sapo POS ─────────────────────────────────────────────────────
      case 'sapo.lookupCustomer': {
        const result = await IntegrationRegistry.executeActionByType('sapo', 'lookupCustomer', { phone: cfg.phone });
        return { customers: result.customers || [], found: result.found, firstCustomer: result.firstCustomer || null };
      }
      case 'sapo.lookupOrder': {
        const result = await IntegrationRegistry.executeActionByType('sapo', 'lookupOrder', { phone: cfg.phone, orderId: cfg.orderId });
        const orders: any[] = result.orders || (result.order ? [result.order] : []);
        return { orders, order: result.order || orders[0] || null, found: orders.length > 0 };
      }
      case 'sapo.createOrder': {
        let orderObj: any = {};
        try { orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : cfg.order; } catch {}
        const result = await IntegrationRegistry.executeActionByType('sapo', 'createOrder', { order: orderObj });
        return { order: result.order || result, success: true };
      }
      case 'sapo.lookupProduct': {
        const result = await IntegrationRegistry.executeActionByType('sapo', 'lookupProduct', {
          keyword: cfg.keyword, limit: Number(cfg.limit || 10),
        });
        return { products: result.products || [], found: result.found };
      }
      case 'sapo.getInventory': {
        const result = await IntegrationRegistry.executeActionByType('sapo', 'getInventory', {
          limit: Number(cfg.limit || 50),
        });
        return { items: result.items || [] };
      }

      // ── P0: Nhanh.vn ─────────────────────────────────────────────────────
      case 'nhanh.lookupCustomer': {
        const result = await IntegrationRegistry.executeActionByType('nhanh', 'lookupCustomer', { phone: cfg.phone });
        return { customers: result.customers || [], found: result.found, firstCustomer: result.firstCustomer || null };
      }
      case 'nhanh.lookupOrder': {
        const result = await IntegrationRegistry.executeActionByType('nhanh', 'lookupOrder', { phone: cfg.phone, orderId: cfg.orderId });
        const orders: any[] = result.orders || (result.order ? [result.order] : []);
        return { orders, order: result.order || orders[0] || null, found: orders.length > 0 };
      }
      case 'nhanh.createOrder': {
        let orderObj: any = {};
        try { orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : cfg.order; } catch {}
        const result = await IntegrationRegistry.executeActionByType('nhanh', 'createOrder', { order: orderObj });
        return { order: result.order || result, success: true };
      }
      case 'nhanh.lookupProduct': {
        const result = await IntegrationRegistry.executeActionByType('nhanh', 'lookupProduct', {
          keyword: cfg.keyword, code: cfg.code, limit: Number(cfg.limit || 10),
        });
        return { products: result.products || [], found: result.found };
      }

      // ── P0: Pancake POS ───────────────────────────────────────────────────
      case 'pancake.lookupCustomer': {
        const result = await IntegrationRegistry.executeActionByType('pancake', 'lookupCustomer', { phone: cfg.phone });
        return { customers: result.customers || [], found: result.found, firstCustomer: result.firstCustomer || null };
      }
      case 'pancake.lookupOrder': {
        const result = await IntegrationRegistry.executeActionByType('pancake', 'lookupOrder', { phone: cfg.phone, orderId: cfg.orderId });
        const orders: any[] = result.orders || (result.order ? [result.order] : []);
        return { orders, order: result.order || orders[0] || null, found: orders.length > 0 };
      }
      case 'pancake.createOrder': {
        let orderObj: any = {};
        try { orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : cfg.order; } catch {}
        const result = await IntegrationRegistry.executeActionByType('pancake', 'createOrder', { order: orderObj });
        return { order: result.order || result, success: true };
      }
      case 'pancake.lookupProduct': {
        const result = await IntegrationRegistry.executeActionByType('pancake', 'lookupProduct', {
          keyword: cfg.keyword, code: cfg.code, limit: Number(cfg.limit || 10),
        });
        return { products: result.products || [], found: result.found };
      }

      // ── P0: Payment (Casso/SePay) ─────────────────────────────────────────
      case 'payment.getTransactions': {
        const type = cfg.integrationType || 'casso';
        const result = await IntegrationRegistry.executeActionByType(type, 'getTransactions', {
          limit: Number(cfg.limit || 20),
          fromDate: cfg.fromDate,
          toDate: cfg.toDate,
        });
        return { transactions: result.transactions || [], total: result.total || 0 };
      }

      // ── P0: GHN Express ──────────────────────────────────────────────────
      case 'ghn.createOrder': {
        let orderObj: any = {};
        try {
          orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : (cfg.order || {});
        } catch {}
        orderObj = {
          ...orderObj,
          ...(cfg.toName ? { to_name: cfg.toName } : {}),
          ...(cfg.toPhone ? { to_phone: cfg.toPhone } : {}),
          ...(cfg.toAddress ? { to_address: cfg.toAddress } : {}),
          ...(cfg.toDistrictId ? { to_district_id: Number(cfg.toDistrictId) } : {}),
          ...(cfg.toWardCode ? { to_ward_code: cfg.toWardCode } : {}),
          ...(cfg.weight ? { weight: Number(cfg.weight) } : {}),
          ...(cfg.serviceTypeId ? { service_type_id: Number(cfg.serviceTypeId) } : {}),
          ...(cfg.codAmount != null && String(cfg.codAmount) !== '' ? { cod_amount: Number(cfg.codAmount) } : {}),
        };
        const result = await IntegrationRegistry.executeActionByType('ghn', 'createOrder', {
          order: orderObj,
        });
        return { order: result.order || {}, orderCode: result.order?.order_code || '', success: true };
      }

      case 'ghn.getTracking': {
        const result = await IntegrationRegistry.executeActionByType('ghn', 'getTracking', {
          orderCode: cfg.orderCode,
        });
        const tracking = result.tracking || {};
        return {
          tracking,
          status: tracking.status || '',
          orderCode: tracking.order_code || cfg.orderCode,
          updatedDate: tracking.updated_date || '',
        };
      }

      case 'ghn.getProvinces': {
        const result = await IntegrationRegistry.executeActionByType('ghn', 'getProvinces', {});
        return { provinces: result.provinces || [] };
      }

      case 'ghn.getDistricts': {
        const result = await IntegrationRegistry.executeActionByType('ghn', 'getDistricts', {
          provinceId: Number(cfg.provinceId || 0),
        });
        return { districts: result.districts || [] };
      }

      case 'ghn.getWards': {
        const result = await IntegrationRegistry.executeActionByType('ghn', 'getWards', {
          districtId: Number(cfg.districtId || 0),
        });
        return { wards: result.wards || [] };
      }

      case 'ghn.getServices': {
        const result = await IntegrationRegistry.executeActionByType('ghn', 'getServices', {
          fromDistrict: Number(cfg.fromDistrict || 0),
          toDistrict: Number(cfg.toDistrict || 0),
        });
        return { services: result.services || [] };
      }

      // ── P0: GHTK ─────────────────────────────────────────────────────────
      case 'ghtk.createOrder': {
        let orderObj: any = {};
        try {
          orderObj = typeof cfg.order === 'string' ? JSON.parse(cfg.order) : cfg.order;
        } catch {}
        const result = await IntegrationRegistry.executeActionByType('ghtk', 'createOrder', orderObj);
        return { order: result.order || {}, trackingCode: result.order?.label || '', success: true };
      }

      case 'ghtk.getTracking': {
        const result = await IntegrationRegistry.executeActionByType('ghtk', 'getTracking', {
          trackingCode: cfg.trackingCode,
        });
        const tracking = result.tracking || {};
        return {
          tracking,
          status: tracking.status_text || tracking.status || '',
          trackingCode: tracking.label || cfg.trackingCode,
        };
      }

      // ── Facebook ─────────────────────────────────────────────────────────────
      case 'fb.trigger.message':
      case 'fb.trigger.image':
      case 'fb.trigger.video':
      case 'fb.trigger.file':
      case 'fb.trigger.sticker':
      case 'fb.trigger.reaction':
      case 'fb.trigger.unsend':
      case 'fb.trigger.groupEvent':
        return { ...ctx.trigger };

      case 'fb.action.sendMessage': {
        const rawAccountId = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawAccountId) throw new Error('[fb.action.sendMessage] accountId required');
        const accountId = this.resolveFBAccountId(rawAccountId);
        if (!cfg.message) throw new Error('[fb.action.sendMessage] message required');
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        if (!targetThreadIds.length) throw new Error('[fb.action.sendMessage] threadId/threadIds required');

        const continueOnError = cfg.continueOnError === true;
        let lastResult: any = { success: false, error: 'Không gửi được đến hội thoại nào' };
        for (const tid of targetThreadIds) {
          try {
            const result = await FacebookSendService.sendTextMessage({
              accountId,
              threadId: tid,
              body: String(cfg.message || ''),
              typeChat: cfg.typeChat,
              replyToMessageId: cfg.replyToMessageId,
            });
            lastResult = result;
            Logger.log(`[WorkflowEngine] fb.action.sendMessage to ${tid}: success=${result.success}, msgId=${result.messageId}`);
          } catch (err: any) {
            Logger.warn(`[WorkflowEngine] fb.action.sendMessage to ${tid} failed: ${err.message}`);
            lastResult = { success: false, error: err.message };
            if (!continueOnError) throw err;
          }
        }
        return {
          success: lastResult.success,
          messageId: lastResult.messageId,
          ...(lastResult.error ? { error: lastResult.error } : {}),
          _targetCount: targetThreadIds.length,
        };
      }

      case 'fb.action.addReaction': {
        const rawAccountId = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawAccountId) throw new Error('[fb.action.addReaction] accountId required');
        const accountId = this.resolveFBAccountId(rawAccountId);
        const service = await FacebookService.getInstance(accountId);
        const messageId = cfg.messageId || ctx.trigger?.messageId;
        if (!messageId) throw new Error('[fb.action.addReaction] messageId required');
        // E2EE 1:1 → cần gửi qua bridge (reaction có mã hoá)
        if (cfg.typeChat === 'user' && service.isE2EEConnected()) {
          const { normalizeChatJid } = require('../facebook/FacebookUtils');
          const chatJid = normalizeChatJid(String(cfg.threadId || ctx.trigger?.threadId || ''));
          const senderJid = normalizeChatJid(accountId);
          const e2eeResult = await service.sendE2EEReaction(chatJid, String(messageId), senderJid, cfg.emoji || '👍');
          return { success: e2eeResult.success };
        }
        await service.addReaction(String(messageId), cfg.emoji || '👍', 'add');
        return { success: true };
      }

      case 'fb.action.sendImage': {

        const rawAccountId = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawAccountId) throw new Error('[fb.action.sendImage] accountId required');
        const accountId = this.resolveFBAccountId(rawAccountId);
        const service = await FacebookService.getInstance(accountId);
        const targetThreadIds = this.resolveTargetThreadIds(cfg, ctx.trigger?.threadId, ctx);
        if (!targetThreadIds.length) throw new Error('[fb.action.sendImage] threadId/threadIds required');
        const filePath = String(cfg.filePath);
        const caption = cfg.body || cfg.message || '';
        const continueOnError = cfg.continueOnError === true;

        let lastResult: any = { success: false, error: 'Không gửi được đến hội thoại nào' };
        for (const threadId of targetThreadIds) {
          try {
            const isUser = /^\d+$/.test(String(threadId));

            // E2EE 1:1: try bridge first (handles upload internally)
            if (isUser && service.isE2EEConnected()) {
              const { normalizeChatJid } = require('../facebook/FacebookUtils');
              const chatJid = normalizeChatJid(String(threadId));
              const e2eeResult = await service.sendE2EEImage(chatJid, filePath, caption);
              if (e2eeResult.success && e2eeResult.messageId) {
                const fbSenderId = service.getRealFacebookId() || accountId;
                const fileName = require('path').basename(filePath);
                await FacebookSendService.persistSentMessage({
                  accountId, threadId: String(threadId),
                  messageId: e2eeResult.messageId,
                  body: caption || null,
                  fbSenderId,
                  timestamp: e2eeResult.timestamp || Date.now(),
                  type: 'image',
                  isUserMessage: true,
                  attachments: JSON.stringify([{ type: 'image', name: fileName }]),
                });
                lastResult = { success: true, messageId: e2eeResult.messageId };
                Logger.log(`[WorkflowEngine] fb.action.sendImage to ${threadId}: success via E2EE, msgId=${e2eeResult.messageId}`);
                continue;
              }
            }

            // REST fallback: upload + send with attachment
            const att = await service.uploadAttachment(filePath);
            if (!att) throw new Error('[fb.action.sendImage] Upload failed');
            let result = await service.sendMessage(String(threadId), caption, { attachmentId: att.attachmentId });

            // E2EE error detection → retry via bridge for 1:1
            if (!result.success && isUser && /disabled|vô hiệu hoá|encrypted/i.test(result.error || '')) {
              Logger.warn(`[Workflow:fb.action.sendImage] E2EE error, retrying via bridge for thread=${threadId}`);
          if (!service.isE2EEConnected()) {
            try { await service.retryE2EE(); } catch {}
          }
          if (service.isE2EEConnected()) {
            const { normalizeChatJid } = require('../facebook/FacebookUtils');
            const chatJid = normalizeChatJid(String(threadId));
            const e2eeResult = await service.sendE2EEImage(chatJid, filePath, caption);
            if (e2eeResult.success && e2eeResult.messageId) {
              const fbSenderId = service.getRealFacebookId() || accountId;
              const fileName = require('path').basename(filePath);
              await FacebookSendService.persistSentMessage({
                accountId, threadId: String(threadId),
                messageId: e2eeResult.messageId,
                body: caption || null,
                fbSenderId,
                timestamp: e2eeResult.timestamp || Date.now(),
                type: 'image',
                isUserMessage: true,
                attachments: JSON.stringify([{ type: 'image', name: fileName }]),
              });
              lastResult = { success: true, messageId: e2eeResult.messageId };
              continue;
            }
          }
        }

        // ── Save DB + emit cho REST path ──
        if (result.success && result.messageId) {
          const fbSenderId = service.getRealFacebookId() || accountId;
          await FacebookSendService.persistSentMessage({
            accountId, threadId: String(threadId),
            messageId: result.messageId,
            body: caption || null,
            fbSenderId,
            timestamp: result.timestamp || Date.now(),
            type: 'image',
            isUserMessage: false,
            attachments: JSON.stringify([{ type: 'image', name: require('path').basename(filePath), id: String(att.attachmentId) }]),
          });
          lastResult = { success: true, messageId: result.messageId };
        } else {
          lastResult = { success: false, error: result.error || 'Send failed' };
          if (!continueOnError) throw new Error(lastResult.error);
        }
        Logger.log(`[WorkflowEngine] fb.action.sendImage to ${threadId}: success=${lastResult.success}`);

        } catch (err: any) {
          Logger.warn(`[WorkflowEngine] fb.action.sendImage to ${threadId} failed: ${err.message}`);
          lastResult = { success: false, error: err.message };
          if (!continueOnError) throw err;
        }
      }
      return {
        success: lastResult.success,
        messageId: lastResult.messageId,
        ...(lastResult.error ? { error: lastResult.error } : {}),
        _targetCount: targetThreadIds.length,
      };
      }

      case 'fb.action.sendTyping': {
        const rawA1 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA1) throw new Error('[fb.action.sendTyping] accountId required');
        const a1 = this.resolveFBAccountId(rawA1);
        const s1 = await FacebookService.getInstance(a1);
        const t1 = cfg.threadId || ctx.trigger?.threadId;
        if (!t1) throw new Error('[fb.action.sendTyping] threadId required');
        await s1.sendTyping(String(t1), cfg.isTyping !== false);
        return { success: true };
      }

      case 'fb.action.markAsRead': {
        const rawA2 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA2) throw new Error('[fb.action.markAsRead] accountId required');
        const a2 = this.resolveFBAccountId(rawA2);
        const s2 = await FacebookService.getInstance(a2);
        const t2 = cfg.threadId || ctx.trigger?.threadId;
        if (!t2) throw new Error('[fb.action.markAsRead] threadId required');
        await s2.markReadOnServer(String(t2));
        return { success: true };
      }

      case 'fb.action.forward': {
        const rawAccountId = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawAccountId) throw new Error('[fb.action.forward] accountId required');
        const accountId = this.resolveFBAccountId(rawAccountId);
        const threadId = cfg.targetThreadId || ctx.trigger?.threadId;
        if (!threadId) throw new Error('[fb.action.forward] targetThreadId required');
        const message = cfg.message || ctx.trigger?.content || '';
        if (!message) throw new Error('[fb.action.forward] Missing message content');
        // Resend như tin nhắn mới — giống behavior chat (sendOneForward), không dùng forwardMessage API riêng
        const result = await FacebookSendService.sendTextMessage({
          accountId,
          threadId: String(threadId),
          body: String(message),
        });
        return {
          success: result.success,
          messageId: result.messageId,
          ...(result.error ? { error: result.error } : {}),
        };
      }

      case 'fb.action.pin': {
        const rawA4 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA4) throw new Error('[fb.action.pin] accountId required');
        const a4 = this.resolveFBAccountId(rawA4);
        const s4 = await FacebookService.getInstance(a4);
        const m2 = cfg.messageId || ctx.trigger?.messageId;
        if (!m2) throw new Error('[fb.action.pin] messageId required');
        const t3 = cfg.threadId || ctx.trigger?.threadId;
        if (!t3) throw new Error('[fb.action.pin] threadId required');
        const r2 = await s4.pinMessage(String(m2), String(t3));
        return { success: r2.success };
      }

      case 'fb.action.unpin': {
        const rawA5 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA5) throw new Error('[fb.action.unpin] accountId required');
        const a5 = this.resolveFBAccountId(rawA5);
        const s5 = await FacebookService.getInstance(a5);
        const m3 = cfg.messageId || ctx.trigger?.messageId;
        if (!m3) throw new Error('[fb.action.unpin] messageId required');
        const t4 = cfg.threadId || ctx.trigger?.threadId;
        if (!t4) throw new Error('[fb.action.unpin] threadId required');
        const r3 = await s5.unpinMessage(String(m3), String(t4));
        return { success: r3.success };
      }

      case 'fb.action.createPoll': {
        const rawA6 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA6) throw new Error('[fb.action.createPoll] accountId required');
        const a6 = this.resolveFBAccountId(rawA6);
        const s6 = await FacebookService.getInstance(a6);
        const t5 = cfg.threadId || ctx.trigger?.threadId;
        if (!t5) throw new Error('[fb.action.createPoll] threadId required');
        if (!cfg.question) throw new Error('[fb.action.createPoll] question required');
        const opts: string[] = String(cfg.options || '').split('\n').map((x: string) => x.trim()).filter(Boolean);
        const r4 = await s6.createPoll(String(t5), String(cfg.question), opts);
        return { success: r4.success, pollId: r4.pollId };
      }

      case 'fb.action.block': {
        const rawA7 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA7) throw new Error('[fb.action.block] accountId required');
        const a7 = this.resolveFBAccountId(rawA7);
        const s7 = await FacebookService.getInstance(a7);
        const u1 = cfg.userId || ctx.trigger?.fromId;
        if (!u1) throw new Error('[fb.action.block] userId required');
        const r5 = await s7.blockUser(String(u1));
        return { success: r5.success };
      }

      case 'fb.action.unsend': {
        const rawA8 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA8) throw new Error('[fb.action.unsend] accountId required');
        const a8 = this.resolveFBAccountId(rawA8);
        const s8 = await FacebookService.getInstance(a8);
        const m4 = cfg.messageId || ctx.trigger?.messageId;
        if (!m4) throw new Error('[fb.action.unsend] messageId required');
        const r6 = await s8.unsendMessage(String(m4));
        return { success: r6.success };
      }

      case 'fb.action.editMessage': {
        const rawA9 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA9) throw new Error('[fb.action.editMessage] accountId required');
        const a9 = this.resolveFBAccountId(rawA9);
        const s9 = await FacebookService.getInstance(a9);
        const m5 = cfg.messageId || ctx.trigger?.messageId;
        if (!m5) throw new Error('[fb.action.editMessage] messageId required');
        if (!cfg.text && !cfg.newText) throw new Error('[fb.action.editMessage] text required');
        const editText = cfg.text || cfg.newText || '';
        const r7 = await s9.editMessage(String(m5), String(editText));
        return { success: r7.success };
      }

      case 'fb.action.changeName': {
        const rawA10 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA10) throw new Error('[fb.action.changeName] accountId required');
        const a10 = this.resolveFBAccountId(rawA10);
        const s10 = await FacebookService.getInstance(a10);
        const t6 = cfg.threadId || ctx.trigger?.threadId;
        if (!t6) throw new Error('[fb.action.changeName] threadId required');
        if (!cfg.name) throw new Error('[fb.action.changeName] name required');
        const r8 = await s10.changeThreadName(String(t6), String(cfg.name));
        return { success: r8 };
      }

      case 'fb.action.changeEmoji': {
        const rawA11 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA11) throw new Error('[fb.action.changeEmoji] accountId required');
        const a11 = this.resolveFBAccountId(rawA11);
        const s11 = await FacebookService.getInstance(a11);
        const t7 = cfg.threadId || ctx.trigger?.threadId;
        if (!t7) throw new Error('[fb.action.changeEmoji] threadId required');
        if (!cfg.emoji) throw new Error('[fb.action.changeEmoji] emoji required');
        const r9 = await s11.changeThreadEmoji(String(t7), String(cfg.emoji));
        return { success: r9 };
      }

      case 'fb.action.changeNickname': {
        const rawA12 = cfg.accountId || ctx.trigger?.fbAccountId || ctx.pageId;
        if (!rawA12) throw new Error('[fb.action.changeNickname] accountId required');
        const a12 = this.resolveFBAccountId(rawA12);
        const s12 = await FacebookService.getInstance(a12);
        const t8 = cfg.threadId || ctx.trigger?.threadId;
        if (!t8) throw new Error('[fb.action.changeNickname] threadId required');
        const u2 = cfg.userId || ctx.trigger?.fromId;
        if (!u2) throw new Error('[fb.action.changeNickname] userId required');
        if (cfg.nickname === undefined) throw new Error('[fb.action.changeNickname] nickname required');
        const r10 = await s12.changeNickname(String(t8), String(u2), String(cfg.nickname));
        return { success: r10 };
      }

      default:
        return {};
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getApi(pageId: string, fallbackPageId?: string): any {
    // Nếu là nhân viên, chuyển tiếp cuộc gọi API Zalo sang máy Boss
    try {
      const WorkspaceManager = require('../../utils/WorkspaceManager').default;
      const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
      if (activeWs && activeWs.type === 'remote') {
        const HttpConnectionManager = require('../http/HttpConnectionManager').default;
        const targetZaloId = pageId || fallbackPageId || '';
        return {
          sendMessage: async (p1: any, p2: any, p3: any, p4: any) => {
            let messageParam = p1;
            if (p1 && typeof p1 === 'object' && p1.attachments && p1.attachments.length > 0) {
              const clientService = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
              if (clientService) {
                const fs = require('fs');
                const path = require('path');
                const uploadedPaths = [];
                for (const filePath of p1.attachments) {
                  try {
                    if (typeof filePath === 'string' && !filePath.startsWith('http://') && !filePath.startsWith('https://') && fs.existsSync(filePath)) {
                      const buffer = fs.readFileSync(filePath);
                      const base64 = buffer.toString('base64');
                      const filename = path.basename(filePath);
                      const uploadRes = await clientService.uploadMedia(base64, filename, targetZaloId);
                      if (uploadRes?.success && uploadRes.bossPath) {
                        uploadedPaths.push(uploadRes.bossPath);
                      } else {
                        Logger.warn(`[WorkflowEngine] Proxy uploadMedia failed for ${filePath}: ${uploadRes?.error}`);
                        uploadedPaths.push(filePath);
                      }
                    } else {
                      uploadedPaths.push(filePath);
                    }
                  } catch (err: any) {
                    Logger.error(`[WorkflowEngine] Proxy upload read error for ${filePath}: ${err.message}`);
                    uploadedPaths.push(filePath);
                  }
                }
                messageParam = { ...p1, attachments: uploadedPaths };
              }
            }

            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendMessage', {
              zaloId: targetZaloId,
              auth: {},
              message: messageParam,
              threadId: p2,
              type: p3,
              typeMessage: p4 || 'text'
            });
            return res?.success ? res.response : res;
          },
          sendTypingEvent: async () => {
            return { success: true };
          },
          findUser: async (phone: string) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:findUser', { zaloId: targetZaloId, auth: {}, phone });
            return res?.success ? res.response : res;
          },
          getUserInfo: async (p: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:getUserInfo', { zaloId: targetZaloId, auth: {}, userId: p.userId });
            return res?.success ? res.response : res;
          },
          acceptFriendRequest: async (userId: string) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:acceptFriendRequest', { zaloId: targetZaloId, auth: {}, userId });
            return res?.success ? res.response : res;
          },
          rejectFriendRequest: async (userId: string) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:rejectFriendRequest', { zaloId: targetZaloId, auth: {}, userId });
            return res?.success ? res.response : res;
          },
          sendFriendRequest: async (message: string, userId: string) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendFriendRequest', { zaloId: targetZaloId, auth: {}, message, userId });
            return res?.success ? res.response : res;
          },
          addUserToGroup: async (p: any) => {
            const members = Array.isArray(p.members) ? p.members : [p.members].filter(Boolean);
            const results = [];
            for (const userId of members) {
              const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:addUserToGroup', { zaloId: targetZaloId, auth: {}, groupId: p.groupId, userId });
              results.push(res);
            }
            return { success: results.every(r => r?.success), results };
          },
          removeUserFromGroup: async (p: any) => {
            const members = Array.isArray(p.members) ? p.members : [p.members].filter(Boolean);
            const results = [];
            for (const userId of members) {
              const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:removeUserFromGroup', { zaloId: targetZaloId, auth: {}, groupId: p.groupId, userId });
              results.push(res);
            }
            return { success: results.every(r => r?.success), results };
          },
          undo: async (p: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:undoMessage', { zaloId: targetZaloId, auth: {}, msgId: p.msgId, threadId: p.threadId, type: p.threadType });
            return res?.success ? res.response : res;
          },
          setMute: async (threadId: string, threadType: any, duration: any, isMute: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:setMute', { zaloId: targetZaloId, auth: {}, threadId, type: threadType, duration, isMute });
            return res?.success ? res.response : res;
          },
          addReaction: async (p: any, type: number) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:addReaction', { zaloId: targetZaloId, auth: {}, msgId: p.msgId, clientMsgId: p.clientMsgId, reactionType: type });
            return res?.success ? res.response : res;
          },
          createPoll: async (options: any, groupId: string) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:createPoll', {
              zaloId: targetZaloId,
              auth: {},
              options,
              groupId
            });
            return res?.success ? res.response : res;
          },
          getGroupChatHistory: async (p: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:getMessageHistory', { zaloId: targetZaloId, auth: {}, ...p });
            return res?.success ? res.response : res;
          },
          sendVideo: async (options: any, threadId: string, type: any) => {
            const clientService = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
            let bossPath = options.videoUrl;
            if (clientService && bossPath) {
              const fs = require('fs');
              const path = require('path');
              try {
                let localPath = bossPath;
                if (localPath.startsWith('file://')) {
                  const decoded = decodeURIComponent(localPath);
                  const pathPart = decoded.startsWith('file:///') ? decoded.substring(8) : decoded.substring(7);
                  localPath = /^[a-zA-Z]:/.test(pathPart) ? pathPart : '/' + pathPart;
                }
                if (localPath && !localPath.startsWith('http://') && !localPath.startsWith('https://') && fs.existsSync(localPath)) {
                  const buffer = fs.readFileSync(localPath);
                  const base64 = buffer.toString('base64');
                  const filename = path.basename(localPath);
                  const uploadRes = await clientService.uploadMedia(base64, filename, targetZaloId);
                  if (uploadRes?.success && uploadRes.bossPath) {
                    bossPath = uploadRes.bossPath;
                  } else {
                    Logger.warn(`[WorkflowEngine] Proxy sendVideo upload failed: ${uploadRes?.error}`);
                  }
                }
              } catch (err: any) {
                Logger.error(`[WorkflowEngine] Proxy sendVideo upload error: ${err.message}`);
              }
            }
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendVideo', {
              zaloId: targetZaloId,
              auth: {},
              options: { ...options, videoUrl: bossPath },
              threadId,
              type
            });
            return res?.success ? res.response : res;
          },
          sendVoice: async (options: any, threadId: string, type: any) => {
            const clientService = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
            let bossPath = options.voiceUrl;
            if (clientService && bossPath) {
              const fs = require('fs');
              const path = require('path');
              try {
                let localPath = bossPath;
                if (localPath.startsWith('file://')) {
                  const decoded = decodeURIComponent(localPath);
                  const pathPart = decoded.startsWith('file:///') ? decoded.substring(8) : decoded.substring(7);
                  localPath = /^[a-zA-Z]:/.test(pathPart) ? pathPart : '/' + pathPart;
                }
                if (localPath && !localPath.startsWith('http://') && !localPath.startsWith('https://') && fs.existsSync(localPath)) {
                  const buffer = fs.readFileSync(localPath);
                  const base64 = buffer.toString('base64');
                  const filename = path.basename(localPath);
                  const uploadRes = await clientService.uploadMedia(base64, filename, targetZaloId);
                  if (uploadRes?.success && uploadRes.bossPath) {
                    bossPath = uploadRes.bossPath;
                  } else {
                    Logger.warn(`[WorkflowEngine] Proxy sendVoice upload failed: ${uploadRes?.error}`);
                  }
                }
              } catch (err: any) {
                Logger.error(`[WorkflowEngine] Proxy sendVoice upload error: ${err.message}`);
              }
            }
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendVoice', {
              zaloId: targetZaloId,
              auth: {},
              options: { ...options, voiceUrl: bossPath },
              threadId,
              type
            });
            return res?.success ? res.response : res;
          },
          sendBankCard: async (payload: any, threadId: string, type: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendBankCard', { zaloId: targetZaloId, auth: {}, payload, threadId, type });
            return res?.success ? res.response : res;
          },
          sendCard: async (cardsInfo: any) => {
            const card = cardsInfo[0] || {};
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendCard', { zaloId: targetZaloId, auth: {}, options: card.options, threadId: card.threadId, type: card.type, quote: card.quote });
            return res?.success ? res.response : res;
          },
          sendFile: async (filePath: string, threadId: string, type: any, quote: any = null) => {
            const clientService = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
            let bossPath = filePath;
            if (clientService) {
              const fs = require('fs');
              const path = require('path');
              try {
                if (filePath && !filePath.startsWith('http://') && !filePath.startsWith('https://') && fs.existsSync(filePath)) {
                  const buffer = fs.readFileSync(filePath);
                  const base64 = buffer.toString('base64');
                  const filename = path.basename(filePath);
                  const uploadRes = await clientService.uploadMedia(base64, filename, targetZaloId);
                  if (uploadRes?.success && uploadRes.bossPath) {
                    bossPath = uploadRes.bossPath;
                  } else {
                    Logger.warn(`[WorkflowEngine] Proxy sendFile upload failed for ${filePath}: ${uploadRes?.error}`);
                  }
                }
              } catch (err: any) {
                Logger.error(`[WorkflowEngine] Proxy sendFile error for ${filePath}: ${err.message}`);
              }
            }
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendFile', {
              zaloId: targetZaloId,
              auth: {},
              filePath: bossPath,
              threadId,
              type,
              quote
            });
            return res?.success ? res.response : res;
          },
          sendImage: async (filePath: string, threadId: string, type: any, message: string = '', quote: any = null) => {
            const clientService = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
            let bossPath = filePath;
            if (clientService) {
              const fs = require('fs');
              const path = require('path');
              try {
                if (filePath && !filePath.startsWith('http://') && !filePath.startsWith('https://') && fs.existsSync(filePath)) {
                  const buffer = fs.readFileSync(filePath);
                  const base64 = buffer.toString('base64');
                  const filename = path.basename(filePath);
                  const uploadRes = await clientService.uploadMedia(base64, filename, targetZaloId);
                  if (uploadRes?.success && uploadRes.bossPath) {
                    bossPath = uploadRes.bossPath;
                  } else {
                    Logger.warn(`[WorkflowEngine] Proxy sendImage upload failed: ${uploadRes?.error}`);
                  }
                }
              } catch (err: any) {
                Logger.error(`[WorkflowEngine] Proxy sendImage upload error: ${err.message}`);
              }
            }
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendImage', {
              zaloId: targetZaloId,
              auth: {},
              filePath: bossPath,
              threadId,
              type,
              message,
              quote
            });
            return res?.success ? res.response : res;
          },
          sendImages: async (filePaths: string[], threadId: string, type: any, quote: any = null) => {
            const clientService = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
            const bossPaths = [];
            if (clientService) {
              const fs = require('fs');
              const path = require('path');
              for (const filePath of (filePaths || [])) {
                try {
                  if (filePath && !filePath.startsWith('http://') && !filePath.startsWith('https://') && fs.existsSync(filePath)) {
                    const buffer = fs.readFileSync(filePath);
                    const base64 = buffer.toString('base64');
                    const filename = path.basename(filePath);
                    const uploadRes = await clientService.uploadMedia(base64, filename, targetZaloId);
                    if (uploadRes?.success && uploadRes.bossPath) {
                      bossPaths.push(uploadRes.bossPath);
                    } else {
                      Logger.warn(`[WorkflowEngine] Proxy sendImages upload failed: ${uploadRes?.error}`);
                      bossPaths.push(filePath);
                    }
                  } else {
                    bossPaths.push(filePath);
                  }
                } catch (err: any) {
                  Logger.error(`[WorkflowEngine] Proxy sendImages upload error: ${err.message}`);
                  bossPaths.push(filePath);
                }
              }
            } else {
              bossPaths.push(...(filePaths || []));
            }
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:sendImages', {
              zaloId: targetZaloId,
              auth: {},
              filePaths: bossPaths,
              threadId,
              type,
              quote
            });
            return res?.success ? res.response : res;
          },
          getLabels: async () => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:getLabels', { zaloId: targetZaloId, auth: {} });
            return res?.success ? res.response : res;
          },
          updateLabels: async (params: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:updateLabels', { zaloId: targetZaloId, auth: {}, ...params });
            return res?.success ? res.response : res;
          },
          forwardMessage: async (payload: any, threadIds: string[], type: any) => {
            const res = await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:forwardMessage', { zaloId: targetZaloId, auth: {}, payload, threadIds, type });
            return res?.success ? res.response : res;
          }
        };
      }
    } catch (e: any) {
      Logger.error(`[WorkflowEngine] Proxy init error: ${e.message}`);
      throw new Error(`[WorkflowEngine] Không thể khởi tạo proxy API Zalo: ${e.message}`);
    }

    // Try to find connection by pageId or use any connected account
    let conn = ConnectionManager.getConnection(pageId);
    if (!conn && fallbackPageId) {
      conn = ConnectionManager.getConnection(fallbackPageId);
    }
    if (!conn) {
      // Try first available connected account
      for (const [, c] of ConnectionManager.getAllConnections()) {
        if (c.connected) { conn = c; break; }
      }
    }
    if (!conn || !conn.api) throw new Error(`Account ${pageId || fallbackPageId || 'unknown'} không connected`);
    
    // Wrap rawApi (ZaloService) to ensure its signatures match the Employee Mode proxy signatures.
    // This resolves signature mismatches for: getUserInfo, addUserToGroup, removeUserFromGroup, undo, addReaction, getGroupChatHistory, updateLabels.
    const rawApi = conn.api as any;
    return {
      ...rawApi,
      sendMessage: (p1: any, p2: any, p3: any, p4: any) => rawApi.sendMessage(p1, p2, p3, p4),
      sendTypingEvent: (threadId: string, type: any, destType?: number) => rawApi.sendTypingEvent(threadId, type, destType),
      findUser: (phone: string) => rawApi.findUser(phone),
      getUserInfo: (p: { userId: string }) => rawApi.getUserInfo(p.userId),
      acceptFriendRequest: (userId: string) => rawApi.acceptFriendRequest(userId),
      rejectFriendRequest: (userId: string) => rawApi.rejectFriendRequest(userId),
      sendFriendRequest: (message: string, userId: string) => rawApi.sendFriendRequest(message, userId),
      addUserToGroup: async (p: { groupId: string; members: string | string[] }) => {
        const members = Array.isArray(p.members) ? p.members : [p.members].filter(Boolean);
        const results = [];
        for (const userId of members) {
          try {
            try {
              // Thử thêm trực tiếp trước
              const res = await rawApi.addUserToGroup(userId, p.groupId);
              results.push(res);
            } catch (err: any) {
              Logger.warn(`[WorkflowEngine] Direct addUserToGroup failed for user ${userId} in group ${p.groupId}: ${err.message}. Trying inviteUserToGroups fallback...`);
              // Gọi API mời làm phương án dự phòng
              const res = await rawApi.inviteUserToGroups(userId, [p.groupId]);
              results.push({ success: true, ...res });
            }
          } catch (err) {
            results.push({ success: false, error: err instanceof Error ? err.message : String(err) });
          }
        }
        return { success: results.every(r => r?.success !== false), results };
      },
      removeUserFromGroup: async (p: { groupId: string; members: string | string[] }) => {
        const members = Array.isArray(p.members) ? p.members : [p.members].filter(Boolean);
        const results = [];
        for (const userId of members) {
          try {
            const res = await rawApi.removeUserFromGroup(userId, p.groupId);
            results.push(res);
          } catch (err) {
            results.push({ success: false, error: err instanceof Error ? err.message : String(err) });
          }
        }
        return { success: results.every(r => r?.success !== false), results };
      },
      undo: async (p: { msgId: string; threadId: string; threadType: number }) => {
        const mockMsg = JSON.stringify({
          threadId: p.threadId,
          type: p.threadType === 1 ? 'group' : 'user',
          data: {
            msgId: p.msgId,
            cliMsgId: p.msgId,
          }
        });
        return await rawApi.undoMessage(mockMsg);
      },
      setMute: (threadId: string, threadType: any, duration: any, isMute: any) => rawApi.setMute(threadId, threadType, duration, isMute),
      addReaction: async (p: { msgId: string; clientMsgId: string; threadId?: string; type?: any }, type: number) => {
        const ReactionsMap = {
          1: 'LIKE',
          2: 'LOVE',
          3: 'HAHA',
          4: 'WOW',
          5: 'SAD',
          6: 'ANGRY'
        } as any;
        const rKey = ReactionsMap[type] || 'LIKE';
        const mockMsg = JSON.stringify({
          threadId: p.threadId || '',
          type: p.type ?? 0,
          data: {
            msgId: p.msgId,
            cliMsgId: p.clientMsgId || p.msgId
          }
        });
        return await rawApi.addReaction(rKey, mockMsg);
      },
      createPoll: (options: any, groupId: string) => rawApi.createPoll(options, groupId),
      getGroupChatHistory: (p: { groupId: string; lastMsgId?: string; count?: number }) => rawApi.getGroupChatHistory(p.groupId, p.lastMsgId, p.count),
      sendVideo: (options: any, threadId: string, type: any) => rawApi.sendVideo(options, threadId, type),
      sendVoice: (options: any, threadId: string, type: any) => rawApi.sendVoice(options, threadId, type),
      sendBankCard: (payload: any, threadId: string, type: any) => rawApi.sendBankCard(payload, threadId, type),
      sendCard: (cardsInfo: any) => rawApi.sendCard(cardsInfo),
      sendFile: (filePath: string, threadId: string, type: any, quote: any = null) => rawApi.sendFile(filePath, threadId, type, quote),
      sendImage: (filePath: string, threadId: string, type: any, message: string = '', quote: any = null) => rawApi.sendImage(filePath, threadId, type, message, quote),
      sendImages: (filePaths: string[], threadId: string, type: any, quote: any = null) => rawApi.sendImages(filePaths, threadId, type, quote),
      getLabels: () => rawApi.getLabels(),
      updateLabels: (p: { labelData?: any[]; labels?: any[]; version: number }) => rawApi.updateLabels(p.labelData || p.labels || [], p.version),
      forwardMessage: (payload: any, threadIds: string[], type: any) => rawApi.forwardMessage(payload, threadIds, type)
    };
  }

  private topologicalSort(wf: Workflow): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const node of wf.nodes) { inDegree.set(node.id, 0); adj.set(node.id, []); }
    for (const edge of wf.edges) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const result: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      result.push(id);
      for (const next of adj.get(id) ?? []) {
        const d = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    // ⚠️ Nếu graph có cycle, topological sort không thể xử lý
    // Chỉ trả về nodes có thể sort được (không cycle)
    Logger.warn(`[WorkflowEngine] topologicalSort: ${result.length}/${wf.nodes.length} nodes sorted, ${wf.nodes.length - result.length} nodes skipped due to cycle(s)`);
    return result;
  }

  /** Resolve target thread IDs từ cfg, hỗ trợ cả threadIds (mảng JSON) và threadId (string cũ) */
  private resolveTargetThreadIds(cfg: Record<string, any>, triggerThreadId?: string, ctx?: ExecutionContext): string[] {
    if (ctx?.trigger?.isOverrideTarget && triggerThreadId) {
      return [triggerThreadId];
    }
    if (cfg.threadIds) {
      try {
        const parsed = JSON.parse(cfg.threadIds);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String);
      } catch {}
    }
    if (cfg.threadId) return [String(cfg.threadId)];
    if (triggerThreadId) return [triggerThreadId];
    return [];
  }

  /** Resolve target IDs từ cfg, hỗ trợ cả dạng mảng JSON đa chọn và dạng đơn lẻ cũ/biến động */
  private resolveTargetIds(cfg: Record<string, any>, key: string, ctx: ExecutionContext): string[] {
    if (ctx.trigger?.isOverrideTarget && ctx.trigger?.threadId && (key === 'threadId' || key === 'toThreadId' || key === 'targetId')) {
      return [String(ctx.trigger.threadId)];
    }
    const pluralKey = key.endsWith('Id') ? key.slice(0, -2) + 'Ids' : key + 's';
    if (cfg[pluralKey]) {
      try {
        const parsed = JSON.parse(cfg[pluralKey]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String);
      } catch {}
    }
    if (cfg[key]) return [String(cfg[key])];
    if (key === 'threadId' || key === 'toThreadId') {
      if (ctx.trigger?.threadId) return [String(ctx.trigger.threadId)];
    }
    return [];
  }
  private renderConfig(config: Record<string, any>, ctx: ExecutionContext, currentNodeId?: string): Record<string, any> {
    const rendered: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        // Check if it is a single template expression: e.g. "{{ $node.id.contacts }}"
        if (trimmed.startsWith('{{') && trimmed.endsWith('}}') && (trimmed.match(/\{\{/g) || []).length === 1) {
          const expr = trimmed.slice(2, -2).trim();
          const resolved = this.resolveExpressionValue(expr, ctx, currentNodeId);
          if (resolved !== undefined) {
            rendered[key] = resolved;
            continue;
          }
        }
        rendered[key] = this.renderTemplate(value, ctx, currentNodeId);
      } else {
        rendered[key] = value;
      }
    }
    return rendered;
  }

  private renderTemplate(template: string, ctx: ExecutionContext, currentNodeId?: string): string {
    return template.replace(/\{\{\s*([\s\S]*?)\s*\}\}/gu, (_, raw) => {
      const val = this.resolveExpressionValue(raw, ctx, currentNodeId);
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    });
  }

  private resolveExpressionValue(expr: string, ctx: ExecutionContext, currentNodeId?: string): any {
    try {
      // Parse pipeline: split by '|' while ignoring pipes inside quotes
      const parts: string[] = [];
      let current = '';
      let inQuote: string | null = null;
      for (let i = 0; i < expr.length; i++) {
        const char = expr[i];
        if (char === '"' || char === "'") {
          if (inQuote === char) {
            inQuote = null;
          } else if (inQuote === null) {
            inQuote = char;
          }
        }
        if (char === '|' && !inQuote) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      const baseExpr = parts[0];
      let val: any = undefined;

      // Resolve base expression
      if (baseExpr.startsWith('$trigger.')) {
        val = this.getNestedValue(ctx.trigger, baseExpr.slice(9));
      } else if (baseExpr.startsWith('$var.')) {
        val = this.getNestedValue(ctx.variables, baseExpr.slice(5));
      } else if (baseExpr.startsWith('$vars.')) {
        val = this.getNestedValue(ctx.variables, baseExpr.slice(6));
      } else if (baseExpr.startsWith('$item.')) {
        const field = baseExpr.slice(6);
        let itemObj = ctx.variables['item'];
        if (itemObj === undefined) {
          for (const [k, v] of Object.entries(ctx.variables)) {
            if (k !== 'index' && k !== 'env' && typeof v === 'object' && v !== null) {
              itemObj = v;
              break;
            }
          }
        }
        val = this.getNestedValue(itemObj || ctx.variables, field);
      } else if (baseExpr === 'index' || baseExpr === '$index') {
        val = ctx.variables['index'];
      } else if (baseExpr.startsWith('$prev.') && currentNodeId && ctx._wfEdges) {
        const edge = ctx._wfEdges.find(e => e.target === currentNodeId);
        if (edge) {
          const prevNodeId = edge.source;
          const field = baseExpr.slice(6);
          const ndata = ctx.nodes[prevNodeId];
          if (ndata) {
            if (field === 'output') {
              const out = ndata.output;
              val = typeof out === 'string' ? out : (out?.result ?? out?.text ?? out?.message ?? out);
            } else {
              const targetField = field.startsWith('output.') ? field.slice(7) : field;
              val = this.getNestedValue(ndata.output, targetField);
              if (field === 'result' && (val === undefined || val === null || val === '')) {
                val = ndata.output.contacts || ndata.output.result || ndata.output;
              }
            }
          }
        }
      } else if (baseExpr === '$pageId') {
        val = ctx.pageId ?? '';
      } else if (baseExpr === '$date.now') {
        val = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      } else if (baseExpr === '$date.today') {
        val = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      } else if (baseExpr === '$now') {
        val = new Date();
      } else if (baseExpr === '$system.lunarDate') {
        const lunar = getLunarDate(new Date());
        val = lunar ? `${lunar.day}/${lunar.month}/${lunar.year}` : '';
      } else if (baseExpr === '$system.lunarDay') {
        const lunar = getLunarDate(new Date());
        val = lunar ? String(lunar.day) : '';
      } else if (baseExpr === '$system.lunarMonth') {
        const lunar = getLunarDate(new Date());
        val = lunar ? String(lunar.month) : '';
      } else if (baseExpr.startsWith('$node.')) {
        const rest = baseExpr.slice(6);
        const dotIdx = rest.indexOf('.');
        if (dotIdx !== -1) {
          const nodeRef = rest.slice(0, dotIdx);
          const field = rest.slice(dotIdx + 1);
          let matched = false;
          for (const [nid, ndata] of Object.entries(ctx.nodes)) {
            const nodeDef = ctx._wfNodes?.find(n => n.id === nid);
            const labelOrId = nodeDef?.label || nid;
            if (nid === nodeRef || labelOrId === nodeRef) {
              matched = true;
              if (field === 'output') {
                const out = ndata.output;
                val = typeof out === 'string' ? out : (out?.result ?? out?.text ?? out?.message ?? out);
              } else {
                const targetField = field.startsWith('output.') ? field.slice(7) : field;
                val = this.getNestedValue(ndata.output, targetField);
              }
              break;
            }
          }
          if (!matched) {
            const idxMatch = nodeRef.match(/^n(\d+)$/);
            if (idxMatch && ctx._wfNodes) {
              const targetIdx = parseInt(idxMatch[1]) - 1;
              if (targetIdx >= 0 && targetIdx < ctx._wfNodes.length) {
                const targetNodeId = ctx._wfNodes[targetIdx].id;
                const ndata = ctx.nodes[targetNodeId];
                if (ndata) {
                  if (field === 'output') {
                    const out = ndata.output;
                    val = typeof out === 'string' ? out : (out?.result ?? out?.text ?? out?.message ?? out);
                  } else {
                    const targetField = field.startsWith('output.') ? field.slice(7) : field;
                    val = this.getNestedValue(ndata.output, targetField);
                  }
                }
              }
            }
          }
        }
      }

      // Apply filters in sequence
      for (let j = 1; j < parts.length; j++) {
        const filterStr = parts[j];
        if (filterStr === 'formatVND') {
          const num = Number(val);
          val = Number.isFinite(num) ? num.toLocaleString('vi-VN') + 'đ' : String(val ?? '');
        } else if (filterStr === 'formatNumber') {
          const num = Number(val);
          val = Number.isFinite(num) ? num.toLocaleString('en-US') : String(val ?? '');
        } else if (filterStr === 'extractOrderCode') {
          if (!val) {
            val = '';
          } else {
            const match = String(val).match(/[A-Z0-9_-]{4,20}/i);
            val = match ? match[0] : String(val);
          }
        } else if (filterStr.startsWith('map(')) {
          const mapExpr = filterStr.slice(4, -1);
          if (Array.isArray(val)) {
            try {
              const fn = new Function('_', `return (${mapExpr});`);
              val = val.map(item => {
                try {
                  return fn(item);
                } catch {
                  return '';
                }
              });
            } catch (err) {
              Logger.error(`[WorkflowEngine] Error compiling map expression: ${mapExpr}`, err);
              val = [];
            }
          } else {
            val = [];
          }
        } else if (filterStr.startsWith('join(')) {
          const sep = filterStr.slice(5, -1).replace(/['"]/g, '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          if (Array.isArray(val)) {
            val = val.join(sep);
          } else {
            val = String(val ?? '');
          }
        } else if (filterStr.startsWith('sumBy(')) {
          const field = filterStr.slice(6, -1).replace(/['"]/g, '');
          if (Array.isArray(val)) {
            val = val.reduce((sum, item) => sum + (Number(item?.[field]) || 0), 0);
          } else {
            val = 0;
          }
        } else if (filterStr.startsWith('maxBy(')) {
          const field = filterStr.slice(6, -1).replace(/['"]/g, '');
          if (Array.isArray(val)) {
            val = val.reduce((max, item) => {
              const itemVal = Number(item?.[field]) || 0;
              return itemVal > max ? itemVal : max;
            }, 0);
          } else {
            val = 0;
          }
        } else if (filterStr.startsWith('formatDate(')) {
          const fmt = filterStr.slice(11, -1).replace(/['"]/g, '');
          const date = new Date(val);
          if (isNaN(date.getTime())) {
            val = String(val ?? '');
          } else {
            const pad = (n: number) => String(n).padStart(2, '0');
            val = fmt
              .replace(/YYYY/g, String(date.getFullYear()))
              .replace(/MM/g, pad(date.getMonth() + 1))
              .replace(/DD/g, pad(date.getDate()))
              .replace(/HH/g, pad(date.getHours()))
              .replace(/mm/g, pad(date.getMinutes()))
              .replace(/ss/g, pad(date.getSeconds()));
          }
        }
      }

      return val;
    } catch (err) {
      Logger.error(`[WorkflowEngine] Error rendering expression "${expr}":`, err);
    }
    return undefined;
  }
  private matchFilterId(id: string, filterVal: any): boolean {
    if (!filterVal) return true;
    if (typeof filterVal === 'string') {
      try {
        const parsed = JSON.parse(filterVal);
        if (Array.isArray(parsed)) {
          return parsed.map(String).includes(id);
        }
      } catch {}
      return id === filterVal;
    }
    if (Array.isArray(filterVal)) {
      return filterVal.map(String).includes(id);
    }
    return id === String(filterVal);
  }
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => {
      if (acc === null || acc === undefined) return '';
      if (key.endsWith(']')) {
        const bracket = key.indexOf('[');
        const arrKey = key.slice(0, bracket);
        const idx = parseInt(key.slice(bracket + 1, -1));
        return acc[arrKey]?.[idx];
      }
      
      // Khắc phục lỗi gõ biến sai của người dùng (fallbacks cho thông tin khách hàng)
      if (typeof acc === 'object') {
        if (key === 'zaloId' || key === 'uid' || key === 'userId' || key === 'threadId') {
          if (acc[key] !== undefined) return acc[key];
          if (acc['contact_id'] !== undefined) return acc['contact_id'];
          if (acc['userId'] !== undefined) return acc['userId'];
        }
        if (key === 'name' || key === 'displayName') {
          if (acc[key] !== undefined) return acc[key];
          if (acc['display_name'] !== undefined) return acc['display_name'];
          if (acc['displayName'] !== undefined) return acc['displayName'];
          if (acc['alias'] !== undefined) return acc['alias'];
        }
      }
      
      return acc[key];
    }, obj);
  }

  /**
   * Truncate data for log storage to prevent huge JSON blobs.
   * Truncates strings > 1000 chars and arrays/objects beyond a depth limit.
   */
  private truncateData(data: any, maxStrLen: number = 1000, maxDepth: number = 5, depth: number = 0): any {
    if (depth > maxDepth) return '[MaxDepth]';
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') {
      return data.length > maxStrLen ? data.substring(0, maxStrLen) + `...[truncated, total ${data.length} chars]` : data;
    }
    if (typeof data === 'number' || typeof data === 'boolean') return data;
    if (Array.isArray(data)) {
      if (data.length > 50) {
        const arr = data.slice(0, 50).map((item: any) => this.truncateData(item, maxStrLen, maxDepth, depth + 1));
        arr.push(`...[truncated, total ${data.length} items]`);
        return arr;
      }
      return data.map((item: any) => this.truncateData(item, maxStrLen, maxDepth, depth + 1));
    }
    if (typeof data === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.truncateData(value, maxStrLen, maxDepth, depth + 1);
      }
      return result;
    }
    return String(data);
  }

  /**
   * Compare two values for greater_than / less_than.
   * Supports numbers and time strings (HH:MM or HH:MM:SS).
   * Returns positive if left > right, negative if left < right, 0 if equal.
   */
  private compareValues(left: string, right: string): number {
    // Try numeric comparison first
    const ln = Number(left), rn = Number(right);
    if (!isNaN(ln) && !isNaN(rn)) return ln - rn;

    // Try time comparison: HH:MM or HH:MM:SS
    const parseTime = (s: string): number | null => {
      const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!m) return null;
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (parseInt(m[3] || '0'));
    };
    const lt = parseTime(left), rt = parseTime(right);
    if (lt !== null && rt !== null) return lt - rt;

    // Fallback: string comparison (lexicographic)
    return left.localeCompare(right, 'vi');
  }

  /** Get the OpenAI-compatible chat/completions URL for a given platform */
  private getOpenAICompatibleUrl(platform: string): string {
    switch (platform) {
      case 'deepseek':   return 'https://api.deepseek.com/v1/chat/completions';
      case 'grok':       return 'https://api.x.ai/v1/chat/completions';
      case 'mistral':    return 'https://api.mistral.ai/v1/chat/completions';
      case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
      case 'openai':
      default:           return 'https://api.openai.com/v1/chat/completions';
    }
  }

  /** Normalize legacy/incorrect model names to current API model IDs */
  private normalizeModelName(model: string): string {
    const aliases: Record<string, string> = {
      'deepseek-chat-v3.2':    'deepseek-v4-flash',
      'deepseek-chat-v3.1':    'deepseek-v4-flash',
      'deepseek-reasoner-r1.5':'deepseek-v4-pro',
      'gemini-3.1-pro':        'gemini-3.1-pro-preview',
      'gemini-3.1-flash':      'gemini-3.5-flash',
      'gemini-3.0-flash':      'gemini-3-flash-preview',
      'gemini-3.0-flash-lite': 'gemini-3-flash-preview',
    };
    return aliases[model] ?? model;
}

  /** Convert OpenAI-format messages to Google Gemini format */
  private openaiMessagesToGemini(messages: Array<{ role: string; content: string }>): any[] {
    // Gemini uses "contents" with role: "user" | "model"
    // System messages become a user+model pair at the start for best results
    const contents: any[] = [];
    let systemText = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemText += (systemText ? '\n' : '') + msg.content;
        continue;
      }
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({ role: geminiRole, parts: [{ text: msg.content }] });
    }

    // Prepend system instruction as a user→model pair if present
    if (systemText) {
      contents.unshift(
        { role: 'user', parts: [{ text: `System instruction: ${systemText}` }] },
        { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
      );
    }

    return contents;
  }

  public getWorkflows(): Workflow[] {
    return [...this.workflows.values()];
  }

  // ─── Structured AI response helpers ───────────────────────────────────────

  /**
   * Parse structured AI JSON response: [{type:"text",content:"..."}, {type:"image",content:["url",...]}]
   * Returns null if the message is not structured JSON, otherwise returns the parsed array.
   */
  // parseStructuredAIResponse → moved to utils/aiUtils.ts

  /**
   * Download a URL to a temporary file. Returns the local temp file path.
   */
  private async downloadUrlToTempFile(url: string): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), 'zagi-workflow-images');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Extract extension from URL or default to .jpg
    let ext = '.jpg';
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const match = pathname.match(/\.(\w{3,5})$/);
      if (match) ext = '.' + match[1];
    } catch {}

    const tempPath = path.join(tmpDir, `ai_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 30000,
    });

    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return tempPath;
  }
}

export default WorkflowEngineService;
