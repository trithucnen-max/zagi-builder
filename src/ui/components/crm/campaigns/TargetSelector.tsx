import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import type { LabelData } from '@/store/appStore';
import ipc from '@/lib/ipc';
import ZaloLabelBadge from '../tags/ZaloLabelBadge';
import GroupAvatar from '@/components/common/GroupAvatar';
import { formatPhone, normalizePhone } from '@/utils/phoneUtils';
import AppIcon from '@/components/common/AppIcon';
import UnifiedLabelPickerModal, { LoadedLabelOption } from '../modals/UnifiedLabelPickerModal';
import { useAccountStore } from '@/store/accountStore';
import { useChatStore } from '@/store/chatStore';

export interface LocalLabelItem {
  id: number;
  name: string;
  color: string;
  text_color?: string;
  emoji?: string;
}

interface TargetSelectorProps {
  zaloId: string;
  allLabels: LabelData[];
  localLabels?: LocalLabelItem[];
  localLabelThreadMap?: Record<string, number[]>;
  existingContactIds: Set<string>;
  onConfirm: (contacts: any[]) => void;
  onClose: () => void;
  headerContent?: React.ReactNode;
}

type SelectMode = 'by_label' | 'by_phone' | 'by_uid' | 'manual' | 'friends_only' | 'groups_only';

