import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import { useAccountStore } from '@/store/accountStore';
import { useVisibleAccounts } from '@/hooks/useVisibleAccounts';
import UnifiedLabelPickerModal, { LoadedLabelOption } from '../modals/UnifiedLabelPickerModal';

export interface BatchConfig {
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
}

interface ImportWizardModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  initialFile?: File | null;
  batchConfig?: BatchConfig;
}

type WizardStep = 1 | 2;

export default function ImportWizardModal({ onClose, onSuccess, initialFile, batchConfig }: ImportWizardModalProps) {
  const { showNotification } = useAppStore();
  const visibleAccounts = useVisibleAccounts();
  const activeAccountId = useAccountStore(s => s.activeAccountId);

  const [step, setStep] = useState<WizardStep>(1);
  const [sourceType, setSourceType] = useState<'xlsx' | 'csv' | 'paste'>(
    initialFile?.name.endsWith('.csv') ? 'csv' : 'xlsx'
  );
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [pastedText, setPastedText] = useState('');
  const [dataSourceNote, setDataSourceNote] = useState('Import file lô quét Zalo');
  const [batchLabel, setBatchLabel] = useState(batchConfig?.name || '');

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<any>({});
  const [genderColumnKind, setGenderColumnKind] = useState<'text' | 'numeric' | 'mixed' | 'empty'>('empty');
  const [genderConv, setGenderConv] = useState<string>('text');
  const [dateOrder, setDateOrder] = useState<'DMY' | 'MDY'>('DMY');
  const [dupStrategy, setDupStrategy] = useState<'fill_empty' | 'skip' | 'overwrite'>('fill_empty');
  const [useBatchFormula, setUseBatchFormula] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsPage, setRowsPage] = useState(0);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'warning' | 'error' | 'dup'>('all');

  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Step 2 state
  const [createNewBatch, setCreateNewBatch] = useState(true);
  const [existingBatches, setExistingBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [step2Status, setStep2Status] = useState<'active' | 'draft' | 'priority_high'>(
    (batchConfig?.status as any) || 'active'
  );
  const [step2ScheduledTime, setStep2ScheduledTime] = useState<string>(
    batchConfig?.scheduledTime || ''
  );
  const [step2AutoTagIds, setStep2AutoTagIds] = useState<number[]>(
    batchConfig?.autoTagIds || []
  );
  const [step2SkipCrmExisting, setStep2SkipCrmExisting] = useState<boolean>(
    batchConfig?.skipCrmExisting !== false
  );
  const [step2UpdateZaloAlias, setStep2UpdateZaloAlias] = useState<boolean>(
    batchConfig?.updateZaloAlias !== false
  );

  const [localLabels, setLocalLabels] = useState<any[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  const fetchLocalLabels = useCallback(() => {
    ipc.db?.getLocalLabels({}).then((res: any) => {
      if (res?.labels) setLocalLabels(res.labels);
    });
  }, []);

  useEffect(() => {
    fetchLocalLabels();
  }, [fetchLocalLabels]);

  const labelOptions: LoadedLabelOption[] = useMemo(() => {
    return localLabels.map((l: any) => ({
      value: `local:${l.id}`,
      label: `${l.emoji || '🏷️'} ${l.name} (Local)`,
      source: 'local' as const,
      color: l.color || '#14b8a6',
      textColor: l.text_color || '#ffffff',
      emoji: l.emoji || '🏷️',
      name: l.name,
    }));
  }, [localLabels]);

  const selectedLabels = useMemo(() => {
    return localLabels.filter((l: any) => step2AutoTagIds.includes(Number(l.id)));
  }, [localLabels, step2AutoTagIds]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing batches for step 2
  useEffect(() => {
    ipc.crm?.getPhoneScanBatches().then(res => {
      if (res?.success && res.batches) {
        setExistingBatches(res.batches);
      }
    });
  }, []);

  // Auto-parse if initialFile is passed
  useEffect(() => {
    if (initialFile && !sessionId && !isParsing) {
      handleParseFile(initialFile);
    }
  }, [initialFile]);

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('__ALL__');

  const fileToBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = err => reject(err);
      reader.readAsDataURL(f);
    });
  };

  const handleParseFile = async (targetFile?: File | null, targetSheetName?: string) => {
    const f = targetFile || file;
    setIsParsing(true);

    try {
      let fileBase64: string | undefined;
      if (f) {
        fileBase64 = await fileToBase64(f);
      }

      const st = f ? (f.name.endsWith('.csv') ? 'csv' : 'xlsx') : sourceType;
      const sheetToParse = targetSheetName !== undefined ? targetSheetName : selectedSheet;

      const res = await ipc.crm.import.parseFile({
        fileBase64,
        pastedText: st === 'paste' ? pastedText : undefined,
        fileName: f ? f.name : 'Dữ liệu dán',
        sourceType: st,
        ownerZaloId: activeAccountId || visibleAccounts[0]?.zalo_id || '',
        batchLabel,
        dataSourceNote: dataSourceNote || 'Import file lô quét Zalo',
        targetSheet: sheetToParse,
      });

      if (!res.success || !res.sessionId) {
        showNotification(res.error || 'Lỗi đọc file', 'error');
        setIsParsing(false);
        return;
      }

      setSessionId(res.sessionId);
      setStats(res.stats);
      setHeader(res.header || []);
      setMapping(res.mapping || {});
      setGenderColumnKind(res.genderColumnKind as any);
      setGenderConv(res.genderColumnKind === 'numeric' ? '1=M,2=F' : 'text');
      setSheetNames((res as any).sheetNames || []);
      setSelectedSheet((res as any).selectedSheet || '__ALL__');

      fetchRows(res.sessionId, 'all', 0);
    } catch (e: any) {
      showNotification(e.message || 'Lỗi đọc file', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  const handleStartParsing = async () => {
    if (!dataSourceNote.trim()) {
      showNotification('Vui lòng nhập Nguồn dữ liệu (tuân thủ NĐ13)', 'error');
      return;
    }
    if (sourceType !== 'paste' && !file) {
      showNotification('Vui lòng chọn file .xlsx hoặc .csv', 'error');
      return;
    }
    if (sourceType === 'paste' && !pastedText.trim()) {
      showNotification('Vui lòng dán nội dung từ Excel/CSV', 'error');
      return;
    }

    await handleParseFile(file);
  };

  const fetchRows = async (sessId: string, filter: string, page: number) => {
    try {
      const res = await ipc.crm.import.getRows({
        sessionId: sessId,
        filter,
        offset: page * 100,
        limit: 100,
      });
      if (res.success) {
        setRows(res.rows || []);
        setRowsTotal(res.total || 0);
        setRowsPage(page);
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  const handleConfigChange = async (updates: any) => {
    if (!sessionId) return;
    const newMapping = updates.columnMapping || mapping;
    const newGenderConv = updates.genderConvention || genderConv;
    const newDateOrder = updates.dateOrder || dateOrder;
    const newDupStrat = updates.dupStrategy || dupStrategy;
    const newFormula = updates.aliasUseBatchFormula !== undefined ? updates.aliasUseBatchFormula : useBatchFormula;
    const newBatchLabel = updates.batchLabel !== undefined ? updates.batchLabel : batchLabel;

    if (updates.columnMapping) setMapping(newMapping);
    if (updates.genderConvention) setGenderConv(newGenderConv);
    if (updates.dateOrder) setDateOrder(newDateOrder);
    if (updates.dupStrategy) setDupStrategy(newDupStrat);
    if (updates.aliasUseBatchFormula !== undefined) setUseBatchFormula(newFormula);
    if (updates.batchLabel !== undefined) setBatchLabel(newBatchLabel);

    try {
      const res = await ipc.crm.import.setConfig({
        sessionId,
        columnMapping: newMapping,
        genderConvention: newGenderConv,
        dateOrder: newDateOrder,
        dupStrategy: newDupStrat,
        aliasUseBatchFormula: newFormula,
        batchLabel: newBatchLabel,
      });
      if (res.success) {
        setStats(res.stats);
        fetchRows(sessionId, filterTab, rowsPage);
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  const handleInlineEditName = async (rowId: string, newRealName: string) => {
    if (!sessionId) return;
    try {
      const res = await ipc.crm.import.updateRow({
        sessionId,
        rowId,
        patch: { real_name: newRealName },
      });
      if (res.success) {
        setStats(res.stats);
        setRows(prev => prev.map(r => (r.id === rowId ? { ...r, real_name: newRealName, user_edited: 1 } : r)));
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  const handleBulkAction = async (action: string) => {
    if (!sessionId) return;
    try {
      const res = await ipc.crm.import.bulkAction({ sessionId, action });
      if (res.success) {
        setStats(res.stats);
        fetchRows(sessionId, filterTab, rowsPage);
        showNotification('Đã áp dụng thao tác hàng loạt', 'success');
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  const handleDownloadSampleTemplate = async () => {
    try {
      const res = await ipc.crm.import.getSampleTemplate();
      if (res?.success && res.fileBase64) {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.fileBase64}`;
        link.download = 'mau_import_khach_hang_chuan.xlsx';
        link.click();
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  const handleDownloadErrors = async () => {
    if (!sessionId) return;
    try {
      const res = await ipc.crm.import.downloadErrors({ sessionId });
      if (res.success && res.fileBase64) {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.fileBase64}`;
        link.download = `Bao_Cao_Loi_Import_${sessionId}.xlsx`;
        link.click();
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  const handleCommit = async () => {
    if (!sessionId) return;
    if (createNewBatch && (!step2AutoTagIds || step2AutoTagIds.length === 0)) {
      showNotification('Vui lòng chọn ít nhất 1 nhãn tự động gán ở Bước 2', 'error');
      return;
    }
    setIsCommitting(true);
    try {
      const res = await ipc.crm.import.commit({
        sessionId,
        batchId: createNewBatch ? undefined : selectedBatchId,
        createNewBatch,
        batchConfig: createNewBatch ? {
          ...batchConfig,
          name: batchLabel.trim() || batchConfig?.name || `Lô import CSV ${new Date().toLocaleDateString('vi-VN')}`,
          status: step2Status,
          scheduledTime: step2ScheduledTime,
          autoTagIds: step2AutoTagIds,
          skipCrmExisting: step2SkipCrmExisting,
          updateZaloAlias: step2UpdateZaloAlias,
        } : undefined,
      });

      if (!res.success) {
        showNotification(res.error || 'Lỗi ghi dữ liệu CRM', 'error');
        setIsCommitting(false);
        return;
      }

      showNotification(`Nhập dữ liệu thành công! Tạo mới: ${res.inserted}, Cập nhật: ${res.updated}`, 'success');

      // Only start immediate scanner if batch status is active AND no future schedule time is set
      if (createNewBatch && step2Status === 'active' && !step2ScheduledTime) {
        await ipc.crm.startPhoneScanImmediate();
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (e: any) {
      showNotification(e.message, 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  const isNextDisabled =
    !sessionId ||
    !mapping.phone ||
    (genderColumnKind === 'numeric' && !genderConv) ||
    !dataSourceNote.trim() ||
    (stats && stats.validRows + stats.warnRows === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-[#f4f6fb] dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Nhập danh sách từ Excel/CSV — {step === 1 ? 'Bước 1: Preview & Ánh xạ' : 'Bước 2: Quét Zalo & Ghi CRM'}
                </h3>
                <span className="text-xs bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  ⚠️ Tránh quét dồn dập nhiều số điện thoại cùng lúc để hạn chế bị khóa tài khoản.
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Chuẩn hoá Họ tên, SĐT, Ngày sinh, Giới tính & Chống trùng lặp CRM
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (sessionId) ipc.crm.import.cancelSession({ sessionId });
              onClose();
            }}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#f4f6fb] dark:bg-gray-900">
          {!sessionId ? (
            /* Upload / Parse File Screen */
            <div className="max-w-2xl mx-auto space-y-5 py-4">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    Nguồn dữ liệu khách hàng <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Form đăng ký website, Khách POS cửa hàng Q7, Sự kiện Tech2026..."
                    value={dataSourceNote}
                    onChange={e => setDataSourceNote(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs font-medium text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Bắt buộc khai báo nguồn dữ liệu để tuân thủ Nghị định 13/2023/NĐ-CP.</p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSourceType('xlsx')}
                    className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold transition ${
                      sourceType === 'xlsx'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    📊 File Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceType('csv')}
                    className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold transition ${
                      sourceType === 'csv'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    📄 File CSV (.csv)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceType('paste')}
                    className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold transition ${
                      sourceType === 'paste'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    📋 Dán trực tiếp
                  </button>
                </div>

                {sourceType !== 'paste' ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-200 dark:border-blue-900/60 hover:border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 rounded-2xl p-8 text-center cursor-pointer transition"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={sourceType === 'xlsx' ? '.xlsx' : '.csv'}
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <div className="text-3xl mb-2">📁</div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      {file ? file.name : `Chọn file ${sourceType.toUpperCase()} hoặc kéo thả vào đây`}
                    </p>
                    <p
                      className="text-blue-600 hover:underline text-[11px] mt-2 font-bold cursor-pointer inline-block"
                      onClick={e => {
                        e.stopPropagation();
                        handleDownloadSampleTemplate();
                      }}
                    >
                      📥 Tải file Excel mẫu chuẩn (.xlsx)
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">Hỗ trợ file tối đa 50.000 dòng</p>
                  </div>
                ) : (
                  <div>
                    <textarea
                      rows={7}
                      placeholder="Dán các cột từ Excel vào đây (Họ tên, SĐT, Ngày sinh, Giới tính)..."
                      value={pastedText}
                      onChange={e => setPastedText(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-xs text-gray-900 dark:text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : step === 1 ? (
            /* Step 1: Preview & Configuration */
            <div className="space-y-4">
              {/* Multi-Sheet Selector Banner if file has > 1 Sheet */}
              {sheetNames.length > 1 && (
                <div className="flex items-center justify-between bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 px-4 py-2.5 rounded-2xl shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1">
                      📑 File Excel có <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sheetNames.length} Sheet</span>:
                    </span>
                    <select
                      value={selectedSheet}
                      onChange={e => {
                        const s = e.target.value;
                        setSelectedSheet(s);
                        handleParseFile(file, s);
                      }}
                      className="bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-700 text-xs font-bold text-blue-700 dark:text-blue-300 px-3 py-1 rounded-xl shadow-2xs focus:outline-none cursor-pointer"
                    >
                      <option value="__ALL__">🌐 Tất cả các Sheet (Tự động gộp dữ liệu)</option>
                      {sheetNames.map(name => (
                        <option key={name} value={name}>
                          📄 Sheet: {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {selectedSheet === '__ALL__' ? '✨ Đang tự động gộp tất cả các Sheet để quét' : `📌 Đang chọn Sheet: ${selectedSheet}`}
                  </span>
                </div>
              )}

              {/* 5 Stat Cards + ETA */}
              <div className="grid grid-cols-5 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-3.5 shadow-2xs">
                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">✅ Hợp lệ</div>
                  <div className="text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-0.5">{stats?.validRows || 0}</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3.5 shadow-2xs">
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">📄 Trùng trong File</div>
                  <div className="text-2xl font-black text-amber-800 dark:text-amber-200 mt-0.5">{stats?.dupInFileRows || 0}</div>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-3.5 shadow-2xs">
                  <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400">❌ Lỗi</div>
                  <div className="text-2xl font-black text-rose-800 dark:text-rose-200 mt-0.5">{stats?.errorRows || 0}</div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 rounded-2xl p-3.5 shadow-2xs">
                  <div className="text-[11px] font-bold text-orange-700 dark:text-orange-400">🔁 Trùng CRM</div>
                  <div className="text-2xl font-black text-orange-800 dark:text-orange-200 mt-0.5">{stats?.dupInCrmRows ?? stats?.dupRows ?? 0}</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-3.5 shadow-2xs">
                  <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">⏱️ Ước tính ETA</div>
                  <div className="text-lg font-black text-blue-800 dark:text-blue-200 mt-1">~{stats?.etaDays || 1} ngày</div>
                </div>
              </div>

              {/* Configuration Controls Card */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-2xl p-4 shadow-2xs space-y-3">
                <h4 className="font-bold text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  ⚙️ Cấu hình Ánh xạ Cột & Quy ước
                </h4>
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Cột SĐT (*)</label>
                    <select
                      value={mapping.phone || ''}
                      onChange={e => handleConfigChange({ columnMapping: { ...mapping, phone: e.target.value } })}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Chọn cột SĐT --</option>
                      {header.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Cột Họ & Tên</label>
                    <select
                      value={mapping.real_name || ''}
                      onChange={e => handleConfigChange({ columnMapping: { ...mapping, real_name: e.target.value } })}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Bỏ qua --</option>
                      {header.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Cột Ngày sinh</label>
                    <select
                      value={mapping.birthday || ''}
                      onChange={e => handleConfigChange({ columnMapping: { ...mapping, birthday: e.target.value } })}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Bỏ qua --</option>
                      {header.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Cột Giới tính</label>
                    <select
                      value={mapping.gender || ''}
                      onChange={e => handleConfigChange({ columnMapping: { ...mapping, gender: e.target.value } })}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Bỏ qua --</option>
                      {header.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Cột Ghi chú</label>
                    <select
                      value={mapping.notes || ''}
                      onChange={e => handleConfigChange({ columnMapping: { ...mapping, notes: e.target.value } })}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Bỏ qua --</option>
                      {header.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                {/* Duplicate strategy & conventions */}
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-3 text-xs">
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500 dark:text-gray-400 font-semibold">Chiến lược khi trùng:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="dupStrategy"
                        value="fill_empty"
                        checked={dupStrategy === 'fill_empty'}
                        onChange={() => handleConfigChange({ dupStrategy: 'fill_empty' })}
                      />
                      <span>Chỉ điền ô trống (Mặc định)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="dupStrategy"
                        value="skip"
                        checked={dupStrategy === 'skip'}
                        onChange={() => handleConfigChange({ dupStrategy: 'skip' })}
                      />
                      <span>🚫 Bỏ qua</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-amber-700 dark:text-amber-300">
                      <input
                        type="radio"
                        name="dupStrategy"
                        value="overwrite"
                        checked={dupStrategy === 'overwrite'}
                        onChange={() => handleConfigChange({ dupStrategy: 'overwrite' })}
                      />
                      <span>⚠️ Ghi đè (có snapshot 30 ngày)</span>
                    </label>
                  </div>

                  {genderColumnKind === 'numeric' && (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-xl">
                      <span className="text-amber-800 dark:text-amber-300 font-semibold">⚠️ Cột giới tính toàn số:</span>
                      <select
                        value={genderConv}
                        onChange={e => handleConfigChange({ genderConvention: e.target.value })}
                        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs rounded-lg font-medium text-gray-900 dark:text-white"
                      >
                        <option value="1=M,2=F">1 = Nam, 2 = Nữ</option>
                        <option value="0=M,1=F">0 = Nam, 1 = Nữ</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Fast Action Bar */}
              <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-200 dark:border-gray-700/80 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-bold uppercase tracking-wider">Thao tác nhanh:</span>
                  <button
                    onClick={() => handleBulkAction('accept_all_name_suggestions')}
                    className="px-3.5 py-1.5 bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    ✨ Nhận tất cả gợi ý tên
                  </button>
                  <button
                    onClick={() => handleBulkAction('fill_empty_all_dup')}
                    className="px-3.5 py-1.5 bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    📝 Điền ô trống tất cả trùng
                  </button>
                  <button
                    onClick={() => handleBulkAction('drop_all_errors')}
                    className="px-3.5 py-1.5 bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    🧹 Bỏ qua tất cả dòng lỗi
                  </button>
                </div>

                <button
                  onClick={handleDownloadErrors}
                  className="px-3.5 py-1.5 bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  📥 Tải báo cáo lỗi (.xlsx)
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-800">
                {[
                  { key: 'all', label: `Tất cả (${stats?.totalRows || 0})` },
                  { key: 'valid', label: `✅ Hợp lệ (${stats?.validRows || 0})` },
                  { key: 'warning', label: `⚠️ Cảnh báo (${stats?.warnRows || 0})` },
                  { key: 'dup_file', label: `📄 Trùng trong File (${stats?.dupInFileRows || 0})` },
                  { key: 'dup_crm', label: `🔁 Trùng CRM (${stats?.dupInCrmRows || 0})` },
                  { key: 'error', label: `❌ Lỗi (${stats?.errorRows || 0})` },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setFilterTab(t.key as any);
                      if (sessionId) fetchRows(sessionId, t.key, 0);
                    }}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
                      filterTab === t.key
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Rows Table Card */}
              <div className="border border-gray-200 dark:border-gray-700/80 rounded-2xl overflow-hidden bg-white dark:bg-gray-800 max-h-72 overflow-y-auto shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-850 text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider sticky top-0 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="p-3 w-10">#</th>
                      <th className="p-3">Họ tên gốc → Tên thật</th>
                      <th className="p-3">SĐT gốc → SĐT chuẩn</th>
                      <th className="p-3 w-24">Ngày sinh</th>
                      <th className="p-3 w-20">Giới tính</th>
                      <th className="p-3">Trạng thái / Trùng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60">
                  {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-400 text-xs">
                          Không có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      rows.map(r => {
                        let issues: ImportIssue[] = [];
                        try { issues = JSON.parse(r.issues_json || '[]'); } catch {}

                        const isError = r.validity === 'error';
                        const isInFileDup = r.dup_type === 'in_file';
                        const isInCrmDup = r.dup_type === 'in_crm';

                        // Primary error/reason message
                        const errorMsg = isError
                          ? (issues.find(i => i.severity === 'error')?.message || issues[0]?.message || 'Số không hợp lệ')
                          : null;

                        return (
                          <tr
                            key={r.id}
                            className={`transition-colors ${
                              isError
                                ? 'bg-red-50/80 dark:bg-red-950/30 opacity-70'
                                : isInFileDup
                                ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                : 'hover:bg-blue-50/30 dark:hover:bg-gray-750'
                            }`}
                          >
                            <td className={`p-3 font-mono text-[11px] ${isError ? 'text-red-400' : 'text-gray-400'}`}>{r.row_index}</td>
                            <td className="p-3">
                              {isError ? (
                                <span className="text-gray-400 text-[11px] italic">—</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-400 line-through text-[11px] font-mono">{r.full_name_raw}</span>
                                  <span className="text-gray-400">→</span>
                                  <input
                                    type="text"
                                    value={r.real_name || ''}
                                    onChange={e => handleInlineEditName(r.id, e.target.value)}
                                    className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                                  />
                                  {r.name_alt_suggestion && r.confidence < 0.8 && (
                                    <button
                                      title={`Gợi ý: ${r.name_alt_suggestion}`}
                                      onClick={() => handleInlineEditName(r.id, r.name_alt_suggestion)}
                                      className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 rounded-lg hover:bg-blue-200 font-bold transition-colors"
                                    >
                                      💡 {r.name_alt_suggestion}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-3 font-mono">
                              <span className={`text-[11px] ${isError ? 'line-through text-red-400' : 'text-gray-400'}`}>{r.phone_raw}</span>
                              {r.phone_normalized && !isError && (
                                <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-bold">{r.phone_normalized}</span>
                              )}
                            </td>
                            <td className="p-3 text-gray-700 dark:text-gray-300 font-medium">{isError ? '—' : (r.birthday_value || '-')}</td>
                            <td className="p-3 text-gray-700 dark:text-gray-300 font-medium">
                              {isError ? '—' : (r.gender === 0 ? 'Nam' : r.gender === 1 ? 'Nữ' : '-')}
                            </td>
                            <td className="p-3">
                              {isError ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2.5 py-0.5 rounded-xl text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-300 dark:border-red-700 flex items-center gap-1">
                                    ❌ Bị loại
                                  </span>
                                  <span className="text-[11px] text-red-500 dark:text-red-400 font-medium">{errorMsg}</span>
                                </div>
                              ) : isInFileDup ? (
                                <span className="px-2.5 py-0.5 rounded-xl text-[11px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                  📄 Trùng trong File
                                </span>
                              ) : isInCrmDup ? (
                                <span className="px-2.5 py-0.5 rounded-xl text-[11px] font-bold bg-orange-100 text-orange-900 dark:bg-orange-950/80 dark:text-orange-300 border border-orange-300 dark:border-orange-700">
                                  🔁 Trùng CRM ({r.dup_account_count} TK Zalo)
                                </span>
                              ) : issues.length > 0 ? (
                                <span className="px-2.5 py-0.5 rounded-xl text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  {issues[0].message}
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-xl text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          ) : (
            /* Step 2: Confirmation & Batch Options */
            <div className="max-w-2xl mx-auto space-y-4 py-3">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700/80 shadow-2xs space-y-4">
                
                {/* Header Summary Banner */}
                <div className="flex items-center justify-between bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-4 rounded-xl">
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                      📋 Xác nhận thông tin & Cấu hình Lô Quét
                    </h4>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                      Đang chuẩn bị đưa <span className="font-bold text-blue-600 dark:text-blue-400">{stats?.validRows || 0} số điện thoại hợp lệ</span> vào lô quét Zalo.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-gray-500 block uppercase tracking-wider">Ước tính chạy</span>
                    <span className="text-xs font-extrabold text-blue-700 dark:text-blue-300">~{stats?.etaDays || 1} ngày</span>
                  </div>
                </div>

                {/* Batch Creation Strategy Selector */}
                <div className="flex gap-3 p-1 bg-gray-100 dark:bg-gray-900 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCreateNewBatch(true)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      createNewBatch
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    ✨ Tạo Lô Quét mới
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateNewBatch(false)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      !createNewBatch
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    📂 Gộp vào Lô Quét có sẵn
                  </button>
                </div>

                {createNewBatch ? (
                  <div className="space-y-4 pt-1">
                    {/* Tên lô */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        TÊN LÔ QUÉT *
                      </label>
                      <input
                        type="text"
                        value={batchLabel}
                        onChange={e => setBatchLabel(e.target.value)}
                        placeholder={`Lô import CSV ${new Date().toLocaleDateString('vi-VN')}`}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    {/* Trạng thái & Hẹn giờ */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                          TRẠNG THÁI KHỞI TẠO
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setStep2Status('draft')}
                            className={`flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              step2Status === 'draft'
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 shadow-2xs ring-1 ring-amber-500/30'
                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                            }`}
                          >
                            <span>📝 Lưu nháp</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setStep2Status('active')}
                            className={`flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              step2Status === 'active'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 shadow-2xs ring-1 ring-blue-500/30'
                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                            }`}
                          >
                            <span>▶️ Chạy ngay</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setStep2Status('priority_high')}
                            className={`flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              step2Status === 'priority_high'
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 shadow-2xs ring-1 ring-emerald-500/30'
                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                            }`}
                          >
                            <span>⚡ Ưu tiên chạy</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Auto Tags Section */}
                    <div className="border border-gray-200 dark:border-gray-700/80 rounded-xl p-3.5 bg-gray-50/50 dark:bg-gray-850 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                          🏷️ NHÃN TỰ ĐỘNG GÁN (KHI TÌM THẤY ZALO)
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowLabelPicker(true)}
                          className="px-3 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-[11px] font-bold rounded-lg transition-colors border border-blue-200 dark:border-blue-800 cursor-pointer flex items-center gap-1"
                        >
                          <span>⚙️ Chọn / Đổi nhãn</span>
                        </button>
                      </div>

                      {selectedLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedLabels.map((l: any) => (
                            <span
                              key={l.id}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs"
                              style={{ backgroundColor: l.color || '#14b8a6', color: l.text_color || '#ffffff' }}
                            >
                              <span>{l.emoji || '🏷️'}</span>
                              <span>{l.name}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800/60">
                          ⚠️ Chưa chọn nhãn tự động gán. Bạn nên chọn nhãn (VD: Khách VIP, Nguồn Excel...) để tự động phân loại liên hệ sau khi quét xong.
                        </p>
                      )}
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                        <input
                          type="checkbox"
                          checked={step2SkipCrmExisting}
                          onChange={e => setStep2SkipCrmExisting(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          Bỏ qua các SĐT đã tồn tại trong danh bạ CRM (Tiết kiệm hạn ngạch quét)
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                        <input
                          type="checkbox"
                          checked={step2UpdateZaloAlias}
                          onChange={e => setStep2UpdateZaloAlias(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          Cập nhật tên gợi nhớ Zalo & CRM theo quy tắc: [Tên lô] - [Tên Zalo] - [SĐT]
                        </span>
                      </label>
                    </div>

                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-semibold">Chọn Lô Quét có sẵn:</label>
                    <select
                      value={selectedBatchId}
                      onChange={e => setSelectedBatchId(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs font-medium text-gray-900 dark:text-white"
                    >
                      <option value="">-- Chọn lô --</option>
                      {existingBatches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.total_count} số)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 dark:bg-gray-850 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center">
          {sessionId && step === 1 ? (
            <button
              type="button"
              onClick={() => {
                if (sessionId) ipc.crm.import.cancelSession({ sessionId });
                setSessionId(null);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            >
              ← Chọn file khác
            </button>
          ) : step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            >
              ← Quay lại
            </button>
          ) : (
            <div></div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            >
              Hủy
            </button>

            {step === 1 && sessionId ? (
              <button
                type="button"
                disabled={isNextDisabled}
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <span>Tiếp tục quét Zalo →</span>
              </button>
            ) : step === 2 ? (
              <button
                type="button"
                disabled={isCommitting}
                onClick={handleCommit}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white shadow-md transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isCommitting
                  ? 'Đang ghi CRM...'
                  : step2Status === 'draft'
                  ? '📝 Lưu Lô Nháp & Ghi CRM'
                  : step2Status === 'priority_high'
                  ? '⚡ Ưu tiên & Quét ngay'
                  : '🚀 Bắt đầu Quét & Ghi CRM (Chạy ngay)'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {showLabelPicker && (
        <UnifiedLabelPickerModal
          open={showLabelPicker}
          onClose={() => setShowLabelPicker(false)}
          options={labelOptions}
          selected={step2AutoTagIds.map(id => `local:${id}`)}
          onChange={selectedVals => {
            const ids = selectedVals
              .map(v => Number(v.replace('local:', '')))
              .filter(n => !isNaN(n));
            setStep2AutoTagIds(ids);
          }}
          mode="multi"
          accounts={visibleAccounts}
          onNewLabelCreated={fetchLocalLabels}
        />
      )}
    </div>
  );
}
