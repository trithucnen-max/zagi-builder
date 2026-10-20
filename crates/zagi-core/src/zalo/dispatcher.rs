use crate::db::Database;
use crate::zalo::antiban::AntiBanEngine;
use chrono::Utc;
use thiserror::Error;
use uuid::Uuid;
use zagi_proto::{Message, ThreadType};

#[derive(Error, Debug)]
pub enum DispatcherError {
    #[error("Lỗi cơ sở dữ liệu: {0}")]
    DatabaseError(#[from] rusqlite::Error),
    #[error("Lỗi vi phạm chính sách chống khoá tài khoản (Anti-Ban): {0}")]
    AntiBanViolation(String),
    #[error("Nội dung tin nhắn không được để trống")]
    EmptyContent,
}

pub struct MessageDispatcher {
    db: Database,
    antiban: AntiBanEngine,
}

impl MessageDispatcher {
    pub fn new(db: Database, antiban: AntiBanEngine) -> Self {
        Self { db, antiban }
    }

    /// Gửi tin nhắn văn bản với cơ chế bảo vệ Anti-Ban tự động
    pub async fn send_text_message(
        &self,
        owner_zalo_id: &str,
        thread_id: &str,
        thread_type: ThreadType,
        content: &str,
        is_stranger: bool,
    ) -> Result<Message, DispatcherError> {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return Err(DispatcherError::EmptyContent);
        }

        // 1. Kiểm tra hạn ngạch nếu là người lạ
        if is_stranger {
            self.antiban
                .check_and_increment_stranger_quota(thread_id)
                .map_err(DispatcherError::AntiBanViolation)?;
        }

        // 2. Áp dụng Jitter tự nhiên
        let _delay = self.antiban.apply_jitter().await;

        // 3. Tạo thông điệp Message
        let now = Utc::now().timestamp_millis();
        let msg_id = format!("msg_{}_{}", now, Uuid::new_v4().simple());

        let msg = Message {
            id: None,
            msg_id,
            cli_msg_id: Some(format!("cli_{}", now)),
            owner_zalo_id: owner_zalo_id.to_string(),
            thread_id: thread_id.to_string(),
            thread_type: thread_type as i64,
            sender_id: owner_zalo_id.to_string(),
            content: trimmed.to_string(),
            msg_type: "text".to_string(),
            timestamp: now,
            is_sent: true,
            attachments: "[]".to_string(),
            local_paths: "{}".to_string(),
            status: "sent".to_string(),
            is_recalled: false,
        };

        // 4. Lưu vết tin nhắn vào CSDL
        self.save_message_to_db(&msg)?;

        Ok(msg)
    }

    fn save_message_to_db(&self, msg: &Message) -> Result<(), rusqlite::Error> {
        // Lưu trực tiếp vào bảng messages
        let conn = self.db.get_raw_connection();
        let conn = conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO messages (
                msg_id, cli_msg_id, owner_zalo_id, thread_id, thread_type,
                sender_id, content, msg_type, timestamp, is_sent,
                attachments, local_paths, status, is_recalled
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(msg_id, owner_zalo_id) DO UPDATE SET
                status = excluded.status,
                content = excluded.content
            "#,
            rusqlite::params![
                msg.msg_id,
                msg.cli_msg_id,
                msg.owner_zalo_id,
                msg.thread_id,
                msg.thread_type,
                msg.sender_id,
                msg.content,
                msg.msg_type,
                msg.timestamp,
                msg.is_sent as i32,
                msg.attachments,
                msg.local_paths,
                msg.status,
                msg.is_recalled as i32,
            ],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zalo::antiban::AntiBanConfig;

    #[tokio::test]
    async fn test_dispatch_text_message_and_save_db() {
        let db = Database::open_in_memory().unwrap();
        let antiban = AntiBanEngine::new(AntiBanConfig {
            min_jitter_ms: 10,
            max_jitter_ms: 20,
            max_stranger_daily: 2,
        });

        let dispatcher = MessageDispatcher::new(db, antiban);

        let sent = dispatcher
            .send_text_message("owner_01", "user_02", ThreadType::Direct, "Xin chào bạn!", false)
            .await
            .expect("Gửi tin nhắn thất bại");

        assert_eq!(sent.owner_zalo_id, "owner_01");
        assert_eq!(sent.content, "Xin chào bạn!");
        assert_eq!(sent.status, "sent");
        assert!(sent.is_sent);
    }
}
