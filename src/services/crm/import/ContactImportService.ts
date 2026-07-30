import crypto from 'crypto';
import * as XLSX from 'xlsx';
import DatabaseService from '../../database/DatabaseService';
import Logger from '../../../utils/Logger';
import {
  ColumnMapping,
  DateOrder,
  DupStrategy,
  GenderConvention,
  ImportIssue,
  RowValidity,
  DupType,
  RawTable,
} from './types';
import { parseSheet, parsePasted, autoMapColumns } from './fileParser';
import { normalizePhone } from './phoneNormalizer';
import { splitRealName, removeVietnameseAccents } from './nameSplitter';
import { parseBirthday } from './birthdayParser';
import { parseGender, detectGenderColumnKind } from './genderParser';

export interface SessionStats {
  totalRows: number;
  validRows: number;
  warnRows: number;
  errorRows: number;
  dupRows: number;
  dupInFileRows?: number;
  dupInCrmRows?: number;
  etaDays: number;
}

export interface ImportRow {
  id: string;
  session_id: string;
  row_index: number;
  full_name_raw: string;
  phone_raw: string;
  birthday_raw: string;
  gender_raw: string;
  note_raw: string;
  real_name: string | null;
  phone_normalized: string | null;
  birthday_value: string | null;
  birthday_precision: string;
  gender: number | null;
  salutation: string;
  alias_preview: string;
  notes_merged: string;
  name_confidence: number;
  name_word_count: number;
  name_branch: string;
  name_alt_suggestion?: string;
  is_org: number;
  validity: RowValidity;
  issues_json: string;
  dup_type: DupType;
  dup_contact_ids_json: string;
  dup_owner_accounts_json: string;
  dup_account_count: number;
  user_action: string;
  user_edited: number;
}

export default class ContactImportService {
  private static instance: ContactImportService;

  private constructor() {}

  public static getInstance(): ContactImportService {
    if (!ContactImportService.instance) {
      ContactImportService.instance = new ContactImportService();
    }
    return ContactImportService.instance;
  }

  /**
   * Step 1: Create import session, parse file/pasted text, validate rows & detect duplicates
   */
  public createSession(input: {
    buffer?: Buffer;
    pastedText?: string;
    fileName?: string;
    sourceType: 'xlsx' | 'csv' | 'paste';
    ownerZaloId: string;
    batchLabel?: string;
    dataSourceNote: string;
    targetSheet?: string;
  }): {
    sessionId: string;
    stats: SessionStats;
    header: string[];
    mapping: ColumnMapping;
    genderColumnKind: 'text' | 'numeric' | 'mixed' | 'empty';
    sheetNames?: string[];
    selectedSheet?: string;
  } {
    const db = DatabaseService.getInstance();
    db.cleanupTempUnscannedContacts();
    const sessionId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    let rawTable: RawTable = { header: [], rows: [] };
    let fileHash = '';

    if (input.sourceType === 'paste') {
      const text = input.pastedText || '';
      fileHash = crypto.createHash('sha256').update(text).digest('hex');
      rawTable = parsePasted(text);
    } else if (input.buffer) {
      fileHash = crypto.createHash('sha256').update(input.buffer).digest('hex');
      rawTable = parseSheet(input.buffer, input.sourceType, input.targetSheet);
    }

    const mapping = autoMapColumns(rawTable.header);

    // Detect gender column kind
    let genderColumnKind: 'text' | 'numeric' | 'mixed' | 'empty' = 'empty';
    if (mapping.gender) {
      const genderVals = rawTable.rows.map(r => r[mapping.gender!]);
      genderColumnKind = detectGenderColumnKind(genderVals);
    }

    const defaultGenderConv: GenderConvention =
      genderColumnKind === 'numeric' ? '1=M,2=F' : 'text';

    // Insert import session record
    db.run(
      `INSERT INTO import_sessions (
        id, owner_zalo_id, file_name, file_hash, source_type, data_source_note,
        total_rows, column_mapping_json, gender_convention, date_order, dup_strategy,
        alias_use_batch_formula, batch_label, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DMY', 'fill_empty', 0, ?, 'previewing', ?)`,
      [
        sessionId,
        input.ownerZaloId,
        input.fileName || 'Pasted Content',
        fileHash,
        input.sourceType,
        input.dataSourceNote || '',
        rawTable.rows.length,
        JSON.stringify(mapping),
        defaultGenderConv,
        input.batchLabel || '',
        Date.now(),
      ]
    );

    // Process & store raw rows into staging table
    this.processAndStoreRows(
      sessionId,
      rawTable.rows,
      mapping,
      defaultGenderConv,
      'DMY',
      false,
      input.batchLabel || ''
    );

    const stats = this.getStats(sessionId);

    return {
      sessionId,
      stats,
      header: rawTable.header,
      mapping,
      genderColumnKind,
      sheetNames: rawTable.sheetNames || [],
      selectedSheet: rawTable.selectedSheet,
    };
  }

