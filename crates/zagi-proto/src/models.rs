use serde::{Deserialize, Serialize};

/// Thông tin tài khoản Zalo đăng nhập
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Account {
    pub id: Option<i64>,
    pub zalo_id: String,
    pub full_name: String,
    pub avatar_url: Option<String>,
    pub imei: String,
    pub user_agent: String,
    pub cookies: String,
    pub is_active: bool,
    pub is_business: bool,
    pub created_at: String,
    pub last_seen: Option<String>,
    pub listener_active: bool,
}

/// Loại hội thoại (0 = Cá nhân, 1 = Nhóm)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ThreadType {
    Direct = 0,
    Group = 1,
}

impl From<i64> for ThreadType {
    fn from(val: i64) -> Self {
        match val {
            1 => ThreadType::Group,
            _ => ThreadType::Direct,
        }
    }
}

/// Tin nhắn Zalo
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Message {
    pub id: Option<i64>,
    pub msg_id: String,
    pub cli_msg_id: Option<String>,
    pub owner_zalo_id: String,
    pub thread_id: String,
    pub thread_type: i64,
    pub sender_id: String,
    pub content: String,
    pub msg_type: String,
    pub timestamp: i64,
    pub is_sent: bool,
    pub attachments: String,
    pub local_paths: String,
    pub status: String,
    pub is_recalled: bool,
}

/// Thông tin danh bạ / Bạn bè / Khách hàng
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Contact {
    pub id: Option<i64>,
    pub owner_zalo_id: String,
    pub contact_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub phone: Option<String>,
    pub alias: Option<String>,
    pub is_friend: bool,
    pub contact_type: String,
    pub unread_count: i64,
    pub last_message: Option<String>,
    pub last_message_time: Option<i64>,
    pub pipeline_stage_id: Option<i64>,
    pub ai_profile: Option<String>,
}

/// Khóa API kết nối AI Agent (Hermes, Claude, Cursor)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentApiKey {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    pub key_hash: String,
    pub permissions: String,
    pub is_active: bool,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
    pub rate_limit: i64,
}

/// Trạng thái Workflow Checkpoint (ngủ đông & khôi phục)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowCheckpoint {
    pub id: String,
    pub run_id: String,
    pub workflow_id: String,
    pub node_id: String,
    pub context_json: String,
    pub resume_at: i64,
    pub status: String,
    pub created_at: i64,
    pub error_message: Option<String>,
}
