use crate::db::Database;
use rusqlite::params;
use zagi_proto::WorkflowCheckpoint;

/// Ngưỡng thời gian chờ để kích hoạt lưu Checkpoint vào SQLite (5 phút)
pub const WAIT_CHECKPOINT_THRESHOLD_MS: u64 = 5 * 60 * 1000;

/// Tuổi thọ tối đa của một Checkpoint trước khi bị đánh dấu hết hạn (90 ngày)
pub const MAX_CHECKPOINT_AGE_MS: i64 = 90 * 24 * 60 * 60 * 1000;

/// Thời gian dọn dẹp Checkpoint hoàn thành (7 ngày)
pub const CLEANUP_DONE_AGE_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Thời gian dọn dẹp Checkpoint lỗi/hết hạn (30 ngày)
pub const CLEANUP_FAILED_AGE_MS: i64 = 30 * 24 * 60 * 60 * 1000;

/// Kiểm tra xem thời gian chờ có cần tạo Checkpoint ngủ đông hay không
pub fn should_create_checkpoint(wait_ms: u64) -> bool {
    wait_ms > WAIT_CHECKPOINT_THRESHOLD_MS
}

/// Kiểm tra xem Checkpoint đã quá hạn 90 ngày hay chưa
pub fn is_checkpoint_expired(created_at: i64, now: i64) -> bool {
    (now - created_at) > MAX_CHECKPOINT_AGE_MS
}

pub struct CheckpointScheduler {
    db: Database,
}

impl CheckpointScheduler {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Lưu Checkpoint vào cơ sở dữ liệu SQLite
    pub fn save_checkpoint(&self, cp: &WorkflowCheckpoint) -> Result<(), rusqlite::Error> {
        let conn = self.db.get_raw_connection();
        let conn = conn.lock().unwrap();

        conn.execute(
            r#"
            INSERT INTO workflow_checkpoints (
                id, run_id, workflow_id, node_id, context_json, resume_at, status, created_at, error_message
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                context_json = excluded.context_json,
                resume_at = excluded.resume_at,
                error_message = excluded.error_message
            "#,
            params![
                cp.id,
                cp.run_id,
                cp.workflow_id,
                cp.node_id,
                cp.context_json,
                cp.resume_at,
                cp.status,
                cp.created_at,
                cp.error_message,
            ],
        )?;
        Ok(())
    }

    /// Lấy danh sách Checkpoints đã đến giờ thức dậy (resume_at <= now)
    pub fn get_pending_checkpoints(&self, now: i64) -> Result<Vec<WorkflowCheckpoint>, rusqlite::Error> {
        let conn = self.db.get_raw_connection();
        let conn = conn.lock().unwrap();

        let mut stmt = conn.prepare(
            r#"
            SELECT id, run_id, workflow_id, node_id, context_json, resume_at, status, created_at, error_message
            FROM workflow_checkpoints
            WHERE status = 'pending' AND resume_at <= ?1
            ORDER BY resume_at ASC
            "#,
        )?;

        let rows = stmt.query_map(params![now], |row| {
            Ok(WorkflowCheckpoint {
                id: row.get(0)?,
                run_id: row.get(1)?,
                workflow_id: row.get(2)?,
                node_id: row.get(3)?,
                context_json: row.get(4)?,
                resume_at: row.get(5)?,
                status: row.get(6)?,
                created_at: row.get(7)?,
                error_message: row.get(8)?,
            })
        })?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item?);
        }
        Ok(list)
    }

    /// Cập nhật trạng thái của Checkpoint ('processing', 'done', 'failed', 'expired')
    pub fn update_status(&self, id: &str, status: &str, error_message: Option<&str>) -> Result<(), rusqlite::Error> {
        let conn = self.db.get_raw_connection();
        let conn = conn.lock().unwrap();

        conn.execute(
            r#"
            UPDATE workflow_checkpoints
            SET status = ?1, error_message = ?2
            WHERE id = ?3
            "#,
            params![status, error_message, id],
        )?;
        Ok(())
    }

    /// Dọn dẹp các checkpoint cũ: done > 7 ngày, failed/expired > 30 ngày
    pub fn cleanup_old_checkpoints(&self, now: i64) -> Result<usize, rusqlite::Error> {
        let conn = self.db.get_raw_connection();
        let conn = conn.lock().unwrap();

        let done_cutoff = now - CLEANUP_DONE_AGE_MS;
        let failed_cutoff = now - CLEANUP_FAILED_AGE_MS;

        let deleted = conn.execute(
            r#"
            DELETE FROM workflow_checkpoints
            WHERE (status = 'done' AND created_at < ?1)
               OR ((status = 'failed' OR status = 'expired') AND created_at < ?2)
            "#,
            params![done_cutoff, failed_cutoff],
        )?;

        Ok(deleted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checkpoint_threshold() {
        assert!(!should_create_checkpoint(4 * 60 * 1000)); // 4m -> false (in-memory timer)
        assert!(!should_create_checkpoint(5 * 60 * 1000)); // 5m00s -> false
        assert!(should_create_checkpoint(5 * 60 * 1000 + 1)); // 5m01s -> true (checkpoint)
        assert!(should_create_checkpoint(86400 * 1000)); // 1 day -> true
        assert!(should_create_checkpoint(3 * 86400 * 1000)); // 3 days -> true
    }

    #[test]
    fn test_checkpoint_expiry_boundary_90_days() {
        let now = 100_000_000_000i64;
        let created_at_exact_90d = now - MAX_CHECKPOINT_AGE_MS;
        assert!(!is_checkpoint_expired(created_at_exact_90d, now));

        let created_at_90d_plus_1ms = now - (MAX_CHECKPOINT_AGE_MS + 1);
        assert!(is_checkpoint_expired(created_at_90d_plus_1ms, now));

        let created_at_1d = now - (24 * 60 * 60 * 1000);
        assert!(!is_checkpoint_expired(created_at_1d, now));
    }

    #[test]
    fn test_checkpoint_db_lifecycle() {
        let db = Database::open_in_memory().unwrap();
        let scheduler = CheckpointScheduler::new(db);

        let cp = WorkflowCheckpoint {
            id: "cp_001".to_string(),
            run_id: "run_001".to_string(),
            workflow_id: "wf_001".to_string(),
            node_id: "wait_node_1".to_string(),
            context_json: "{\"test\": true}".to_string(),
            resume_at: 1000,
            status: "pending".to_string(),
            created_at: 500,
            error_message: None,
        };

        scheduler.save_checkpoint(&cp).unwrap();

        // Query khi now = 900 (chưa đến giờ thức dậy)
        let pending = scheduler.get_pending_checkpoints(900).unwrap();
        assert_eq!(pending.len(), 0);

        // Query khi now = 1050 (đã đến giờ thức dậy)
        let due = scheduler.get_pending_checkpoints(1050).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, "cp_001");

        // Cập nhật trạng thái thành processing -> done
        scheduler.update_status("cp_001", "processing", None).unwrap();
        scheduler.update_status("cp_001", "done", None).unwrap();

        let pending_after = scheduler.get_pending_checkpoints(2000).unwrap();
        assert_eq!(pending_after.len(), 0);
    }
}