  /**
   * Re-validate session rows when user changes mapping, gender convention, date order, or formula
   */
  public setConfig(
    sessionId: string,
    cfg: Partial<{
      columnMapping: ColumnMapping;
      genderConvention: GenderConvention;
      dateOrder: DateOrder;
      dupStrategy: DupStrategy;
      aliasUseBatchFormula: boolean;
      batchLabel: string;
    }>
  ): SessionStats {
    const db = DatabaseService.getInstance();
    const session = db.queryOne<any>(
      `SELECT * FROM import_sessions WHERE id = ?`,
      [sessionId]
    );
    if (!session) throw new Error('Import session not found');

    const currentMapping: ColumnMapping = cfg.columnMapping
      ? cfg.columnMapping
      : JSON.parse(session.column_mapping_json || '{}');
    const genderConv = cfg.genderConvention || session.gender_convention || 'text';
    const dateOrder = cfg.dateOrder || session.date_order || 'DMY';
    const dupStrategy = cfg.dupStrategy || session.dup_strategy || 'fill_empty';
    const useBatchFormula =
      cfg.aliasUseBatchFormula !== undefined
        ? cfg.aliasUseBatchFormula
        : Boolean(session.alias_use_batch_formula);
    const batchLabel =
      cfg.batchLabel !== undefined ? cfg.batchLabel : session.batch_label || '';

    // Update session record
    db.run(
      `UPDATE import_sessions SET
        column_mapping_json = ?,
        gender_convention = ?,
        date_order = ?,
        dup_strategy = ?,
        alias_use_batch_formula = ?,
        batch_label = ?
      WHERE id = ?`,
      [
        JSON.stringify(currentMapping),
        genderConv,
        dateOrder,
        dupStrategy,
        useBatchFormula ? 1 : 0,
        batchLabel,
        sessionId,
      ]
    );

    // Re-read raw data from import_rows and re-process
    const rawRows = db.query<any>(
      `SELECT row_index, full_name_raw, phone_raw, birthday_raw, gender_raw, note_raw
       FROM import_rows WHERE session_id = ? ORDER BY row_index ASC`,
      [sessionId]
    );

    // Format raw rows back into record map for re-processing
    const tableRows = rawRows.map(r => ({
      [currentMapping.real_name || 'full_name_raw']: r.full_name_raw,
      [currentMapping.phone || 'phone_raw']: r.phone_raw,
      [currentMapping.birthday || 'birthday_raw']: r.birthday_raw,
      [currentMapping.gender || 'gender_raw']: r.gender_raw,
      [currentMapping.notes || 'note_raw']: r.note_raw,
    }));

    db.run(`DELETE FROM import_rows WHERE session_id = ?`, [sessionId]);

    this.processAndStoreRows(
      sessionId,
      tableRows,
      currentMapping,
      genderConv,
      dateOrder,
      useBatchFormula,
      batchLabel
    );

    return this.getStats(sessionId);
  }

