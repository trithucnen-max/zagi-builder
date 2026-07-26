/**
 * CheckpointScheduler.ts
 * Quét DB mỗi phút, resume các workflow checkpoint đến hạn.
 * Chỉ chạy trên Boss / Standalone (không chạy trên máy nhân viên).
 */

import DatabaseService from '../database/DatabaseService';
import Logger from '../../utils/Logger';

const POLL_INTERVAL_MS = 60_000;           // Quét mỗi 1 phút
const MAX_CHECKPOINT_AGE_MS = 90 * 24 * 3600 * 1000; // 90 ngày

class CheckpointScheduler {
  private static instance: CheckpointScheduler;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  public static getInstance(): CheckpointScheduler {
    if (!this.instance) this.instance = new CheckpointScheduler();
    return this.instance;
  }

  public start(): void {
    // Poll ngay lần đầu khi boot — resume các checkpoint bị lỡ khi tắt máy
    setTimeout(() => this.poll(), 5_000); // Đợi 5s để DB khởi tạo xong
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    Logger.log('[CheckpointScheduler] Started — polling every 60s');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    Logger.log('[CheckpointScheduler] Stopped');
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return; // Tránh overlap nếu poll trước chưa xong
    this.isPolling = true;

    try {
      const db = DatabaseService.getInstance();
      if (!db.getIsInitialized()) return;

      // Chỉ chạy trên Boss — nhân viên không poll
      try {
        const WorkspaceManager = require('../../utils/WorkspaceManager').default;
        const ws = WorkspaceManager.getInstance().getActiveWorkspace();
        if (ws?.type === 'remote') return;
      } catch {
        // Safe default: tiếp tục poll
      }

      const now = Date.now();

      // 1. Xử lý checkpoint quá hạn 90 ngày
      const allPending = db.getAllPendingCheckpoints();
      for (const cp of allPending) {
        if (now - cp.created_at > MAX_CHECKPOINT_AGE_MS) {
          Logger.warn(`[CheckpointScheduler] Checkpoint ${cp.id} expired (>90 days) — marking expired`);
          db.markCheckpointExpired(cp.id);
          // Thông báo renderer
          try {
            const EventBroadcaster = require('../event/EventBroadcaster').default;
            EventBroadcaster.emit('workflow:checkpointExpired', {
              checkpointId: cp.id,
              workflowName: cp.workflow_name,
              message: `Workflow "${cp.workflow_name}" có bước đang chờ đã quá hạn 90 ngày và bị huỷ.`,
            });
          } catch { /* ignore */ }
        }
      }

      // 2. Cleanup records cũ (done > 7 ngày, expired/failed > 30 ngày)
      db.cleanupOldCheckpoints();

      // 3. Resume các checkpoint đến hạn
      const pending = db.getPendingCheckpoints(now);
      if (pending.length === 0) return;

      Logger.log(`[CheckpointScheduler] ${pending.length} checkpoint(s) due — resuming...`);

      // Import lazy để tránh circular dependency
      const WorkflowEngineService = require('./WorkflowEngineService').default;
      const engine = WorkflowEngineService.getInstance();

      for (const cp of pending) {
        // Check if workflow still exists and is enabled before resuming
        const wfRow = db.getWorkflowById(cp.workflow_id);
        if (!wfRow || wfRow.enabled === 0 || wfRow.enabled === false) {
          Logger.warn(`[CheckpointScheduler] Checkpoint ${cp.id} skipped — workflow "${cp.workflow_name}" (#${cp.workflow_id}) is disabled or deleted`);
          db.markCheckpointFailed(cp.id, 'Workflow bị tắt hoặc đã bị xóa');
          continue;
        }

        // Atomic: mark processing trước để tránh duplicate resume
        db.markCheckpointProcessing(cp.id);

        try {
          Logger.log(`[CheckpointScheduler] Resuming checkpoint ${cp.id} — workflow "${cp.workflow_name}"`);
          const resumeResult = await engine.resumeFromCheckpoint(cp);
          // [BUG-02 Fix] resumeFromCheckpoint đã gọi markCheckpointDone nếu có nested wait bên trong.
          // Kiểm tra status 'waiting': nếu vẫy, checkpoint đã được đánh dấu xử lý bên trong rồi, không cần gọi lại.
          if (!resumeResult || resumeResult.status !== 'waiting') {
            db.markCheckpointDone(cp.id);
          }
          Logger.log(`[CheckpointScheduler] Checkpoint ${cp.id} completed (status=${resumeResult?.status ?? 'unknown'})`);
        } catch (err: any) {
          Logger.error(`[CheckpointScheduler] Failed to resume checkpoint ${cp.id}: ${err.message}`);
          db.markCheckpointFailed(cp.id, err.message);
        }
      }
    } catch (err: any) {
      Logger.error(`[CheckpointScheduler] poll() error: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }
}

export default CheckpointScheduler;
