const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function getDbPath() {
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME, 'Library/Application Support/zagi/zagi-tool.db');
  } else if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'zagi', 'zagi-tool.db');
  } else {
    return path.join(process.env.HOME, '.config/zagi/zagi-tool.db');
  }
}

function getDb(readonly = true) {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`CSDL Zagi không tồn tại tại: ${dbPath}. Vui lòng mở Zagi ít nhất 1 lần.`);
  }
  const db = new Database(dbPath, { readonly });
  // Đảm bảo bảng tồn tại nếu mở ở chế độ ghi
  if (!readonly) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT UNIQUE NOT NULL,
        key_prefix TEXT NOT NULL,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT 'read,send,crm',
        created_at TEXT NOT NULL,
        expires_at TEXT,
        last_used_at TEXT,
        is_revoked INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_agent_api_keys_hash ON agent_api_keys(key_hash);
    `);
  }
  return db;
}

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

function createApiKey({ name = 'Hermes Agent', scopes = ['read', 'send', 'crm', 'admin'], expiresDays = null } = {}) {
  const db = getDb(false);
  try {
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawKey = `zg_live_${randomHex}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 15) + '...';
    const createdAt = new Date().toISOString();
    let expiresAt = null;
    if (expiresDays && expiresDays > 0) {
      const expDate = new Date(Date.now() + expiresDays * 86400000);
      expiresAt = expDate.toISOString();
    }

    const scopeStr = Array.isArray(scopes) ? scopes.join(',') : scopes;

    const stmt = db.prepare(`
      INSERT INTO agent_api_keys (key_hash, key_prefix, name, scopes, created_at, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `);
    const info = stmt.run(keyHash, keyPrefix, name, scopeStr, createdAt, expiresAt);

    return {
      id: info.lastInsertRowid,
      rawKey,
      keyPrefix,
      name,
      scopes: scopeStr.split(','),
      createdAt,
      expiresAt
    };
  } finally {
    db.close();
  }
}

function listApiKeys() {
  const db = getDb(true);
  try {
    return db.prepare(`
      SELECT id, key_prefix, name, scopes, created_at, expires_at, last_used_at, is_revoked
      FROM agent_api_keys
      ORDER BY id DESC
    `).all().map(k => ({
      ...k,
      scopes: k.scopes.split(','),
      isActive: k.is_revoked === 0 && (!k.expires_at || new Date(k.expires_at) > new Date())
    }));
  } finally {
    db.close();
  }
}

function revokeApiKey(id) {
  const db = getDb(false);
  try {
    const stmt = db.prepare(`UPDATE agent_api_keys SET is_revoked = 1 WHERE id = ?`);
    return stmt.run(id);
  } finally {
    db.close();
  }
}

function validateKey(providedKey, requiredScope = 'read') {
  const key = providedKey || process.env.ZAGI_API_KEY;
  if (!key) {
    return { valid: false, error: 'Thiếu API Key (truyền tham số apiKey hoặc biến môi trường ZAGI_API_KEY)' };
  }

  let db;
  try {
    db = getDb(false); // mở rw để cập nhật last_used_at
  } catch (err) {
    return { valid: false, error: `Không thể kết nối CSDL Zagi: ${err.message}` };
  }

  try {
    const keyHash = hashKey(key);
    const row = db.prepare(`
      SELECT id, name, scopes, expires_at, is_revoked
      FROM agent_api_keys
      WHERE key_hash = ?
    `).get(keyHash);

    if (!row) {
      return { valid: false, error: 'API Key không hợp lệ hoặc không tồn tại trong hệ thống Zagi' };
    }

    if (row.is_revoked === 1) {
      return { valid: false, error: 'API Key này đã bị thu hồi (Revoked) bởi quản trị viên' };
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { valid: false, error: `API Key đã hết hạn vào ngày ${row.expires_at}` };
    }

    const scopes = row.scopes.split(',');
    if (!scopes.includes(requiredScope) && !scopes.includes('admin')) {
      return { valid: false, error: `Quyền bị từ chối: Key thiếu quyền '${requiredScope}'` };
    }

    // Cập nhật last_used_at
    db.prepare(`UPDATE agent_api_keys SET last_used_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);

    return {
      valid: true,
      user: row.name,
      scopes
    };
  } finally {
    db.close();
  }
}

function getSettings() {
  return {
    antiBan: {
      minJitterMs: 1500,
      maxJitterMs: 4000,
      maxStrangerDaily: 30
    }
  };
}

module.exports = {
  getDbPath,
  hashKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  validateKey,
  getSettings
};