export default function TargetSelector({
  zaloId,
  allLabels,
  localLabels,
  localLabelThreadMap,
  existingContactIds,
  onConfirm,
  onClose,
  headerContent,
}: TargetSelectorProps) {
  const [mode, setMode] = useState<SelectMode>('by_label');
  const groupInfoCache = useAppStore(s => s.groupInfoCache);
  const showNotification = useAppStore(s => s.showNotification);
  const [selectedZaloLabelIds, setSelectedZaloLabelIds] = useState<number[]>([]);
  const [selectedLocalLabelIds, setSelectedLocalLabelIds] = useState<number[]>([]);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTip, setShowTip] = useState(true);

  // ── Group Selection State (Mode: Theo nhóm) ──
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupMembersMap, setGroupMembersMap] = useState<Record<string, any[]>>({});
  const [exGroupSearch, setExGroupSearch] = useState('');
  const [exContactSearch, setExContactSearch] = useState('');

  // ── Exclusion Filter State ──
  const [showExclusionSection, setShowExclusionSection] = useState(false);
  const [exclusionTab, setExclusionTab] = useState<'label' | 'group' | 'contact'>('label');
  const [excludedZaloLabelIds, setExcludedZaloLabelIds] = useState<number[]>([]);
  const [excludedLocalLabelIds, setExcludedLocalLabelIds] = useState<number[]>([]);
  const [excludedGroupIds, setExcludedGroupIds] = useState<Set<string>>(new Set());
  const [excludedContactIds, setExcludedContactIds] = useState<Set<string>>(new Set());

  const toggleExcludeContact = (cId: string) => {
    setExcludedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(cId)) next.delete(cId); else next.add(cId);
      return next;
    });
  };

  const toggleExcludeGroup = (gId: string) => {
    setExcludedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(gId)) next.delete(gId); else next.add(gId);
      return next;
    });
  };

  const toggleSelectGroup = (gId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(gId)) next.delete(gId); else next.add(gId);
      return next;
    });
  };

  // Auto-fetch group members for selected and excluded groups from DB
  useEffect(() => {
    if (!zaloId) return;
    const targetGroupIds = new Set([
      ...Array.from(selectedGroupIds),
      ...Array.from(excludedGroupIds),
    ]);
    if (targetGroupIds.size === 0) return;

    targetGroupIds.forEach(gId => {
      if (!groupMembersMap[gId]) {
        ipc.db?.getGroupMembers({ zaloId, groupId: gId }).then(res => {
          if (res?.members) {
            setGroupMembersMap(prev => ({ ...prev, [gId]: res.members }));
          }
        }).catch(() => {});
      }
    });
  }, [selectedGroupIds, excludedGroupIds, zaloId]);

  // ── Phone tab state ──
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneList, setPhoneList] = useState<string[]>([]);
  const [phoneResolved, setPhoneResolved] = useState<Map<string, { uid: string; name: string; avatar?: string } | null>>(new Map());

  // ── UID tab state ──
  const [uidInput, setUidInput] = useState('');
  const [uidList, setUidList] = useState<string[]>([]);
  const [uidResolved, setUidResolved] = useState<Map<string, { name: string; avatar?: string } | null>>(new Map());

  // Label section scroll ref
  const labelScrollRef = useRef<HTMLDivElement>(null);
  const [labelTab, setLabelTab] = useState<'local' | 'zalo'>('local');

  // ── Load local labels directly ──
  const [fetchedLocalLabels, setFetchedLocalLabels] = useState<LocalLabelItem[]>([]);
  const [fetchedThreadMap, setFetchedThreadMap] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!zaloId) return;
    Promise.all([
      ipc.db?.getLocalLabels({ zaloId }),
      ipc.db?.getLocalLabelThreads({ zaloId }),
    ]).then(([labelsRes, threadsRes]) => {
      const labels = (labelsRes?.labels || []).filter((l: any) => (l.is_active ?? 1) !== 0);
      setFetchedLocalLabels(labels);
      const map: Record<string, number[]> = {};
      (threadsRes?.threads || []).forEach((row: any) => {
        if (!map[row.thread_id]) map[row.thread_id] = [];
        map[row.thread_id].push(Number(row.label_id));
      });
      setFetchedThreadMap(map);
    }).catch(() => {});
  }, [zaloId]);

  const effectiveLocalLabels = useMemo(() => {
    const fromProp = (localLabels || []).filter((l: any) => (l.is_active ?? 1) !== 0);
    if (fromProp.length > 0) return fromProp;
    return fetchedLocalLabels;
  }, [localLabels, fetchedLocalLabels]);

  const effectiveThreadMap = useMemo(() => {
    const propMap = localLabelThreadMap || {};
    const merged: Record<string, number[]> = { ...fetchedThreadMap };
    Object.entries(propMap).forEach(([k, v]) => {
      if (!v || !Array.isArray(v)) return;
      if (!merged[k]) {
        merged[k] = [...v];
      } else {
        merged[k] = Array.from(new Set([...merged[k], ...v]));
      }
      const clean = k.startsWith('g') ? k.slice(1) : k;
      if (!merged[clean]) {
        merged[clean] = [...v];
      } else {
        merged[clean] = Array.from(new Set([...merged[clean], ...v]));
      }
    });
    return merged;
  }, [localLabelThreadMap, fetchedThreadMap]);

  const accounts = useAccountStore(s => s.accounts);
  const [showLabelPickerModal, setShowLabelPickerModal] = useState(false);

  const unifiedLabelOptions: LoadedLabelOption[] = useMemo(() => {
    const localOpts: LoadedLabelOption[] = (effectiveLocalLabels || []).map((l: any) => ({
      value: `local:${l.id}`,
      name: l.name,
      label: `${l.emoji || '🏷️'} ${l.name} (Local)`,
      source: 'local',
      id: l.id,
      color: l.color,
      emoji: l.emoji,
      accountZaloId: zaloId,
      accountName: accounts.find(a => a.zalo_id === zaloId)?.full_name || zaloId,
    }));
    const zaloOpts: LoadedLabelOption[] = (allLabels || []).map((l: any) => ({
      value: `zalo:${l.id}`,
      name: l.text || l.name,
      label: `🏷️ ${l.text || l.name} (Zalo)`,
      source: 'zalo',
      id: l.id,
      color: l.color,
      accountZaloId: zaloId,
      accountName: accounts.find(a => a.zalo_id === zaloId)?.full_name || zaloId,
    }));
    return [...localOpts, ...zaloOpts];
  }, [effectiveLocalLabels, allLabels, zaloId, accounts]);

  const [allGroups, setAllGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!zaloId) return;
    setLoading(true);
    let isMounted = true;

    ipc.crm?.getContacts({ zaloId, opts: { limit: 5000 } }).then(res => {
      if (isMounted && res?.contacts) setAllContacts(res.contacts);
    }).finally(() => {
      if (isMounted) setLoading(false);
    });

    const loadGroups = async () => {
      const groupMap = new Map<string, any>();

      // 1. From useChatStore
      try {
        const storeContacts = useChatStore.getState().contacts[zaloId] || [];
        storeContacts.forEach((c: any) => {
          if (c.contact_type === 'group' || c.is_group === 1) {
            groupMap.set(c.contact_id, {
              contact_id: c.contact_id,
              display_name: c.display_name || c.alias || c.zalo_name || `Nhóm ${c.contact_id}`,
              avatar: c.avatar_url || c.avatar,
              contact_type: 'group',
              member_count: c.member_count || c.total_members || 0,
            });
          }
        });
      } catch {}

      // 2. From DB contacts (groups in contacts table)
      try {
        const cRes = await ipc.crm?.getContacts({ zaloId, opts: { contactType: 'group', limit: 2000 } });
        const gContacts = cRes?.contacts || [];
        gContacts.forEach((c: any) => {
          if (c.contact_id && !groupMap.has(c.contact_id)) {
            groupMap.set(c.contact_id, {
              contact_id: c.contact_id,
              display_name: c.display_name || c.alias || `Nhóm ${c.contact_id}`,
              avatar: c.avatar || c.avatar_url || '',
              contact_type: 'group',
              member_count: c.member_count || 0,
            });
          }
        });
      } catch {}

      // 3. From DB conversations
      try {
        const convRes = await ipc.db?.getConversations({ zaloId });
        const convs = convRes?.conversations || [];
        convs.forEach((c: any) => {
          if (c.contact_type === 'group' || c.is_group === 1 || String(c.thread_type || c.type) === '1') {
            const gId = c.contact_id || c.thread_id;
            if (gId && !groupMap.has(gId)) {
              groupMap.set(gId, {
                contact_id: gId,
                display_name: c.display_name || c.alias || c.name || `Nhóm ${gId}`,
                avatar: c.avatar_url || c.avatar,
                contact_type: 'group',
                member_count: c.member_count || c.total_members || 0,
              });
            }
          }
        });
      } catch {}

      // 4. From Zalo API
      const acc = accounts.find(a => a.zalo_id === zaloId);
      if (acc) {
        try {
          const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
          const groupsRes = await ipc.zalo?.getGroups(auth);
          if (groupsRes?.response?.gridInfoMap) {
            Object.entries(groupsRes.response.gridInfoMap).forEach(([gId, gInfo]: [string, any]) => {
              const existing = groupMap.get(gId);
              groupMap.set(gId, {
                contact_id: gId,
                display_name: gInfo?.name || existing?.display_name || `Nhóm ${gId}`,
                avatar: gInfo?.avatar || gInfo?.avt || existing?.avatar,
                contact_type: 'group',
                member_count: gInfo?.memberCount || gInfo?.totalMember || existing?.member_count || 0,
              });
            });
          }
        } catch {}
      }

      if (isMounted) {
        setAllGroups(Array.from(groupMap.values()));
      }
    };

    loadGroups();

    return () => { isMounted = false; };
  }, [zaloId, accounts]);

  // Handle phone textarea input
  useEffect(() => {
    const lines = phoneInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const valid: string[] = [];
    const seen = new Set<string>();
    for (const l of lines) {
      const norm = normalizePhone(l);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        valid.push(norm);
      }
    }
    setPhoneList(valid);
  }, [phoneInput]);

  useEffect(() => {
    if (phoneList.length === 0 || !zaloId) return;
    const unresolved = phoneList.filter(p => !phoneResolved.has(p));
    if (unresolved.length === 0) return;

    let cancelled = false;
    (async () => {
      const batch = unresolved.slice(0, 20);
      const newMap = new Map(phoneResolved);
      for (const phone of batch) {
        if (cancelled) break;
        try {
          const res = await ipc.crm?.getContacts({ zaloId, opts: { search: phone, limit: 1 } });
          const matched = res?.contacts?.[0];
          if (matched && (matched.phone === phone || normalizePhone(matched.phone || '') === phone)) {
            newMap.set(phone, {
              uid: matched.contact_id,
              name: matched.alias || matched.display_name || phone,
              avatar: matched.avatar,
            });
          } else {
            newMap.set(phone, null);
          }
        } catch {
          newMap.set(phone, null);
        }
      }
      if (!cancelled) setPhoneResolved(newMap);
    })();

    return () => { cancelled = true; };
  }, [phoneList, zaloId]);

  // Handle UID textarea input
  useEffect(() => {
    const lines = uidInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const valid: string[] = [];
    const seen = new Set<string>();
    for (const l of lines) {
      if (/^\d{5,}$/.test(l) && !seen.has(l)) {
        seen.add(l);
        valid.push(l);
      }
    }
    setUidList(valid);
  }, [uidInput]);

  const toggleZaloLabel = (labelId: number) => {
    setSelectedZaloLabelIds(prev =>
      prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
    );
  };

  const toggleLocalLabel = (labelId: number) => {
    setSelectedLocalLabelIds(prev =>
      prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
    );
  };

  const totalLabelFilters = selectedZaloLabelIds.length + selectedLocalLabelIds.length;

  const allExcludedIds = useMemo(() => {
    const set = new Set<string>(excludedContactIds);
    if (excludedZaloLabelIds.length > 0 || excludedLocalLabelIds.length > 0) {
      allContacts.forEach(c => {
        const cId = c.contact_id;
        const isGroup = c.contact_type === 'group';
        const prefId = isGroup ? `g${cId}` : cId;
        const matchesZalo = excludedZaloLabelIds.some(lId => {
          const lObj = allLabels.find(l => l.id === lId);
          return lObj?.conversations?.includes(cId) || (isGroup && lObj?.conversations?.includes(prefId));
        });
        const threadLabels = effectiveThreadMap[cId] || effectiveThreadMap[prefId] || [];
        const matchesLocal = excludedLocalLabelIds.some(lId => threadLabels.includes(lId));
        if (matchesZalo || matchesLocal) set.add(cId);
      });
    }
    if (excludedGroupIds.size > 0) {
      excludedGroupIds.forEach(gId => {
        set.add(gId);
        const dbMembers = groupMembersMap[gId] || [];
        dbMembers.forEach((m: any) => {
          if (m.member_id) set.add(m.member_id);
        });
        const cache = groupInfoCache?.[zaloId]?.[gId];
        if (cache?.members) {
          cache.members.forEach((m: any) => {
            if (m.userId) set.add(m.userId);
            if (m.member_id) set.add(m.member_id);
          });
        }
      });
    }
    return set;
  }, [excludedContactIds, excludedZaloLabelIds, excludedLocalLabelIds, excludedGroupIds, groupMembersMap, allContacts, allLabels, effectiveThreadMap, groupInfoCache, zaloId]);

  // Extract unique members from selected groups in 'groups_only' mode with deduplication
  const extractedUniqueMembers = useMemo(() => {
    if (mode !== 'groups_only' || selectedGroupIds.size === 0) return [];
    const memberMap = new Map<string, any>();
    selectedGroupIds.forEach(gId => {
      const dbMembers = groupMembersMap[gId] || [];
      dbMembers.forEach((m: any) => {
        const mId = String(m.member_id || m.userId);
        if (mId && !memberMap.has(mId)) {
          const existing = allContacts.find(c => c.contact_id === mId);
          memberMap.set(mId, existing || {
            contact_id: mId,
            display_name: m.display_name || m.name || mId,
            alias: m.display_name || m.name || mId,
            avatar: m.avatar || '',
            contact_type: 'friend',
            is_friend: 1,
          });
        }
      });
    });
    return Array.from(memberMap.values()).filter(c => !existingContactIds.has(c.contact_id) && !allExcludedIds.has(c.contact_id));
  }, [mode, selectedGroupIds, groupMembersMap, allContacts, existingContactIds, allExcludedIds]);

  const filtered = useMemo(() => {
    let list = allContacts;
    if (mode === 'friends_only') {
      list = list.filter(c => c.is_friend === 1 && c.contact_type !== 'group');
    } else if (mode === 'groups_only') {
      list = list.filter(c => c.contact_type === 'group');
    } else if (mode === 'by_label') {
      if (totalLabelFilters === 0) return [];

      // Build expanded set of local label IDs that share the same name(s) as selectedLocalLabelIds
      const selectedNames = (effectiveLocalLabels || [])
        .filter(l => selectedLocalLabelIds.includes(l.id))
        .map(l => (l.name || '').trim().toLowerCase())
        .filter(Boolean);

      const expandedLocalLabelIds = new Set<number>([
        ...selectedLocalLabelIds,
        ...(effectiveLocalLabels || [])
          .filter(l => selectedNames.includes((l.name || '').trim().toLowerCase()))
          .map(l => l.id)
      ]);

      list = list.filter(c => {
        const cId = c.contact_id || c.user_id;
        if (!cId) return false;
        const isGroup = c.contact_type === 'group';
        const prefId = isGroup ? (cId.startsWith('g') ? cId : `g${cId}`) : cId;
        const cleanId = cId.startsWith('g') ? cId.slice(1) : cId;

        const matchesZalo = selectedZaloLabelIds.some(lId => {
          const lObj = allLabels.find(l => l.id === lId);
          return lObj?.conversations?.includes(cId) || (isGroup && (lObj?.conversations?.includes(prefId) || lObj?.conversations?.includes(cleanId)));
        });

        // Collect all label IDs assigned to this contact/thread across any ID variation
        const threadLabelIds = new Set<number>([
          ...(effectiveThreadMap[cId] || []),
          ...(effectiveThreadMap[prefId] || []),
          ...(effectiveThreadMap[cleanId] || []),
          ...(c.phone ? effectiveThreadMap[c.phone] || [] : []),
          ...(c.user_id ? effectiveThreadMap[c.user_id] || [] : []),
        ]);

        const matchesLocal = Array.from(expandedLocalLabelIds).some(lId => threadLabelIds.has(lId));
        return matchesZalo || matchesLocal;
      });
    }

    // Apply Exclusion Filter
    if (allExcludedIds.size > 0) {
      list = list.filter(c => !allExcludedIds.has(c.contact_id));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.display_name && c.display_name.toLowerCase().includes(q)) ||
        (c.alias && c.alias.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.contact_id && c.contact_id.includes(q))
      );
    }
    return list;
  }, [allContacts, mode, selectedZaloLabelIds, selectedLocalLabelIds, totalLabelFilters, allExcludedIds, search, allLabels, effectiveThreadMap]);

  const effectiveSelectedContacts = useMemo(() => {
    if (mode === 'groups_only') {
      return extractedUniqueMembers;
    }
    if (mode === 'by_label' || mode === 'friends_only') {
      return filtered.filter(c => !existingContactIds.has(c.contact_id));
    }
    return allContacts.filter(c => manualSelected.has(c.contact_id) && !existingContactIds.has(c.contact_id));
  }, [mode, extractedUniqueMembers, filtered, allContacts, manualSelected, existingContactIds]);

  const toggleManualSelect = (cId: string) => {
    setManualSelected(prev => {
      const next = new Set(prev);
      if (next.has(cId)) next.delete(cId); else next.add(cId);
      return next;
    });
  };

  const handleConfirmPhones = () => {
    if (phoneList.length === 0) return;
    const contacts = phoneList.map(phone => {
      const resolved = phoneResolved.get(phone);
      if (resolved?.uid) {
        const inCrm = allContacts.find(c => c.contact_id === resolved.uid);
        if (inCrm) return inCrm;
        return {
          contact_id: resolved.uid,
          display_name: resolved.name || phone,
          phone,
          avatar: resolved.avatar || '',
          contact_type: 'user',
          is_friend: 0,
        };
      }
      return {
        contact_id: `phone:${phone}`,
        display_name: phone,
        phone,
        avatar: '',
        contact_type: 'user',
        is_friend: 0,
      };
    });
    onConfirm(contacts);
  };

  const handleConfirmUIDs = () => {
    if (uidList.length === 0) return;
    const contacts = uidList.map(uid => {
      const inCrm = allContacts.find(c => c.contact_id === uid);
      if (inCrm) return inCrm;
      const res = uidResolved.get(uid);
      return {
        contact_id: uid,
        display_name: res?.name || uid,
        phone: '',
        avatar: res?.avatar || '',
        contact_type: 'user',
        is_friend: 0,
      };
    });
    onConfirm(contacts);
  };

  const handleConfirm = () => {
    if (mode === 'by_phone') { handleConfirmPhones(); return; }
    if (mode === 'by_uid') { handleConfirmUIDs(); return; }
    if (effectiveSelectedContacts.length === 0) {
      showNotification('Vui lòng chọn ít nhất 1 liên hệ', 'warning');
      return;
    }
    onConfirm(effectiveSelectedContacts);
  };

  const totalAvailable = allContacts.length;
  const selectedCount = mode === 'by_phone' ? phoneList.length : mode === 'by_uid' ? uidList.length : effectiveSelectedContacts.length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[70] p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-[680px] shadow-2xl flex flex-col overflow-hidden text-gray-900 dark:text-white max-h-[92vh] sm:max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Drag Indicator for Mobile */}
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-2.5 mb-1 sm:hidden" />

        {/* ── Stepper Indicator ── */}
        <div className="px-6 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800/80 flex items-center justify-center gap-3 text-xs font-semibold">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">✓</div>
            <span>Tạo chiến dịch</span>
          </div>
          <div className="w-12 h-0.5 bg-blue-500 rounded-full" />
          <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-bold">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">2</div>
            <span>Thêm liên hệ</span>
          </div>
        </div>

        {/* ── Header ── */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Chọn liên hệ</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-800 dark:text-gray-200">{selectedCount} đã chọn</span> · {totalAvailable} khả dụng
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Mode selector sub-tabs (Row 1 - Matching Mockup Image 3) ── */}
        <div className="px-4 py-2.5 bg-gray-50/60 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
          {[
            { id: 'by_label', label: 'Theo nhãn', icon: '🏷️' },
            { id: 'by_phone', label: 'Theo SĐT', icon: '📞' },
            { id: 'by_uid', label: 'Theo UID', icon: '🔗' },
            { id: 'manual', label: 'Theo Liên hệ', icon: '👤' },
            { id: 'groups_only', label: 'Theo nhóm', icon: '👨‍👩‍👧‍👦' },
          ].map(tab => {
            const isActive = mode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Exclusion Filter Section ── */}
        <div className="px-4 py-2 bg-red-50/40 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/40 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowExclusionSection(!showExclusionSection)}
              className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:opacity-80 transition-opacity"
            >
              <span>🚫</span>
              <span>Bộ lọc Loại Trừ (Nhãn, Nhóm, Liên hệ)</span>
              {allExcludedIds.size > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  Đang loại trừ {allExcludedIds.size} liên hệ
                </span>
              )}
              <span className="text-[10px] text-gray-400 ml-1">{showExclusionSection ? '▲' : '▼'}</span>
            </button>
          </div>

          {showExclusionSection && (
            <div className="mt-2 p-3 rounded-2xl bg-white dark:bg-gray-850 border border-red-200 dark:border-red-900/40 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                <div className="flex gap-1.5 overflow-x-auto">
                  {[
                    { id: 'label', label: 'Theo Nhãn', icon: '🏷️', count: excludedLocalLabelIds.length + excludedZaloLabelIds.length },
                    { id: 'group', label: 'Theo Nhóm Zalo', icon: '👨‍👩‍👧‍👦', count: excludedGroupIds.size },
                    { id: 'contact', label: 'Theo Liên hệ', icon: '👤', count: excludedContactIds.size },
                  ].map(tab => {
                    const isActive = exclusionTab === tab.id;
                    return (
                      <button
                        key={`ex-tab-${tab.id}`}
                        type="button"
                        onClick={() => setExclusionTab(tab.id as any)}
                        className={`text-[11px] px-3 py-1 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-red-600 text-white shadow-2xs'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                        {tab.count > 0 && (
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${isActive ? 'bg-white text-red-600' : 'bg-red-500 text-white'}`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1. Tab Loại trừ Theo Nhãn */}
              {exclusionTab === 'label' && (
                <div className="space-y-2.5">
                  {effectiveLocalLabels.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Nhãn Local:
                      </span>
                      <div className="flex gap-1.5 flex-wrap max-h-28 overflow-y-auto">
                        {effectiveLocalLabels.map(label => {
                          const isExcluded = excludedLocalLabelIds.includes(label.id);
                          return (
                            <button
                              key={`ex-local-${label.id}`}
                              type="button"
                              onClick={() => setExcludedLocalLabelIds(prev => prev.includes(label.id) ? prev.filter(id => id !== label.id) : [...prev, label.id])}
                              className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all flex items-center gap-1 ${
                                isExcluded ? 'bg-red-600 text-white border-red-600 shadow-2xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              {isExcluded && <span>🚫</span>}
                              <span>{label.emoji || '🏷️'} {label.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {allLabels.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Nhãn Zalo:
                      </span>
                      <div className="flex gap-1.5 flex-wrap max-h-28 overflow-y-auto">
                        {allLabels.map(label => {
                          const isExcluded = excludedZaloLabelIds.includes(label.id);
                          return (
                            <button
                              key={`ex-zalo-${label.id}`}
                              type="button"
                              onClick={() => setExcludedZaloLabelIds(prev => prev.includes(label.id) ? prev.filter(id => id !== label.id) : [...prev, label.id])}
                              className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all flex items-center gap-1 ${
                                isExcluded ? 'bg-red-600 text-white border-red-600 shadow-2xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              {isExcluded && <span>🚫</span>}
                              <span>🏷️ {label.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Tab Loại trừ Theo Nhóm Zalo */}
              {exclusionTab === 'group' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Chọn Nhóm Zalo cần loại trừ toàn bộ thành viên:
                    </span>
                    {(() => {
                      const filteredExGroups = allGroups.filter(g => (!exGroupSearch || (g.display_name || '').toLowerCase().includes(exGroupSearch.toLowerCase())));
                      const allSelected = filteredExGroups.length > 0 && filteredExGroups.every(g => excludedGroupIds.has(g.contact_id));
                      return (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (allSelected) {
                                setExcludedGroupIds(new Set());
                              } else {
                                setExcludedGroupIds(new Set(filteredExGroups.map(g => g.contact_id)));
                              }
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-2xs"
                          >
                            {allSelected ? '☒ Bỏ chọn tất cả' : `☑️ Chọn tất cả nhóm loại trừ (${filteredExGroups.length} nhóm)`}
                          </button>
                          {excludedGroupIds.size > 0 && (
                            <span className="text-[11px] text-red-500 font-bold">
                              🚫 Đã chọn {excludedGroupIds.size} nhóm
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <input
                    value={exGroupSearch}
                    onChange={e => setExGroupSearch(e.target.value)}
                    placeholder="🔍 Tìm tên nhóm Zalo..."
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                  />
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {(() => {
                      const groups = allGroups.filter(g => (!exGroupSearch || (g.display_name || '').toLowerCase().includes(exGroupSearch.toLowerCase())));
                      if (groups.length === 0) return <p className="text-xs text-gray-400 italic py-2 text-center">Không tìm thấy nhóm Zalo nào.</p>;
                      return groups.map(group => {
                        const isExcluded = excludedGroupIds.has(group.contact_id);
                        const dbMembers = groupMembersMap[group.contact_id] || [];
                        return (
                          <div
                            key={`ex-group-${group.contact_id}`}
                            onClick={() => toggleExcludeGroup(group.contact_id)}
                            className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              isExcluded
                                ? 'border-red-500 bg-red-50 dark:bg-red-950/30 ring-1 ring-red-500/30'
                                : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                                isExcluded ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {isExcluded && <span className="text-xs font-bold">✓</span>}
                              </div>
                              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                                {group.avatar ? <img src={group.avatar} alt="" className="w-full h-full object-cover" /> : '👨‍👩‍👧‍👦'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{group.display_name}</p>
                                {dbMembers.length > 0 && <p className="text-[10px] text-gray-400">{dbMembers.length} thành viên</p>}
                              </div>
                            </div>
                            <span className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold transition-all ${
                              isExcluded ? 'bg-red-600 text-white border-red-600 shadow-2xs' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-100 hover:text-red-600'
                            }`}>
                              {isExcluded ? '🚫 Đã loại trừ' : '+ Loại trừ'}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* 3. Tab Loại trừ Theo Liên Hệ Cụ Thể */}
              {exclusionTab === 'contact' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Chọn liên hệ cá nhân cần loại trừ khỏi chiến dịch:
                    </span>
                    {(() => {
                      const filteredExContacts = allContacts.filter(c => c.contact_type !== 'group' && (!exContactSearch || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(exContactSearch.toLowerCase())));
                      const allSelected = filteredExContacts.length > 0 && filteredExContacts.every(c => excludedContactIds.has(c.contact_id));
                      return (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (allSelected) {
                                setExcludedContactIds(new Set());
                              } else {
                                setExcludedContactIds(new Set(filteredExContacts.map(c => c.contact_id)));
                              }
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-2xs"
                          >
                            {allSelected ? '☒ Bỏ chọn tất cả' : `🚫 Chọn tất cả loại trừ (${filteredExContacts.length} liên hệ)`}
                          </button>
                          {excludedContactIds.size > 0 && (
                            <span className="text-[11px] text-red-500 font-bold">
                              Đã chọn {excludedContactIds.size} liên hệ
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {excludedContactIds.size > 0 && (
                    <div className="flex gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1.5 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/40">
                      {Array.from(excludedContactIds).map(cId => {
                        const contact = allContacts.find(c => c.contact_id === cId);
                        const name = contact?.alias || contact?.display_name || cId;
                        return (
                          <button
                            key={`ex-c-${cId}`}
                            type="button"
                            onClick={() => toggleExcludeContact(cId)}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-red-600 text-white font-semibold flex items-center gap-1.5 shadow-2xs hover:bg-red-700 transition-colors"
                          >
                            <span>🚫 {name}</span>
                            <span className="text-[10px] opacity-80">✕</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <input
                    value={exContactSearch}
                    onChange={e => setExContactSearch(e.target.value)}
                    placeholder="🔍 Tìm bạn bè, liên hệ theo tên, SĐT, UID..."
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                  />

                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {(() => {
                      const contacts = allContacts.filter(c => c.contact_type !== 'group' && (!exContactSearch || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(exContactSearch.toLowerCase())));
                      if (contacts.length === 0) return <p className="text-xs text-gray-400 italic py-2 text-center">Không tìm thấy liên hệ nào.</p>;
                      return contacts.slice(0, 100).map(c => {
                        const isExcluded = excludedContactIds.has(c.contact_id);
                        return (
                          <div
                            key={`ex-contact-${c.contact_id}`}
                            onClick={() => toggleExcludeContact(c.contact_id)}
                            className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              isExcluded
                                ? 'border-red-500 bg-red-50 dark:bg-red-950/30 ring-1 ring-red-500/30'
                                : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* Checkbox at the START (left-hand side) - Matching Request 4 */}
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                                isExcluded ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {isExcluded && <span className="text-xs font-bold">✓</span>}
                              </div>
                              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                                {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.alias || c.display_name || '?').slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{c.alias || c.display_name || c.contact_id}</p>
                                <p className="text-[10px] text-gray-400 truncate">{c.phone || c.contact_id}</p>
                              </div>
                            </div>
                            {isExcluded && (
                              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold shadow-2xs">
                                🚫 Đã loại trừ
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sub-tabs for Label Mode (Row 2 - Matching Mockup Image 3) ── */}
        {mode === 'by_label' && (
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap flex-shrink-0 bg-white dark:bg-gray-900">
            <div className="flex gap-2">
              <button
                onClick={() => setLabelTab('local')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  labelTab === 'local'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                📦 Nhãn Local ({effectiveLocalLabels.length})
              </button>
              <button
                onClick={() => setLabelTab('zalo')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  labelTab === 'zalo'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                🔄 Nhãn Zalo ({allLabels.length})
              </button>
            </div>
          </div>
        )}

        {/* ── Content Body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Tip Banner (Matching Mockup Image 3) */}
          {showTip && mode === 'by_label' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-3 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 font-semibold">
                <span className="text-base">🛡️</span>
                <span>Mẹo: Chọn ít nhất 1 nhãn để lọc liên hệ</span>
              </div>
              <button onClick={() => setShowTip(false)} className="text-blue-400 hover:text-blue-600 text-xs">✕</button>
            </div>
          )}

          {/* Search Bar */}
          {(mode === 'by_label' || mode === 'manual' || mode === 'friends_only' || mode === 'groups_only') && (
            <div className="relative">
              <svg width="14" height="14" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm tên, SĐT, UID..."
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full pl-9 pr-4 py-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>
          )}

          {/* Render By Label Mode */}
          {mode === 'by_label' && (
            <div>
              {/* Chips Selector */}
              {labelTab === 'local' ? (
                effectiveLocalLabels.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 flex-wrap">
                    {effectiveLocalLabels.map(label => {
                      const isActive = selectedLocalLabelIds.includes(label.id);
                      const baseColor = label.color && label.color.startsWith('#') ? label.color : `#${label.color || '3b82f6'}`;
                      return (
                        <button
                          key={`local-${label.id}`}
                          onClick={() => toggleLocalLabel(label.id)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all font-semibold flex items-center gap-1 ${
                            isActive ? 'text-white shadow-sm' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                          }`}
                          style={isActive
                            ? { backgroundColor: baseColor, borderColor: baseColor }
                            : { backgroundColor: baseColor + '10', borderColor: baseColor + '30', color: baseColor }}
                        >
                          {label.emoji && <span>{label.emoji}</span>}
                          <span>{label.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-500 flex items-center justify-center text-2xl mb-2">📁</div>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Chưa có Nhãn Local nào.</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Tạo nhãn từ trang Liên hệ.</p>
                  </div>
                )
              ) : (
                allLabels.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 flex-wrap">
                    {allLabels.map(label => {
                      const isActive = selectedZaloLabelIds.includes(label.id);
                      const baseColor = label.color && label.color.startsWith('#') ? label.color : `#${label.color || '3b82f6'}`;
                      return (
                        <button
                          key={`zalo-${label.id}`}
                          onClick={() => toggleZaloLabel(label.id)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all font-semibold flex items-center gap-1 ${
                            isActive ? 'text-white shadow-sm' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                          }`}
                          style={isActive
                            ? { backgroundColor: baseColor, borderColor: baseColor }
                            : { backgroundColor: baseColor + '10', borderColor: baseColor + '30', color: baseColor }}
                        >
                          <span>{label.emoji || '🏷️'}</span>
                          <span>{label.text}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 py-4 text-center">Chưa có nhãn Zalo nào. Đồng bộ nhãn từ trang Liên hệ trước.</p>
                )
              )}

              {/* Filter List or Empty Filter Illustration */}
              {totalLabelFilters === 0 ? (
                /* Matching Mockup Image 3 Empty State Illustration */
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center text-3xl mb-3 shadow-inner">
                    🔍
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Chọn ít nhất 1 nhãn để lọc liên hệ</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                    Sau khi chọn nhãn, danh sách liên hệ phù hợp sẽ tự động hiển thị tại đây.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2">
                    ✓ Tìm thấy {filtered.length} liên hệ phù hợp ({selectedCount} sẵn sàng)
                  </p>
                  {filtered.slice(0, 100).map(c => (
                    <div
                      key={c.contact_id}
                      className="p-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center gap-3 shadow-xs"
                    >
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                        {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.alias || c.display_name || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{c.alias || c.display_name || c.contact_id}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{c.phone || c.contact_id}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mode By Phone */}
          {mode === 'by_phone' && (
            <div className="space-y-3">
              <textarea
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder={"Nhập hoặc dán SĐT (mỗi số 1 dòng):\n0901234567\n0912345678\n..."}
                className="w-full h-36 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Đã nhập: {phoneList.length} SĐT hợp lệ
              </p>
            </div>
          )}

          {/* Mode By UID */}
          {mode === 'by_uid' && (
            <div className="space-y-3">
              <textarea
                value={uidInput}
                onChange={e => setUidInput(e.target.value)}
                placeholder={"Nhập hoặc dán UID Zalo (mỗi UID 1 dòng):\n1234567890\n9876543210\n..."}
                className="w-full h-36 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Đã nhập: {uidList.length} UID hợp lệ
              </p>
            </div>
          )}

          {/* Groups Only Mode (Theo nhóm - Matching Request 1 / Hình 1) */}
          {mode === 'groups_only' && (
            <div className="space-y-3">
              {/* Group Toolbar Controls */}
              {(() => {
                const groups = allGroups.filter(g => (!search || (g.display_name || '').toLowerCase().includes(search.toLowerCase())));
                const allSelected = groups.length > 0 && groups.every(g => selectedGroupIds.has(g.contact_id));
                return (
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50/70 dark:bg-blue-950/30 p-3 rounded-2xl border border-blue-100 dark:border-blue-900/50">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setSelectedGroupIds(new Set());
                          } else {
                            setSelectedGroupIds(new Set(groups.map(g => g.contact_id)));
                          }
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-2xs"
                      >
                        {allSelected ? '☒ Bỏ chọn tất cả' : `☑️ Chọn tất cả (${groups.length} nhóm)`}
                      </button>
                      {selectedGroupIds.size > 0 && !allSelected && (
                        <button
                          type="button"
                          onClick={() => setSelectedGroupIds(new Set())}
                          className="text-xs px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold transition-all"
                        >
                          ☒ Bỏ chọn
                        </button>
                      )}
                    </div>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                      {selectedGroupIds.size > 0
                        ? `✓ Đã chọn ${selectedGroupIds.size} nhóm ➔ ${extractedUniqueMembers.length} thành viên độc nhất (tự động khử trùng)`
                        : 'Hãy chọn 1 hoặc nhiều nhóm bên dưới'}
                    </span>
                  </div>
                );
              })()}

              {/* Group List */}
              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {(() => {
                  const groups = allGroups.filter(g => (!search || (g.display_name || '').toLowerCase().includes(search.toLowerCase())));
                  if (groups.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <span className="text-3xl mb-2">👨‍👩‍👧‍👦</span>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300">Không tìm thấy nhóm Zalo nào.</p>
                      </div>
                    );
                  }
                  return groups.map(group => {
                    const isSelected = selectedGroupIds.has(group.contact_id);
                    const dbMembers = groupMembersMap[group.contact_id] || [];
                    return (
                      <div
                        key={group.contact_id}
                        onClick={() => toggleSelectGroup(group.contact_id)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-2xs'
                            : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                            isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && <span className="text-xs font-bold">✓</span>}
                          </div>
                          <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                            {group.avatar ? <img src={group.avatar} alt="" className="w-full h-full object-cover" /> : '👨‍👩‍👧‍👦'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{group.display_name}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {dbMembers.length > 0 ? `${dbMembers.length} thành viên` : (group.member_count > 0 ? `${group.member_count} thành viên` : 'Nhóm Zalo')}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[11px] px-2.5 py-1 rounded-xl border font-bold transition-all ${
                          isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>
                          {isSelected ? '✓ Đã chọn' : '+ Chọn nhóm'}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Manual / Friends Select Mode (Theo Liên hệ - Matching Request 1 & 2 / Hình 2) */}
          {(mode === 'manual' || mode === 'friends_only') && (
            <div className="space-y-3">
              {/* Toolbar Controls */}
              {(() => {
                const contacts = allContacts.filter(c => c.contact_type !== 'group' && (!search || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(search.toLowerCase())));
                const allSelected = contacts.length > 0 && contacts.every(c => manualSelected.has(c.contact_id));
                return (
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50/70 dark:bg-blue-950/30 p-3 rounded-2xl border border-blue-100 dark:border-blue-900/50">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setManualSelected(new Set());
                          } else {
                            setManualSelected(new Set(contacts.map(c => c.contact_id)));
                          }
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-2xs"
                      >
                        {allSelected ? '☒ Bỏ chọn tất cả' : `☑️ Chọn tất cả (${contacts.length} liên hệ)`}
                      </button>
                      {manualSelected.size > 0 && !allSelected && (
                        <button
                          type="button"
                          onClick={() => setManualSelected(new Set())}
                          className="text-xs px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold transition-all"
                        >
                          ☒ Bỏ chọn
                        </button>
                      )}
                    </div>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                      {manualSelected.size > 0
                        ? `✓ Đã chọn ${manualSelected.size} liên hệ để thêm vào chiến dịch`
                        : 'Tích chọn 1 hoặc nhiều liên hệ bên dưới để thêm gửi tin'}
                    </span>
                  </div>
                );
              })()}

              {/* Contact List */}
              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {(() => {
                  const contacts = allContacts.filter(c => c.contact_type !== 'group' && (!search || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(search.toLowerCase())));
                  if (contacts.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <span className="text-3xl mb-2">👤</span>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300">Không tìm thấy liên hệ nào.</p>
                      </div>
                    );
                  }
                  return contacts.slice(0, 300).map(c => {
                    const isSelected = manualSelected.has(c.contact_id);
                    return (
                      <div
                        key={c.contact_id}
                        onClick={() => toggleManualSelect(c.contact_id)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500/20 shadow-2xs'
                            : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Checkbox at the START (left-hand side) */}
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                            isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && <span className="text-xs font-bold">✓</span>}
                          </div>

                          {/* Avatar người dùng - Matching Request 1 */}
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                            {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.alias || c.display_name || '?').slice(0, 1).toUpperCase()}
                          </div>

                          {/* Contact Info */}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{c.alias || c.display_name || c.contact_id}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{c.phone || c.contact_id}</p>
                          </div>
                        </div>

                        {/* Status Tag on the right (NO EXCLUDE BUTTON HERE!) */}
                        {isSelected && (
                          <span className="text-[11px] px-2.5 py-1 rounded-xl bg-blue-600 text-white font-bold shadow-2xs">
                            ✓ Đã chọn
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ── Fixed Footer Bar (Matching Mockup Image 3) ── */}
        <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900 flex items-center justify-between flex-shrink-0 gap-3">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
            {selectedCount} liên hệ được chọn
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold transition-colors"
            >
              Hủy
            </button>
            <button
              disabled={selectedCount === 0}
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-40 transition-all"
            >
              Thêm {selectedCount} liên hệ
            </button>
          </div>
        </div>

        {/* Unified Label Picker Modal */}
        {showLabelPickerModal && (
          <UnifiedLabelPickerModal
            open={showLabelPickerModal}
            options={unifiedLabelOptions}
            selected={[
              ...selectedLocalLabelIds.map(id => `local:${id}`),
              ...selectedZaloLabelIds.map(id => `zalo:${id}`),
            ]}
            accounts={accounts as any}
            onChange={selectedValues => {
              const localIds: number[] = [];
              const zaloIds: number[] = [];
              selectedValues.forEach(val => {
                if (val.startsWith('local:')) {
                  const id = Number(val.replace('local:', ''));
                  if (!isNaN(id)) localIds.push(id);
                } else if (val.startsWith('zalo:')) {
                  const id = Number(val.replace('zalo:', ''));
                  if (!isNaN(id)) zaloIds.push(id);
                }
              });
              setSelectedLocalLabelIds(localIds);
              setSelectedZaloLabelIds(zaloIds);
            }}
            onConfirm={() => setShowLabelPickerModal(false)}
            onClose={() => setShowLabelPickerModal(false)}
          />
        )}
      </div>
    </div>
  );
}