  /**
   * Internal helper to process rows and insert into import_rows staging table in batches
   */
  private processAndStoreRows(
    sessionId: string,
    tableRows: Record<string, any>[],
    mapping: ColumnMapping,
    genderConv: GenderConvention,
    dateOrder: DateOrder,
    useBatchFormula: boolean,
    batchLabel: string
  ): void {
    const db = DatabaseService.getInstance();

    // Batch query CRM contacts to find duplicates efficiently
    const allPhones = tableRows
      .map(r => {
        const rawP = mapping.phone ? r[mapping.phone] : r.phone_raw;
        return normalizePhone(rawP).normalized;
      })
      .filter(Boolean) as string[];

    const crmDupMap = this.lookupCrmDuplicates(allPhones);

    const seenPhonesInFile = new Map<string, number>(); // normalizedPhone -> first rowIndex
    const rowsToInsert: any[] = [];
    const todayStr = new Date().toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
    });

    tableRows.forEach((r, idx) => {
      const fullNameRaw = String(
        mapping.real_name ? r[mapping.real_name] || '' : r.full_name_raw || ''
      ).trim();
      let phoneRaw = String(
        mapping.phone ? r[mapping.phone] || '' : r.phone_raw || ''
      ).trim();
      const birthdayRaw = String(
        mapping.birthday ? r[mapping.birthday] || '' : r.birthday_raw || ''
      ).trim();
      const genderRaw = String(
        mapping.gender ? r[mapping.gender] || '' : r.gender_raw || ''
      ).trim();
      let noteRaw = String(
        mapping.notes ? r[mapping.notes] || '' : r.note_raw || ''
      ).trim();

      // Smart Fallback: If primary phone column is empty or invalid, check secondary phone columns (e.g. SĐT 2, SĐT 3)
      let phoneRes = normalizePhone(phoneRaw);
      if (!phoneRes.valid) {
        for (const k of Object.keys(r)) {
          if (k !== mapping.phone && ['sdt', 'phone', 'dienthoai', 'mobile'].some(kw => removeVietnameseAccents(k).toLowerCase().includes(kw))) {
            const altPhone = String(r[k] || '').trim();
            const altRes = normalizePhone(altPhone);
            if (altRes.valid) {
              phoneRaw = altPhone;
              phoneRes = altRes;
              break;
            }
          }
        }
      }

      // Auto-append unmapped informational fields (like CĂN HỘ, DỰ ÁN...) to notes
      const extraFields: string[] = [];
      Object.keys(r).forEach(k => {
        if (
          k !== mapping.phone &&
          k !== mapping.real_name &&
          k !== mapping.birthday &&
          k !== mapping.gender &&
          k !== mapping.notes
        ) {
          const val = String(r[k] || '').trim();
          if (val && val !== 'null' && val !== 'undefined') {
            extraFields.push(`${k}: ${val}`);
          }
        }
      });

      if (extraFields.length > 0) {
        noteRaw = noteRaw ? `${noteRaw} | ${extraFields.join(', ')}` : extraFields.join(', ');
      }

      const nameRes = splitRealName(fullNameRaw);
      const bdayRes = parseBirthday(birthdayRaw, dateOrder);
      const genderRes = parseGender(genderRaw, genderConv);

      const allIssues: ImportIssue[] = [
        ...phoneRes.issues,
        ...nameRes.issues,
        ...bdayRes.issues,
        ...genderRes.issues,
      ];

      // Check 2-Tier Duplicates: Tier 1 (In File), Tier 2 (In CRM)
      let dupType: DupType = 'none';
      let dupContactIds: string[] = [];
      let dupAccounts: any[] = [];

      if (phoneRes.normalized) {
        if (seenPhonesInFile.has(phoneRes.normalized)) {
          dupType = 'in_file';
          const firstRowIdx = seenPhonesInFile.get(phoneRes.normalized)!;
          allIssues.push({
            code: 'EXCEL_FLOAT_FORMAT',
            severity: 'warning',
            message: `Trùng SĐT với Dòng ${firstRowIdx} trong file`,
          });
        } else {
          seenPhonesInFile.set(phoneRes.normalized, idx + 1);

          if (crmDupMap.has(phoneRes.normalized)) {
            dupType = 'in_crm';
            const matches = crmDupMap.get(phoneRes.normalized)!;
            dupContactIds = matches.map(m => m.contact_id);
            dupAccounts = matches.map(m => ({
              zalo_id: m.owner_zalo_id,
              account_name: m.account_name || m.owner_zalo_id,
              current_display_name: m.display_name,
            }));
          }
        }
      }

      // Determine alias preview
      let aliasPreview = '';
      if (useBatchFormula) {
        const label = batchLabel.trim() || 'LÔ';
        const displayNamePart = nameRes.realName || 'Khách';
        const phonePart = phoneRes.normalized || phoneRaw;
        aliasPreview = `${label} - ${displayNamePart} - ${phonePart}`;
      } else {
        aliasPreview = nameRes.realName || '';
      }

      // Prepare merged notes
      const notesMerged = noteRaw
        ? `[Import ${todayStr}] ${noteRaw}`
        : '';

      // Determine validity
      let validity: RowValidity = 'valid';
      if (allIssues.some(i => i.severity === 'error')) {
        validity = 'error';
      } else if (allIssues.length > 0 || dupType !== 'none') {
        validity = 'warning';
      }

      rowsToInsert.push([
        `row_${sessionId}_${idx + 1}`,
        sessionId,
        idx + 1,
        fullNameRaw,
        phoneRaw,
        birthdayRaw,
        genderRaw,
        noteRaw,
        nameRes.realName,
        phoneRes.normalized,
        bdayRes.value,
        bdayRes.precision,
        genderRes.gender,
        genderRes.salutation,
        aliasPreview,
        notesMerged,
        nameRes.confidence,
        nameRes.wordCount,
        nameRes.branch,
        nameRes.altSuggestion || null,
        nameRes.isOrg ? 1 : 0,
        validity,
        JSON.stringify(allIssues),
        dupType,
        JSON.stringify(dupContactIds),
        JSON.stringify(dupAccounts),
        dupAccounts.length,
        'default',
        0,
      ]);
    });

    // Batch insert into import_rows (chunks of 500)
    for (let i = 0; i < rowsToInsert.length; i += 500) {
      const chunk = rowsToInsert.slice(i, i + 500);
      db.transaction(() => {
        for (const row of chunk) {
          db.run(
            `INSERT INTO import_rows (
              id, session_id, row_index, full_name_raw, phone_raw, birthday_raw, gender_raw, note_raw,
              real_name, phone_normalized, birthday_value, birthday_precision, gender, salutation,
              alias_preview, notes_merged, name_confidence, name_word_count, name_branch,
              name_alt_suggestion, is_org, validity, issues_json, dup_type, dup_contact_ids_json,
              dup_owner_accounts_json, dup_account_count, user_action, user_edited
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            row
          );
        }
      });
    }

    // Update session summary counts
    this.updateSessionCounts(sessionId);
  }

  /**
   * Helper to lookup CRM contacts by normalized phones in chunked IN queries (max 900)
   */
  private lookupCrmDuplicates(phones: string[]): Map<string, any[]> {
    const db = DatabaseService.getInstance();
    const map = new Map<string, any[]>();
    if (phones.length === 0) return map;

    const uniquePhones = Array.from(new Set(phones));

    for (let i = 0; i < uniquePhones.length; i += 900) {
      const chunk = uniquePhones.slice(i, i + 900);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db.query<any>(
        `SELECT c.contact_id, c.owner_zalo_id, c.phone, c.display_name, a.full_name as account_name
         FROM contacts c
         LEFT JOIN accounts a ON a.zalo_id = c.owner_zalo_id
         WHERE c.phone IN (${placeholders}) AND c.contact_id NOT LIKE 'tmp_%'`,
        chunk
      );

      for (const r of rows) {
        if (!map.has(r.phone)) map.set(r.phone, []);
        map.get(r.phone)!.push(r);
      }
    }

    return map;
  }

  /**
   * Recalculate and update session summary counts in DB
   */
  private updateSessionCounts(sessionId: string): void {
    const db = DatabaseService.getInstance();
    const rows = db.query<any>(
      `SELECT validity, dup_type FROM import_rows WHERE session_id = ?`,
      [sessionId]
    );

    let validRows = 0;
    let warnRows = 0;
    let errorRows = 0;
    let dupRows = 0;

    for (const r of rows) {
      if (r.validity === 'valid') validRows++;
      if (r.validity === 'warning') warnRows++;
      if (r.validity === 'error') errorRows++;
      if (r.dup_type && r.dup_type !== 'none') dupRows++;
    }

    db.run(
      `UPDATE import_sessions SET
        total_rows = ?, valid_rows = ?, warn_rows = ?, error_rows = ?, dup_rows = ?
       WHERE id = ?`,
      [rows.length, validRows, warnRows, errorRows, dupRows, sessionId]
    );
  }

  /**
   * Get current statistics for a session
   */
  public getStats(sessionId: string): SessionStats {
    const db = DatabaseService.getInstance();
    const s = db.queryOne<any>(
      `SELECT total_rows, valid_rows, warn_rows, error_rows, dup_rows FROM import_sessions WHERE id = ?`,
      [sessionId]
    );
    if (!s) {
      return { totalRows: 0, validRows: 0, warnRows: 0, errorRows: 0, dupRows: 0, etaDays: 0 };
    }

    const detailedDup = db.queryOne<any>(`
      SELECT 
        SUM(CASE WHEN dup_type = 'in_file' THEN 1 ELSE 0 END) as in_file_cnt,
        SUM(CASE WHEN dup_type = 'in_crm' THEN 1 ELSE 0 END) as in_crm_cnt
      FROM import_rows WHERE session_id = ?
    `, [sessionId]);

    // ETA calculation: Zalo scanning safety limit is 100 contacts/day per account
    const accounts = db.getAccounts() || [];
    const activeAccountCount = Math.max(1, accounts.filter((a: any) => a.is_active !== 0).length);
    const validAndWarnCount = (s.valid_rows || 0) + (s.warn_rows || 0);
    const etaDays = Math.ceil(validAndWarnCount / (100 * activeAccountCount));

    return {
      totalRows: s.total_rows || 0,
      validRows: s.valid_rows || 0,
      warnRows: s.warn_rows || 0,
      errorRows: s.error_rows || 0,
      dupRows: s.dup_rows || 0,
      dupInFileRows: detailedDup?.in_file_cnt || 0,
      dupInCrmRows: detailedDup?.in_crm_cnt || 0,
      etaDays,
    };
  }

  /**
   * Retrieve rows with pagination and optional filter
   */
  public getRows(
    sessionId: string,
    opts: {
      filter?: 'all' | 'valid' | 'warning' | 'error' | 'dup' | 'dup_file' | 'dup_crm';
      offset: number;
      limit: number;
    }
  ): { rows: ImportRow[]; total: number } {
    const db = DatabaseService.getInstance();
    let whereClause = `WHERE session_id = ?`;
    const params: any[] = [sessionId];

    if (opts.filter && opts.filter !== 'all') {
      if ((opts.filter as string) === 'dup') {
        whereClause += ` AND dup_type != 'none'`;
      } else if ((opts.filter as string) === 'dup_file') {
        whereClause += ` AND dup_type = 'in_file'`;
      } else if ((opts.filter as string) === 'dup_crm') {
        whereClause += ` AND dup_type = 'in_crm'`;
      } else {
        whereClause += ` AND validity = ?`;
        params.push(opts.filter);
      }
    }

    const countRes = db.queryOne<any>(
      `SELECT COUNT(*) as cnt FROM import_rows ${whereClause}`,
      params
    );
    const total = countRes?.cnt || 0;

    const rows = db.query<any>(
      `SELECT * FROM import_rows ${whereClause} ORDER BY row_index ASC LIMIT ? OFFSET ?`,
      [...params, opts.limit || 200, opts.offset || 0]
    );

    return { rows, total };
  }

  /**
   * Update single row inline (e.g. user edits real_name or phone)
   */
  public updateRow(
    sessionId: string,
    rowId: string,
    patch: Partial<ImportRow>
  ): { row: ImportRow; stats: SessionStats } {
    const db = DatabaseService.getInstance();
    const existing = db.queryOne<any>(
      `SELECT * FROM import_rows WHERE session_id = ? AND id = ?`,
      [sessionId, rowId]
    );
    if (!existing) throw new Error('Row not found');

    const updatedName = patch.real_name !== undefined ? patch.real_name : existing.real_name;
    const updatedPhone = patch.phone_normalized !== undefined ? patch.phone_normalized : existing.phone_normalized;
    const updatedUserAction = patch.user_action !== undefined ? patch.user_action : existing.user_action;

    // Save name override if user manually changed name
    if (patch.real_name !== undefined && patch.real_name !== existing.real_name && existing.full_name_raw) {
      const normRaw = removeVietnameseAccents(existing.full_name_raw).trim();
      if (normRaw && patch.real_name) {
        db.run(
          `INSERT INTO name_split_overrides (full_name_normalized, real_name, hit_count, updated_at)
           VALUES (?, ?, 1, ?)
           ON CONFLICT(full_name_normalized) DO UPDATE SET
             real_name = excluded.real_name,
             hit_count = hit_count + 1,
             updated_at = excluded.updated_at`,
          [normRaw, patch.real_name.trim(), Date.now()]
        );
      }
    }

    db.run(
      `UPDATE import_rows SET
        real_name = ?,
        phone_normalized = ?,
        user_action = ?,
        user_edited = 1
       WHERE session_id = ? AND id = ?`,
      [updatedName, updatedPhone, updatedUserAction, sessionId, rowId]
    );

    this.updateSessionCounts(sessionId);
    const updatedRow = db.queryOne<any>(
      `SELECT * FROM import_rows WHERE session_id = ? AND id = ?`,
      [sessionId, rowId]
    );
    const stats = this.getStats(sessionId);

    return { row: updatedRow, stats };
  }

  /**
   * Perform bulk action across rows in session
   */
  public bulkAction(
    sessionId: string,
    action:
      | 'skip_all_dup'
      | 'fill_empty_all_dup'
      | 'overwrite_all_dup'
      | 'accept_all_name_suggestions'
      | 'drop_all_errors'
  ): SessionStats {
    const db = DatabaseService.getInstance();

    if (action === 'skip_all_dup') {
      db.run(
        `UPDATE import_rows SET user_action = 'skip' WHERE session_id = ? AND dup_type != 'none'`,
        [sessionId]
      );
    } else if (action === 'fill_empty_all_dup') {
      db.run(
        `UPDATE import_rows SET user_action = 'fill_empty' WHERE session_id = ? AND dup_type != 'none'`,
        [sessionId]
      );
    } else if (action === 'overwrite_all_dup') {
      db.run(
        `UPDATE import_rows SET user_action = 'overwrite' WHERE session_id = ? AND dup_type != 'none'`,
        [sessionId]
      );
    } else if (action === 'accept_all_name_suggestions') {
      const rows = db.query<any>(
        `SELECT id, name_alt_suggestion FROM import_rows WHERE session_id = ? AND name_alt_suggestion IS NOT NULL`,
        [sessionId]
      );
      for (const r of rows) {
        db.run(
          `UPDATE import_rows SET real_name = ?, user_edited = 1 WHERE id = ?`,
          [r.name_alt_suggestion, r.id]
        );
      }
    } else if (action === 'drop_all_errors') {
      db.run(
        `UPDATE import_rows SET user_action = 'skip' WHERE session_id = ? AND validity = 'error'`,
        [sessionId]
      );
    }

    this.updateSessionCounts(sessionId);
    return this.getStats(sessionId);
  }

  /**
   * Export error rows to XLSX buffer
   */
  public exportErrors(sessionId: string): Buffer {
    const db = DatabaseService.getInstance();
    const rows = db.query<any>(
      `SELECT row_index, full_name_raw, phone_raw, birthday_raw, gender_raw, note_raw, issues_json
       FROM import_rows WHERE session_id = ? AND validity = 'error' ORDER BY row_index ASC`,
      [sessionId]
    );

    const exportData = rows.map(r => {
      let issues: ImportIssue[] = [];
      try {
        issues = JSON.parse(r.issues_json || '[]');
      } catch {}
      const reason = issues.map(i => i.message).join('; ');

      return {
        'Dòng': r.row_index,
        'Họ và tên gốc': r.full_name_raw,
        'Số điện thoại gốc': r.phone_raw,
        'Ngày sinh gốc': r.birthday_raw,
        'Giới tính gốc': r.gender_raw,
        'Ghi chú gốc': r.note_raw,
        'Lý do lỗi': reason,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Loi_Import');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Step 2: Commit staging rows into CRM contacts & batch
   */
  public commit(
    sessionId: string,
    opts: {
      batchId?: string;
      createNewBatch?: boolean;
      batchConfig?: {
        name?: string;
        assignedAccountId?: string | null;
        targetAccountId?: string | null;
        contactAssignmentMode?: 'single' | 'distributed' | 'all_accounts';
        autoTagIds?: number[];
        dailyLimit?: number;
        hourlyLimit?: number;
        priority?: number;
        status?: 'active' | 'paused';
        scheduledTime?: string;
        skipCrmExisting?: boolean;
        autoWorkflowId?: number | null;
        updateZaloAlias?: boolean;
      };
    }
  ): {
    batchId: string;
    inserted: number;
    updated: number;
    skipped: number;
    snapshotCount: number;
  } {
    const db = DatabaseService.getInstance();
    const session = db.queryOne<any>(
      `SELECT * FROM import_sessions WHERE id = ?`,
      [sessionId]
    );
    if (!session) throw new Error('Session not found');
    if (session.status === 'committed') {
      throw new Error('Session has already been committed');
    }

    const rows = db.query<any>(
      `SELECT * FROM import_rows WHERE session_id = ? AND user_action != 'skip' AND validity != 'error'`,
      [sessionId]
    );

    let batchId = opts.batchId || '';
    if (!batchId && opts.createNewBatch !== false) {
      const cfg = opts.batchConfig || {};
      const batchName = (cfg.name && cfg.name.trim())
        ? cfg.name.trim()
        : session.batch_label
        ? `Lô import: ${session.batch_label}`
        : `Lô import CSV ${new Date().toLocaleDateString('vi-VN')}`;

      const assignedAccountId = cfg.assignedAccountId !== undefined ? cfg.assignedAccountId : (session.owner_zalo_id || null);
      const targetAccountId = cfg.contactAssignmentMode === 'single' ? (cfg.targetAccountId || null) : null;
      const contactAssignmentMode = cfg.contactAssignmentMode || 'distributed';
      const autoTagIdsStr = JSON.stringify(cfg.autoTagIds || []);
      const dailyLimit = cfg.dailyLimit || 100;
      const hourlyLimit = cfg.hourlyLimit || 30;
      const priority = cfg.priority || 0;
      const initialStatus = cfg.status || 'active';
      const scheduledTime = cfg.scheduledTime || null;
      const skipCrmExisting = cfg.skipCrmExisting !== false ? 1 : 0;
      const autoWorkflowId = cfg.autoWorkflowId ? Number(cfg.autoWorkflowId) : null;
      const updateZaloAlias = cfg.updateZaloAlias !== false ? 1 : 0;
      const now = Date.now();

      const lastId = db.runInsert(
        `INSERT INTO phone_scan_batches (
          name, assigned_account_id, target_account_id, contact_assignment_mode, auto_tag_ids, daily_limit, hourly_limit, priority, status, scheduled_time, skip_crm_existing, auto_workflow_id, update_zalo_alias, total_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchName, assignedAccountId, targetAccountId, contactAssignmentMode, autoTagIdsStr, dailyLimit, hourlyLimit, priority, initialStatus, scheduledTime, skipCrmExisting, autoWorkflowId, updateZaloAlias, rows.length, now]
      );
      batchId = String(lastId);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let snapshotCount = 0;
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days expiry

    // Wrap single commit transaction for 50x performance boost
    db.transaction(() => {
      for (const r of rows) {
        if (!r.phone_normalized) {
          skipped++;
          continue;
        }

        // In-file duplicate rows (Row 2, Row 3...) are automatically skipped from queuing into batch scan
        if (r.dup_type === 'in_file') {
          skipped++;
          continue;
        }

        const effectiveStrategy =
          r.user_action !== 'default' ? r.user_action : session.dup_strategy;

        if (r.dup_type !== 'none' && effectiveStrategy === 'skip') {
          skipped++;
          continue;
        }

        // Save rollback snapshot if overwriting existing contact
        if (r.dup_type !== 'none' && effectiveStrategy === 'overwrite') {
          const existingContact = db.queryOne<any>(
            `SELECT * FROM contacts WHERE owner_zalo_id = ? AND phone = ?`,
            [session.owner_zalo_id, r.phone_normalized]
          );
          if (existingContact) {
            db.run(
              `INSERT INTO import_rollback_snapshots (id, session_id, contact_id, before_json, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                `snap_${sessionId}_${r.id}`,
                sessionId,
                existingContact.contact_id,
                JSON.stringify(existingContact),
                now,
                expiresAt,
              ]
            );
            snapshotCount++;
          }
        }

        // Insert or update CRM contact
        const fieldSources = {
          real_name: r.real_name ? 'csv' : 'none',
          gender: r.gender !== null ? 'csv' : 'none',
          birthday: r.birthday_value ? 'csv' : 'none',
          phone: 'csv',
        };

        if (r.dup_type === 'none') {
          // New contact entry — DO NOT pre-insert unverified temp contacts into CRM contacts table.
          // Real contacts will be inserted by PhoneScanService ONLY when scan returns status = 'found' with a verified Zalo UID.
          inserted++;
        } else {
          // Duplicate contact update based on strategy
          if (effectiveStrategy === 'fill_empty') {
            db.run(
              `UPDATE contacts SET
                real_name = CASE WHEN real_name IS NULL OR real_name = '' THEN ? ELSE real_name END,
                gender = CASE WHEN gender IS NULL THEN ? ELSE gender END,
                birthday = CASE WHEN birthday IS NULL OR birthday = '' THEN ? ELSE birthday END,
                salutation = CASE WHEN salutation IS NULL OR salutation = '' THEN ? ELSE salutation END,
                alias = CASE WHEN alias IS NULL OR alias = '' THEN ? ELSE alias END
               WHERE owner_zalo_id = ? AND phone = ?`,
              [
                r.real_name,
                r.gender,
                r.birthday_value,
                r.salutation,
                r.alias_preview,
                session.owner_zalo_id,
                r.phone_normalized,
              ]
            );
            updated++;
          } else if (effectiveStrategy === 'overwrite') {
            db.run(
              `UPDATE contacts SET
                real_name = ?,
                gender = ?,
                birthday = ?,
                salutation = ?,
                alias = ?,
                full_name_raw = ?,
                phone_raw = ?
               WHERE owner_zalo_id = ? AND phone = ?`,
              [
                r.real_name,
                r.gender,
                r.birthday_value,
                r.salutation,
                r.alias_preview,
                r.full_name_raw,
                r.phone_raw,
                session.owner_zalo_id,
                r.phone_normalized,
              ]
            );
            updated++;
          }
        }

        // Push into phone_scan_items for background Zalo scanning
        if (batchId) {
          db.run(
            `INSERT INTO phone_scan_items (batch_id, phone, phone_normalized, status, created_at)
             VALUES (?, ?, ?, 'pending', ?)`,
            [batchId, r.phone_raw || r.phone_normalized, r.phone_normalized, now]
          );
        }
      }

      // Mark session as committed
      db.run(
        `UPDATE import_sessions SET status = 'committed', batch_id = ?, committed_at = ? WHERE id = ?`,
        [batchId, now, sessionId]
      );
    });

    return { batchId, inserted, updated, skipped, snapshotCount };
  }

  /**
   * Rollback overwrites using 30-day snapshot
   */
  public rollback(sessionId: string): { restored: number } {
    const db = DatabaseService.getInstance();
    const snapshots = db.query<any>(
      `SELECT * FROM import_rollback_snapshots WHERE session_id = ?`,
      [sessionId]
    );

    let restored = 0;

    db.transaction(() => {
      for (const snap of snapshots) {
        try {
          const before = JSON.parse(snap.before_json);
          db.run(
            `UPDATE contacts SET
              display_name = ?, avatar_url = ?, phone = ?, alias = ?, gender = ?, birthday = ?, salutation = ?, real_name = ?
             WHERE owner_zalo_id = ? AND contact_id = ?`,
            [
              before.display_name,
              before.avatar_url,
              before.phone,
              before.alias,
              before.gender,
              before.birthday,
              before.salutation,
              before.real_name,
              before.owner_zalo_id,
              before.contact_id,
            ]
          );
          restored++;
        } catch (e) {
          Logger.error(`Rollback error for snapshot ${snap.id}: ${e}`);
        }
      }
    });

    return { restored };
  }

  /**
   * Cancel session and cleanup staging records
   */
  public cancelSession(sessionId: string): { ok: boolean } {
    const db = DatabaseService.getInstance();
    db.run(`DELETE FROM import_rows WHERE session_id = ?`, [sessionId]);
    db.run(`DELETE FROM import_sessions WHERE id = ?`, [sessionId]);
    return { ok: true };
  }

  public getSampleTemplate(): Buffer {
    const { generateSampleExcelBuffer } = require('./fileParser');
    return generateSampleExcelBuffer();
  }
}
