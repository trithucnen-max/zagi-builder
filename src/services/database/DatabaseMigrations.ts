import BetterSqlite3 from 'better-sqlite3';
import Logger from '../../utils/Logger';

export interface Migration {
    version: string;
    up: (db: BetterSqlite3.Database) => void;
}

function execSafe(db: BetterSqlite3.Database, sql: string) {
    try {
        db.exec(sql);
    } catch (err: any) {
        if (
            err.message.includes('duplicate column name') ||
            err.message.includes('already exists') ||
            err.message.includes('Duplicate column name')
        ) {
            // Safe to ignore
        } else {
            throw err;
        }
    }
}

export const MIGRATIONS: Migration[] = [
    {
        version: '27.0.0-001-init-base-tables',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-001-init-base-tables');
            execSafe(db, `
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
            `);

            execSafe(db, `
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
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    display_name TEXT NOT NULL DEFAULT '',
                    avatar_url TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    is_friend INTEGER DEFAULT 0,
                    contact_type TEXT DEFAULT 'user',
                    unread_count INTEGER DEFAULT 0,
                    last_message TEXT DEFAULT '',
                    last_message_time INTEGER DEFAULT 0,
                    UNIQUE(owner_zalo_id, contact_id)
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS friends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    avatar TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    updated_at INTEGER DEFAULT 0,
                    UNIQUE(owner_zalo_id, user_id)
                );
                CREATE INDEX IF NOT EXISTS idx_friends_owner ON friends(owner_zalo_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    msg_id TEXT NOT NULL,
                    url TEXT NOT NULL,
                    title TEXT DEFAULT '',
                    domain TEXT DEFAULT '',
                    thumb_url TEXT DEFAULT '',
                    timestamp INTEGER NOT NULL,
                    UNIQUE(owner_zalo_id, msg_id)
                );
                CREATE INDEX IF NOT EXISTS idx_links_thread ON links(owner_zalo_id, thread_id, timestamp);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS page_group_member (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    group_id TEXT NOT NULL,
                    member_id TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    avatar TEXT DEFAULT '',
                    role INTEGER DEFAULT 0,
                    updated_at INTEGER DEFAULT 0,
                    UNIQUE(owner_zalo_id, group_id, member_id)
                );
                CREATE INDEX IF NOT EXISTS idx_group_member ON page_group_member(owner_zalo_id, group_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS stickers (
                    sticker_id INTEGER PRIMARY KEY,
                    cat_id INTEGER DEFAULT 0,
                    type INTEGER DEFAULT 0,
                    text TEXT DEFAULT '',
                    sticker_url TEXT DEFAULT '',
                    sticker_sprite_url TEXT DEFAULT '',
                    checksum TEXT DEFAULT '',
                    data_json TEXT DEFAULT '{}',
                    unsupported INTEGER DEFAULT 0,
                    updated_at INTEGER DEFAULT 0
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS sticker_packs (
                    cat_id INTEGER PRIMARY KEY,
                    name TEXT DEFAULT '',
                    thumb_url TEXT DEFAULT '',
                    sticker_count INTEGER DEFAULT 0,
                    data_json TEXT DEFAULT '{}',
                    updated_at INTEGER DEFAULT 0
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS recent_stickers (
                    sticker_id INTEGER PRIMARY KEY,
                    used_at INTEGER NOT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS keyword_stickers (
                    keyword TEXT PRIMARY KEY,
                    sticker_ids TEXT DEFAULT '[]',
                    updated_at INTEGER DEFAULT 0
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS pinned_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    msg_id TEXT NOT NULL,
                    msg_type TEXT NOT NULL DEFAULT 'text',
                    content TEXT NOT NULL DEFAULT '',
                    preview_text TEXT DEFAULT '',
                    preview_image TEXT DEFAULT '',
                    sender_id TEXT DEFAULT '',
                    sender_name TEXT DEFAULT '',
                    timestamp INTEGER NOT NULL DEFAULT 0,
                    pinned_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner_zalo_id, thread_id, msg_id)
                );
                CREATE INDEX IF NOT EXISTS idx_pinned ON pinned_messages(owner_zalo_id, thread_id, pinned_at DESC);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS friend_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    avatar TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    direction TEXT NOT NULL DEFAULT 'received',
                    msg TEXT DEFAULT '',
                    created_at INTEGER DEFAULT 0,
                    updated_at INTEGER DEFAULT 0,
                    UNIQUE(owner_zalo_id, user_id, direction)
                );
                CREATE INDEX IF NOT EXISTS idx_friend_requests_owner ON friend_requests(owner_zalo_id, direction);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS local_quick_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    keyword TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    media_json TEXT DEFAULT NULL,
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner_zalo_id, keyword)
                );
                CREATE INDEX IF NOT EXISTS idx_lqm_owner ON local_quick_messages(owner_zalo_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS local_pinned_conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    pinned_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner_zalo_id, thread_id)
                );
                CREATE INDEX IF NOT EXISTS idx_lpc_owner ON local_pinned_conversations(owner_zalo_id, pinned_at DESC);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#3B82F6',
                    emoji TEXT NOT NULL DEFAULT '🏷️',
                    created_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner_zalo_id, name)
                );
                CREATE INDEX IF NOT EXISTS idx_crm_tags_owner ON crm_tags(owner_zalo_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#3B82F6',
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_contact_tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    tag_id INTEGER NOT NULL,
                    UNIQUE(owner_zalo_id, contact_id, tag_id),
                    FOREIGN KEY(tag_id) REFERENCES crm_tags(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_crm_ct_owner ON crm_contact_tags(owner_zalo_id, contact_id);
                CREATE INDEX IF NOT EXISTS idx_crm_ct_tag ON crm_contact_tags(tag_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    contact_type TEXT NOT NULL DEFAULT 'user',
                    content TEXT NOT NULL DEFAULT '',
                    topic_id TEXT DEFAULT NULL,
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_crm_notes ON crm_notes(owner_zalo_id, contact_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_campaigns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    template_message TEXT NOT NULL DEFAULT '',
                    friend_request_message TEXT NOT NULL DEFAULT '',
                    campaign_type TEXT NOT NULL DEFAULT 'message',
                    mixed_config TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'draft',
                    delay_seconds INTEGER NOT NULL DEFAULT 60,
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_crm_campaigns ON crm_campaigns(owner_zalo_id, status);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_campaign_contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER NOT NULL,
                    owner_zalo_id TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    avatar TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    sent_at INTEGER DEFAULT 0,
                    retry_count INTEGER DEFAULT 0,
                    error TEXT DEFAULT '',
                    UNIQUE(campaign_id, contact_id),
                    FOREIGN KEY(campaign_id) REFERENCES crm_campaigns(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_crm_cc_campaign ON crm_campaign_contacts(campaign_id, status);
                CREATE INDEX IF NOT EXISTS idx_crm_cc_owner ON crm_campaign_contacts(owner_zalo_id, status);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS crm_send_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    contact_type TEXT DEFAULT 'user',
                    campaign_id INTEGER DEFAULT NULL,
                    message TEXT NOT NULL DEFAULT '',
                    sent_at INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'sent',
                    error TEXT DEFAULT '',
                    data_request TEXT DEFAULT '',
                    data_response TEXT DEFAULT '',
                    send_type TEXT DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_crm_log_owner ON crm_send_log(owner_zalo_id, sent_at DESC);
                CREATE INDEX IF NOT EXISTS idx_crm_log_contact ON crm_send_log(owner_zalo_id, contact_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS local_labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#3B82F6',
                    text_color TEXT NOT NULL DEFAULT '#FFFFFF',
                    emoji TEXT NOT NULL DEFAULT '🏷️',
                    page_ids TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_local_labels_name ON local_labels(name);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS local_label_threads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    label_id INTEGER NOT NULL,
                    thread_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner_zalo_id, label_id, thread_id),
                    FOREIGN KEY(label_id) REFERENCES local_labels(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_llt_owner ON local_label_threads(owner_zalo_id, label_id);
                CREATE INDEX IF NOT EXISTS idx_llt_thread ON local_label_threads(owner_zalo_id, thread_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS workflows (
                    id           TEXT PRIMARY KEY,
                    name         TEXT NOT NULL,
                    description  TEXT DEFAULT '',
                    enabled      INTEGER DEFAULT 1,
                    channel      TEXT NOT NULL DEFAULT 'zalo',
                    page_id      TEXT DEFAULT '',
                    page_ids     TEXT DEFAULT '',
                    nodes_json   TEXT NOT NULL DEFAULT '[]',
                    edges_json   TEXT NOT NULL DEFAULT '[]',
                    created_at   INTEGER NOT NULL,
                    updated_at   INTEGER NOT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS workflow_run_logs (
                    id              TEXT PRIMARY KEY,
                    workflow_id     TEXT NOT NULL,
                    workflow_name   TEXT NOT NULL,
                    triggered_by    TEXT NOT NULL,
                    started_at      INTEGER NOT NULL,
                    finished_at     INTEGER NOT NULL,
                    status          TEXT NOT NULL,
                    error_message   TEXT,
                    node_results    TEXT NOT NULL DEFAULT '[]'
                );
                CREATE INDEX IF NOT EXISTS idx_wf_logs_workflow ON workflow_run_logs(workflow_id, started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_wf_logs_status ON workflow_run_logs(status, started_at DESC);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS integrations (
                    id                    TEXT PRIMARY KEY,
                    type                  TEXT NOT NULL,
                    name                  TEXT NOT NULL DEFAULT '',
                    enabled               INTEGER NOT NULL DEFAULT 1,
                    credentials_encrypted TEXT NOT NULL DEFAULT '{}',
                    settings              TEXT NOT NULL DEFAULT '{}',
                    connected_at          INTEGER,
                    created_at            INTEGER NOT NULL,
                    updated_at            INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type, enabled);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS ai_assistants (
                    id                    TEXT PRIMARY KEY,
                    name                  TEXT NOT NULL,
                    platform              TEXT NOT NULL DEFAULT 'openai',
                    api_key_encrypted     TEXT NOT NULL DEFAULT '',
                    model                 TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
                    system_prompt         TEXT NOT NULL DEFAULT '',
                    pos_integration_id    TEXT DEFAULT NULL,
                    pinned_products_json  TEXT NOT NULL DEFAULT '[]',
                    max_tokens            INTEGER NOT NULL DEFAULT 1000,
                    temperature           REAL NOT NULL DEFAULT 0.7,
                    context_message_count INTEGER NOT NULL DEFAULT 30,
                    custom_url            TEXT DEFAULT '',
                    enabled               INTEGER NOT NULL DEFAULT 1,
                    is_default            INTEGER NOT NULL DEFAULT 0,
                    created_at            INTEGER NOT NULL,
                    updated_at            INTEGER NOT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS ai_assistant_files (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    assistant_id    TEXT NOT NULL,
                    file_name       TEXT NOT NULL,
                    file_path       TEXT NOT NULL DEFAULT '',
                    file_size       INTEGER NOT NULL DEFAULT 0,
                    content_text    TEXT NOT NULL DEFAULT '',
                    created_at      INTEGER NOT NULL,
                    FOREIGN KEY(assistant_id) REFERENCES ai_assistants(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_ai_files_assistant ON ai_assistant_files(assistant_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS fb_accounts (
                    id                  TEXT PRIMARY KEY,
                    facebook_id         TEXT,
                    name                TEXT DEFAULT '',
                    avatar_url          TEXT DEFAULT '',
                    cookie_encrypted    TEXT NOT NULL DEFAULT '',
                    session_data        TEXT DEFAULT '',
                    status              TEXT DEFAULT 'disconnected',
                    last_cookie_check   INTEGER DEFAULT 0,
                    created_at          INTEGER NOT NULL,
                    updated_at          INTEGER NOT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS fb_threads (
                    id                      TEXT PRIMARY KEY,
                    account_id              TEXT NOT NULL,
                    name                    TEXT DEFAULT '',
                    type                    TEXT DEFAULT 'group',
                    emoji                   TEXT,
                    participant_count       INTEGER DEFAULT 0,
                    last_message_preview    TEXT,
                    last_message_at         INTEGER,
                    unread_count            INTEGER DEFAULT 0,
                    is_muted                INTEGER DEFAULT 0,
                    metadata                TEXT,
                    synced_at               INTEGER,
                    FOREIGN KEY (account_id) REFERENCES fb_accounts(id)
                );
                CREATE INDEX IF NOT EXISTS idx_fb_threads_account ON fb_threads(account_id, last_message_at DESC);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS fb_messages (
                    id              TEXT PRIMARY KEY,
                    account_id      TEXT NOT NULL,
                    thread_id       TEXT NOT NULL,
                    sender_id       TEXT DEFAULT '',
                    sender_name     TEXT DEFAULT '',
                    body            TEXT,
                    timestamp       INTEGER NOT NULL,
                    type            TEXT DEFAULT 'text',
                    attachments     TEXT DEFAULT '[]',
                    reply_to_id     TEXT,
                    is_self         INTEGER DEFAULT 0,
                    is_unsent       INTEGER DEFAULT 0,
                    reactions       TEXT DEFAULT '{}',
                    created_at      INTEGER NOT NULL,
                    FOREIGN KEY (account_id) REFERENCES fb_accounts(id)
                );
                CREATE INDEX IF NOT EXISTS idx_fb_messages_thread ON fb_messages(account_id, thread_id, timestamp DESC);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS fb_crm_contacts (
                    id                  TEXT PRIMARY KEY,
                    fb_account_id       TEXT NOT NULL,
                    facebook_user_id    TEXT NOT NULL,
                    facebook_thread_id  TEXT,
                    display_name        TEXT DEFAULT '',
                    avatar_url          TEXT DEFAULT '',
                    tag_ids             TEXT DEFAULT '[]',
                    notes               TEXT DEFAULT '[]',
                    custom_fields       TEXT DEFAULT '{}',
                    created_at          INTEGER NOT NULL,
                    updated_at          INTEGER NOT NULL,
                    UNIQUE(fb_account_id, facebook_user_id),
                    FOREIGN KEY (fb_account_id) REFERENCES fb_accounts(id)
                );
                CREATE INDEX IF NOT EXISTS idx_fb_crm_account ON fb_crm_contacts(fb_account_id);
            `);
        }
    },
    {
        version: '27.0.0-002-init-erp-tables',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-002-init-erp-tables');
            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    color TEXT DEFAULT '#3b82f6',
                    owner_employee_id TEXT DEFAULT '',
                    department_id INTEGER,
                    status TEXT DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_projects_status ON erp_projects(status);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_tasks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT,
                    parent_task_id TEXT,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    status TEXT DEFAULT 'todo',
                    priority TEXT DEFAULT 'normal',
                    reporter_id TEXT DEFAULT '',
                    start_date INTEGER,
                    due_date INTEGER,
                    completed_at INTEGER,
                    estimated_hours REAL,
                    actual_hours REAL DEFAULT 0,
                    recurring_rule TEXT,
                    linked_contact_id TEXT,
                    linked_zalo_msg_id TEXT,
                    sort_order INTEGER DEFAULT 0,
                    archived INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_tasks_project ON erp_tasks(project_id);
                CREATE INDEX IF NOT EXISTS idx_erp_tasks_status ON erp_tasks(status);
                CREATE INDEX IF NOT EXISTS idx_erp_tasks_due ON erp_tasks(due_date);
                CREATE INDEX IF NOT EXISTS idx_erp_tasks_parent ON erp_tasks(parent_task_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_assignees (
                    task_id TEXT NOT NULL,
                    employee_id TEXT NOT NULL,
                    assigned_at INTEGER NOT NULL,
                    PRIMARY KEY (task_id, employee_id)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_assignees_emp ON erp_task_assignees(employee_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_checklist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    done INTEGER DEFAULT 0,
                    sort_order INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_checklist_task ON erp_task_checklist(task_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    mentions TEXT DEFAULT '[]',
                    parent_comment_id INTEGER,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_comments_task ON erp_task_comments(task_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_attachments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    file_name TEXT NOT NULL DEFAULT '',
                    file_path TEXT NOT NULL DEFAULT '',
                    mime_type TEXT DEFAULT '',
                    size INTEGER DEFAULT 0,
                    uploaded_by TEXT DEFAULT '',
                    uploaded_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_attach_task ON erp_task_attachments(task_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_activity_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    payload TEXT DEFAULT '{}',
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_activity_task ON erp_task_activity_log(task_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_calendar_events (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    type TEXT DEFAULT 'meeting',
                    start_at INTEGER NOT NULL,
                    end_at INTEGER NOT NULL,
                    all_day INTEGER DEFAULT 0,
                    location TEXT DEFAULT '',
                    color TEXT DEFAULT '',
                    organizer_id TEXT DEFAULT '',
                    linked_task_id TEXT,
                    linked_contact_id TEXT,
                    recurring_rule TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_events_start ON erp_calendar_events(start_at);
                CREATE INDEX IF NOT EXISTS idx_erp_events_organizer ON erp_calendar_events(organizer_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_event_reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL,
                    minutes_before INTEGER NOT NULL,
                    channel TEXT DEFAULT 'toast',
                    triggered INTEGER DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_erp_reminders_event ON erp_event_reminders(event_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_note_folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    parent_id INTEGER,
                    owner_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_note_folders_owner ON erp_note_folders(owner_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_notes (
                    id TEXT PRIMARY KEY,
                    folder_id INTEGER,
                    title TEXT NOT NULL DEFAULT 'Untitled',
                    content TEXT DEFAULT '',
                    author_id TEXT NOT NULL,
                    pinned INTEGER DEFAULT 0,
                    share_scope TEXT DEFAULT 'private',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_notes_folder ON erp_notes(folder_id);
                CREATE INDEX IF NOT EXISTS idx_erp_notes_author ON erp_notes(author_id);
                CREATE INDEX IF NOT EXISTS idx_erp_notes_updated ON erp_notes(updated_at);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_note_tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    color TEXT DEFAULT '#6b7280'
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_note_tag_map (
                    note_id TEXT NOT NULL,
                    tag_id INTEGER NOT NULL,
                    PRIMARY KEY (note_id, tag_id)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_note_tag_map_tag ON erp_note_tag_map(tag_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_note_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    note_id TEXT NOT NULL,
                    content_snapshot TEXT NOT NULL DEFAULT '',
                    editor_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_note_versions_note ON erp_note_versions(note_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_watchers (
                    task_id TEXT NOT NULL,
                    employee_id TEXT NOT NULL,
                    added_at INTEGER NOT NULL,
                    PRIMARY KEY (task_id, employee_id)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_watchers_emp ON erp_task_watchers(employee_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_task_dependencies (
                    task_id TEXT NOT NULL,
                    depends_on_task_id TEXT NOT NULL,
                    type TEXT DEFAULT 'FS',
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (task_id, depends_on_task_id)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_deps_dep ON erp_task_dependencies(depends_on_task_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_event_attendees (
                    event_id TEXT NOT NULL,
                    employee_id TEXT NOT NULL,
                    status TEXT DEFAULT 'invited',
                    PRIMARY KEY (event_id, employee_id)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_event_attendees_emp ON erp_event_attendees(employee_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_note_shares (
                    note_id TEXT NOT NULL,
                    employee_id TEXT NOT NULL,
                    permission TEXT DEFAULT 'read',
                    PRIMARY KEY (note_id, employee_id)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_note_shares_emp ON erp_note_shares(employee_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_departments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    parent_id INTEGER,
                    manager_employee_id TEXT DEFAULT '',
                    description TEXT DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_dept_parent ON erp_departments(parent_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    level INTEGER DEFAULT 0,
                    department_id INTEGER,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_positions_dept ON erp_positions(department_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_employee_profiles (
                    employee_id TEXT PRIMARY KEY,
                    department_id INTEGER,
                    position_id INTEGER,
                    manager_employee_id TEXT DEFAULT '',
                    dob INTEGER,
                    gender TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    email TEXT DEFAULT '',
                    address TEXT DEFAULT '',
                    joined_at INTEGER,
                    erp_role TEXT DEFAULT 'member',
                    extra_json TEXT DEFAULT '{}',
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_profiles_dept ON erp_employee_profiles(department_id);
                CREATE INDEX IF NOT EXISTS idx_erp_profiles_manager ON erp_employee_profiles(manager_employee_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_attendance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    check_in_at INTEGER,
                    check_out_at INTEGER,
                    note TEXT DEFAULT '',
                    source TEXT DEFAULT 'manual',
                    updated_at INTEGER NOT NULL,
                    UNIQUE(employee_id, date)
                );
                CREATE INDEX IF NOT EXISTS idx_erp_attendance_emp_date ON erp_attendance(employee_id, date);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_leave_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_id TEXT NOT NULL,
                    leave_type TEXT DEFAULT 'annual',
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    days REAL DEFAULT 1,
                    reason TEXT DEFAULT '',
                    status TEXT DEFAULT 'pending',
                    approver_id TEXT DEFAULT '',
                    decided_at INTEGER,
                    decision_note TEXT DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_leave_status ON erp_leave_requests(status);
                CREATE INDEX IF NOT EXISTS idx_erp_leave_requester ON erp_leave_requests(requester_id);
                CREATE INDEX IF NOT EXISTS idx_erp_leave_approver ON erp_leave_requests(approver_id);
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS erp_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    recipient_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT DEFAULT '',
                    link TEXT DEFAULT '',
                    payload TEXT DEFAULT '{}',
                    read INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_erp_notify_recipient ON erp_notifications(recipient_id, read);
                CREATE INDEX IF NOT EXISTS idx_erp_notify_created ON erp_notifications(created_at);
            `);
        }
    },
    {
        version: '27.0.0-003-historical-migrations-part1',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-003-historical-migrations-part1');
            // quote_data, reactions, is_recalled, recalled_content, deleted_by
            execSafe(db, `ALTER TABLE messages ADD COLUMN quote_data TEXT DEFAULT NULL`);
            execSafe(db, `ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}'`);
            execSafe(db, `ALTER TABLE messages ADD COLUMN is_recalled INTEGER DEFAULT 0`);
            execSafe(db, `ALTER TABLE messages ADD COLUMN recalled_content TEXT DEFAULT NULL`);
            execSafe(db, `ALTER TABLE messages ADD COLUMN deleted_by TEXT DEFAULT NULL`);

            // accounts listener_active
            execSafe(db, `ALTER TABLE accounts ADD COLUMN listener_active INTEGER DEFAULT 1`);

            // Clean bad contacts/messages
            try {
                db.exec(`DELETE FROM contacts WHERE contact_id = 'undefined' OR contact_id = '' OR contact_id IS NULL`);
                db.exec(`DELETE FROM messages WHERE thread_id = 'undefined' OR thread_id = '' OR thread_id IS NULL`);
            } catch {}

            // channel columns
            execSafe(db, `ALTER TABLE contacts ADD COLUMN channel TEXT DEFAULT 'zalo'`);
            execSafe(db, `ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT 'zalo'`);
            execSafe(db, `ALTER TABLE accounts ADD COLUMN channel TEXT DEFAULT 'zalo'`);

            // indexes
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_contacts_channel ON contacts(channel, owner_zalo_id)`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel, owner_zalo_id, thread_id)`);
        }
    },
    {
        version: '27.0.0-004-historical-migrations-part2',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-004-historical-migrations-part2');
            // Copy fb_* data (we try-catch because fb tables might not exist on sharded connection)
            try {
                const hasFbTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fb_accounts'`).get();
                if (hasFbTable) {
                    const fbInAccounts = db.prepare(`SELECT COUNT(*) as n FROM accounts WHERE channel = 'facebook'`).get() as any;
                    if ((fbInAccounts?.n || 0) === 0) {
                        const fbAccCount = db.prepare(`SELECT COUNT(*) as n FROM fb_accounts`).get() as any;
                        if ((fbAccCount?.n || 0) > 0) {
                            db.exec(`
                                INSERT OR IGNORE INTO accounts (zalo_id, full_name, avatar_url, imei, user_agent, cookies, is_active, created_at, channel)
                                SELECT COALESCE(facebook_id, id), COALESCE(name, ''), COALESCE(avatar_url, ''), '', '', COALESCE(cookie_encrypted, ''), 1, datetime(created_at/1000, 'unixepoch'), 'facebook'
                                FROM fb_accounts
                            `);
                            db.exec(`
                                INSERT OR IGNORE INTO contacts (owner_zalo_id, contact_id, display_name, avatar_url, is_friend, contact_type, unread_count, last_message, last_message_time, channel)
                                SELECT COALESCE(f.facebook_id, ft.account_id), ft.id, COALESCE(ft.name, ''), '', 0,
                                       CASE WHEN ft.type = 'user' THEN 'user' ELSE 'group' END,
                                       COALESCE(ft.unread_count, 0), COALESCE(ft.last_message_preview, ''), COALESCE(ft.last_message_at, 0), 'facebook'
                                FROM fb_threads ft
                                LEFT JOIN fb_accounts f ON f.id = ft.account_id
                            `);
                            db.exec(`
                                INSERT OR IGNORE INTO messages (msg_id, owner_zalo_id, thread_id, thread_type, sender_id, content, msg_type, timestamp, is_sent, attachments, status, channel)
                                SELECT fm.id, COALESCE(f.facebook_id, fm.account_id), fm.thread_id, 0, COALESCE(fm.sender_id, ''),
                                       COALESCE(fm.body, ''), COALESCE(fm.type, 'text'), fm.timestamp, COALESCE(fm.is_self, 0),
                                       COALESCE(fm.attachments, '[]'), 'received', 'facebook'
                                FROM fb_messages fm
                                LEFT JOIN fb_accounts f ON f.id = fm.account_id
                            `);
                        }
                    }
                }
            } catch {}

            // workflow channel
            try {
                execSafe(db, `ALTER TABLE workflows ADD COLUMN channel TEXT NOT NULL DEFAULT 'zalo'`);
                db.exec(`UPDATE workflows SET channel = 'zalo' WHERE channel IS NULL OR TRIM(channel) = ''`);
            } catch {}

            // Migration B4: FB accounts.zalo_id UUID → facebook_id
            try {
                const hasFbTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fb_accounts'`).get();
                if (hasFbTable) {
                    const fbWithUuid = db.prepare(
                        `SELECT a.zalo_id, f.facebook_id FROM accounts a
                         JOIN fb_accounts f ON a.zalo_id = f.id
                         WHERE a.channel = 'facebook' AND f.facebook_id IS NOT NULL AND f.facebook_id != ''`
                    ).all() as any[];
                    for (const row of fbWithUuid) {
                        if (row.zalo_id !== row.facebook_id) {
                            const existing = db.prepare(`SELECT 1 FROM accounts WHERE zalo_id = ?`).get(row.facebook_id);
                            if (!existing) {
                                db.exec(`UPDATE accounts SET zalo_id = '${row.facebook_id}' WHERE zalo_id = '${row.zalo_id}' AND channel = 'facebook'`);
                            } else {
                                db.exec(`DELETE FROM accounts WHERE zalo_id = '${row.zalo_id}' AND channel = 'facebook'`);
                            }
                        }
                    }
                }
            } catch {}
        }
    },
    {
        version: '27.0.0-005-historical-migrations-part3',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-005-historical-migrations-part3');
            // Migration B5: fix contacts & messages owner_zalo_id UUID → facebook_id
            try {
                const hasFbTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fb_accounts'`).get();
                if (hasFbTable) {
                    const fbAccs = db.prepare(
                        `SELECT id, facebook_id FROM fb_accounts WHERE facebook_id IS NOT NULL AND facebook_id != ''`
                    ).all() as any[];
                    for (const acc of fbAccs) {
                        if (acc.id === acc.facebook_id) continue;
                        db.prepare(
                            `UPDATE contacts SET owner_zalo_id = ? WHERE owner_zalo_id = ? AND channel = 'facebook'`
                        ).run(acc.facebook_id, acc.id);
                        db.prepare(
                            `UPDATE messages SET owner_zalo_id = ? WHERE owner_zalo_id = ? AND channel = 'facebook'`
                        ).run(acc.facebook_id, acc.id);
                    }
                }
            } catch {}

            // channel in CRM
            execSafe(db, `ALTER TABLE crm_tags ADD COLUMN channel TEXT DEFAULT 'zalo'`);
            execSafe(db, `ALTER TABLE crm_contact_tags ADD COLUMN channel TEXT DEFAULT 'zalo'`);
            execSafe(db, `ALTER TABLE crm_notes ADD COLUMN channel TEXT DEFAULT 'zalo'`);

            // unsupported in stickers
            execSafe(db, `ALTER TABLE stickers ADD COLUMN unsupported INTEGER DEFAULT 0`);

            // accounts details
            execSafe(db, `ALTER TABLE accounts ADD COLUMN phone TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE accounts ADD COLUMN is_business INTEGER DEFAULT 0`);
        }
    },
    {
        version: '27.0.0-006-historical-migrations-part4',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-006-historical-migrations-part4');
            // contacts options
            execSafe(db, `ALTER TABLE contacts ADD COLUMN is_muted INTEGER DEFAULT 0`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN mute_until INTEGER DEFAULT 0`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN is_in_others INTEGER DEFAULT 0`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN alias TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN gender INTEGER DEFAULT NULL`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN birthday TEXT DEFAULT NULL`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN pipeline_stage_id INTEGER DEFAULT NULL`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN ai_sentiment TEXT DEFAULT NULL`);
            execSafe(db, `ALTER TABLE contacts ADD COLUMN ai_intent TEXT DEFAULT NULL`);

            // crm_pipeline_stages seed
            try {
                const stageCount = db.prepare(`SELECT COUNT(*) as n FROM crm_pipeline_stages`).get() as any;
                if ((stageCount?.n || 0) === 0) {
                    const now = Date.now();
                    db.prepare(`INSERT INTO crm_pipeline_stages (name, color, position, created_at) VALUES (?, ?, ?, ?)`).run('Mới tiếp cận', '#3B82F6', 0, now);
                    db.prepare(`INSERT INTO crm_pipeline_stages (name, color, position, created_at) VALUES (?, ?, ?, ?)`).run('Đang tư vấn', '#F59E0B', 1, now);
                    db.prepare(`INSERT INTO crm_pipeline_stages (name, color, position, created_at) VALUES (?, ?, ?, ?)`).run('Đã chốt đơn', '#10B981', 2, now);
                    db.prepare(`INSERT INTO crm_pipeline_stages (name, color, position, created_at) VALUES (?, ?, ?, ?)`).run('Chăm sóc sau bán', '#8B5CF6', 3, now);
                }
            } catch {}
        }
    },
    {
        version: '27.0.0-007-historical-migrations-part5',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-007-historical-migrations-part5');
            // crm_send_log details
            execSafe(db, `ALTER TABLE crm_send_log ADD COLUMN display_name TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE crm_send_log ADD COLUMN phone TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE crm_send_log ADD COLUMN contact_type TEXT DEFAULT 'user'`);
            execSafe(db, `ALTER TABLE crm_send_log ADD COLUMN data_request TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE crm_send_log ADD COLUMN data_response TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE crm_send_log ADD COLUMN send_type TEXT DEFAULT ''`);

            // local_labels text_color
            execSafe(db, `ALTER TABLE local_labels ADD COLUMN text_color TEXT NOT NULL DEFAULT '#FFFFFF'`);

            // local_quick_messages options
            execSafe(db, `ALTER TABLE local_quick_messages ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
            execSafe(db, `ALTER TABLE local_quick_messages ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);

            // local_labels options
            execSafe(db, `ALTER TABLE local_labels ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
            execSafe(db, `ALTER TABLE local_labels ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
            execSafe(db, `ALTER TABLE local_labels ADD COLUMN shortcut TEXT NOT NULL DEFAULT ''`);

            // ai assistants details
            execSafe(db, `ALTER TABLE ai_assistants ADD COLUMN context_message_count INTEGER NOT NULL DEFAULT 30`);
            execSafe(db, `ALTER TABLE ai_assistants ADD COLUMN pinned_products_json TEXT NOT NULL DEFAULT '[]'`);
            execSafe(db, `ALTER TABLE ai_assistants ADD COLUMN custom_url TEXT DEFAULT ''`);
        }
    },
    {
        version: '27.0.0-008-historical-migrations-part6',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-008-historical-migrations-part6');
            // ai_account_assistants & ai_usage_logs
            execSafe(db, `
                CREATE TABLE IF NOT EXISTS ai_account_assistants (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    zalo_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('suggestion', 'panel')),
                    assistant_id TEXT NOT NULL,
                    UNIQUE(zalo_id, role),
                    FOREIGN KEY(assistant_id) REFERENCES ai_assistants(id) ON DELETE CASCADE
                );
            `);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_ai_account_role ON ai_account_assistants(zalo_id, role);`);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS ai_usage_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    assistant_id TEXT NOT NULL,
                    assistant_name TEXT DEFAULT '',
                    platform TEXT DEFAULT '',
                    model TEXT DEFAULT '',
                    prompt_text TEXT DEFAULT '',
                    response_text TEXT DEFAULT '',
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT 0
                );
            `);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage_logs(created_at);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_ai_usage_assistant ON ai_usage_logs(assistant_id, created_at);`);
        }
    },
    {
        version: '27.0.0-009-historical-migrations-part7',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-009-historical-migrations-part7');
            // message_drafts
            execSafe(db, `
                CREATE TABLE IF NOT EXISTS message_drafts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner_zalo_id, thread_id)
                );
            `);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_drafts_owner ON message_drafts(owner_zalo_id);`);

            // bank_cards
            execSafe(db, `
                CREATE TABLE IF NOT EXISTS bank_cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_zalo_id TEXT NOT NULL,
                    bank_name TEXT NOT NULL DEFAULT '',
                    bin_bank INTEGER NOT NULL DEFAULT 0,
                    account_number TEXT NOT NULL DEFAULT '',
                    account_name TEXT NOT NULL DEFAULT '',
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0
                );
            `);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_bank_cards_owner ON bank_cards(owner_zalo_id);`);

            // topic_id, contact_type in crm_notes
            execSafe(db, `ALTER TABLE crm_notes ADD COLUMN topic_id TEXT DEFAULT NULL`);
            execSafe(db, `ALTER TABLE crm_notes ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'user'`);
        }
    },
    {
        version: '27.0.0-010-historical-migrations-part8',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-010-historical-migrations-part8');
            // employee management
            execSafe(db, `
                CREATE TABLE IF NOT EXISTS employees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL UNIQUE,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    avatar_url TEXT DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'employee',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    last_login INTEGER DEFAULT NULL
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS employee_permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL,
                    module TEXT NOT NULL,
                    can_access INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(employee_id, module),
                    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS employee_account_access (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL,
                    zalo_id TEXT NOT NULL,
                    UNIQUE(employee_id, zalo_id),
                    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
                );
            `);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS employee_message_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL,
                    zalo_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    thread_type INTEGER NOT NULL DEFAULT 0,
                    msg_id TEXT,
                    action TEXT NOT NULL,
                    metadata TEXT DEFAULT '{}',
                    timestamp INTEGER NOT NULL
                );
            `);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_emp_msg_log_employee ON employee_message_log(employee_id);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_emp_msg_log_zalo ON employee_message_log(zalo_id);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_emp_msg_log_ts ON employee_message_log(timestamp);`);

            execSafe(db, `
                CREATE TABLE IF NOT EXISTS employee_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL,
                    machine_name TEXT DEFAULT '',
                    ip_address TEXT DEFAULT '',
                    connected_at INTEGER NOT NULL,
                    disconnected_at INTEGER DEFAULT NULL,
                    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
                );
            `);
        }
    },
    {
        version: '27.0.0-011-historical-migrations-part9',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-011-historical-migrations-part9');
            // employee groups
            execSafe(db, `
                CREATE TABLE IF NOT EXISTS employee_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    color TEXT DEFAULT '',
                    sort_order INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL
                );
            `);
            execSafe(db, `ALTER TABLE employees ADD COLUMN group_id TEXT DEFAULT NULL`);

            // messages employee handler
            execSafe(db, `ALTER TABLE messages ADD COLUMN handled_by_employee TEXT DEFAULT NULL`);

            // employee_account_access allowed filters
            execSafe(db, `ALTER TABLE employee_account_access ADD COLUMN allowed_groups TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE employee_account_access ADD COLUMN allowed_tags TEXT DEFAULT ''`);
            execSafe(db, `ALTER TABLE employee_account_access ADD COLUMN exclude_blocked INTEGER DEFAULT 0`);

            // contacts is_blocked
            execSafe(db, `ALTER TABLE contacts ADD COLUMN is_blocked INTEGER DEFAULT 0`);
        }
    },
    {
        version: '27.0.0-012-v27-optimization-indexes',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-012-v27-optimization-indexes');
            // New indexes optimized in v27.0.0
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_contacts_pipeline ON contacts(owner_zalo_id, pipeline_stage_id);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_messages_media ON messages(owner_zalo_id, thread_id, msg_type, timestamp DESC);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);`);
        }
    },
    {
        // v27.0.0 GĐ4 — Comprehensive query optimization indexes
        version: '27.0.0-013-gd4-comprehensive-indexes',
        up: (db) => {
            Logger.log('[DatabaseMigrations] Running 27.0.0-013-gd4-comprehensive-indexes');

            // contacts: fast lookup by phone, last_message_time (inbox sorting), tag search
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL AND phone != '';`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_contacts_last_msg_time ON contacts(owner_zalo_id, last_message_time DESC);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_contacts_type_owner ON contacts(owner_zalo_id, contact_type);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_contacts_unread ON contacts(owner_zalo_id, unread_count) WHERE unread_count > 0;`);

            // messages: fast range scan for export / conversation history
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(owner_zalo_id, timestamp DESC);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(owner_zalo_id, status) WHERE status != 'received';`);

            // crm_notes: lookup by contact
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_crm_notes_contact ON crm_notes(owner_zalo_id, contact_id, created_at DESC);`);

            // workflow_run_logs: lookup by workflow + status for debug panel
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_run_logs(workflow_id, started_at DESC);`);
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_run_logs(status, started_at DESC);`);

            // crm_send_log: fast stats per campaign
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_crm_send_log_campaign ON crm_send_log(campaign_id, status);`);

            // page_group_member: role-based filter (admins)
            execSafe(db, `CREATE INDEX IF NOT EXISTS idx_group_member_role ON page_group_member(owner_zalo_id, group_id, role) WHERE role > 0;`);

            Logger.log('[DatabaseMigrations] GĐ4 comprehensive index optimization applied.');
        }
    }
];

export function runMigrations(dbConn: BetterSqlite3.Database): void {
    Logger.log('[DatabaseMigrations] Starting schema migration run...');
    dbConn.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );
    `);

    const applied = new Set<string>();
    try {
        const rows = dbConn.prepare('SELECT version FROM schema_migrations').all() as any[];
        for (const r of rows) {
            applied.add(r.version);
        }
    } catch (err: any) {
        Logger.error(`[DatabaseMigrations] Failed to read schema_migrations: ${err.message}`);
    }

    for (const m of MIGRATIONS) {
        if (!applied.has(m.version)) {
            Logger.log(`[DatabaseMigrations] Applying database migration: ${m.version}`);
            try {
                dbConn.transaction(() => {
                    m.up(dbConn);
                    dbConn.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now());
                })();
                Logger.log(`[DatabaseMigrations] Database migration applied successfully: ${m.version}`);
            } catch (err: any) {
                Logger.error(`[DatabaseMigrations] Database migration failed: ${m.version} | Error: ${err.message}`);
                throw err;
            }
        }
    }
    Logger.log('[DatabaseMigrations] Schema migration run finished successfully.');
}
