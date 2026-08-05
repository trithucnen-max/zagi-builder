jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid-1234',
}));

jest.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  safeStorage: { isEncryptionAvailable: () => false },
}), { virtual: true });

import DatabaseService from '../services/database/DatabaseService';
import ContactImportService from '../services/crm/import/ContactImportService';

describe('ContactImportService Integration & Logic Tests', () => {
  let sessionsTable: Map<string, any> = new Map();
  let rowsTable: Map<string, any> = new Map();
  let contactsTable: Map<string, any> = new Map();
  let nameOverridesTable: Map<string, any> = new Map();
  let batchesTable: Map<string, any> = new Map();
  let scanItemsTable: Map<string, any> = new Map();
  let snapshotsTable: Map<string, any> = new Map();

  beforeAll(() => {
    delete (DatabaseService as any).instance;
    Object.defineProperty(DatabaseService.prototype, 'initialized', { get: () => true, configurable: true });

    DatabaseService.prototype.getIsInitialized = () => true;

    DatabaseService.prototype.getAccounts = () => [
      { zalo_id: 'test_owner_123', full_name: 'Owner Account', is_active: 1 }
    ];

    DatabaseService.prototype.transaction = <T>(fn: () => T): T => fn();

    DatabaseService.prototype.runInsert = (sql: string, params: any[] = []): number => {
      if (sql.includes('INSERT INTO phone_scan_batches')) {
        const batchId = 'batch_999';
        batchesTable.set(batchId, { id: batchId, name: params[0] });
        return 999;
      }
      return 1;
    };

    DatabaseService.prototype.run = (sql: string, params: any[] = []): any => {
      if (sql.includes('INSERT INTO import_sessions')) {
        const [id, owner, fileName, fileHash, sourceType, dataNote, totalRows, colMap, genderConv, batchLabel, status, createdAt] = params;
        sessionsTable.set(id, {
          id, owner_zalo_id: owner, file_name: fileName, file_hash: fileHash, source_type: sourceType,
          data_source_note: dataNote, total_rows: totalRows, column_mapping_json: colMap,
          gender_convention: genderConv, date_order: 'DMY', dup_strategy: 'fill_empty',
          alias_use_batch_formula: 0, batch_label: batchLabel, status, created_at: createdAt
        });
        return { lastInsertRowid: id };
      }

      if (sql.includes('UPDATE import_sessions SET')) {
        const sessionId = params[params.length - 1];
        const session = sessionsTable.get(sessionId) || {};
        if (sql.includes('column_mapping_json')) {
          session.column_mapping_json = params[0];
          session.gender_convention = params[1];
          session.date_order = params[2];
          session.dup_strategy = params[3];
          session.alias_use_batch_formula = params[4];
          session.batch_label = params[5];
        } else if (sql.includes('total_rows =')) {
          session.total_rows = params[0];
          session.valid_rows = params[1];
          session.warn_rows = params[2];
          session.error_rows = params[3];
          session.dup_rows = params[4];
        } else if (sql.includes('status = \'committed\'')) {
          session.status = 'committed';
          session.batch_id = params[0];
          session.committed_at = params[1];
        }
        sessionsTable.set(sessionId, session);
        return;
      }

      if (sql.includes('INSERT INTO import_rows')) {
        const id = params[0];
        rowsTable.set(id, {
          id, session_id: params[1], row_index: params[2], full_name_raw: params[3], phone_raw: params[4],
          birthday_raw: params[5], gender_raw: params[6], note_raw: params[7], real_name: params[8],
          phone_normalized: params[9], birthday_value: params[10], birthday_precision: params[11],
          gender: params[12], salutation: params[13], alias_preview: params[14], notes_merged: params[15],
          name_confidence: params[16], name_word_count: params[17], name_branch: params[18],
          name_alt_suggestion: params[19], is_org: params[20], validity: params[21], issues_json: params[22],
          dup_type: params[23], dup_contact_ids_json: params[24], dup_owner_accounts_json: params[25],
          dup_account_count: params[26], user_action: params[27], user_edited: params[28]
        });
        return;
      }

      if (sql.includes('UPDATE import_rows SET')) {
        const name = params[0];
        const phone = params[1];
        const userAction = params[2];
        const rowId = params[4];
        const r = rowsTable.get(rowId);
        if (r) {
          r.real_name = name;
          r.phone_normalized = phone;
          r.user_action = userAction;
          r.user_edited = 1;
        }
        return;
      }

      if (sql.includes('INSERT INTO name_split_overrides')) {
        nameOverridesTable.set(params[0], { real_name: params[1] });
        return;
      }

      if (sql.includes('INSERT OR IGNORE INTO contacts')) {
        const key = `${params[0]}_${params[1]}`;
        contactsTable.set(key, {
          owner_zalo_id: params[0], contact_id: params[1], display_name: params[2], phone: params[3],
          phone_raw: params[4], full_name_raw: params[5], real_name: params[6], alias: params[7],
          gender: params[8], birthday: params[9], salutation: params[10], field_sources_json: params[11],
          import_session_id: params[12]
        });
        return;
      }

      if (sql.includes('INSERT INTO phone_scan_batches')) {
        const batchId = 'batch_999';
        batchesTable.set(batchId, { id: batchId, name: params[0] });
        return { lastInsertRowid: batchId };
      }

      if (sql.includes('INSERT INTO phone_scan_items')) {
        const id = `item_${Date.now()}_${Math.random()}`;
        scanItemsTable.set(id, { batch_id: params[0], phone: params[1], phone_normalized: params[2], real_name: params[3], full_name_raw: params[4] });
        return;
      }

      if (sql.includes('DELETE FROM import_rows')) {
        const sessionId = params[0];
        for (const [k, v] of rowsTable.entries()) {
          if (v.session_id === sessionId) rowsTable.delete(k);
        }
        return;
      }

      if (sql.includes('DELETE FROM import_sessions')) {
        sessionsTable.delete(params[0]);
        return;
      }
    };

    DatabaseService.prototype.prepare = (sql: string) => ({
      run: (...params: any[]) => DatabaseService.prototype.run(sql, params)
    }) as any;

    DatabaseService.prototype.queryOne = <T>(sql: string, params: any[] = []): T | undefined => {
      if (sql.includes('FROM import_sessions WHERE id =')) {
        return sessionsTable.get(params[0]) as any;
      }
      if (sql.includes('FROM import_rows WHERE session_id = ? AND id =')) {
        return rowsTable.get(params[1]) as any;
      }
      if (sql.includes('SELECT COUNT(*) as cnt FROM import_rows')) {
        const sessionId = params[0];
        let cnt = 0;
        for (const r of rowsTable.values()) {
          if (r.session_id === sessionId) cnt++;
        }
        return { cnt } as any;
      }
      if (sql.includes('SELECT * FROM contacts WHERE owner_zalo_id = ? AND phone = ?')) {
        const key = `${params[0]}_${params[1]}`;
        for (const c of contactsTable.values()) {
          if (c.owner_zalo_id === params[0] && c.phone === params[1]) return c as any;
        }
        return undefined;
      }
      return undefined;
    };

    DatabaseService.prototype.query = <T>(sql: string, params: any[] = []): T[] => {
      if (sql.includes('FROM import_rows WHERE session_id = ? ORDER BY row_index ASC')) {
        const sessionId = params[0];
        const res: any[] = [];
        for (const r of rowsTable.values()) {
          if (r.session_id === sessionId) res.push(r);
        }
        return res as any;
      }
      if (sql.includes('FROM import_rows WHERE session_id = ?')) {
        const sessionId = params[0];
        const res: any[] = [];
        for (const r of rowsTable.values()) {
          if (r.session_id === sessionId) res.push(r);
        }
        return res as any;
      }
      if (sql.includes('FROM contacts c')) {
        return [] as any;
      }
      return [] as any;
    };
  });

  beforeEach(() => {
    sessionsTable.clear();
    rowsTable.clear();
    contactsTable.clear();
    nameOverridesTable.clear();
    batchesTable.clear();
    scanItemsTable.clear();
    snapshotsTable.clear();
  });

  test('creates session from pasted text and verifies staging rows', () => {
    const service = ContactImportService.getInstance();
    const pastedText = `Họ tên\tSố điện thoại\tNgày sinh\tGiới tính\nNguyễn Văn Bình\t0985999959\t15/03/1990\tNam\nTrần Thị Hồng Nhung\t0906111222\t20/11\tNữ`;

    const res = service.createSession({
      pastedText,
      sourceType: 'paste',
      ownerZaloId: 'test_owner_123',
      dataSourceNote: 'Nguồn từ POS cửa hàng',
      batchLabel: 'LÔ_TEST',
    });

    expect(res.sessionId).toBeDefined();
    expect(res.stats.totalRows).toBe(2);
    expect(res.mapping.real_name).toBe('Họ tên');
    expect(res.mapping.phone).toBe('Số điện thoại');

    const { rows } = service.getRows(res.sessionId, { offset: 0, limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0].real_name).toBe('Bình');
    expect(rows[0].phone_normalized).toBe('0985999959');
    expect(rows[0].salutation).toBe('Anh');
    expect(rows[1].real_name).toBe('Hồng Nhung');
    expect(rows[1].salutation).toBe('Chị');
  });

  test('updates row inline and saves override', () => {
    const service = ContactImportService.getInstance();
    const pastedText = `Họ tên,Số điện thoại\nLê Minh Quân,0988777666`;
    const res = service.createSession({
      pastedText,
      sourceType: 'paste',
      ownerZaloId: 'test_owner_123',
      dataSourceNote: 'Nguồn test',
    });

    const { rows } = service.getRows(res.sessionId, { offset: 0, limit: 10 });
    const rowId = rows[0].id;

    // Manually edit real_name
    const updated = service.updateRow(res.sessionId, rowId, { real_name: 'Minh Quân' });
    expect(updated.row.real_name).toBe('Minh Quân');
    expect(updated.row.user_edited).toBe(1);
  });

  test('commits session and verifies CRM contact & scan batch creation', () => {
    const service = ContactImportService.getInstance();
    const pastedText = `Họ tên,Số điện thoại,Ngày sinh,Giới tính\nPhạm Ngọc Hà,0912345678,1992,Nữ`;
    const res = service.createSession({
      pastedText,
      sourceType: 'paste',
      ownerZaloId: 'test_owner_123',
      dataSourceNote: 'Nguồn test',
      batchLabel: 'TEST_BATCH',
    });

    const commitRes = service.commit(res.sessionId, { createNewBatch: true });
    expect(commitRes.inserted).toBe(1);
    expect(commitRes.batchId).toBeDefined();

    const items = Array.from(scanItemsTable.values());
    expect(items.length).toBe(1);
    expect(items[0].phone_normalized).toBe('0912345678');
    expect(items[0].real_name).toBe('Hà');
    expect(items[0].full_name_raw).toBe('Phạm Ngọc Hà');
  });

  test('cancels session cleanly', () => {
    const service = ContactImportService.getInstance();
    const res = service.createSession({
      pastedText: `Họ tên,Số điện thoại\nNam Phong,0977123456`,
      sourceType: 'paste',
      ownerZaloId: 'test_owner_123',
      dataSourceNote: 'Test cancel',
    });

    const cancelRes = service.cancelSession(res.sessionId);
    expect(cancelRes.ok).toBe(true);

    const { rows } = service.getRows(res.sessionId, { offset: 0, limit: 10 });
    expect(rows).toHaveLength(0);
  });
});
