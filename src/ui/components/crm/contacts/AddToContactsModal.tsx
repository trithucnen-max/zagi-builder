import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore, LabelData } from '@/store/appStore';
import ZaloLabelBadge from '../tags/ZaloLabelBadge';
import type { LocalLabelItem } from '@/components/common/LocalLabelSelector';
import { extractUserProfile } from '../../../../utils/profileUtils';
import { normalizePhone, isValidVietnamPhone } from '@/utils/phoneUtils';
import UnifiedLabelPickerModal, { LoadedLabelOption } from '../modals/UnifiedLabelPickerModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContactToAdd {
  contactId: string;
  displayName: string;
  avatar: string;
  phone?: string;
}

type InputMode = 'list' | 'phones';

interface AddToContactsModalProps {
  /** Danh sách liên hệ cần thêm (từ group members, v.v.) — nếu null thì dùng mode nhập SĐT */
  contacts?: ContactToAdd[];
  /** Override account (nếu không truyền dùng activeAccountId) */
  zaloId?: string;
  onClose: () => void;
  /** Callback sau khi thêm xong */
  onDone?: (addedCount: number) => void;
}

const SpinIcon = (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AddToContactsModal({ contacts, zaloId: overrideZaloId, onClose, onDone }: AddToContactsModalProps) {
  const { activeAccountId, getActiveAccount } = useAccountStore();
  const { showNotification, labels: allLabelsMap } = useAppStore();
  const accountId = overrideZaloId || activeAccountId || '';

  // ── Input mode state ─────────────────────────────────────────────────────
  const inputMode: InputMode = contacts && contacts.length > 0 ? 'list' : 'phones';
  const [phoneInput, setPhoneInput] = useState('');
  const [resolvedContacts, setResolvedContacts] = useState<ContactToAdd[]>([]);
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<{ current: number; total: number } | null>(null);
  const stopRef = useRef(false);

  // ── Tag options ──────────────────────────────────────────────────────────
  const [selectedLocalLabelIds, setSelectedLocalLabelIds] = useState<number[]>([]);
  const [selectedZaloLabelIds, setSelectedZaloLabelIds] = useState<number[]>([]);
  const [newLocalLabelName, setNewLocalLabelName] = useState('');

  // ── Labels data ──────────────────────────────────────────────────────────
  const [localLabels, setLocalLabels] = useState<LocalLabelItem[]>([]);
  const zaloLabels: LabelData[] = allLabelsMap[accountId] || [];
  const accounts = useAccountStore(s => s.accounts);
  const [showLabelPickerModal, setShowLabelPickerModal] = useState(false);

  // ── Processing state ─────────────────────────────────────────────────
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ current: number; total: number } | null>(null);

  // ── Load local labels ───────────────────────────────────────────────
  const fetchLocalLabels = useCallback(() => {
    if (!accountId) return;
    ipc.db?.getLocalLabels({ zaloId: accountId }).then(res => {
      if (res?.labels) {
        setLocalLabels(res.labels);
      }
    }).catch(() => {});
  }, [accountId]);

  useEffect(() => {
    fetchLocalLabels();
  }, [fetchLocalLabels]);

  const unifiedLabelOptions: LoadedLabelOption[] = useMemo(() => {
    const localOpts: LoadedLabelOption[] = localLabels.map((l: any) => ({
      value: `local:${l.id}`,
      label: `${l.emoji || '🏷️'} ${l.name} (Local)`,
      source: 'local',
      color: l.color || '#14b8a6',
      textColor: l.text_color || l.textColor || '#ffffff',
      emoji: l.emoji || '🏷️',
      name: l.name,
      pageIds: l.pageIds || (l.page_ids ? (typeof l.page_ids === 'string' ? l.page_ids.split(',') : l.page_ids) : []),
    }));

    const zaloOpts: LoadedLabelOption[] = zaloLabels.map(l => ({
      value: `zalo:${(l as any).zalo_id || (l as any).pageId || accountId || ''}:${l.id}`,
      label: `${l.emoji || '🏷️'} ${l.text} (Zalo)`,
      source: 'zalo',
      color: l.color || '#3b82f6',
      textColor: '#ffffff',
      emoji: l.emoji || '🏷️',
      name: l.text,
      pageId: (l as any).zalo_id || (l as any).pageId || accountId || '',
    }));

    return [...localOpts, ...zaloOpts];
  }, [localLabels, zaloLabels, accountId]);

  const selectedUnifiedValues = useMemo(() => {
    const localValues = selectedLocalLabelIds.map(id => `local:${id}`);
    const zaloValues = selectedZaloLabelIds.map(id => {
      const opt = unifiedLabelOptions.find(o => o.source === 'zalo' && o.value.endsWith(`:${id}`));
      return opt ? opt.value : `zalo:${accountId}:${id}`;
    });
    return [...localValues, ...zaloValues];
  }, [selectedLocalLabelIds, selectedZaloLabelIds, unifiedLabelOptions, accountId]);

  const handleUnifiedChange = (newValues: string[]) => {
    const newLocalIds: number[] = [];
    const newZaloIds: number[] = [];

    for (const val of newValues) {
      if (val.startsWith('local:')) {
        const id = Number(val.split(':')[1]);
        if (!isNaN(id)) newLocalIds.push(id);
      } else if (val.startsWith('zalo:')) {
        const parts = val.split(':');
        const id = Number(parts[parts.length - 1]);
        if (!isNaN(id)) newZaloIds.push(id);
      }
    }
    setSelectedLocalLabelIds(newLocalIds);
    setSelectedZaloLabelIds(newZaloIds);
  };

  // ── Contact list to process ──────────────────────────────────────────────
  const finalContacts = inputMode === 'list' ? (contacts || []) : resolvedContacts;

  // ── Parse phone numbers ──────────────────────────────────────────────────
  const parsePhones = useCallback((): string[] => {
    const unique = new Set<string>();
    phoneInput
      .split(/[\n,;]+/)
      .forEach(s => {
        const norm = normalizePhone(s);
        if (norm && isValidVietnamPhone(norm)) {
          unique.add(norm);
        }
      });
    return Array.from(unique);
  }, [phoneInput]);

  // ── Resolve phone numbers → user info via Zalo API (Batch mode) ──────────
  // Dùng getMultiUsersByPhones (batch API như PhoneScan) thay vì vòng lặp findUser.
  // Batch API tìm thấy nhiều user hơn vì xử lý như "tra cứu từ danh bạ".
  const handleResolvePhones = useCallback(async () => {
    const phones = parsePhones();
    if (phones.length === 0) {
      showNotification('Không tìm thấy SĐT hợp lệ nào', 'info');
      return;
    }
    const acc = getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    setResolving(true);
    setResolveProgress({ current: 0, total: phones.length });
    stopRef.current = false;

    // ── Bước 1: Batch lookup (getMultiUsersByPhones) ────────────────────────
    // API trả về key = 84xxxxxxxxx, cần normalize về 0xxxxxxxxx
    const BATCH_SIZE = 100;
    const zaloMap: Record<string, any> = {}; // phone (0xxx) → user object

    for (let b = 0; b < phones.length; b += BATCH_SIZE) {
      if (stopRef.current) break;
      const batch = phones.slice(b, b + BATCH_SIZE);
      try {
        const res = await ipc.zalo?.getMultiUsersByPhones({ auth, phones: batch });
        if (res?.success && res?.response) {
          for (const [phoneKey, user] of Object.entries(res.response as Record<string, any>)) {
            // Zalo trả key dạng "84933640999" → normalize về "0933640999"
            const normalized = phoneKey.startsWith('84') ? '0' + phoneKey.slice(2) : phoneKey;
            const matched = batch.find(p => p === normalized || p === phoneKey);
            if (matched) zaloMap[matched] = user;
          }
        }
      } catch {
        // Batch thất bại → fallback findUser từng số trong batch
        for (const phone of batch) {
          if (stopRef.current) break;
          try {
            const res = await ipc.zalo?.findUser({ auth, phone });
            if (res?.response?.uid) zaloMap[phone] = res.response;
          } catch {}
          await new Promise(r => setTimeout(r, 300));
        }
      }
      setResolveProgress({ current: Math.min(b + BATCH_SIZE, phones.length), total: phones.length });
    }

    // ── Bước 2: Enrich từng user đã tìm được với getUserInfo ─────────────────
    const foundPhones = phones.filter(p => zaloMap[p]?.uid);
    const results: ContactToAdd[] = [];

    setResolveProgress({ current: 0, total: foundPhones.length });
    for (let i = 0; i < foundPhones.length; i++) {
      if (stopRef.current) break;
      setResolveProgress({ current: i + 1, total: foundPhones.length });
      const phone = foundPhones[i];
      const user = zaloMap[phone];
      try {
        const infoRes = await ipc.zalo?.getUserInfo({ auth, userId: user.uid });
        const profile = infoRes?.response?.changed_profiles?.[user.uid];
        const extracted = profile ? extractUserProfile(profile) : null;
        results.push({
          contactId: user.uid,
          displayName: extracted?.displayName || profile?.displayName || user.display_name || user.zalo_name || user.uid,
          avatar: extracted?.avatar || profile?.avatar || user.avatar || '',
          phone,
        });
        // Pre-save gender/birthday
        if (extracted && (extracted.gender !== null || extracted.birthday)) {
          ipc.db?.updateContactProfile({
            zaloId: accountId,
            contactId: user.uid,
            displayName: extracted.displayName,
            avatarUrl: extracted.avatar,
            phone,
            gender: extracted.gender,
            birthday: extracted.birthday,
          }).catch(() => {});
        }
      } catch {
        // getUserInfo thất bại → dùng thông tin cơ bản từ batch
        results.push({
          contactId: user.uid,
          displayName: user.display_name || user.zalo_name || user.uid,
          avatar: user.avatar || '',
          phone,
        });
      }
      if (i < foundPhones.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    setResolvedContacts(results);
    setResolving(false);
    setResolveProgress(null);
    if (results.length === 0) {
      showNotification('Không tìm thấy người dùng Zalo nào từ danh sách SĐT', 'info');
    }
  }, [parsePhones, getActiveAccount, showNotification, accountId]);

  // ── Remove a resolved contact ────────────────────────────────────────────
  const removeResolved = (contactId: string) => {
    setResolvedContacts(prev => prev.filter(c => c.contactId !== contactId));
  };

  // ── Add contacts to DB + assign tags ─────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (finalContacts.length === 0 || !accountId) return;
    setProcessing(true);
    setProcessProgress({ current: 0, total: finalContacts.length });

    try {
      // 1. Save contacts to DB (updateContactProfile upserts)
      for (let i = 0; i < finalContacts.length; i++) {
        setProcessProgress({ current: i + 1, total: finalContacts.length });
        const c = finalContacts[i];
        await ipc.db?.updateContactProfile({
          zaloId: accountId,
          contactId: c.contactId,
          displayName: c.displayName || c.contactId,
          avatarUrl: c.avatar || '',
          phone: c.phone || '',
          contactType: 'user',
        });
      }

      // 2. Assign local labels if selected
      if (selectedLocalLabelIds.length > 0) {
        for (const labelId of selectedLocalLabelIds) {
          for (const c of finalContacts) {
            await ipc.db?.assignLocalLabelToThread({ zaloId: accountId, labelId, threadId: c.contactId });
          }
        }
        window.dispatchEvent(new CustomEvent('local-labels-changed', { detail: { zaloId: accountId } }));
      }

      // 3. Assign Zalo labels if selected
      if (selectedZaloLabelIds.length > 0) {
        try {
          const acc = getActiveAccount();
          if (acc) {
            const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
            const freshRes = await ipc.zalo?.getLabels({ auth });
            const freshLabels: LabelData[] = freshRes?.response?.labelData || zaloLabels;
            const version: number = freshRes?.response?.version || 0;

            const contactIds = finalContacts.map(c => c.contactId);
            const updated = freshLabels.map(label => {
              if (!selectedZaloLabelIds.includes(label.id)) return label;
              const existing = new Set(label.conversations || []);
              contactIds.forEach(id => existing.add(id));
              return { ...label, conversations: [...existing] };
            });

            const res = await ipc.zalo?.updateLabels({ auth, labelData: updated, version });
            if (res?.success) {
              const { setLabels } = useAppStore.getState();
              const finalLabels: LabelData[] = res.response?.labelData || updated;
              setLabels(accountId, finalLabels);
            }
          }
        } catch (err: any) {
          showNotification('Cảnh báo: Gán nhãn Zalo thất bại — ' + (err?.message || ''), 'error');
        }
      }

      showNotification(`Đã thêm ${finalContacts.length} liên hệ vào CRM`, 'success');
      onDone?.(finalContacts.length);
      onClose();
    } catch (err: any) {
      showNotification('Lỗi: ' + (err?.message || 'Không rõ'), 'error');
    } finally {
      setProcessing(false);
      setProcessProgress(null);
    }
  }, [finalContacts, accountId, selectedLocalLabelIds, selectedZaloLabelIds, zaloLabels, getActiveAccount, showNotification, onClose, onDone]);

  const phoneCount = parsePhones().length;
  const isLabelSelected = selectedLocalLabelIds.length > 0 || selectedZaloLabelIds.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-[520px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Thêm vào Liên hệ CRM</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {inputMode === 'list'
                  ? `${finalContacts.length} liên hệ đã chọn`
                  : 'Nhập danh sách SĐT để tra cứu & thêm vào liên hệ'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-655 transition-colors p-1 cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-white">

          {/* ── Phone input mode ───────────────────────────────────────────── */}
          {inputMode === 'phones' && resolvedContacts.length === 0 && (
            <div>
              <label className="text-xs text-gray-700 font-semibold mb-1.5 block">
                Nhập danh sách SĐT <span className="text-gray-450 font-normal">(mỗi dòng 1 số, hoặc cách nhau bởi dấu phẩy)</span>
              </label>
              <textarea
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder={"0901234567\n0912345678\n+84987654321"}
                rows={6}
                disabled={resolving}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 disabled:opacity-60 resize-none font-mono transition-colors"
              />
              {phoneInput.trim() && (
                <p className="text-xs text-gray-500 mt-1.5 font-medium">
                  Phát hiện <span className="text-green-600 font-semibold">{phoneCount}</span> SĐT hợp lệ
                </p>
              )}

              {/* Resolve progress */}
              {resolveProgress && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      {SpinIcon}
                      <span>Đang tra cứu: <span className="text-gray-900 font-semibold">{resolveProgress.current}</span>/{resolveProgress.total}</span>
                    </span>
                    <span className="text-green-650 font-semibold">
                      {Math.round((resolveProgress.current / resolveProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all duration-205"
                      style={{ width: `${(resolveProgress.current / resolveProgress.total) * 100}%` }} />
                  </div>
                  <button onClick={() => { stopRef.current = true; }}
                    className="mt-2 text-xs text-red-500 hover:text-red-700 transition-colors font-semibold cursor-pointer">
                    Dừng tra cứu
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Resolved contacts preview ──────────────────────────────────── */}
          {inputMode === 'phones' && resolvedContacts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  Tìm thấy <span className="text-green-600 font-semibold">{resolvedContacts.length}</span> người dùng
                </span>
                <button
                  onClick={() => { setResolvedContacts([]); }}
                  className="text-xs text-blue-600 hover:text-blue-750 transition-colors font-semibold cursor-pointer">
                  ← Nhập lại
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                {resolvedContacts.map(c => (
                  <div key={c.contactId} className="flex items-center gap-2.5 px-3 py-2">
                    {c.avatar
                      ? <img src={c.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{(c.displayName || '?').charAt(0).toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium truncate">{c.displayName}</p>
                      {c.phone && <p className="text-[11px] text-gray-450 font-mono">{c.phone}</p>}
                    </div>
                    <button onClick={() => removeResolved(c.contactId)}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 p-0.5 cursor-pointer">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── List mode: preview contacts ────────────────────────────────── */}
          {inputMode === 'list' && finalContacts.length > 0 && (
            <div>
              <span className="text-xs text-gray-700 font-semibold mb-1.5 block">Danh sách liên hệ</span>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                {finalContacts.slice(0, 50).map(c => (
                  <div key={c.contactId} className="flex items-center gap-2.5 px-3 py-2">
                    {c.avatar
                      ? <img src={c.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{(c.displayName || '?').charAt(0).toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium truncate">{c.displayName}</p>
                      {c.phone && <p className="text-[11px] text-gray-450 font-mono">{c.phone}</p>}
                    </div>
                  </div>
                ))}
                {finalContacts.length > 50 && (
                  <p className="text-xs text-gray-400 px-3 py-2 text-center italic bg-gray-50">
                    ... và {finalContacts.length - 50} liên hệ khác
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Tag assignment section (Unified Label Picker) ───────────────── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <p className="text-xs text-gray-700 font-semibold">Gắn nhãn chiến dịch / phân loại <span className="text-red-500">* Bắt buộc</span></p>
              {!isLabelSelected ? (
                <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100">Cần chọn nhãn</span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setSelectedLocalLabelIds([]); setSelectedZaloLabelIds([]); }}
                  className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                >
                  Bỏ chọn tất cả
                </button>
              )}
            </div>

            <div className="p-4 space-y-3 bg-white">
              {/* Selected badges display */}
              {isLabelSelected ? (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                  {selectedLocalLabelIds.map(id => {
                    const label = localLabels.find(l => l.id === id);
                    if (!label) return null;
                    return (
                      <span
                        key={`local-${id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs text-white"
                        style={{ backgroundColor: label.color || '#14b8a6' }}
                      >
                        <span>{label.emoji || '🏷️'}</span>
                        <span>{label.name} (Local)</span>
                        <button
                          type="button"
                          onClick={() => setSelectedLocalLabelIds(prev => prev.filter(x => x !== id))}
                          className="ml-0.5 hover:bg-black/20 rounded-full w-4 h-4 flex items-center justify-center"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                  {selectedZaloLabelIds.map(id => {
                    const label = zaloLabels.find(l => l.id === id);
                    if (!label) return null;
                    return (
                      <span
                        key={`zalo-${id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs bg-blue-600 text-white"
                      >
                        <span>{label.emoji || '🏷️'}</span>
                        <span>{label.text} (Zalo)</span>
                        <button
                          type="button"
                          onClick={() => setSelectedZaloLabelIds(prev => prev.filter(x => x !== id))}
                          className="ml-0.5 hover:bg-black/20 rounded-full w-4 h-4 flex items-center justify-center"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  Chưa chọn nhãn nào. Nhấn nút bên dưới để mở cửa sổ chọn Nhãn Local hoặc Nhãn Zalo tự động gán.
                </p>
              )}

              {/* Trigger Button opening UnifiedLabelPickerModal */}
              <button
                type="button"
                onClick={() => setShowLabelPickerModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-bold transition-all border border-blue-200 cursor-pointer shadow-2xs"
              >
                <span>🏷️</span>
                <span>{isLabelSelected ? 'Thay đổi / Thêm nhãn mới' : 'Chọn nhãn tự động gán'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-150 flex gap-2 flex-shrink-0 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-2.5 rounded-xl bg-gray-205 text-gray-700 text-sm font-semibold hover:bg-gray-300 disabled:opacity-40 transition-colors cursor-pointer">
            Hủy
          </button>

          {/* Phone mode: "Tra cứu" button */}
          {inputMode === 'phones' && resolvedContacts.length === 0 && (
            <button
              type="button"
              onClick={handleResolvePhones}
              disabled={resolving || phoneCount === 0}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-750 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
              {resolving ? <>{SpinIcon} Đang tra cứu...</> : `🔍 Tra cứu ${phoneCount > 0 ? phoneCount + ' SĐT' : ''}`}
            </button>
          )}

          {/* Submit button */}
          {(inputMode === 'list' || resolvedContacts.length > 0) && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={processing || finalContacts.length === 0 || !isLabelSelected}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-750 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
              {processing
                ? <>{SpinIcon} Đang xử lý...</>
                : <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
                      <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    Thêm {finalContacts.length} liên hệ
                  </>
              }
            </button>
          )}
        </div>
      </div>

      {showLabelPickerModal && (
        <UnifiedLabelPickerModal
          open={showLabelPickerModal}
          onClose={() => setShowLabelPickerModal(false)}
          options={unifiedLabelOptions}
          selected={selectedUnifiedValues}
          onChange={handleUnifiedChange}
          onConfirm={(values) => {
            handleUnifiedChange(values);
            setShowLabelPickerModal(false);
          }}
          accounts={accounts}
          onNewLabelCreated={fetchLocalLabels}
        />
      )}
    </div>
  );
}
