import React, { useState, useMemo, useEffect } from 'react';
import ipc from '@/lib/ipc';

function AccountAvatar({ account, size = 'sm' }: { account: { avatar_url?: string; avatar?: string; full_name?: string; display_name?: string; name?: string; zalo_id?: string }; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  };
  const displayName = account.full_name || account.display_name || account.name;
  const avatarUrl = account.avatar_url || account.avatar;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName || ''}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0 border border-gray-700`}
        onError={(e) => {
          (e.target as HTMLElement).style.display = 'none';
        }}
      />
    );
  }

  const initial = displayName && displayName.trim() ? displayName.trim().charAt(0).toUpperCase() : '👤';

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initial}
    </div>
  );
}

export interface LoadedLabelOption {
  value: string;
  label: string;
  source: 'local' | 'zalo';
  color: string;
  textColor?: string;
  emoji?: string;
  name: string;
  pageId?: string;
  pageIds?: string[];
}

export interface UnifiedLabelPickerModalProps {
  open: boolean;
  onClose: () => void;
  options: LoadedLabelOption[];
  selected: string[];
  indeterminate?: string[];
  onChange: (selectedValues: string[]) => void;
  onIndeterminateChange?: (indeterminateValues: string[]) => void;
  onConfirm?: (selectedValues: string[], indeterminateValues?: string[]) => void;
  mode?: 'single' | 'multi';
  accounts: { zalo_id: string; full_name: string; display_name?: string; phone?: string; avatar_url?: string }[];
  selectedCount?: number;
  onNewLabelCreated?: (newLabel: LoadedLabelOption) => void;
  applying?: boolean;
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

function formatAccountDisplayName(acc?: any): string {
  if (!acc) return '';
  const candidateNames = [acc.full_name, acc.display_name, acc.name, acc.name_zalo];
  for (const name of candidateNames) {
    if (name && typeof name === 'string' && name.trim()) {
      const trimmed = name.trim();
      if (!/^\d{8,}$/.test(trimmed)) {
        return trimmed;
      }
    }
  }
  if (acc.phone && String(acc.phone).trim()) return formatPhoneDisplay(String(acc.phone));
  const idStr = String(acc.zalo_id || acc.id || acc.pageId || '');
  if (idStr && idStr.length > 8) {
    return `Zalo (...${idStr.slice(-4)})`;
  }
  return idStr || 'Zalo Account';
}

export default function UnifiedLabelPickerModal({
  open,
  onClose,
  options,
  selected,
  indeterminate = [],
  onChange,
  onIndeterminateChange,
  onConfirm,
  mode = 'multi',
  accounts,
  selectedCount,
  onNewLabelCreated,
  applying = false,
}: UnifiedLabelPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'zalo'>('local');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [newLocalLabelName, setNewLocalLabelName] = useState('');
  const [newLocalLabelColor, setNewLocalLabelColor] = useState('#3B82F6');
  const [newLocalLabelEmoji, setNewLocalLabelEmoji] = useState('🏷️');
  const [targetScopeAccountId, setTargetScopeAccountId] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState(false);

  // Draft states to ensure instant responsive toggling and clean commit on confirm
  const [draftSelected, setDraftSelected] = useState<string[]>(selected);
  const [draftIndeterminate, setDraftIndeterminate] = useState<string[]>(indeterminate);

  // Sync draft state when modal is opened or selected prop changes externally
  useEffect(() => {
    if (open) {
      setDraftSelected(selected || []);
    }
  }, [open, selected]);

  useEffect(() => {
    if (open) {
      setDraftIndeterminate(indeterminate || []);
    }
  }, [open, indeterminate]);

  const isThreeState = (onIndeterminateChange !== undefined || (indeterminate && indeterminate.length > 0)) && mode !== 'single';

  // Ghi nhớ danh sách ban đầu nằm ở trạng thái Indeterminate khi mở modal
  const [initialIndeterminateSet, setInitialIndeterminateSet] = useState<Set<string>>(() => new Set(indeterminate));

  useEffect(() => {
    if (open) {
      setInitialIndeterminateSet(new Set(indeterminate || []));
    }
  }, [open, indeterminate]);

  const localOpts = useMemo(() => {
    return options.filter(o => o.source === 'local');
  }, [options]);

  const zaloOpts = useMemo(() => {
    return options.filter(o => o.source === 'zalo').filter(o => {
      if (!o.pageId) return true;
      return accounts.some(acc => acc.zalo_id === o.pageId);
    });
  }, [options, accounts]);

  // Build account lookup map
  const accountMap = useMemo(() => {
    const map = new Map<string, typeof accounts[0]>();
    accounts.forEach(a => map.set(a.zalo_id, a));
    return map;
  }, [accounts]);

  // Get accounts that have labels
  const accountsWithLabels = useMemo(() => {
    const currentOpts = activeTab === 'local' ? localOpts : zaloOpts;

    if (activeTab === 'zalo') {
      const pageIds = new Set<string>();
      currentOpts.forEach(o => {
        if (o.pageId) pageIds.add(o.pageId);
      });

      if (pageIds.size === 0 && currentOpts.length > 0) {
        return accounts.map(acc => ({
          ...acc,
          avatar_url: acc.avatar_url || '',
          labelCount: currentOpts.length,
        }));
      }

      return accounts.filter(a => pageIds.has(a.zalo_id)).map(acc => ({
        ...acc,
        avatar_url: acc.avatar_url || '',
        labelCount: currentOpts.filter(o => o.pageId === acc.zalo_id).length,
      }));
    }

    return accounts.map(acc => {
      const count = currentOpts.filter(o => !o.pageIds || o.pageIds.length === 0 || o.pageIds.includes(acc.zalo_id)).length;
      return {
        ...acc,
        avatar_url: acc.avatar_url || '',
        labelCount: count,
      };
    }).filter(acc => acc.labelCount > 0);
  }, [activeTab, localOpts, zaloOpts, accounts]);

  // Filter labels by selected account
  const filteredLabels = useMemo(() => {
    const currentOpts = activeTab === 'local' ? localOpts : zaloOpts;
    if (selectedAccountId === 'all') return currentOpts;
    if (activeTab === 'zalo') {
      return currentOpts.filter(o => !o.pageId || o.pageId === selectedAccountId);
    }
    return currentOpts.filter(o => !o.pageIds || o.pageIds.length === 0 || o.pageIds.includes(selectedAccountId));
  }, [activeTab, localOpts, zaloOpts, selectedAccountId]);

  // Reset account filter & sync scope when switching tabs or selecting accounts
  useEffect(() => {
    setSelectedAccountId('all');
    setTargetScopeAccountId('all');
  }, [activeTab]);

  useEffect(() => {
    setTargetScopeAccountId(selectedAccountId);
  }, [selectedAccountId]);

  // Auto-select tab based on available options
  useEffect(() => {
    if (localOpts.length === 0 && zaloOpts.length > 0) setActiveTab('zalo');
    else if (localOpts.length > 0) setActiveTab('local');
  }, [localOpts.length, zaloOpts.length]);

  const handleCreateLocalLabel = async () => {
    const name = newLocalLabelName.trim();
    if (!name) return;
    const existing = options.find(o => o.source === 'local' && o.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (mode === 'single') {
        setDraftSelected([existing.value]);
        if (!onConfirm) onChange([existing.value]);
      } else {
        if (!draftSelected.includes(existing.value)) {
          const next = [...draftSelected, existing.value];
          setDraftSelected(next);
          if (!onConfirm) onChange(next);
          if (draftIndeterminate.includes(existing.value)) {
            const nextIndet = draftIndeterminate.filter(x => x !== existing.value);
            setDraftIndeterminate(nextIndet);
            if (!onConfirm) onIndeterminateChange?.(nextIndet);
          }
        }
      }
      setNewLocalLabelName('');
      return;
    }
    setCreating(true);
    try {
      const pageIds = targetScopeAccountId !== 'all' ? targetScopeAccountId : '';

      const createRes = await ipc.db?.upsertLocalLabel({
        label: {
          id: 0,
          name,
          color: newLocalLabelColor,
          textColor: '#ffffff',
          emoji: newLocalLabelEmoji,
          pageIds,
        }
      });

      if (createRes?.success && createRes.id) {
        const newLabel: LoadedLabelOption = {
          value: `local:${createRes.id}`,
          label: `${newLocalLabelEmoji} ${name} (Local)`,
          source: 'local',
          color: newLocalLabelColor,
          textColor: '#ffffff',
          emoji: newLocalLabelEmoji,
          name,
          pageIds: pageIds ? pageIds.split(',') : [],
        };
        onNewLabelCreated?.(newLabel);
        if (mode === 'single') {
          setDraftSelected([newLabel.value]);
          if (!onConfirm) onChange([newLabel.value]);
        } else {
          const next = [...draftSelected, newLabel.value];
          setDraftSelected(next);
          if (!onConfirm) onChange(next);
          if (draftIndeterminate.includes(newLabel.value)) {
            const nextIndet = draftIndeterminate.filter(x => x !== newLabel.value);
            setDraftIndeterminate(nextIndet);
            if (!onConfirm) onIndeterminateChange?.(nextIndet);
          }
        }
        setNewLocalLabelName('');
      }
    } catch (err) {
      console.error('Failed to create local label:', err);
    } finally {
      setCreating(false);
    }
  };

  /**
   * Toggle Checkbox:
   * - Nếu mode='single': Chọn 1 nhãn duy nhất
   * - Nếu 2-State (Standard Multi-Select): Toggle [✓] / [ ]
   * - Nếu 3-State (Bulk edit CRM): [-] -> [✓] -> [ ] -> [-]
   */
  const toggle = (v: string) => {
    if (mode === 'single') {
      const next = draftSelected.includes(v) ? [] : [v];
      setDraftSelected(next);
      if (!onConfirm) onChange(next);
      return;
    }

    if (!isThreeState) {
      // Clean 2-state standard multi-select toggle
      const next = draftSelected.includes(v)
        ? draftSelected.filter(x => x !== v)
        : [...draftSelected, v];
      setDraftSelected(next);
      if (!onConfirm) onChange(next);
      return;
    }

    // 3-state checkbox cycle
    const isChecked = draftSelected.includes(v);
    const isIndet = draftIndeterminate.includes(v);
    const wasOriginallyIndet = initialIndeterminateSet.has(v);

    if (isIndet) {
      // [-] -> [✓] (Gán cho tất cả)
      const nextIndet = draftIndeterminate.filter(x => x !== v);
      const nextSel = [...draftSelected, v];
      setDraftIndeterminate(nextIndet);
      setDraftSelected(nextSel);
      if (!onConfirm) {
        onIndeterminateChange?.(nextIndet);
        onChange(nextSel);
      }
    } else if (isChecked) {
      // [✓] -> [ ] (Gỡ khỏi tất cả)
      const nextSel = draftSelected.filter(x => x !== v);
      const nextIndet = draftIndeterminate.filter(x => x !== v);
      setDraftSelected(nextSel);
      setDraftIndeterminate(nextIndet);
      if (!onConfirm) {
        onChange(nextSel);
        onIndeterminateChange?.(nextIndet);
      }
    } else {
      // [ ] -> Nếu ban đầu là Indet -> [-] (Giữ nguyên) | Nếu không -> [✓] (Gán tất cả)
      if (wasOriginallyIndet && !draftIndeterminate.includes(v)) {
        const nextIndet = [...draftIndeterminate, v];
        const nextSel = draftSelected.filter(x => x !== v);
        setDraftIndeterminate(nextIndet);
        setDraftSelected(nextSel);
        if (!onConfirm) {
          onIndeterminateChange?.(nextIndet);
          onChange(nextSel);
        }
      } else {
        const nextSel = [...draftSelected, v];
        const nextIndet = draftIndeterminate.filter(x => x !== v);
        setDraftSelected(nextSel);
        setDraftIndeterminate(nextIndet);
        if (!onConfirm) {
          onChange(nextSel);
          onIndeterminateChange?.(nextIndet);
        }
      }
    }
  };

  const handleConfirmAction = () => {
    onChange(draftSelected);
    if (isThreeState) {
      onIndeterminateChange?.(draftIndeterminate);
    }
    if (onConfirm) {
      onConfirm(draftSelected, draftIndeterminate);
    }
    onClose();
  };

  const handleExecuteClearAll = () => {
    setDraftSelected([]);
    setDraftIndeterminate([]);
    if (!onConfirm) {
      onChange([]);
      onIndeterminateChange?.([]);
    }
    setShowConfirmClearAll(false);
  };

  const handleQuickClearSelection = () => {
    setDraftSelected([]);
    setDraftIndeterminate([]);
    if (!onConfirm) {
      onChange([]);
      onIndeterminateChange?.([]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-[720px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
              <span className="text-xl">🏷️</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Chọn nhãn</h2>
              <p className="text-xs text-gray-400">
                {mode === 'single'
                  ? 'Chọn 1 nhãn'
                  : isThreeState
                  ? 'Có thể chọn nhiều nhãn (Hỗ trợ 3 trạng thái)'
                  : 'Chọn một hoặc nhiều nhãn để gán'}
                {selectedCount !== undefined && selectedCount > 0 && (
                  <span> • Áp dụng cho <span className="text-blue-400 font-semibold">{selectedCount}</span> liên hệ</span>
                )}
                {draftSelected.length > 0 && ` • Đã chọn: ${draftSelected.length}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-700/50 hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* ─── Left: Account Sidebar ─── */}
          <div className="w-60 border-r border-gray-700 bg-gray-800/30 flex flex-col">
            <div className="px-3 py-2.5 border-b border-gray-700/50">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
                Tài khoản
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* All accounts option */}
              <button
                type="button"
                onClick={() => setSelectedAccountId('all')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                  selectedAccountId === 'all'
                    ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300'
                    : 'hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 border border-transparent'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm">
                  📋
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">Tất cả</div>
                  <div className="text-[10px] text-gray-500">
                    {(activeTab === 'local' ? localOpts : zaloOpts).length} nhãn
                  </div>
                </div>
              </button>

              {/* Individual accounts */}
              {accountsWithLabels.map(acc => {
                const isActive = selectedAccountId === acc.zalo_id;
                return (
                  <button
                    key={acc.zalo_id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.zalo_id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                        : 'hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 border border-transparent'
                    }`}
                  >
                    <AccountAvatar account={acc as any} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {formatAccountDisplayName(acc)}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        {acc.phone && <span>{formatPhoneDisplay(acc.phone)}</span>}
                        <span>•</span>
                        <span>{acc.labelCount} nhãn</span>
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-teal-400" />
                    )}
                  </button>
                );
              })}

              {accountsWithLabels.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-gray-500">
                  Không có tài khoản nào có nhãn {activeTab === 'local' ? 'Local' : 'Zalo'}
                </div>
              )}
            </div>
          </div>

          {/* ─── Right: Labels Panel ─── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tabs */}
            <div className="flex bg-gray-800/60 border-b border-gray-700/50">
              <button
                type="button"
                onClick={() => setActiveTab('local')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                  activeTab === 'local'
                    ? 'border-teal-500 text-teal-400 bg-teal-500/5'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-700/30'
                }`}
              >
                <span>💾</span>
                <span>Nhãn Local</span>
                {localOpts.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'local' ? 'bg-teal-500/20 text-teal-400' : 'bg-gray-700 text-gray-500'
                  }`}>
                    {localOpts.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('zalo')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                  activeTab === 'zalo'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-700/30'
                }`}
              >
                <span>☁️</span>
                <span>Nhãn Zalo</span>
                {zaloOpts.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'zalo' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'
                  }`}>
                    {zaloOpts.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick create local label */}
            {activeTab === 'local' && (
              <div className="px-3.5 py-2.5 border-b border-gray-700 bg-gray-800/40 flex flex-wrap sm:flex-nowrap items-center gap-1.5 flex-shrink-0">
                <input
                  type="text"
                  placeholder="+ Tên nhãn mới..."
                  value={newLocalLabelName}
                  onChange={e => setNewLocalLabelName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newLocalLabelName.trim() && !creating) handleCreateLocalLabel(); }}
                  className="flex-1 min-w-[100px] bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <select
                  value={targetScopeAccountId}
                  onChange={e => setTargetScopeAccountId(e.target.value)}
                  className="max-w-[125px] bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer flex-shrink-0 truncate"
                  title="Chọn phạm vi tài khoản sử dụng nhãn này"
                >
                  <option value="all">🌐 Tất cả Zalo</option>
                  {accounts.map(acc => (
                    <option key={acc.zalo_id} value={acc.zalo_id}>
                      👤 {formatAccountDisplayName(acc)}
                    </option>
                  ))}
                </select>
                <select
                  value={newLocalLabelEmoji}
                  onChange={e => setNewLocalLabelEmoji(e.target.value)}
                  className="w-10 bg-gray-900 border border-gray-700 rounded-lg px-1 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer flex-shrink-0 text-center"
                >
                  {['🏷️', '🎯', '🔥', '⭐', '📢', '💡', '✅', '❌', '⚠️'].map(em => (
                    <option key={em} value={em}>{em}</option>
                  ))}
                </select>
                <input
                  type="color"
                  value={newLocalLabelColor}
                  onChange={e => setNewLocalLabelColor(e.target.value)}
                  className="w-7 h-7 rounded border border-gray-700 bg-transparent p-0.5 cursor-pointer flex-shrink-0"
                  title="Chọn màu nhãn"
                />
                <button
                  type="button"
                  onClick={handleCreateLocalLabel}
                  disabled={creating || !newLocalLabelName.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-all flex-shrink-0 shadow-xs flex items-center gap-1"
                >
                  {creating ? 'Đang tạo...' : '+ Tạo nhãn'}
                </button>
              </div>
            )}

            {/* Labels List */}
            <div className="flex-1 overflow-y-auto p-3">
              {filteredLabels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <span className="text-4xl mb-3">🏷️</span>
                  <p className="text-sm">Không có nhãn nào</p>
                  <p className="text-xs mt-1">
                    {selectedAccountId !== 'all'
                      ? 'Tài khoản này chưa có nhãn'
                      : activeTab === 'local' ? 'Chưa có nhãn Local' : 'Chưa có nhãn Zalo'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredLabels.map(opt => {
                    const isSelected = draftSelected.includes(opt.value);
                    const isIndet = isThreeState && draftIndeterminate.includes(opt.value);
                    const bgColor = opt.color || '#6b7280';
                    const textColor = opt.textColor || getContrastColor(bgColor);
                    const isGlobalLocal = opt.source === 'local' && (!opt.pageIds || opt.pageIds.length === 0);
                    const accId = opt.pageId || opt.accountZaloId || (opt.pageIds && opt.pageIds[0]);
                    const acc = accId ? accountMap.get(accId) : undefined;
                    const formattedAccName = formatAccountDisplayName(acc);
                    const displayAccName = formattedAccName || (opt.accountName && !/^\d{8,}$/.test(opt.accountName) ? opt.accountName : (accId && accId.length > 8 ? `Zalo (...${accId.slice(-4)})` : accId));
                    const avatarUrl = acc?.avatar_url || (acc as any)?.avatar;
                    const effectiveAcc = { avatar_url: avatarUrl, full_name: displayAccName, display_name: displayAccName, zalo_id: accId || '' };

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggle(opt.value)}
                        title={
                          isSelected ? 'Bấm để BỎ CHỌN nhãn này' :
                          isIndet ? 'Bấm để GÁN NHÃN CHO TẤT CẢ liên hệ' :
                          'Bấm để CHỌN nhãn này'
                        }
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-offset-1 ring-offset-gray-900'
                            : isIndet
                            ? 'bg-gray-800/80 border-amber-500/40'
                            : 'bg-gray-800/40 border-gray-700/40 hover:border-gray-600 hover:bg-gray-800/60'
                        }`}
                        style={isSelected ? {
                          backgroundColor: `${bgColor}15`,
                          borderColor: `${bgColor}60`,
                          '--tw-ring-color': bgColor,
                        } as React.CSSProperties : undefined}
                      >
                        {/* Checkbox */}
                        <span
                          className={`w-5 h-5 ${mode === 'single' ? 'rounded-full' : 'rounded-md'} border-2 flex items-center justify-center flex-shrink-0 transition-all`}
                          style={
                            isSelected ? {
                              backgroundColor: bgColor,
                              borderColor: bgColor,
                              color: textColor,
                            } : isIndet ? {
                              backgroundColor: `${bgColor}30`,
                              borderColor: bgColor,
                              color: bgColor,
                            } : { borderColor: '#4b5563' }
                          }
                        >
                          {isSelected ? (
                            mode === 'single' ? (
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: textColor }} />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )
                          ) : isIndet ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                          ) : null}
                        </span>

                        {/* Label badge */}
                        <span
                          className="text-xs px-2.5 py-1 rounded-md font-medium shadow-sm flex items-center gap-1"
                          style={{ backgroundColor: bgColor, color: textColor }}
                        >
                          <span>{opt.emoji || '🏷️'}</span>
                          <span>{opt.name}</span>
                        </span>

                        {/* State Status Tag */}
                        {isIndet && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium flex-shrink-0">
                            [-] Giữ nguyên nhãn cũ
                          </span>
                        )}
                        {isSelected && isThreeState && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 font-medium flex-shrink-0">
                            [✓] Gán cho tất cả
                          </span>
                        )}

                        {/* Account info or Global Badge on the right-hand side */}
                        {selectedAccountId === 'all' && (
                          isGlobalLocal ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium ml-auto flex-shrink-0">
                              🌐 Tất cả Zalo
                            </span>
                          ) : (accId || displayAccName) ? (
                            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                              <AccountAvatar account={effectiveAcc} size="sm" />
                              <span className="text-xs font-medium text-gray-300">
                                {displayAccName}
                              </span>
                            </div>
                          ) : null
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2.5 px-5 py-3.5 border-t border-gray-700 bg-gray-800/60">
          {/* 3-State Legend Banner (only shown in 3-State mode) */}
          {isThreeState && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-gray-900/80 rounded-xl border border-gray-700/50 text-[11px] text-gray-300">
              <span className="font-semibold text-gray-400">Chú thích trạng thái:</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-[9px] text-amber-400 font-bold">➖</span>
                  <span className="text-amber-300 font-medium font-mono">[-]</span> Giữ nguyên nhãn cũ
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-blue-600 flex items-center justify-center text-[9px] text-white font-bold">✓</span>
                  <span className="text-blue-400 font-medium font-mono">[✓]</span> Gán cho tất cả
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded border border-gray-600 flex items-center justify-center text-[9px]"></span>
                  <span className="text-gray-400 font-medium font-mono">[ ]</span> Gỡ khỏi tất cả
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {selectedCount !== undefined && selectedCount > 0 ? (
                <span>Số liên hệ xử lý: <strong className="text-blue-400">{selectedCount}</strong></span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {isThreeState ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmClearAll(true)}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20 cursor-pointer"
                >
                  🗑️ Xóa tất cả nhãn
                </button>
              ) : draftSelected.length > 0 ? (
                <button
                  type="button"
                  onClick={handleQuickClearSelection}
                  className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-700 cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={handleConfirmAction}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors shadow-lg flex items-center gap-1.5 cursor-pointer"
              >
                {applying && (
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="10"/>
                  </svg>
                )}
                {applying ? 'Đang áp dụng...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Clear All */}
      {showConfirmClearAll && (
        <div className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-red-500/40 rounded-2xl p-5 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto text-2xl">
              ⚠️
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Xác nhận XÓA TẤT CẢ NHÃN?</h3>
              <p className="text-xs text-gray-300 mt-2 leading-relaxed">
                Hành động này sẽ <strong>XÓA TOÀN BỘ NHÃN</strong> (cả Local & Zalo) khỏi{' '}
                <strong className="text-red-400">{selectedCount || 'các'} liên hệ</strong> đã chọn. Bạn có chắc chắn muốn tiếp tục?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmClearAll(false)}
                className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteClearAll}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg transition-colors cursor-pointer"
              >
                Đồng ý xóa hết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
