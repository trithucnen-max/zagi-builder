import React, { useCallback, useEffect, useRef, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore, LabelData } from '@/store/appStore';
import { extractUserProfile } from '../../../../utils/profileUtils';
import ZaloLabelBadge from '../tags/ZaloLabelBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportPhase = 'configure' | 'analyzing' | 'preview' | 'done';
type RowStatus = 'new' | 'duplicate' | 'blocked' | 'no_zalo';

interface ParsedRow {
  phone: string;        // normalized
  rawPhone: string;
  fbName: string;
  fbLink: string;
  gender: string;
  // filled after Zalo check
  status?: RowStatus;
  uid?: string;
  displayName?: string;
  avatar?: string;
  blockReason?: string;
}

interface ImportResult {
  added: number;
  updated: number;
  blocked: number;
  noZalo: number;
}

interface CRMImportModalProps {
  onClose: () => void;
  onDone?: () => void; // refresh contact list
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BLACKLIST_KEY_PREFIX = 'crm_import_blacklist_';
const MAX_PHONES = 50;

export function normalizePhone(raw: string): string {
  const s = raw.trim().replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) return '0' + s.slice(3).replace(/^0+/, '');
  if (s.startsWith('84') && s.length >= 10) return '0' + s.slice(2).replace(/^0+/, '');
  return s;
}

export function isValidPhone(p: string): boolean {
  return /^0\d{8,9}$/.test(p);
}

/** Parse CSV text → rows. Supports comma or tab separator. */
export function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  // Detect separator
  const sep = lines[0].includes('\t') ? '\t' : ',';
  // Check if first line is header
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes('điện thoại') || firstLower.includes('facebook') || firstLower.includes('số') || firstLower.includes('phone');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    const fbName = cols[0] || '';
    const rawPhone = cols[1] || '';
    const gender = cols[2] || '';
    const fbLink = cols[3] || '';
    return { phone: normalizePhone(rawPhone), rawPhone, fbName, fbLink, gender };
  }).filter(r => r.rawPhone.trim());
}

