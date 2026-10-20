/// Chuỗi SQL khởi tạo toàn bộ cấu trúc bảng cho Zagi SQLite
pub const INIT_SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zalo_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT DEFAULT '',
    imei TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    cookies TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    is_business INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen TEXT,
    listener_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    msg_id TEXT NOT NULL,
    cli_msg_id TEXT,
    owner_zalo_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    thread_type INTEGER NOT NULL DEFAULT 0,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    msg_type TEXT NOT NULL DEFAULT 'text',
    timestamp INTEGER NOT NULL,
    is_sent INTEGER DEFAULT 0,
    attachments TEXT DEFAULT '[]',
    local_paths TEXT DEFAULT '{}',
    status TEXT DEFAULT 'received',
    is_recalled INTEGER DEFAULT 0,
    UNIQUE(msg_id, owner_zalo_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(owner_zalo_id, thread_id, timestamp);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_zalo_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    alias TEXT DEFAULT '',
    is_friend INTEGER DEFAULT 0,
    contact_type TEXT DEFAULT 'user',
    unread_count INTEGER DEFAULT 0,
    last_message TEXT DEFAULT '',
    last_message_time INTEGER DEFAULT 0,
    pipeline_stage_id INTEGER DEFAULT NULL,
    ai_profile TEXT DEFAULT NULL,
    UNIQUE(owner_zalo_id, contact_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT '["read"]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    rate_limit INTEGER NOT NULL DEFAULT 120
);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_prefix ON agent_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    context_json TEXT NOT NULL,
    resume_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_checkpoints_resume ON workflow_checkpoints(status, resume_at);
"#;
