pub mod schema;

use rusqlite::{params, Connection, Result};
use std::path::Path;
use std::sync::{Arc, Mutex};
use zagi_proto::{Account, AgentApiKey};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Mở hoặc tạo mới database từ file SQLite
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    /// Khởi tạo database In-Memory dùng cho Unit Testing
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    /// Chạy chuỗi DDL khởi tạo schema
    pub fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(schema::INIT_SCHEMA)?;
        Ok(())
    }

    pub fn get_raw_connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    // ==========================================
    // ACCOUNT REPOSITORY
    // ==========================================

    pub fn insert_or_update_account(&self, acc: &Account) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO accounts (
                zalo_id, full_name, avatar_url, imei, user_agent, cookies,
                is_active, is_business, created_at, last_seen, listener_active
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(zalo_id) DO UPDATE SET
                full_name = excluded.full_name,
                avatar_url = excluded.avatar_url,
                cookies = excluded.cookies,
                is_active = excluded.is_active,
                last_seen = excluded.last_seen,
                listener_active = excluded.listener_active
            "#,
            params![
                acc.zalo_id,
                acc.full_name,
                acc.avatar_url,
                acc.imei,
                acc.user_agent,
                acc.cookies,
                acc.is_active as i32,
                acc.is_business as i32,
                acc.created_at,
                acc.last_seen,
                acc.listener_active as i32
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_account_by_zalo_id(&self, zalo_id: &str) -> Result<Option<Account>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, zalo_id, full_name, avatar_url, imei, user_agent, cookies,
                   is_active, is_business, created_at, last_seen, listener_active
            FROM accounts WHERE zalo_id = ?1
            "#,
        )?;

        let mut rows = stmt.query(params![zalo_id])?;
        if let Some(row) = rows.next()? {
            let is_active: i32 = row.get(7)?;
            let is_business: i32 = row.get(8)?;
            let listener_active: i32 = row.get(11)?;

            Ok(Some(Account {
                id: Some(row.get(0)?),
                zalo_id: row.get(1)?,
                full_name: row.get(2)?,
                avatar_url: row.get(3)?,
                imei: row.get(4)?,
                user_agent: row.get(5)?,
                cookies: row.get(6)?,
                is_active: is_active == 1,
                is_business: is_business == 1,
                created_at: row.get(9)?,
                last_seen: row.get(10)?,
                listener_active: listener_active == 1,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_active_accounts(&self) -> Result<Vec<Account>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, zalo_id, full_name, avatar_url, imei, user_agent, cookies,
                   is_active, is_business, created_at, last_seen, listener_active
            FROM accounts WHERE is_active = 1
            "#,
        )?;

        let rows = stmt.query_map([], |row| {
            let is_active: i32 = row.get(7)?;
            let is_business: i32 = row.get(8)?;
            let listener_active: i32 = row.get(11)?;

            Ok(Account {
                id: Some(row.get(0)?),
                zalo_id: row.get(1)?,
                full_name: row.get(2)?,
                avatar_url: row.get(3)?,
                imei: row.get(4)?,
                user_agent: row.get(5)?,
                cookies: row.get(6)?,
                is_active: is_active == 1,
                is_business: is_business == 1,
                created_at: row.get(9)?,
                last_seen: row.get(10)?,
                listener_active: listener_active == 1,
            })
        })?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item?);
        }
        Ok(list)
    }

    // ==========================================
    // AGENT API KEY REPOSITORY
    // ==========================================

    pub fn save_agent_api_key(&self, key: &AgentApiKey) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO agent_api_keys (
                id, name, key_prefix, key_hash, permissions, is_active, created_at, last_used_at, rate_limit
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                permissions = excluded.permissions,
                is_active = excluded.is_active,
                last_used_at = excluded.last_used_at,
                rate_limit = excluded.rate_limit
            "#,
            params![
                key.id,
                key.name,
                key.key_prefix,
                key.key_hash,
                key.permissions,
                key.is_active as i32,
                key.created_at,
                key.last_used_at,
                key.rate_limit
            ],
        )?;
        Ok(())
    }

    pub fn get_agent_api_key_by_hash(&self, key_hash: &str) -> Result<Option<AgentApiKey>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, key_prefix, key_hash, permissions, is_active, created_at, last_used_at, rate_limit
            FROM agent_api_keys WHERE key_hash = ?1 AND is_active = 1
            "#,
        )?;

        let mut rows = stmt.query(params![key_hash])?;
        if let Some(row) = rows.next()? {
            let is_active: i32 = row.get(5)?;
            Ok(Some(AgentApiKey {
                id: row.get(0)?,
                name: row.get(1)?,
                key_prefix: row.get(2)?,
                key_hash: row.get(3)?,
                permissions: row.get(4)?,
                is_active: is_active == 1,
                created_at: row.get(6)?,
                last_used_at: row.get(7)?,
                rate_limit: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_in_memory_db_schema_initialization() {
        let db = Database::open_in_memory().expect("Khởi tạo in-memory DB thất bại");
        let accounts = db.list_active_accounts().expect("Lấy danh sách account thất bại");
        assert_eq!(accounts.len(), 0);
    }

    #[test]
    fn test_insert_and_get_account() {
        let db = Database::open_in_memory().expect("Khởi tạo in-memory DB thất bại");
        let acc = Account {
            id: None,
            zalo_id: "84988888888".to_string(),
            full_name: "Nguyễn Văn A".to_string(),
            avatar_url: Some("https://example.com/avatar.jpg".to_string()),
            imei: "imei_test_123".to_string(),
            user_agent: "Mozilla/5.0".to_string(),
            cookies: "{\"zpw_sek\":\"test_cookie\"}".to_string(),
            is_active: true,
            is_business: false,
            created_at: "2026-10-20T08:00:00Z".to_string(),
            last_seen: None,
            listener_active: true,
        };

        db.insert_or_update_account(&acc).expect("Insert account thất bại");
        let fetched = db.get_account_by_zalo_id("84988888888").expect("Query thất bại");
        assert!(fetched.is_some());
        let item = fetched.unwrap();
        assert_eq!(item.full_name, "Nguyễn Văn A");
        assert_eq!(item.is_active, true);
    }

    #[test]
    fn test_save_and_verify_agent_api_key() {
        let db = Database::open_in_memory().expect("Khởi tạo in-memory DB thất bại");
        let key = AgentApiKey {
            id: "key_01".to_string(),
            name: "Hermes Agent Key".to_string(),
            key_prefix: "zagi_sec_2ef510b1".to_string(),
            key_hash: "hash_abc_xyz_123".to_string(),
            permissions: "[\"read\", \"write\"]".to_string(),
            is_active: true,
            created_at: 1729410000,
            last_used_at: None,
            rate_limit: 120,
        };

        db.save_agent_api_key(&key).expect("Lưu API key thất bại");
        let found = db.get_agent_api_key_by_hash("hash_abc_xyz_123").expect("Query key thất bại");
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Hermes Agent Key");
    }
}
