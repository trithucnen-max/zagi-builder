/**
 * Zagi MCP Fast Read Layer
 * Direct SQLite Database Access for Instant (<2ms) Data Retrieval
 * Reads from ~/Library/Application Support/zagi/zagi-tool.db
 */

const { getDb } = require('./auth');

/**
 * 1. Danh sách tài khoản Zalo / Facebook đã đăng nhập trên máy
 */
function listAccounts() {
  const db = getDb(true);
  try {
    const rows = db.prepare(`
      SELECT id, zalo_id, full_name, avatar_url, phone, is_active, listener_active, is_business, channel, last_seen, created_at
      FROM accounts
      ORDER BY id ASC
    `).all();

    return rows.map(r => ({
      id: r.id,
      zaloId: r.zalo_id,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
      phone: r.phone || '',
      isActive: Boolean(r.is_active),
      listenerActive: Boolean(r.listener_active),
      isBusiness: Boolean(r.is_business),
      channel: r.channel || 'zalo',
      lastSeen: r.last_seen,
      createdAt: r.created_at
    }));
  } finally {
    db.close();
  }
}

/**
 * 2. Lấy danh sách hội thoại có phân trang & tìm kiếm
 */
function getConversations({ zaloId, limit = 50, offset = 0, search = '' } = {}) {
  const db = getDb(true);
  try {
    const where = [];
    const params = [];

    if (zaloId) {
      where.push('owner_zalo_id = ?');
      params.push(zaloId);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where.push('(display_name LIKE ? OR phone LIKE ? OR contact_id LIKE ? OR alias LIKE ?)');
      params.push(q, q, q, q);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM contacts ${whereClause}`).get(...params);
    const items = db.prepare(`
      SELECT id, owner_zalo_id, contact_id, display_name, avatar_url, phone, is_friend, contact_type,
             unread_count, last_message, last_message_time, pipeline_stage_id, salutation, alias
      FROM contacts
      ${whereClause}
      ORDER BY last_message_time DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return {
      total: totalRow ? totalRow.total : 0,
      limit,
      offset,
      items: items.map(c => ({
        id: c.id,
        ownerZaloId: c.owner_zalo_id,
        contactId: c.contact_id,
        displayName: c.display_name,
        avatarUrl: c.avatar_url,
        phone: c.phone || '',
        isFriend: Boolean(c.is_friend),
        contactType: c.contact_type || 'user',
        unreadCount: c.unread_count || 0,
        lastMessage: c.last_message || '',
        lastMessageTime: c.last_message_time || 0,
        pipelineStageId: c.pipeline_stage_id,
        salutation: c.salutation,
        alias: c.alias || ''
      }))
    };
  } finally {
    db.close();
  }
}

/**
 * 3. Lấy danh sách hội thoại có tin nhắn chưa đọc
 */
function getUnreadChats({ zaloId } = {}) {
  const db = getDb(true);
  try {
    let sql = `
      SELECT id, owner_zalo_id, contact_id, display_name, avatar_url, phone, unread_count, last_message, last_message_time
      FROM contacts
      WHERE unread_count > 0
    `;
    const params = [];
    if (zaloId) {
      sql += ' AND owner_zalo_id = ?';
      params.push(zaloId);
    }
    sql += ' ORDER BY unread_count DESC, last_message_time DESC';

    const rows = db.prepare(sql).all(...params);
    return rows.map(c => ({
      id: c.id,
      ownerZaloId: c.owner_zalo_id,
      contactId: c.contact_id,
      displayName: c.display_name,
      avatarUrl: c.avatar_url,
      phone: c.phone || '',
      unreadCount: c.unread_count,
      lastMessage: c.last_message || '',
      lastMessageTime: c.last_message_time || 0
    }));
  } finally {
    db.close();
  }
}

/**
 * 4. Lấy lịch sử tin nhắn của một hội thoại (threadId)
 */
function getThreadMessages({ threadId, zaloId, limit = 50, offset = 0 } = {}) {
  const db = getDb(true);
  try {
    let sql = `
      SELECT id, msg_id, cli_msg_id, owner_zalo_id, thread_id, thread_type, sender_id,
             content, msg_type, timestamp, is_sent, attachments, local_paths, status, is_recalled
      FROM messages
      WHERE thread_id = ?
    `;
    const params = [threadId];
    if (zaloId) {
      sql += ' AND owner_zalo_id = ?';
      params.push(zaloId);
    }
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    return rows.map(m => {
      let attachments = [];
      try {
        attachments = m.attachments ? JSON.parse(m.attachments) : [];
      } catch (e) {}

      return {
        id: m.id,
        msgId: m.msg_id,
        cliMsgId: m.cli_msg_id,
        ownerZaloId: m.owner_zalo_id,
        threadId: m.thread_id,
        threadType: m.thread_type,
        senderId: m.sender_id,
        content: m.content,
        msgType: m.msg_type,
        timestamp: m.timestamp,
        isSent: Boolean(m.is_sent),
        attachments,
        status: m.status,
        isRecalled: Boolean(m.is_recalled)
      };
    });
  } finally {
    db.close();
  }
}

/**
 * 5. Tìm kiếm danh bạ theo tên, SĐT, contactId hoặc alias
 */
function searchContacts({ query, zaloId, limit = 20 } = {}) {
  const db = getDb(true);
  try {
    const q = `%${(query || '').trim()}%`;
    let sql = `
      SELECT id, owner_zalo_id, contact_id, display_name, avatar_url, phone, is_friend,
             contact_type, unread_count, pipeline_stage_id, salutation, alias, last_message, last_message_time
      FROM contacts
      WHERE (display_name LIKE ? OR phone LIKE ? OR contact_id LIKE ? OR alias LIKE ?)
    `;
    const params = [q, q, q, q];
    if (zaloId) {
      sql += ' AND owner_zalo_id = ?';
      params.push(zaloId);
    }
    sql += ' ORDER BY last_message_time DESC LIMIT ?';
    params.push(limit);

    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

/**
 * 6. Lấy hồ sơ chi tiết của khách hàng (kèm nhãn dán, CRM tags, CRM notes, pipeline stage)
 */
function getContactDetail({ contactId, zaloId } = {}) {
  const db = getDb(true);
  try {
    let sql = `SELECT * FROM contacts WHERE contact_id = ?`;
    const params = [contactId];
    if (zaloId) {
      sql += ' AND owner_zalo_id = ?';
      params.push(zaloId);
    }
    const contact = db.prepare(sql).get(...params);
    if (!contact) return null;

    // Nhãn dán phân loại local_labels
    const labels = db.prepare(`
      SELECT l.id, l.name, l.color, l.text_color, l.emoji
      FROM local_labels l
      JOIN local_label_threads lt ON l.id = lt.label_id
      WHERE lt.thread_id = ?
    `).all(contactId);

    // Thẻ CRM tags
    const crmTags = db.prepare(`
      SELECT t.id, t.name, t.color, t.emoji
      FROM crm_tags t
      JOIN crm_contact_tags ct ON t.id = ct.tag_id
      WHERE ct.contact_id = ?
    `).all(contactId);

    // Ghi chú CRM
    const notes = db.prepare(`
      SELECT id, content, created_at, updated_at
      FROM crm_notes
      WHERE contact_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(contactId);

    // Giai đoạn Pipeline
    let pipelineStage = null;
    if (contact.pipeline_stage_id) {
      pipelineStage = db.prepare(`
        SELECT id, name, color, position
        FROM crm_pipeline_stages
        WHERE id = ?
      `).get(contact.pipeline_stage_id);
    }

    return {
      contact: {
        id: contact.id,
        ownerZaloId: contact.owner_zalo_id,
        contactId: contact.contact_id,
        displayName: contact.display_name,
        avatarUrl: contact.avatar_url,
        phone: contact.phone || '',
        isFriend: Boolean(contact.is_friend),
        contactType: contact.contact_type || 'user',
        unreadCount: contact.unread_count || 0,
        lastMessage: contact.last_message || '',
        lastMessageTime: contact.last_message_time || 0,
        salutation: contact.salutation,
        salutationManual: Boolean(contact.salutation_manual),
        alias: contact.alias || '',
        aliasManual: Boolean(contact.alias_manual),
        gender: contact.gender,
        birthday: contact.birthday
      },
      labels,
      crmTags,
      notes,
      pipelineStage
    };
  } finally {
    db.close();
  }
}

/**
 * 7. Cập nhật thông tin khách hàng (xưng hô salutation, giai đoạn pipeline, alias biệt danh)
 */
function updateContact({ contactId, zaloId, salutation, pipelineStageId, alias } = {}) {
  const db = getDb(false);
  try {
    const sets = [];
    const vals = [];

    if (salutation !== undefined) {
      sets.push('salutation = ?');
      vals.push(salutation);
      sets.push('salutation_manual = ?');
      vals.push(salutation ? 1 : 0);
    }

    if (pipelineStageId !== undefined) {
      sets.push('pipeline_stage_id = ?');
      vals.push(pipelineStageId);
    }

    if (alias !== undefined) {
      sets.push('alias = ?');
      vals.push(alias);
      sets.push('alias_manual = ?');
      vals.push(alias ? 1 : 0);
    }

    if (sets.length === 0) return { updated: 0 };

    let sql = `UPDATE contacts SET ${sets.join(', ')} WHERE contact_id = ?`;
    vals.push(contactId);
    if (zaloId) {
      sql += ' AND owner_zalo_id = ?';
      vals.push(zaloId);
    }

    const res = db.prepare(sql).run(...vals);
    return { updated: res.changes, contactId };
  } finally {
    db.close();
  }
}

/**
 * 8. Thêm ghi chú CRM cho khách hàng
 */
function addCrmNote({ contactId, content, zaloId, contactType = 'user' } = {}) {
  const db = getDb(false);
  try {
    const now = Date.now();
    let ownerId = zaloId;
    if (!ownerId) {
      const row = db.prepare('SELECT owner_zalo_id FROM contacts WHERE contact_id = ? LIMIT 1').get(contactId);
      ownerId = row ? row.owner_zalo_id : '';
    }

    const stmt = db.prepare(`
      INSERT INTO crm_notes (owner_zalo_id, contact_id, contact_type, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(ownerId, contactId, contactType, content, now, now);
    return {
      id: res.lastInsertRowid,
      contactId,
      ownerZaloId: ownerId,
      content,
      createdAt: now
    };
  } finally {
    db.close();
  }
}

/**
 * 9. Danh sách nhãn dán phân loại (local_labels) và thẻ CRM (crm_tags)
 */
function listLabels({ zaloId } = {}) {
  const db = getDb(true);
  try {
    const localLabels = db.prepare('SELECT id, name, color, text_color, emoji FROM local_labels ORDER BY name ASC').all();
    let crmTagsSql = 'SELECT id, name, color, emoji FROM crm_tags';
    const crmParams = [];
    if (zaloId) {
      crmTagsSql += ' WHERE owner_zalo_id = ?';
      crmParams.push(zaloId);
    }
    crmTagsSql += ' ORDER BY name ASC';
    const crmTags = db.prepare(crmTagsSql).all(...crmParams);

    return { localLabels, crmTags };
  } finally {
    db.close();
  }
}

/**
 * 10. Danh sách chiến dịch CRM marketing
 */
function listCampaigns({ zaloId, limit = 20 } = {}) {
  const db = getDb(true);
  try {
    let sql = 'SELECT id, owner_zalo_id, name, campaign_type, status, created_at, updated_at FROM crm_campaigns WHERE is_deleted = 0';
    const params = [];
    if (zaloId) {
      sql += ' AND owner_zalo_id = ?';
      params.push(zaloId);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

/**
 * 11. Thống kê tổng quan cơ sở dữ liệu
 */
function getDbStats() {
  const db = getDb(true);
  try {
    const accountsCount = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get()?.cnt || 0;
    const contactsCount = db.prepare('SELECT COUNT(*) as cnt FROM contacts').get()?.cnt || 0;
    const messagesCount = db.prepare('SELECT COUNT(*) as cnt FROM messages').get()?.cnt || 0;
    const unreadCount = db.prepare('SELECT SUM(unread_count) as cnt FROM contacts').get()?.cnt || 0;
    const labelsCount = db.prepare('SELECT COUNT(*) as cnt FROM local_labels').get()?.cnt || 0;
    const stagesCount = db.prepare('SELECT COUNT(*) as cnt FROM crm_pipeline_stages').get()?.cnt || 0;

    return {
      accountsCount,
      contactsCount,
      messagesCount,
      unreadCount,
      labelsCount,
      stagesCount
    };
  } finally {
    db.close();
  }
}

module.exports = {
  listAccounts,
  getConversations,
  getUnreadChats,
  getThreadMessages,
  searchContacts,
  getContactDetail,
  updateContact,
  addCrmNote,
  listLabels,
  listCampaigns,
  getDbStats
};