// ─── Status Badge ───────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: RowStatus }) => {
  const map: Record<RowStatus, { label: string; cls: string }> = {
    new:       { label: 'Mới',        cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    duplicate: { label: 'Trùng',      cls: 'bg-amber-50 border-amber-200 text-amber-700'  },
    blocked:   { label: 'Loại',       cls: 'bg-red-50 border-red-200 text-red-700'         },
    no_zalo:   { label: 'Không Zalo', cls: 'bg-gray-100 border-gray-200 text-gray-600'      },
  };
  const { label, cls } = map[status];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{label}</span>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CRMImportModal({ onClose, onDone }: CRMImportModalProps) {
  const { activeAccountId, getActiveAccount } = useAccountStore();
  const { showNotification, labels: allLabelsMap } = useAppStore();
  const zaloId = activeAccountId || '';

  // ── Phase ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ImportPhase>('configure');

  // ── Configure state ───────────────────────────────────────────────────────
  const [csvFileName, setCsvFileName] = useState('');
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [checkZalo, setCheckZalo] = useState(true);
  const [syncDuplicates, setSyncDuplicates] = useState(false);
  const [blacklistText, setBlacklistText] = useState('');
  const [savingBlacklist, setSavingBlacklist] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Tag states ──────────────────────────────────────────────────
  const [localLabels, setLocalLabels] = useState<any[]>([]);
  const [selectedLocalLabelIds, setSelectedLocalLabelIds] = useState<number[]>([]);
  const [selectedZaloLabelIds, setSelectedZaloLabelIds] = useState<number[]>([]);
  const [newLocalLabelName, setNewLocalLabelName] = useState('');
  const zaloLabels: LabelData[] = allLabelsMap[zaloId] || [];

  // ── Analyzing state ───────────────────────────────────────────────────────
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });
  const [analyzeStats, setAnalyzeStats] = useState({ zalo: 0, noZalo: 0, blocked: 0, dup: 0 });
  const stopRef = useRef(false);

  // ── Preview state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<ParsedRow[]>([]);

  // ── Done state ────────────────────────────────────────────────────────────
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Load blacklist from settings ──────────────────────────────────────────
  useEffect(() => {
    if (!zaloId) return;
    ipc.db?.getSetting({ key: `${BLACKLIST_KEY_PREFIX}${zaloId}` })
      .then(res => {
        if (res?.success && res.value) {
          try {
            const arr: string[] = JSON.parse(res.value);
            setBlacklistText(arr.join('\n'));
          } catch { /* ignore */ }
        }
      }).catch(() => {});
  }, [zaloId]);

  // ── Load local labels ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!zaloId) return;
    ipc.db?.getLocalLabels({ zaloId })
      .then(res => {
        if (res?.success && res.labels) {
          setLocalLabels(res.labels);
        }
      }).catch(() => {});
  }, [zaloId]);

  // ── Blacklist keywords array ──────────────────────────────────────────────
  const blacklistKeywords = React.useMemo(() => {
    return blacklistText
      .split(/[\n,]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }, [blacklistText]);

  // ── Save blacklist ────────────────────────────────────────────────────────
  const handleSaveBlacklist = async () => {
    if (!zaloId) return;
    setSavingBlacklist(true);
    await ipc.db?.setSetting({
      key: `${BLACKLIST_KEY_PREFIX}${zaloId}`,
      value: JSON.stringify(blacklistKeywords),
    });
    setSavingBlacklist(false);
    showNotification('Đã lưu từ khoá cấm', 'success');
  };

  // ── CSV upload handler ────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length > MAX_PHONES) {
        showNotification(`File chứa ${parsed.length} số. Chỉ import tối đa ${MAX_PHONES} số đầu tiên.`, 'warning');
      }
      setCsvRows(parsed.slice(0, MAX_PHONES));
    };
    reader.readAsText(file, 'utf-8');
  };

  // ── Download sample CSV ───────────────────────────────────────────────────
  const handleDownloadSample = () => {
    const header = 'Tên facebook,Số điện thoại,Giới tính,Link facebook';
    const row1   = 'Nguyễn Văn A,0912345678,Nam,https://facebook.com/example1';
    const row2   = 'Trần Thị B,0987654321,Nữ,https://facebook.com/example2';
    const csv = [header, row1, row2].join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'file_mau_import_khach_hang.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Get active rows from current tab ─────────────────────────────────────
  const getActiveRows = useCallback((): ParsedRow[] => {
    return csvRows;
  }, [csvRows]);

  // ── Analyze & Preview ─────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    const parsed = getActiveRows().filter(r => isValidPhone(r.phone));
    if (!parsed.length) {
      showNotification('Không tìm thấy số điện thoại hợp lệ', 'warning');
      return;
    }
    const acc = getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    setPhase('analyzing');
    stopRef.current = false;
    const stats = { zalo: 0, noZalo: 0, blocked: 0, dup: 0 };

    // 1. Bulk check duplicates (1 IPC call for all phones)
    const dupRes = await ipc.db?.checkPhonesDuplicate({ zaloId, phones: parsed.map(r => r.phone) });
    const dupSet = new Set<string>(dupRes?.duplicates || []);

    const working: ParsedRow[] = [];
    setAnalyzeProgress({ current: 0, total: parsed.length });

    for (let i = 0; i < parsed.length; i++) {
      if (stopRef.current) break;
      const row = { ...parsed[i] };
      setAnalyzeProgress({ current: i + 1, total: parsed.length });

      // 2. Blacklist filter
      const combinedText = `${row.phone} ${row.fbName}`.toLowerCase();
      const blockedBy = blacklistKeywords.find(kw => combinedText.includes(kw));
      if (blockedBy) {
        row.status = 'blocked';
        row.blockReason = `Từ khoá: "${blockedBy}"`;
        stats.blocked++;
        setAnalyzeStats({ ...stats });
        working.push(row);
        continue;
      }

      // 3. Mark duplicate (check before Zalo to show status correctly)
      if (dupSet.has(row.phone)) {
        row.status = 'duplicate';
        stats.dup++;
      }

      // 4. Zalo check
      if (checkZalo) {
        try {
          const res = await ipc.zalo?.findUser({ auth, phone: row.phone });
          const user = res?.response;
          if (user?.uid) {
            row.uid = user.uid;
            row.displayName = row.fbName || user.display_name || user.uid;
            row.avatar = user.avatar || '';
            // Keep 'duplicate' if already set, else 'new'
            if (!row.status) row.status = 'new';
            stats.zalo++;
          } else {
            row.status = 'no_zalo';
            row.blockReason = 'Không có tài khoản Zalo';
            stats.noZalo++;
          }
        } catch {
          row.status = 'no_zalo';
          row.blockReason = 'Không tìm thấy';
          stats.noZalo++;
        }
        if (i < parsed.length - 1) await new Promise(r => setTimeout(r, 500));
      } else {
        if (!row.status) row.status = 'new';
        row.displayName = row.fbName || row.phone;
        row.uid = row.phone; // use phone as placeholder ID
      }

      setAnalyzeStats({ ...stats });
      working.push(row);
    }

    setRows(working);
    setPhase('preview');
  }, [getActiveRows, zaloId, blacklistKeywords, checkZalo, getActiveAccount, showNotification]);

  // ── Confirm import ────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    setImporting(true);
    if (!zaloId) return;

    const outcome: ImportResult = { added: 0, updated: 0, blocked: 0, noZalo: 0 };
    const importedContactIds: string[] = [];

    for (const row of rows) {
      if (row.status === 'blocked') { outcome.blocked++; continue; }
      if (row.status === 'no_zalo') { outcome.noZalo++; continue; }
      if (row.status === 'duplicate' && !syncDuplicates) continue;

      const contactId = row.uid || row.phone;
      const displayName = row.fbName || row.displayName || row.phone;

      await ipc.db?.updateContactProfile({
        zaloId,
        contactId,
        displayName,
        avatarUrl: row.avatar || '',
        phone: row.phone,
        contactType: 'user',
      });

      importedContactIds.push(contactId);

      // Save FB extra_data if available
      if (row.fbName || row.fbLink) {
        const extraData: Record<string, any> = {
          import_source: 'csv_import',
          imported_at: new Date().toISOString(),
        };
        if (row.fbName) extraData.fb_name = row.fbName;
        if (row.fbLink) extraData.fb_link = row.fbLink;
        if (row.gender) extraData.gender_text = row.gender;
        await ipc.db?.updateContactExtraData({ zaloId, contactId, extraData });
      }

      if (row.status === 'duplicate') outcome.updated++;
      else outcome.added++;
    }

    // 1. Assign local labels if selected
    if (selectedLocalLabelIds.length > 0 && importedContactIds.length > 0) {
      for (const labelId of selectedLocalLabelIds) {
        for (const id of importedContactIds) {
          try {
            await ipc.db?.assignLocalLabelToThread({ zaloId, labelId, threadId: id });
          } catch (err) {
            console.error('Failed to assign local label:', err);
          }
        }
      }
      window.dispatchEvent(new CustomEvent('local-labels-changed', { detail: { zaloId } }));
    }

    // 2. Assign Zalo labels if selected
    if (selectedZaloLabelIds.length > 0 && importedContactIds.length > 0) {
      try {
        const acc = getActiveAccount();
        if (acc) {
          const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
          const freshRes = await ipc.zalo?.getLabels({ auth });
          const freshLabels: LabelData[] = freshRes?.response?.labelData || zaloLabels;
          const version: number = freshRes?.response?.version || 0;

          const updated = freshLabels.map(label => {
            if (!selectedZaloLabelIds.includes(label.id)) return label;
            const existing = new Set(label.conversations || []);
            importedContactIds.forEach(id => existing.add(id));
            return { ...label, conversations: [...existing] };
          });

          const res = await ipc.zalo?.updateLabels({ auth, labelData: updated, version });
          if (res?.success) {
            const { setLabels } = useAppStore.getState();
            const finalLabels: LabelData[] = res.response?.labelData || updated;
            setLabels(zaloId, finalLabels);
          }
        }
      } catch (err: any) {
        showNotification('Cảnh báo: Gán nhãn Zalo thất bại — ' + (err?.message || ''), 'error');
      }
    }

    setResult(outcome);
    setImporting(false);
    setPhase('done');
  }, [rows, zaloId, syncDuplicates, selectedLocalLabelIds, selectedZaloLabelIds, zaloLabels, getActiveAccount, showNotification]);

  // ── Counts for preview ────────────────────────────────────────────────────
  const newCount  = rows.filter(r => r.status === 'new').length;
  const dupCount  = rows.filter(r => r.status === 'duplicate').length;
  const skipCount = rows.filter(r => r.status === 'blocked' || r.status === 'no_zalo').length;
  const confirmCount = newCount + (syncDuplicates ? dupCount : 0);
  const isLabelSelected = selectedLocalLabelIds.length > 0 || selectedZaloLabelIds.length > 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-150 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-xl">📥</span>
            <div>
              <h2 className="text-gray-900 font-semibold text-sm">Import danh sách khách hàng</h2>
              <p className="text-gray-500 text-xs mt-0.5">Tối đa {MAX_PHONES} số điện thoại mỗi lần</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              {(['configure', 'analyzing', 'preview', 'done'] as ImportPhase[]).map((p, idx) => {
                const labels: Record<ImportPhase, string> = { configure: 'Cấu hình', analyzing: 'Phân tích', preview: 'Xác nhận', done: 'Hoàn tất' };
                const isCurrent = phase === p;
                const isDone = (['configure', 'analyzing', 'preview', 'done'] as ImportPhase[]).indexOf(p) < (['configure', 'analyzing', 'preview', 'done'] as ImportPhase[]).indexOf(phase);
                return (
                  <React.Fragment key={p}>
                    {idx > 0 && <span className="text-gray-300 font-bold">›</span>}
                    <span className={isCurrent ? 'text-blue-600 font-semibold' : isDone ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                      {labels[p]}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-white">

          {/* PHASE: configure */}
          {phase === 'configure' && (
            <div className="p-6 space-y-5">
              {/* CSV Upload Only */}
              <div className="space-y-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all bg-gray-50/50"
                >
                  {csvFileName ? (
                    <>
                      <p className="text-emerald-600 font-semibold text-sm">✅ {csvFileName}</p>
                      <p className="text-gray-500 text-xs mt-1">{csvRows.length} dòng (tối đa {MAX_PHONES})</p>
                      <p className="text-blue-500 text-xs mt-2 font-medium">Click để chọn file khác</p>
                    </>
                  ) : (
                    <>
                      <svg className="mx-auto mb-2 text-gray-400" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                      <p className="text-gray-700 text-sm font-semibold">Kéo thả hoặc click để chọn file CSV</p>
                      <p className="text-gray-400 text-xs mt-1">Hỗ trợ .csv, .txt (UTF-8)</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="text-blue-600 hover:text-blue-750 text-xs flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  Tải file mẫu .csv (Tên FB, SĐT, Giới tính, Link FB)
                </button>
              </div>

              {/* Options */}
              <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-gray-700 text-sm font-semibold">⚙️ Tuỳ chọn import</p>
                {[
                  {
                    id: 'checkZalo', value: checkZalo, set: setCheckZalo,
                    label: 'Kiểm tra tài khoản Zalo trước khi thêm',
                    sub: 'Chỉ import số có Zalo (~0.5s/số, khuyên dùng)',
                  },
                  {
                    id: 'syncDup', value: syncDuplicates, set: setSyncDuplicates,
                    label: 'Cập nhật nếu số đã tồn tại',
                    sub: 'Ghi đè tên hiển thị theo Tên FB từ file CSV',
                  },
                ].map(opt => (
                  <label key={opt.id} className="flex items-start gap-3 cursor-pointer group" onClick={() => opt.set(v => !v)}>
                    <div className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative mt-0.5 ${opt.value ? 'bg-blue-600' : 'bg-gray-300'}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow ${opt.value ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </div>
                    <div>
                      <p className="text-gray-800 text-sm font-medium group-hover:text-gray-900">{opt.label}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{opt.sub}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Blacklist */}
              <div className="bg-red-50/30 border border-red-200/60 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-gray-755 text-sm font-semibold">
                    🚫 Từ khoá cấm
                    <span className="text-gray-400 text-xs font-normal ml-1">(lưu theo tài khoản Zalo)</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveBlacklist}
                    disabled={savingBlacklist}
                    className="text-xs text-blue-600 hover:text-blue-755 disabled:opacity-50 flex items-center gap-1 transition-colors font-semibold cursor-pointer"
                  >
                    {savingBlacklist ? '...' : '💾 Lưu lại'}
                  </button>
                </div>
                <textarea
                  value={blacklistText}
                  onChange={e => setBlacklistText(e.target.value)}
                  placeholder={'casino\ncờ bạc\ncho vay\nlừa đảo\nbóng đá'}
                  rows={3}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-850 placeholder-gray-400 focus:outline-none focus:border-red-500/70 resize-none"
                />
                <p className="text-gray-500 text-xs">Mỗi từ khoá một dòng. Lọc theo SĐT và tên Facebook trong file.</p>
              </div>
            </div>
          )}

          {/* PHASE: analyzing */}
          {phase === 'analyzing' && (
            <div className="p-8 flex flex-col items-center justify-center gap-6 min-h-[320px]">
              <div className="text-center">
                <div className="text-5xl mb-3 animate-pulse">🔍</div>
                <p className="text-gray-800 font-semibold text-base">Đang phân tích danh sách...</p>
                <p className="text-gray-500 text-xs mt-1">
                  {analyzeProgress.current} / {analyzeProgress.total} số điện thoại
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-sm">
                <div className="h-2.5 bg-gray-150 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-300"
                    style={{ width: `${analyzeProgress.total ? (analyzeProgress.current / analyzeProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {/* Live stats */}
              <div className="grid grid-cols-4 gap-3 w-full max-w-sm">
                {[
                  { label: 'Có Zalo',   value: analyzeStats.zalo,    color: 'text-emerald-600' },
                  { label: 'Không Zalo', value: analyzeStats.noZalo, color: 'text-gray-500'    },
                  { label: 'Từ khoá',   value: analyzeStats.blocked, color: 'text-red-600'     },
                  { label: 'Trùng DB',  value: analyzeStats.dup,     color: 'text-yellow-600'  },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-gray-500 text-[10px] mt-0.5 font-medium">{s.label}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { stopRef.current = true; setPhase('configure'); }}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 hover:border-gray-400 px-5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Dừng lại
              </button>
            </div>
          )}

          {/* PHASE: preview */}
          {phase === 'preview' && (
            <div className="flex flex-col">
              {/* Summary strip */}
              <div className="flex gap-5 px-6 py-3 border-b border-gray-150 bg-gray-50/50 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-emerald-600 font-bold text-base">{newCount}</span>
                  <span className="text-gray-500 font-medium text-xs">Mới</span>
                </div>
                <div className="w-px bg-gray-250" />
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-yellow-600 font-bold text-base">{dupCount}</span>
                  <span className="text-gray-500 font-medium text-xs">Trùng</span>
                </div>
                <div className="w-px bg-gray-250" />
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-red-500 font-bold text-base">{skipCount}</span>
                  <span className="text-gray-500 font-medium text-xs">Loại bỏ</span>
                </div>
                {syncDuplicates && dupCount > 0 && (
                  <>
                    <div className="w-px bg-gray-250" />
                    <p className="text-xs text-yellow-655 self-center font-medium">🔄 Sẽ cập nhật {dupCount} trùng</p>
                  </>
                )}
              </div>

              {/* Tag Assignment (Unified Checklist) */}
              <div className="border border-gray-200 rounded-xl overflow-hidden mx-6 mt-4 mb-4 bg-white">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-xs text-gray-700 font-semibold">Gắn nhãn chiến dịch / phân loại <span className="text-red-500">* Bắt buộc</span></p>
                  {!isLabelSelected && <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100">Cần chọn nhãn</span>}
                </div>

                <div className="p-4 space-y-4">
                  {/* Quick create local label */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Tạo nhanh nhãn local mới (VD: Chiến dịch tháng 6)..."
                      value={newLocalLabelName}
                      onChange={e => setNewLocalLabelName(e.target.value)}
                      className="flex-1 bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-gray-900 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const name = newLocalLabelName.trim();
                        if (!name) return;
                        const existing = localLabels.find(l => l.name.toLowerCase() === name.toLowerCase());
                        if (existing) {
                          if (!selectedLocalLabelIds.includes(existing.id)) {
                            setSelectedLocalLabelIds(prev => [...prev, existing.id]);
                          }
                          setNewLocalLabelName('');
                          showNotification(`Đã tự động chọn nhãn "${existing.name}" sẵn có`, 'info');
                          return;
                        }
                        try {
                          const createRes = await ipc.db?.upsertLocalLabel({
                            label: { id: 0, name, color: '#f97316', emoji: '🎯', pageIds: zaloId }
                          });
                          if (createRes?.success && createRes.id) {
                            const newLabel = { id: createRes.id, name, color: '#f97316', emoji: '🎯', page_ids: zaloId };
                            setLocalLabels(prev => [newLabel, ...prev]);
                            setSelectedLocalLabelIds(prev => [...prev, createRes.id]);
                            setNewLocalLabelName('');
                            showNotification('Đã tạo và chọn nhãn local mới', 'success');
                          }
                        } catch (err) {
                          showNotification('Không thể tạo nhãn', 'error');
                        }
                      }}
                      disabled={!newLocalLabelName.trim()}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Tạo
                    </button>
                  </div>

                  {/* Scrollable checklist of both Local and Zalo labels */}
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2.5 bg-gray-55/50 space-y-4">
                    {/* Local labels */}
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Nhãn Local (Chọn nhiều)</p>
                      {localLabels.length === 0 ? (
                        <p className="text-xs text-gray-400 italic pl-1">Chưa có nhãn local nào</p>
                      ) : (
                        <div className="space-y-1">
                          {localLabels.map(label => {
                            const isSelected = selectedLocalLabelIds.includes(label.id);
                            return (
                              <button key={label.id} type="button"
                                onClick={() => setSelectedLocalLabelIds(prev =>
                                  isSelected ? prev.filter(x => x !== label.id) : [...prev, label.id]
                                )}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-left cursor-pointer bg-white border border-gray-100 shadow-sm">
                                <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] ${
                                  isSelected ? 'bg-blue-600 border-blue-600 text-white font-bold' : 'border-gray-300 bg-white'
                                }`}>
                                  {isSelected && '✓'}
                                </span>
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color || '#f97316' }} />
                                {label.emoji && <span className="text-xs">{label.emoji}</span>}
                                <span className="text-xs text-gray-700 font-medium truncate">{label.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Zalo labels */}
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Nhãn Zalo (Chọn tối đa 1)</p>
                      {zaloLabels.length === 0 ? (
                        <p className="text-xs text-gray-400 italic pl-1">Chưa có nhãn Zalo nào</p>
                      ) : (
                        <div className="space-y-1">
                          {zaloLabels.map(label => {
                            const isSelected = selectedZaloLabelIds.includes(label.id);
                            return (
                              <button key={label.id} type="button"
                                onClick={() => setSelectedZaloLabelIds(
                                  isSelected ? [] : [label.id]
                                )}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-left cursor-pointer bg-white border border-gray-100 shadow-sm">
                                <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center text-[9px] ${
                                  isSelected ? 'bg-blue-600 border-blue-600 text-white font-bold' : 'border-gray-300 bg-white'
                                }`}>
                                  {isSelected && '●'}
                                </span>
                                <ZaloLabelBadge label={label} size="xs" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-y-auto max-h-60 border-t border-gray-150 bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-55 z-10 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs w-10">#</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">SĐT</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">Tên FB</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">Link FB</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">Trạng thái</th>
                      <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                      <tr key={i} className={`hover:bg-gray-50/50 transition-colors ${row.status === 'blocked' || row.status === 'no_zalo' ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 text-gray-850 font-mono text-xs">{row.phone}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-xs max-w-[100px] truncate">
                          {row.fbName || row.displayName || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs max-w-[100px] truncate">
                          {row.fbLink
                            ? <a href={row.fbLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline hover:text-blue-750" onClick={e => e.stopPropagation()}>
                                {row.fbLink.replace('https://facebook.com/', 'fb/').replace('https://fb.com/', 'fb/')}
                              </a>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">{row.status && <StatusBadge status={row.status} />}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{row.blockReason || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PHASE: done */}
          {phase === 'done' && result && (
            <div className="p-10 flex flex-col items-center justify-center gap-6 text-center bg-white">
              <div className="text-6xl animate-bounce">🎉</div>
              <div>
                <h3 className="text-gray-900 font-bold text-lg">Import hoàn tất!</h3>
                <p className="text-gray-500 text-xs mt-1">Dữ liệu đã được lưu vào ZaloCRM</p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-emerald-600 font-bold text-3xl">{result.added}</p>
                  <p className="text-gray-500 text-xs mt-1">Đã thêm mới</p>
                </div>
                <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-blue-600 font-bold text-3xl">{result.updated}</p>
                  <p className="text-gray-500 text-xs mt-1">Đã cập nhật</p>
                </div>
                <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4">
                  <p className="text-red-500 font-bold text-3xl">{result.blocked}</p>
                  <p className="text-gray-500 text-xs mt-1">Từ khoá cấm</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <p className="text-gray-600 font-bold text-3xl">{result.noZalo}</p>
                  <p className="text-gray-405 text-xs mt-1">Không có Zalo</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-150 flex-shrink-0 bg-gray-50">

          {phase === 'configure' && (
            <>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-750 text-sm transition-colors px-2 font-medium cursor-pointer">
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={csvRows.length === 0}
                className="bg-blue-600 hover:bg-blue-750 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Phân tích &amp; Preview
              </button>
            </>
          )}

          {phase === 'analyzing' && (
            <div className="w-full flex justify-center">
              <p className="text-gray-500 text-xs animate-pulse font-medium">Đang xử lý, vui lòng chờ...</p>
            </div>
          )}

          {phase === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setPhase('configure')}
                className="text-gray-500 hover:text-gray-750 text-sm transition-colors flex items-center gap-1.5 px-2 font-medium cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Sửa lại
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={importing || confirmCount === 0 || !isLabelSelected}
                className="bg-blue-600 hover:bg-blue-750 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {importing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Đang import...
                  </>
                ) : (
                  `✅ Xác nhận Import (${confirmCount})`
                )}
              </button>
            </>
          )}

          {phase === 'done' && (
            <>
              <button
                type="button"
                onClick={() => { onDone?.(); onClose(); }}
                className="text-blue-600 hover:text-blue-700 text-sm transition-colors px-2 font-semibold cursor-pointer"
              >
                Xem danh sách liên hệ →
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-250 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
