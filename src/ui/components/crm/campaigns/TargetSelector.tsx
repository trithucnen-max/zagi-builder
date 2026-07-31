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
  existingContactIds?: Set<string>;
  existingIds?: Set<string>;
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
  existingContactIds: propExistingContactIds,
  existingIds,
  onConfirm,
  onClose,
  headerContent,
}: TargetSelectorProps) {
  const existingContactIds = useMemo(
    () => propExistingContactIds || existingIds || new Set<string>(),
    [propExistingContactIds, existingIds]
  );
  const [mode, setMode] = useState<SelectMode>('by_label');
  const [listPage, setListPage] = useState(0);
  const PAGE_SIZE = 10;
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
    const fetchLabels = () => {
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
    };

    fetchLabels();

    window.addEventListener('local-labels-changed', fetchLabels);
    window.addEventListener('ui:threadLabelsChanged', fetchLabels);
    return () => {
      window.removeEventListener('local-labels-changed', fetchLabels);
      window.removeEventListener('ui:threadLabelsChanged', fetchLabels);
    };
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
    const acc = accounts.find(a => a.zalo_id === zaloId);
    const rawAccName = acc?.full_name || acc?.display_name;
    const formattedName = (rawAccName && !/^\d{8,}$/.test(rawAccName)) ? rawAccName : (acc?.phone ? formatPhone(acc.phone) : '');
    const resolvedAccName = formattedName || (zaloId && zaloId.length > 8 ? `Zalo (...${zaloId.slice(-4)})` : zaloId);

    const localOpts: LoadedLabelOption[] = (effectiveLocalLabels || []).map((l: any) => ({
      value: `local:${l.id}`,
      name: l.name,
      label: `${l.emoji || '🏷️'} ${l.name} (Local)`,
      source: 'local',
      id: l.id,
      color: l.color,
      emoji: l.emoji,
      accountZaloId: zaloId,
      accountName: resolvedAccName,
    }));
    const zaloOpts: LoadedLabelOption[] = (allLabels || []).map((l: any) => ({
      value: `zalo:${l.id}`,
      name: l.text || l.name,
      label: `🏷️ ${l.text || l.name} (Zalo)`,
      source: 'zalo',
      id: l.id,
      color: l.color,
      accountZaloId: zaloId,
      accountName: resolvedAccName,
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

  const paginationInfo = useMemo(() => {
    let total = 0;
    if (mode === 'by_label') {
      total = totalLabelFilters === 0 ? 0 : filtered.length;
    } else if (mode === 'by_phone') {
      total = phoneList.length;
    } else if (mode === 'by_uid') {
      total = uidList.length;
    } else if (mode === 'groups_only') {
      total = allGroups.filter(g => (!search || (g.display_name || '').toLowerCase().includes(search.toLowerCase()))).length;
    } else if (mode === 'manual' || mode === 'friends_only') {
      total = allContacts.filter(c => c.contact_type !== 'group' && (!search || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(search.toLowerCase()))).length;
    }
    const totalPages = Math.ceil(total / PAGE_SIZE);
    return { total, totalPages };
  }, [mode, totalLabelFilters, filtered.length, phoneList.length, uidList.length, allGroups, search, allContacts, PAGE_SIZE]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[70] p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-[960px] shadow-2xl flex flex-col overflow-hidden text-gray-900 dark:text-white h-[80vh] min-h-[500px] max-h-[90vh] my-auto"
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

        {/* ── 2-Column Body Layout ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ════════════ LEFT PANEL: Accordion Controls (280px fixed) ════════════ */}
          <div className="w-[280px] flex-shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-800 overflow-y-auto bg-gray-50/30 dark:bg-gray-900/30">

            {/* Accordion Mode List */}
            <div className="px-3 pt-3 pb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Chọn theo</p>

              {/* ── Theo nhãn ── */}
              <div className="mb-1">
                <button
                  onClick={() => { setMode('by_label'); setListPage(0); }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    mode === 'by_label'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>🏷️</span><span className="flex-1 text-left">Theo nhãn</span>
                  {mode === 'by_label' && <span className="text-[10px] opacity-60">▲</span>}
                </button>
                {mode === 'by_label' && (
                  <div className="mt-1.5 ml-1 space-y-2">
                    {/* Local/Zalo sub-tabs */}
                    <div className="flex gap-1.5">
                      <button onClick={() => setLabelTab('local')}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                          labelTab === 'local' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50'
                        }`}>
                        📦 Local ({effectiveLocalLabels.length})
                      </button>
                      <button onClick={() => setLabelTab('zalo')}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                          labelTab === 'zalo' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50'
                        }`}>
                        🔄 Zalo ({allLabels.length})
                      </button>
                    </div>
                    {/* Label chips */}
                    <div className="flex gap-1.5 flex-wrap">
                      {(labelTab === 'local' ? effectiveLocalLabels : []).map(label => {
                        const isActive = selectedLocalLabelIds.includes(label.id);
                        const baseColor = label.color && label.color.startsWith('#') ? label.color : `#${label.color || '3b82f6'}`;
                        return (
                          <button key={`local-${label.id}`} onClick={() => { toggleLocalLabel(label.id); setListPage(0); }}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all font-semibold flex items-center gap-1 ${isActive ? 'text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
                            style={isActive ? { backgroundColor: baseColor, borderColor: baseColor } : { backgroundColor: baseColor + '10', borderColor: baseColor + '30', color: baseColor }}>
                            {label.emoji && <span>{label.emoji}</span>}<span>{label.name}</span>
                          </button>
                        );
                      })}
                      {(labelTab === 'zalo' ? allLabels : []).map(label => {
                        const isActive = selectedZaloLabelIds.includes(label.id);
                        const baseColor = label.color && label.color.startsWith('#') ? label.color : `#${label.color || '3b82f6'}`;
                        return (
                          <button key={`zalo-${label.id}`} onClick={() => { toggleZaloLabel(label.id); setListPage(0); }}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all font-semibold flex items-center gap-1 ${isActive ? 'text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
                            style={isActive ? { backgroundColor: baseColor, borderColor: baseColor } : { backgroundColor: baseColor + '10', borderColor: baseColor + '30', color: baseColor }}>
                            <span>🏷️</span><span>{label.text}</span>
                          </button>
                        );
                      })}
                      {labelTab === 'local' && effectiveLocalLabels.length === 0 && (
                        <span className="text-[11px] text-gray-400 italic">📁 Chưa có nhãn Local</span>
                      )}
                      {labelTab === 'zalo' && allLabels.length === 0 && (
                        <span className="text-[11px] text-gray-400 italic">🏷️ Chưa có nhãn Zalo</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Theo SĐT ── */}
              <div className="mb-1">
                <button
                  onClick={() => { setMode('by_phone'); setListPage(0); }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    mode === 'by_phone'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>📞</span><span className="flex-1 text-left">Theo SĐT</span>
                  {mode === 'by_phone' && <span className="text-[10px] opacity-60">▲</span>}
                </button>
                {mode === 'by_phone' && (
                  <div className="mt-1.5 ml-1 space-y-2">
                    <textarea
                      value={phoneInput}
                      onChange={e => { setPhoneInput(e.target.value); setListPage(0); }}
                      placeholder={"Nhập hoặc dán SĐT\n(mỗi số 1 dòng):\n0901234567\n0912345678"}
                      className="w-full h-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono resize-none"
                    />
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{phoneList.length} SĐT hợp lệ</p>
                  </div>
                )}
              </div>

              {/* ── Theo UID ── */}
              <div className="mb-1">
                <button
                  onClick={() => { setMode('by_uid'); setListPage(0); }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    mode === 'by_uid'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>🔗</span><span className="flex-1 text-left">Theo UID</span>
                  {mode === 'by_uid' && <span className="text-[10px] opacity-60">▲</span>}
                </button>
                {mode === 'by_uid' && (
                  <div className="mt-1.5 ml-1 space-y-2">
                    <textarea
                      value={uidInput}
                      onChange={e => { setUidInput(e.target.value); setListPage(0); }}
                      placeholder={"Nhập hoặc dán UID Zalo\n(mỗi UID 1 dòng):\n1234567890"}
                      className="w-full h-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono resize-none"
                    />
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{uidList.length} UID hợp lệ</p>
                  </div>
                )}
              </div>

              {/* ── Theo Liên hệ ── */}
              <div className="mb-1">
                <button
                  onClick={() => { setMode('manual'); setListPage(0); }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    mode === 'manual' || mode === 'friends_only'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>👤</span><span className="flex-1 text-left">Theo Liên hệ</span>
                  {(mode === 'manual' || mode === 'friends_only') && <span className="text-[10px] opacity-60">▲</span>}
                </button>
                {(mode === 'manual' || mode === 'friends_only') && (
                  <div className="mt-1.5 ml-1">
                    <p className="text-[11px] text-gray-400">Tìm kiếm và tích chọn liên hệ ở cột bên phải.</p>
                  </div>
                )}
              </div>

              {/* ── Theo nhóm ── */}
              <div className="mb-1">
                <button
                  onClick={() => { setMode('groups_only'); setListPage(0); }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    mode === 'groups_only'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>👨‍👩‍👧‍👦</span><span className="flex-1 text-left">Theo nhóm</span>
                  {mode === 'groups_only' && <span className="text-[10px] opacity-60">▲</span>}
                </button>
                {mode === 'groups_only' && (
                  <div className="mt-1.5 ml-1">
                    <p className="text-[11px] text-gray-400">Tìm kiếm và tích chọn nhóm ở cột bên phải.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 mx-3 mt-1" />

            {/* ── Exclusion Filter Section ── */}
            <div className="px-3 py-3 flex-1">
              <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowExclusionSection(!showExclusionSection)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/40 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>🚫</span>
                    <span>Bộ lọc Loại Trừ</span>
                    {allExcludedIds.size > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                        {allExcludedIds.size} loại trừ
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-red-400 font-bold">{showExclusionSection ? '▲' : '▼'}</span>
                </button>

                {showExclusionSection && (
                  <div className="p-3 border-t border-red-200/60 dark:border-red-900/40 bg-white dark:bg-gray-850 space-y-2.5">
                    <div className="flex gap-1.5 flex-wrap border-b border-gray-100 dark:border-gray-800 pb-2">
                      {[
                        { id: 'label', label: 'Nhãn', icon: '🏷️', count: excludedLocalLabelIds.length + excludedZaloLabelIds.length },
                        { id: 'group', label: 'Nhóm', icon: '👨‍👩‍👧‍👦', count: excludedGroupIds.size },
                        { id: 'contact', label: 'Liên hệ', icon: '👤', count: excludedContactIds.size },
                      ].map(tab => {
                        const isActive = exclusionTab === tab.id;
                        return (
                          <button key={`ex-tab-${tab.id}`} type="button"
                            onClick={() => setExclusionTab(tab.id as any)}
                            className={`text-[11px] px-2.5 py-1 rounded-xl font-bold transition-all flex items-center gap-1 ${
                              isActive ? 'bg-red-600 text-white shadow-2xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                            }`}>
                            <span>{tab.icon}</span><span>{tab.label}</span>
                            {tab.count > 0 && (
                              <span className={`px-1.5 rounded-full text-[10px] font-extrabold ${isActive ? 'bg-white text-red-600' : 'bg-red-500 text-white'}`}>{tab.count}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {exclusionTab === 'label' && (
                      <div className="space-y-2">
                        {effectiveLocalLabels.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Nhãn Local:</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {effectiveLocalLabels.map(label => {
                                const isExcluded = excludedLocalLabelIds.includes(label.id);
                                return (
                                  <button key={`ex-local-${label.id}`} type="button"
                                    onClick={() => setExcludedLocalLabelIds(prev => prev.includes(label.id) ? prev.filter(id => id !== label.id) : [...prev, label.id])}
                                    className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all flex items-center gap-1 ${
                                      isExcluded ? 'bg-red-600 text-white border-red-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 border-gray-200'
                                    }`}>
                                    {isExcluded && <span>🚫</span>}<span>{label.emoji || '🏷️'} {label.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {allLabels.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Nhãn Zalo:</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {allLabels.map(label => {
                                const isExcluded = excludedZaloLabelIds.includes(label.id);
                                return (
                                  <button key={`ex-zalo-${label.id}`} type="button"
                                    onClick={() => setExcludedZaloLabelIds(prev => prev.includes(label.id) ? prev.filter(id => id !== label.id) : [...prev, label.id])}
                                    className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all flex items-center gap-1 ${
                                      isExcluded ? 'bg-red-600 text-white border-red-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 border-gray-200'
                                    }`}>
                                    {isExcluded && <span>🚫</span>}<span>🏷️ {label.text}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {exclusionTab === 'group' && (
                      <div className="space-y-2">
                        <input value={exGroupSearch} onChange={e => setExGroupSearch(e.target.value)}
                          placeholder="🔍 Tìm nhóm..."
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                        />
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {(() => {
                            const groups = allGroups.filter(g => (!exGroupSearch || (g.display_name || '').toLowerCase().includes(exGroupSearch.toLowerCase())));
                            if (groups.length === 0) return <p className="text-xs text-gray-400 italic py-2 text-center">Không tìm thấy nhóm.</p>;
                            return groups.map(g => {
                              const isExcluded = excludedGroupIds.has(g.contact_id);
                              return (
                                <div key={`ex-g-${g.contact_id}`} onClick={() => toggleExcludeGroup(g.contact_id)}
                                  className={`p-1.5 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                                    isExcluded ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 hover:bg-gray-100'
                                  }`}>
                                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                                    isExcluded ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600'
                                  }`}>{isExcluded && <span className="text-[10px] font-bold">✓</span>}</div>
                                  <span className="text-xs text-gray-800 dark:text-gray-200 truncate flex-1">{g.display_name}</span>
                                  {isExcluded && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">🚫</span>}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {exclusionTab === 'contact' && (
                      <div className="space-y-2">
                        <input value={exContactSearch} onChange={e => setExContactSearch(e.target.value)}
                          placeholder="🔍 Tìm liên hệ..."
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                        />
                        {excludedContactIds.size > 0 && (
                          <div className="flex gap-1 flex-wrap max-h-16 overflow-y-auto p-1 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/40">
                            {Array.from(excludedContactIds).map(cId => {
                              const contact = allContacts.find(c => c.contact_id === cId);
                              return (
                                <button key={`ex-c-${cId}`} type="button" onClick={() => toggleExcludeContact(cId)}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold flex items-center gap-1 hover:bg-red-700">
                                  <span>🚫 {contact?.alias || contact?.display_name || cId}</span><span className="opacity-70">✕</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {(() => {
                            const contacts = allContacts.filter(c => c.contact_type !== 'group' && (!exContactSearch || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(exContactSearch.toLowerCase())));
                            if (contacts.length === 0) return <p className="text-xs text-gray-400 italic py-2 text-center">Không tìm thấy liên hệ.</p>;
                            return contacts.slice(0, 100).map(c => {
                              const isExcluded = excludedContactIds.has(c.contact_id);
                              return (
                                <div key={`ex-c-${c.contact_id}`} onClick={() => toggleExcludeContact(c.contact_id)}
                                  className={`p-1.5 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                                    isExcluded ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 hover:bg-gray-100'
                                  }`}>
                                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                                    isExcluded ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600'
                                  }`}>{isExcluded && <span className="text-[10px] font-bold">✓</span>}</div>
                                  <span className="text-xs font-normal text-gray-800 dark:text-gray-200 truncate flex-1">{c.alias || c.display_name || c.contact_id}</span>
                                  {isExcluded && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">🚫</span>}
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
            </div>
          </div>

          {/* ════════════ RIGHT PANEL: List with Search + Pagination ════════════ */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Right panel top bar: Search + summary + select-all */}
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-2 flex-shrink-0">
              {/* Search input */}
              {(mode === 'by_label' || mode === 'manual' || mode === 'friends_only' || mode === 'groups_only') && (
                <div className="relative flex-1">
                  <svg width="13" height="13" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setListPage(0); }}
                    placeholder={mode === 'groups_only' ? 'Tìm nhóm...' : 'Tìm tên, SĐT, UID...'}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full pl-8 pr-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              {/* Summary + select-all */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  {selectedCount} đã chọn · {totalAvailable} khả dụng
                </span>
                {(mode === 'manual' || mode === 'friends_only') && (() => {
                  const contacts = allContacts.filter(c => c.contact_type !== 'group' && (!search || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(search.toLowerCase())));
                  const allSelected = contacts.length > 0 && contacts.every(c => manualSelected.has(c.contact_id));
                  return (
                    <button type="button" onClick={() => { allSelected ? setManualSelected(new Set()) : setManualSelected(new Set(contacts.map(c => c.contact_id))); setListPage(0); }}
                      className="text-[11px] px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-2xs whitespace-nowrap">
                      {allSelected ? '☒ Bỏ tất cả' : `☑️ Chọn tất cả (${contacts.length})`}
                    </button>
                  );
                })()}
                {mode === 'groups_only' && (() => {
                  const groups = allGroups.filter(g => (!search || (g.display_name || '').toLowerCase().includes(search.toLowerCase())));
                  const allSelected = groups.length > 0 && groups.every(g => selectedGroupIds.has(g.contact_id));
                  return (
                    <button type="button" onClick={() => { allSelected ? setSelectedGroupIds(new Set()) : setSelectedGroupIds(new Set(groups.map(g => g.contact_id))); setListPage(0); }}
                      className="text-[11px] px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-2xs whitespace-nowrap">
                      {allSelected ? '☒ Bỏ tất cả' : `☑️ Chọn tất cả (${groups.length})`}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Right panel scrollable list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">

              {/* By Label */}
              {mode === 'by_label' && (
                totalLabelFilters === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center text-3xl mb-3">🏷️</div>
                    <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Chọn nhãn để lọc</h4>
                    <p className="text-xs text-gray-400 max-w-[220px]">Chọn ít nhất 1 nhãn ở bảng trái để hiển thị danh sách liên hệ phù hợp.</p>
                  </div>
                ) : (() => {
                  const pageData = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
                  return pageData.map(c => (
                    <div key={c.contact_id}
                      className="p-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center gap-2.5 shadow-xs">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                        {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.alias || c.display_name || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-normal text-gray-900 dark:text-white truncate">{c.alias || c.display_name || c.contact_id}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{c.phone || c.contact_id}</p>
                      </div>
                    </div>
                  ));
                })()
              )}

              {/* By Phone preview */}
              {mode === 'by_phone' && (
                phoneList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 flex items-center justify-center text-3xl mb-3">📞</div>
                    <p className="text-xs text-gray-400">Nhập SĐT ở bảng trái để xem trước danh sách</p>
                  </div>
                ) : (() => {
                  const pageData = phoneList.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
                  return pageData.map((phone, i) => (
                    <div key={`phone-${listPage * PAGE_SIZE + i}`} className="p-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">📞</div>
                      <span className="text-xs font-mono text-gray-900 dark:text-white">{phone}</span>
                    </div>
                  ));
                })()
              )}

              {/* By UID preview */}
              {mode === 'by_uid' && (
                uidList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 flex items-center justify-center text-3xl mb-3">🔗</div>
                    <p className="text-xs text-gray-400">Nhập UID ở bảng trái để xem trước danh sách</p>
                  </div>
                ) : (() => {
                  const pageData = uidList.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
                  return pageData.map((uid, i) => (
                    <div key={`uid-${listPage * PAGE_SIZE + i}`} className="p-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">🔗</div>
                      <span className="text-xs font-mono text-gray-900 dark:text-white">{uid}</span>
                    </div>
                  ));
                })()
              )}

              {/* Groups Mode */}
              {mode === 'groups_only' && (() => {
                const groups = allGroups.filter(g => (!search || (g.display_name || '').toLowerCase().includes(search.toLowerCase())));
                if (groups.length === 0) return (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                    <span className="text-3xl mb-2">👨‍👩‍👧‍👦</span>
                    <p className="text-xs text-gray-400">Không tìm thấy nhóm Zalo.</p>
                  </div>
                );
                const pageData = groups.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
                return pageData.map(group => {
                  const isSelected = selectedGroupIds.has(group.contact_id);
                  const dbMembers = groupMembersMap[group.contact_id] || [];
                  return (
                    <div key={group.contact_id} onClick={() => toggleSelectGroup(group.contact_id)}
                      className={`p-2.5 rounded-2xl border cursor-pointer transition-all flex items-center gap-2.5 ${
                        isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/20' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}>
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'
                      }`}>{isSelected && <span className="text-xs font-bold">✓</span>}</div>
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                        {group.avatar ? <img src={group.avatar} alt="" className="w-full h-full object-cover" /> : '👨‍👩‍👧‍👦'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-normal text-gray-900 dark:text-white truncate">{group.display_name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {dbMembers.length > 0 ? `${dbMembers.length} thành viên` : (group.member_count > 0 ? `${group.member_count} thành viên` : 'Nhóm Zalo')}
                        </p>
                      </div>
                      {isSelected && <span className="text-[11px] px-2 py-0.5 rounded-xl bg-blue-600 text-white font-bold">✓</span>}
                    </div>
                  );
                });
              })()}

              {/* Manual Contact Select Mode */}
              {(mode === 'manual' || mode === 'friends_only') && (() => {
                const contacts = allContacts.filter(c => c.contact_type !== 'group' && (!search || (c.alias || c.display_name || c.phone || c.contact_id || '').toLowerCase().includes(search.toLowerCase())));
                if (contacts.length === 0) return (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                    <span className="text-3xl mb-2">👤</span>
                    <p className="text-xs text-gray-400">Không tìm thấy liên hệ.</p>
                  </div>
                );
                const pageData = contacts.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
                return pageData.map(c => {
                  const isSelected = manualSelected.has(c.contact_id);
                  return (
                    <div key={c.contact_id} onClick={() => toggleManualSelect(c.contact_id)}
                      className={`p-2.5 rounded-2xl border cursor-pointer transition-all flex items-center gap-2.5 ${
                        isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500/20' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}>
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'
                      }`}>{isSelected && <span className="text-xs font-bold">✓</span>}</div>
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                        {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.alias || c.display_name || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-normal text-gray-900 dark:text-white truncate">{c.alias || c.display_name || c.contact_id}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{c.phone || c.contact_id}</p>
                      </div>
                      {isSelected && <span className="text-[11px] px-2 py-0.5 rounded-xl bg-blue-600 text-white font-bold">✓</span>}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Right panel fixed bottom pagination bar */}
            {paginationInfo.totalPages > 1 && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-center gap-2 flex-shrink-0">
                <button
                  disabled={listPage === 0}
                  onClick={() => setListPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  ← Trước
                </button>
                <span className="text-xs text-gray-500 font-medium">
                  {listPage + 1} / {paginationInfo.totalPages} · {paginationInfo.total} kết quả
                </span>
                <button
                  disabled={listPage >= paginationInfo.totalPages - 1}
                  onClick={() => setListPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Sau →
                </button>
              </div>
            )}
          </div>
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
