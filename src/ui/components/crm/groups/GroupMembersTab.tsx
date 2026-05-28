import React, { useEffect, useState, useCallback, useRef } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { useCRMStore } from '@/store/crmStore';
import PhoneDisplay from '@/components/common/PhoneDisplay';
import GroupAvatar from '@/components/common/GroupAvatar';
import CampaignCreateModal from '@/components/crm/campaigns/CampaignCreateModal';
import AddToContactsModal from '@/components/crm/contacts/AddToContactsModal';
import { syncZaloGroups, MemberPlaceholder, SyncGroupsProgress } from '@/lib/zaloGroupUtils';
import Logger from '../../../../utils/Logger';

interface ZaloGroup {
  contact_id: string;
  display_name: string;
  avatar_url: string;
  last_message_time: number;
  memberCount: number;
}

interface GroupMember {
  member_id: string;
  display_name: string;
  avatar: string;
  role: number;
  updated_at: number;
  phone?: string;
}

function roleLabel(role: number) {
  if (role === 2) return { text: 'Trưởng nhóm', cls: 'text-yellow-400' };
  if (role === 1) return { text: 'Phó nhóm', cls: 'text-blue-400' };
  return { text: 'Thành viên', cls: 'text-gray-500' };
}

function Avatar({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = (name || '?').charAt(0).toUpperCase();
  if (src && !err) {
    return (
      <img src={src} alt={name} style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
        onError={() => setErr(true)} />
    );
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3 opacity-70">{icon}</div>
      <p className="text-sm text-gray-300 font-medium mb-1">{title}</p>
      <div className="text-xs text-gray-500 leading-relaxed max-w-xs">{desc}</div>
    </div>
  );
}

const GroupIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const RefreshIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.97"/>
  </svg>
);
const SpinIcon = (
  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

export default function GroupMembersTab() {
  const { activeAccountId } = useAccountStore();
  const { setGroupCount } = useCRMStore();
  const groupInfoCache = useAppStore(s => s.groupInfoCache);

  const [groups, setGroups] = useState<ZaloGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLastFetched, setMembersLastFetched] = useState(0);
  const [searchGroup, setSearchGroup] = useState('');
  const [searchMember, setSearchMember] = useState('');

  // ── Managed groups state ──────────────────────────────────────────────────
  const [groupFilter, setGroupFilter] = useState<'all' | 'managed'>('all');
  const [managedGroupIds, setManagedGroupIds] = useState<Set<string>>(new Set());

  // ── Add to multiple groups modal state ───────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [searchContact, setSearchContact] = useState('');
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [checkedGroupIds, setCheckedGroupIds] = useState<Set<string>>(new Set());
  const [existingGroupMembers, setExistingGroupMembers] = useState<Record<string, Set<string>>>({});
  const [isRunningAdd, setIsRunningAdd] = useState(false);
  const [addProgress, setAddProgress] = useState<{ current: number; total: number; msg: string } | null>(null);

  // ── Remove from multiple groups modal state ──────────────────────────────
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [checkedRemoveGroupIds, setCheckedRemoveGroupIds] = useState<Set<string>>(new Set());
  const [memberGroups, setMemberGroups] = useState<any[]>([]);
  const [isRunningRemove, setIsRunningRemove] = useState(false);
  const [removeProgress, setRemoveProgress] = useState<{ current: number; total: number; msg: string } | null>(null);


  // ── Progress state ────────────────────────────────────────────────────────
  /** Phase 1: syncing groups from API | Phase 2: enriching member details */
  type GroupFetchProgress =
    | { phase: 'groups'; current: number; total: number }
    | { phase: 'members'; groupCurrent: number; groupTotal: number; memberCurrent: number; memberTotal: number; currentGroupName: string };
  const [groupFetchProgress, setGroupFetchProgress] = useState<GroupFetchProgress | null>(null);
  /** Progress bar shown while auto-fetching member details via getUserInfo (single group) */
  const [manualLoadProgress, setManualLoadProgress] = useState<{ current: number; total: number } | null>(null);
  const manualLoadStopRef = useRef(false);
  /** Stop ref for Phase 2 bulk member enrichment inside fetchGroupsFromAPI */
  const bulkEnrichStopRef = useRef(false);

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // ── Campaign picker state ─────────────────────────────────────────────────
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [localCampaigns, setLocalCampaigns] = useState<any[]>([]);
  const [pickedCampaignId, setPickedCampaignId] = useState<number | null>(null);
  const [addingToCampaign, setAddingToCampaign] = useState(false);

  // ── Add to contacts modal state ─────────────────────────────────────────
  const [showAddToContacts, setShowAddToContacts] = useState(false);

  // ── Link scan state ──────────────────────────────────────────────────
  const [showLinkScanModal, setShowLinkScanModal] = useState(false);
  const [linkScanInput, setLinkScanInput] = useState('');
  const [linkScanLoading, setLinkScanLoading] = useState(false);
  const [linkScanProgress, setLinkScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [linkScanError, setLinkScanError] = useState('');
  const [linkScanResult, setLinkScanResult] = useState<{ groupId: string; name: string } | null>(null);
  const linkScanStopRef = useRef(false);

  // ── Pin Scheduler state ──────────────────────────────────────────
  const [showPinScheduler, setShowPinScheduler] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const [pinScheduleType, setPinScheduleType] = useState<'once' | 'daily' | 'weekly'>('daily');
  const [pinScheduleTime, setPinScheduleTime] = useState('08:00');
  const [pinScheduleWeekday, setPinScheduleWeekday] = useState('1');
  const [isSavingPinSchedule, setIsSavingPinSchedule] = useState(false);
  const [pinScheduleSaved, setPinScheduleSaved] = useState(false);

  // ── Groups 3-dot menu ─────────────────────────────────────────────────────
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showGroupMenu) return;
    const handler = (e: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) setShowGroupMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showGroupMenu]);

  const handleSavePinSchedule = async () => {
    if (!selectedGroupId || !activeAccountId) return;
    setIsSavingPinSchedule(true);
    try {
      await ipc.db?.upsertPinSchedule({
        zaloId: activeAccountId,
        groupId: selectedGroupId,
        message: pinMessage,
        scheduleType: pinScheduleType,
        scheduleTime: pinScheduleTime,
        weekday: pinScheduleWeekday,
      });
      setPinScheduleSaved(true);
      setTimeout(() => {
        setShowPinScheduler(false);
        setPinScheduleSaved(false);
      }, 1500);
    } finally {
      setIsSavingPinSchedule(false);
    }
  };

  const selectedGroup = groups.find(g => g.contact_id === selectedGroupId) ?? null;

  // ── Load groups from contacts (contact_type='group') ──────────────────────
  const loadGroupsFromDB = useCallback(async () => {
    if (!activeAccountId) return;
    const contactsRes = await ipc.db?.getContacts(activeAccountId);
    const allContacts: any[] = contactsRes?.contacts ?? contactsRes ?? [];
    const groupContacts = allContacts.filter((c: any) => c.contact_type === 'group');

    const allMembersRes = await ipc.db?.getAllGroupMembers({ zaloId: activeAccountId });
    const memberRows = allMembersRes?.rows ?? [];
    const countMap: Record<string, number> = {};
    const managedIds = new Set<string>();
    for (const row of memberRows) {
      countMap[row.group_id] = (countMap[row.group_id] || 0) + 1;
      if (row.member_id === activeAccountId && (row.role === 1 || row.role === 2)) {
        managedIds.add(row.group_id);
      }
    }
    setManagedGroupIds(managedIds);

    const mapped = groupContacts.map((c: any) => ({
      contact_id: c.contact_id,
      display_name: c.display_name || c.contact_id,
      avatar_url: c.avatar_url || '',
      last_message_time: c.last_message_time || 0,
      memberCount: countMap[c.contact_id] ?? 0,
    }));
    setGroups(mapped);
    setGroupCount(mapped.length);
  }, [activeAccountId, setGroupCount]);

  // ── Load members from page_group_member ───────────────────────────────────
  const loadMembersFromDB = useCallback(async (groupId: string) => {
    if (!activeAccountId) return;
    const res = await ipc.db?.getGroupMembers({ zaloId: activeAccountId, groupId });
    // Filter out non-numeric garbage IDs (e.g. "profiles", "unchangeds_profile") from old bad parses
    const rows = (res?.members ?? []).filter((m: any) => {
      const id = m.member_id?.trim();
      return id && /^\d+$/.test(id);
    });

    // Merge phone numbers from contacts table
    const contactsRes = await ipc.db?.getContacts(activeAccountId);
    const allContacts: any[] = contactsRes?.contacts ?? contactsRes ?? [];
    const phoneMap: Record<string, string> = {};
    for (const c of allContacts) {
      if (c.contact_id && c.phone) phoneMap[c.contact_id] = c.phone;
    }
    const merged: GroupMember[] = rows.map((m: any) => ({ ...m, phone: phoneMap[m.member_id] || '' }));

    setMembers(merged);
    setMembersLastFetched(merged.length > 0 ? Math.max(...merged.map((m: any) => m.updated_at || 0)) : 0);
  }, [activeAccountId]);

  // ── Fetch groups from API — delegates to syncZaloGroups (full-sync mode) ──
  const fetchGroupsFromAPI = useCallback(async () => {
    if (!activeAccountId) return;
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    setGroupsLoading(true);
    bulkEnrichStopRef.current = false;
    try {
      await syncZaloGroups({
        activeAccountId,
        auth,
        onProgress: (p: SyncGroupsProgress) => {
          if (p.phase === 'groups') {
            setGroupFetchProgress({ phase: 'groups', current: p.current, total: p.total });
          } else {
            setGroupFetchProgress({
              phase: 'members',
              groupCurrent: p.groupCurrent ?? 1,
              groupTotal: p.groupTotal ?? 1,
              memberCurrent: p.current,
              memberTotal: p.total,
              currentGroupName: p.currentGroupName ?? '',
            });
          }
        },
        onPhase1Done: async () => { await loadGroupsFromDB(); },
        onGroupEnriched: async () => { await loadGroupsFromDB(); },
        stopRef: bulkEnrichStopRef,
      });
      await loadGroupsFromDB();
    } finally {
      setGroupsLoading(false);
      setGroupFetchProgress(null);
      bulkEnrichStopRef.current = false;
    }
  }, [activeAccountId, loadGroupsFromDB]);

  // ── Fetch members — delegates to syncZaloGroups (single-group mode) ───────
  const fetchMembersFromAPI = useCallback(async () => {
    if (!activeAccountId || !selectedGroupId) return;
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    setMembersLoading(true);
    manualLoadStopRef.current = false;
    setManualLoadProgress(null);

    try {
      await syncZaloGroups({
        activeAccountId,
        auth,
        groupId: selectedGroupId,   // ← single-group mode, skips getAllGroups
        onProgress: (p: SyncGroupsProgress) => {
          if (p.phase === 'members') {
            setMembersLoading(false); // transition: spinner → progress bar
            setManualLoadProgress({ current: p.current, total: p.total });
          }
        },
        onPhase1Done: async () => {
          // Placeholders saved → show UIDs in list immediately
          await loadMembersFromDB(selectedGroupId);
        },
        onGroupEnriched: async () => {
          setManualLoadProgress(null);
          manualLoadStopRef.current = false;
          await loadMembersFromDB(selectedGroupId);
          await loadGroupsFromDB();
        },
        stopRef: manualLoadStopRef,
      });
    } finally {
      setMembersLoading(false);
      setManualLoadProgress(null);
      manualLoadStopRef.current = false;
    }
  }, [activeAccountId, selectedGroupId, loadMembersFromDB, loadGroupsFromDB]);

  // ── Scan group by invite link ─────────────────────────────────────────────
  const scanGroupByLink = useCallback(async () => {
    if (!activeAccountId || !linkScanInput.trim()) return;
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    setLinkScanLoading(true);
    setLinkScanError('');
    setLinkScanResult(null);
    setLinkScanProgress(null);
    linkScanStopRef.current = false;

    try {
      // ── Step 1: getGroupLinkInfo ─────────────────────────────────────────
      const res = await ipc.zalo?.getGroupLinkInfo({ auth, link: linkScanInput.trim() });
      if (!res?.success) {
        setLinkScanError(res?.error || 'Không thể lấy thông tin nhóm. Kiểm tra lại đường dẫn.');
        return;
      }
      const data = res.response;
      const groupId: string = data.groupId;
      const name: string = data.name || groupId;
      const avatar: string = data.fullAvt || data.avt || '';
      const creatorId: string = (data.creatorId || '').replace(/_0$/, '');
      const adminIds: string[] = (data.adminIds || []).map((a: string) => a.replace(/_0$/, ''));
      const currentMems: any[] = data.currentMems || [];

      // ── Step 2: Save group contact to DB ─────────────────────────────────
      await ipc.db?.updateContactProfile({
        zaloId: activeAccountId, contactId: groupId,
        displayName: name, avatarUrl: avatar, phone: '', contactType: 'group',
      });

      // ── Step 3: Build + save initial member list ──────────────────────────
      const adminSet = new Set([creatorId, ...adminIds]);
      const memberIds: string[] = [];
      const memInfoMap: Record<string, { displayName: string; avatar: string; role: number }> = {};

      for (const mem of currentMems) {
        const memberId = String(mem.id || '').replace(/_0$/, '').trim();
        if (!memberId || !/^\d+$/.test(memberId)) continue;
        memberIds.push(memberId);
        let role = 0;
        if (memberId === creatorId) role = 2;
        else if (adminSet.has(memberId)) role = 1;
        memInfoMap[memberId] = { displayName: mem.dName || mem.zaloName || '', avatar: mem.avatar || mem.avatar_25 || '', role };
      }

      if (memberIds.length > 0) {
        const initMembers = memberIds.map(id => ({
          memberId: id,
          displayName: memInfoMap[id]?.displayName || '',
          avatar: memInfoMap[id]?.avatar || '',
          role: memInfoMap[id]?.role || 0,
        }));
        await ipc.db?.saveGroupMembers({ zaloId: activeAccountId, groupId, members: initMembers });
      }

      setLinkScanResult({ groupId, name });

      // ── Step 4: Batch getUserInfo for full profile + phone ────────────────
      if (memberIds.length > 0) {
        setLinkScanProgress({ current: 0, total: memberIds.length });
        const BATCH = 200;
        for (let j = 0; j < memberIds.length; j += BATCH) {
          if (linkScanStopRef.current) break;
          const batch = memberIds.slice(j, j + BATCH);
          try {
            const uRes = await ipc.zalo?.getUserInfo({ auth, userId: batch });
            if (uRes?.success && uRes.response) {
              const changedProfiles: Record<string, any> = uRes.response.changed_profiles ?? {};
              const updates: any[] = [];
              const contactSaves: Promise<any>[] = [];
              for (const memberId of batch) {
                const profile = changedProfiles[memberId] ?? changedProfiles[`${memberId}_0`] ?? null;
                if (profile) {
                  const displayName = profile.displayName || profile.zaloName || '';
                  const av = profile.avatar || '';
                  const phone: string = profile.msisdn || profile.phoneNumber || profile.phone || '';
                  updates.push({ memberId, displayName, avatar: av, role: memInfoMap[memberId]?.role ?? 0 });
                  if (phone) {
                    contactSaves.push(
                      ipc.db?.updateContactProfile({
                        zaloId: activeAccountId, contactId: memberId,
                        displayName, avatarUrl: av, phone, contactType: 'friend',
                      }) ?? Promise.resolve()
                    );
                  }
                }
              }
              if (updates.length > 0) await ipc.db?.saveGroupMembers({ zaloId: activeAccountId, groupId, members: updates });
              if (contactSaves.length > 0) await Promise.all(contactSaves);
            }
          } catch (err) {
            Logger.warn('[GroupMembersTab] scanGroupByLink getUserInfo batch error:', err);
          }
          setLinkScanProgress({ current: Math.min(j + BATCH, memberIds.length), total: memberIds.length });
          if (!linkScanStopRef.current && j + BATCH < memberIds.length) await new Promise(r => setTimeout(r, 200));
        }
        setLinkScanProgress(null);
      }

      // Reload group list and auto-select the scanned group
      await loadGroupsFromDB();
      setSelectedGroupId(groupId);
      await loadMembersFromDB(groupId);
    } catch (err: any) {
      setLinkScanError(err.message || 'Đã xảy ra lỗi không xác định');
    } finally {
      setLinkScanLoading(false);
      setLinkScanProgress(null);
      linkScanStopRef.current = false;
    }
  }, [activeAccountId, linkScanInput, loadGroupsFromDB, loadMembersFromDB]);

  // ── Member selection helpers ──────────────────────────────────────────────
  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAllMembers = () => setSelectedMemberIds(new Set(filteredMembers.map(m => m.member_id)));
  const clearSelection = () => setSelectedMemberIds(new Set());

  // ── Open campaign picker ──────────────────────────────────────────────────
  const openCampaignPicker = useCallback(async () => {
    if (!activeAccountId) return;
    const res = await ipc.crm?.getCampaigns({ zaloId: activeAccountId });
    if (res?.success) {
      const available = (res.campaigns || []).filter((c: any) => c.status !== 'done');
      setLocalCampaigns(available);
    }
    setPickedCampaignId(null);
    setShowCampaignPicker(true);
  }, [activeAccountId]);

  // ── Create new campaign from within picker ────────────────────────────────
  const handleCreateCampaignInPicker = useCallback(async (data: any) => {
    if (!activeAccountId) return;
    const res = await ipc.crm?.saveCampaign({ zaloId: activeAccountId, campaign: data });
    if (res?.success) {
      // Refresh local campaign list and auto-select the new one
      const res2 = await ipc.crm?.getCampaigns({ zaloId: activeAccountId });
      if (res2?.success) {
        const available = (res2.campaigns || []).filter((c: any) => c.status !== 'done');
        setLocalCampaigns(available);
        if (res.id) setPickedCampaignId(res.id);
      }
    }
  }, [activeAccountId]);

  // ── Add selected members to campaign ─────────────────────────────────────
  const handleAddToCampaign = useCallback(async () => {
    if (!activeAccountId || !pickedCampaignId || selectedMemberIds.size === 0) return;
    setAddingToCampaign(true);
    try {
      const contacts = members
        .filter(m => selectedMemberIds.has(m.member_id))
        .map(m => ({
          contactId: m.member_id,
          displayName: m.display_name || m.member_id,
          avatar: m.avatar || '',
        }));
      await ipc.crm?.addCampaignContacts({ zaloId: activeAccountId, campaignId: pickedCampaignId, contacts });
      setShowCampaignPicker(false);
      setSelectedMemberIds(new Set());
      setPickedCampaignId(null);
    } finally {
      setAddingToCampaign(false);
    }
  }, [activeAccountId, pickedCampaignId, selectedMemberIds, members]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setGroups([]); setMembers([]); setSelectedGroupId(null);
    setMembersLastFetched(0); setSelectedMemberIds(new Set());
    setManualLoadProgress(null);
    manualLoadStopRef.current = true;
    if (activeAccountId) loadGroupsFromDB();
  }, [activeAccountId]);

  useEffect(() => {
    setMembers([]); setMembersLastFetched(0); setSelectedMemberIds(new Set());
    setManualLoadProgress(null);
    manualLoadStopRef.current = true;
    if (selectedGroupId) loadMembersFromDB(selectedGroupId);
  }, [selectedGroupId]);

  // Load list of contacts for AddUserToGroupsModal
  useEffect(() => {
    if (showAddModal && activeAccountId) {
      ipc.db?.getContacts(activeAccountId).then((res: any) => {
        const list = res?.contacts ?? res ?? [];
        setAllContacts(list.filter((c: any) => c.contact_type !== 'group'));
      });
      ipc.db?.getAllGroupMembers({ zaloId: activeAccountId }).then((res: any) => {
        const rows = res?.rows ?? [];
        const map: Record<string, Set<string>> = {};
        for (const r of rows) {
          if (!map[r.group_id]) map[r.group_id] = new Set();
          map[r.group_id].add(r.member_id);
        }
        setExistingGroupMembers(map);
      });
      setSelectedContact(null);
      setSearchContact('');
      setCheckedGroupIds(new Set());
    }
  }, [showAddModal, activeAccountId]);

  // Load groups the selected member is in for RemoveUserFromGroupsModal
  useEffect(() => {
    if (showRemoveModal && activeAccountId && selectedMemberIds.size === 1) {
      const targetId = Array.from(selectedMemberIds)[0];
      ipc.db?.getAllGroupMembers({ zaloId: activeAccountId }).then((res: any) => {
        const rows = res?.rows ?? [];
        const filtered = rows.filter((r: any) => r.member_id === targetId && managedGroupIds.has(r.group_id));
        setMemberGroups(filtered);
        setCheckedRemoveGroupIds(new Set(filtered.map((f: any) => f.group_id)));
      });
    }
  }, [showRemoveModal, activeAccountId, selectedMemberIds, managedGroupIds]);

  const handleAddUserToGroups = async () => {
    if (!activeAccountId || !selectedContact || checkedGroupIds.size === 0) return;
    setIsRunningAdd(true);
    const groupIdsArray = Array.from(checkedGroupIds);
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) {
      setIsRunningAdd(false);
      return;
    }
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    for (let i = 0; i < groupIdsArray.length; i++) {
      const gId = groupIdsArray[i];
      const groupObj = groups.find(g => g.contact_id === gId);
      const groupName = groupObj?.display_name || gId;

      setAddProgress({
        current: i + 1,
        total: groupIdsArray.length,
        msg: `Đang thêm vào nhóm: ${groupName}...`
      });

      try {
        const res = await ipc.zalo?.addUserToGroup({ auth, userId: selectedContact.contact_id, groupId: gId });
        if (res?.success) {
          await ipc.db?.upsertGroupMember({
            zaloId: activeAccountId,
            groupId: gId,
            member: {
              memberId: selectedContact.contact_id,
              displayName: selectedContact.display_name || '',
              avatar: selectedContact.avatar_url || '',
              role: 0
            }
          });
        } else {
          Logger.warn(`[AddUserToGroup] Failed for ${gId}:`, res?.error);
        }
      } catch (err) {
        Logger.error(err);
      }

      if (i < groupIdsArray.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setIsRunningAdd(false);
    setAddProgress(null);
    setShowAddModal(false);
    await loadGroupsFromDB();
    if (selectedGroupId) {
      await loadMembersFromDB(selectedGroupId);
    }
  };

  const handleRemoveUserFromGroups = async () => {
    if (!activeAccountId || selectedMemberIds.size !== 1 || checkedRemoveGroupIds.size === 0) return;
    setIsRunningRemove(true);
    const targetId = Array.from(selectedMemberIds)[0];
    const groupIdsArray = Array.from(checkedRemoveGroupIds);
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) {
      setIsRunningRemove(false);
      return;
    }
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    for (let i = 0; i < groupIdsArray.length; i++) {
      const gId = groupIdsArray[i];
      const groupObj = groups.find(g => g.contact_id === gId);
      const groupName = groupObj?.display_name || gId;

      setRemoveProgress({
        current: i + 1,
        total: groupIdsArray.length,
        msg: `Đang xóa khỏi nhóm: ${groupName}...`
      });

      try {
        const res = await ipc.zalo?.removeUserFromGroup({ auth, userId: targetId, groupId: gId });
        if (res?.success) {
          await ipc.db?.removeGroupMember({ zaloId: activeAccountId, groupId: gId, memberId: targetId });
        } else {
          Logger.warn(`[RemoveUserFromGroup] Failed for ${gId}:`, res?.error);
        }
      } catch (err) {
        Logger.error(err);
      }

      if (i < groupIdsArray.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setIsRunningRemove(false);
    setRemoveProgress(null);
    setShowRemoveModal(false);
    setSelectedMemberIds(new Set());
    await loadGroupsFromDB();
    if (selectedGroupId) {
      await loadMembersFromDB(selectedGroupId);
    }
  };

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredGroups = groups.filter(g => {
    if (groupFilter === 'managed' && !managedGroupIds.has(g.contact_id)) return false;
    return (
      !searchGroup.trim() ||
      g.display_name.toLowerCase().includes(searchGroup.toLowerCase()) ||
      g.contact_id.includes(searchGroup)
    );
  });
  const filteredMembers = members.filter(m =>
    !searchMember.trim() ||
    m.display_name.toLowerCase().includes(searchMember.toLowerCase()) ||
    m.member_id.includes(searchMember)
  );
  const filteredContacts = allContacts.filter(c =>
    !searchContact.trim() ||
    (c.display_name || '').toLowerCase().includes(searchContact.toLowerCase()) ||
    (c.phone || '').includes(searchContact) ||
    (c.contact_id || '').includes(searchContact)
  );

  const allFilteredSelected = filteredMembers.length > 0 &&
    filteredMembers.every(m => selectedMemberIds.has(m.member_id));

  const formatTime = (ts: number) =>
    ts ? new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  if (!activeAccountId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState icon={GroupIcon} title="Chưa chọn tài khoản" desc="Chọn tài khoản Zalo để xem thành viên nhóm" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden relative">

      {/* ── Left: Groups ──────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-gray-700 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">
              Nhóm Zalo
              {groups.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">({groups.length})</span>}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Từ danh sách hội thoại</p>
          </div>
          {/* 3-dot menu */}
          <div ref={groupMenuRef} className="relative flex-shrink-0">
            <button
              onClick={() => setShowGroupMenu(v => !v)}
              disabled={groupsLoading}
              title="Tùy chọn đồng bộ nhóm"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-lg font-bold transition-colors leading-none">
              ⋮
            </button>
            {showGroupMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-30 min-w-[210px] overflow-hidden py-1">
                <button
                  onClick={() => { fetchGroupsFromAPI(); setShowGroupMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left">
                  {groupsLoading ? SpinIcon : RefreshIcon}
                  <span>Tải toàn bộ nhóm từ Zalo</span>
                </button>
                <button
                  onClick={() => { setShowLinkScanModal(true); setLinkScanInput(''); setLinkScanError(''); setLinkScanResult(null); setShowGroupMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  <span>Quét nhóm theo link</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {groups.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-700/50 flex-shrink-0 flex flex-col gap-2">
            <input type="text" value={searchGroup} onChange={e => setSearchGroup(e.target.value)}
              placeholder="Tìm nhóm..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            
            <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700">
              <button
                onClick={() => setGroupFilter('all')}
                className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${groupFilter === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Tất cả ({groups.length})
              </button>
              <button
                onClick={() => setGroupFilter('managed')}
                className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${groupFilter === 'managed' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Tôi quản lý ({managedGroupIds.size})
              </button>
            </div>

            {groupFilter === 'managed' && managedGroupIds.size > 0 && (
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm"
              >
                <span>➕ Thêm người vào nhóm</span>
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <EmptyState icon={GroupIcon} title="Chưa có dữ liệu nhóm"
              desc={<>Nhấn <span className="text-blue-400 font-medium">Tải từ API</span> để đồng bộ nhóm từ Zalo.</>} />
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-gray-500">
              {groupFilter === 'managed'
                ? 'Bạn chưa có nhóm nào làm Trưởng/Phó nhóm, hoặc cần nhấn "Tải toàn bộ nhóm từ Zalo" để cập nhật thông tin vai trò.'
                : 'Không tìm thấy nhóm'}
            </div>
          ) : (
            <div className="py-1">
              {filteredGroups.map(group => (
                  <button key={group.contact_id} onClick={() => setSelectedGroupId(group.contact_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-700/50 transition-colors
                    ${selectedGroupId === group.contact_id ? 'bg-blue-500/10 border-r-2 border-blue-500' : ''}`}>
                  <GroupAvatar
                    avatarUrl={group.avatar_url}
                    groupInfo={activeAccountId ? (groupInfoCache[activeAccountId] || {})[group.contact_id] : undefined}
                    name={group.display_name}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{group.display_name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {group.memberCount > 0 ? `${group.memberCount} thành viên` : 'Chưa có thành viên'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Members ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedGroup ? (
          <EmptyState icon={GroupIcon} title="Chọn một nhóm để xem thành viên"
            desc={groups.length === 0
              ? 'Hãy tải danh sách nhóm từ API trước.'
              : 'Chọn một nhóm bên trái để xem danh sách thành viên.'} />
        ) : (
          <>
            {/* Members header */}
            <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-3 flex-shrink-0 flex-wrap">
              <GroupAvatar
                avatarUrl={selectedGroup.avatar_url}
                groupInfo={activeAccountId ? (groupInfoCache[activeAccountId] || {})[selectedGroup.contact_id] : undefined}
                name={selectedGroup.display_name}
                size="xs"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">{selectedGroup.display_name}</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {members.length > 0
                    ? <>{members.length} thành viên{membersLastFetched > 0 && <span className="ml-2 text-gray-600">· {formatTime(membersLastFetched)}</span>}</>
                    : 'Chưa có dữ liệu thành viên'}
                </p>
              </div>
              {/* Tải thành viên (getGroupMembersInfo, auto-fallback getUserInfo) */}
              <button onClick={fetchMembersFromAPI} disabled={membersLoading || manualLoadProgress !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors flex-shrink-0">
                {membersLoading ? SpinIcon : RefreshIcon}
                {membersLoading ? 'Đang tải...' : 'Tải thông tin thành viên'}
              </button>
              {/* Nút lên lịch thông báo — chỉ hiện khi là quản lý nhóm */}
              {selectedGroupId && managedGroupIds.has(selectedGroupId) && (
                <button
                  onClick={() => { setPinMessage(''); setPinScheduleSaved(false); setShowPinScheduler(true); }}
                  title="Lên lịch ghím thông báo cho nhóm"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Lên lịch thông báo
                </button>
              )}

              {/* Stop button shown only during getUserInfo fallback */}
              {manualLoadProgress !== null && (
                <button onClick={() => { manualLoadStopRef.current = true; }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors flex-shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  Dừng
                </button>
              )}
            </div>

            {/* getUserInfo fallback progress bar */}
            {manualLoadProgress !== null && (
              <div className="mx-4 mt-2 mb-1 flex-shrink-0">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span className="flex items-center gap-1.5">
                    {SpinIcon}
                    <span>Đang tải thông tin thành viên: <span className="text-white font-medium">{manualLoadProgress.current}</span>/{manualLoadProgress.total}</span>
                  </span>
                  <span className="text-blue-400 font-medium">
                    {Math.round((manualLoadProgress.current / manualLoadProgress.total) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-200"
                    style={{ width: `${(manualLoadProgress.current / manualLoadProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Search + select-all row */}
            <div className="px-4 py-2 border-b border-gray-700/50 flex items-center gap-2 flex-shrink-0">
              {members.length > 0 && (
                <button onClick={allFilteredSelected ? clearSelection : selectAllMembers}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors border
                    ${allFilteredSelected
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30'
                      : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'}`}>
                  {allFilteredSelected ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      Bỏ chọn tất cả
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>
                      Chọn tất cả ({filteredMembers.length})
                    </>
                  )}
                </button>
              )}
              <input type="text" value={searchMember} onChange={e => setSearchMember(e.target.value)}
                     placeholder="Tìm thành viên..."
                     className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto pb-16">
              {members.length === 0 ? (
                <EmptyState
                  icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                  title="Chưa có dữ liệu thành viên"
                  desc={<>Nhấn <span className="text-blue-400 font-medium">Tải thành viên</span> để đồng bộ từ Zalo về DB.<br/><span className="text-gray-600 text-[11px]">Lưu ý: cần tải nhóm từ API trước để có danh sách UID.</span></>}
                />
              ) : filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center h-16 text-xs text-gray-500">Không tìm thấy thành viên</div>
              ) : (
                <div className="p-2 space-y-0.5">
                  {filteredMembers.map(member => {
                    const rl = roleLabel(member.role);
                    const isSelected = selectedMemberIds.has(member.member_id);
                    return (
                      <div key={member.member_id}
                        onClick={() => toggleMember(member.member_id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors select-none
                          ${isSelected ? 'bg-blue-500/15 border border-blue-500/30' : 'hover:bg-gray-800/60 border border-transparent'}`}>
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                          ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-800'}`}>
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </div>
                        <Avatar src={member.avatar} name={member.display_name || member.member_id} size={34} />
                        <div className="flex-1 min-w-0">
                          {member.display_name
                            ? <p className="text-sm text-white truncate font-medium">{member.display_name}</p>
                            : <p className="text-sm text-gray-500 truncate italic">
                                Chưa có tên —{' '}
                                {member.phone
                                  ? <PhoneDisplay phone={member.phone} className="text-gray-400" />
                                  : member.member_id}
                              </p>}
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {member.phone
                              ? <>
                                  <PhoneDisplay phone={member.phone} className="text-green-400" />
                                  <div className="text-gray-600">{member.member_id}</div>
                                </>
                              : member.display_name ? member.member_id : null}
                          </div>
                        </div>
                        <span className={`text-[11px] font-medium flex-shrink-0 ${rl.cls}`}>{rl.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Bottom action bar (when members selected) ─────────────────── */}
            {selectedMemberIds.size > 0 && (
              <div className="absolute bottom-0 left-72 right-0 bg-gray-800/95 backdrop-blur border-t border-gray-600 px-5 py-3 flex items-center gap-3 z-10">
                <span className="text-sm text-white font-medium">
                  Đã chọn <span className="text-blue-400">{selectedMemberIds.size}</span> thành viên
                </span>
                <div className="flex-1"/>
                <button onClick={clearSelection}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors">
                  Bỏ chọn
                </button>
                {selectedMemberIds.size === 1 && (
                  <button onClick={() => setShowRemoveModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                      <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                    </svg>
                    Xóa khỏi các nhóm
                  </button>
                )}
                <button onClick={openCampaignPicker}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                  Thêm vào chiến dịch
                </button>
                <button onClick={() => setShowAddToContacts(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                  Thêm vào liên hệ
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Campaign picker modal ──────────────────────────────────────────── */}
      {showCampaignPicker && !showCreateCampaign && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowCampaignPicker(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-80 p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-white">Thêm vào chiến dịch</h3>
              <button
                onClick={() => setShowCreateCampaign(true)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg hover:bg-blue-500/10">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Tạo mới
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Áp dụng cho <span className="text-blue-400 font-medium">{selectedMemberIds.size}</span> thành viên đã chọn
            </p>

            {localCampaigns.length === 0 ? (
              <div className="py-6 flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-300 font-medium">Chưa có chiến dịch nào</p>
                  <p className="text-xs text-gray-500 mt-1">Tạo chiến dịch mới để bắt đầu gửi tin</p>
                </div>
                <button
                  onClick={() => setShowCreateCampaign(true)}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors flex items-center justify-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Tạo chiến dịch mới
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto mb-4">
                {localCampaigns.map((c: any) => (
                  <button key={c.id} onClick={() => setPickedCampaignId(c.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors
                      ${pickedCampaignId === c.id ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.status === 'active' ? 'bg-green-400' : c.status === 'paused' ? 'bg-yellow-400' : 'bg-gray-500'}`} />
                      {c.name}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5 pl-3">{c.total_contacts ?? 0} liên hệ</span>
                  </button>
                ))}
              </div>
            )}

            {localCampaigns.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => setShowCampaignPicker(false)}
                  className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">
                  Hủy
                </button>
                <button onClick={handleAddToCampaign}
                  disabled={!pickedCampaignId || addingToCampaign}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  {addingToCampaign ? 'Đang thêm...' : `Thêm ${selectedMemberIds.size} thành viên`}
                </button>
              </div>
            )}
            {localCampaigns.length === 0 && (
              <button onClick={() => setShowCampaignPicker(false)}
                className="w-full mt-2 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">
                Hủy
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Create campaign popup (from picker) ───────────────────────────── */}
      {showCreateCampaign && (
        <CampaignCreateModal
          onClose={() => setShowCreateCampaign(false)}
          onSave={async (data) => {
            await handleCreateCampaignInPicker(data);
            setShowCreateCampaign(false);
          }}
        />
      )}

      {/* ── Add to contacts modal ─────────────────────────────────────────── */}
      {showAddToContacts && (
        <AddToContactsModal
          contacts={members
            .filter(m => selectedMemberIds.has(m.member_id))
            .map(m => ({
              contactId: m.member_id,
              displayName: m.display_name || m.member_id,
              avatar: m.avatar || '',
              phone: m.phone || '',
            }))}
          onClose={() => setShowAddToContacts(false)}
          onDone={() => {
            setSelectedMemberIds(new Set());
            setShowAddToContacts(false);
          }}
        />
      )}

      {/* ── Scan by link modal ─────────────────────────────────────────────── */}
      {showLinkScanModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => { if (!linkScanLoading) setShowLinkScanModal(false); }}>
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-[420px] p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Quét nhóm theo link</h3>
                <p className="text-xs text-gray-400 mt-0.5">Nhập link mời nhóm Zalo để lấy thông tin &amp; thành viên</p>
              </div>
            </div>

            {/* Input */}
            <div className="mb-4">
              <label className="text-xs text-gray-400 mb-1.5 block">Đường dẫn nhóm</label>
              <input
                value={linkScanInput}
                onChange={e => setLinkScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !linkScanLoading) scanGroupByLink(); }}
                placeholder="https://zalo.me/g/..."
                disabled={linkScanLoading}
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-60"
              />
            </div>

            {/* Progress bar */}
            {linkScanProgress !== null && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    {SpinIcon}
                    <span>Đang tải thông tin thành viên: <span className="text-white font-medium">{linkScanProgress.current}</span>/{linkScanProgress.total}</span>
                  </span>
                  <span className="text-purple-400 font-medium">{Math.round((linkScanProgress.current / linkScanProgress.total) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-200"
                    style={{ width: `${(linkScanProgress.current / linkScanProgress.total) * 100}%` }} />
                </div>
                <button onClick={() => { linkScanStopRef.current = true; }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors">
                  Dừng tải thông tin
                </button>
              </div>
            )}

            {/* Loading state */}
            {linkScanLoading && linkScanProgress === null && (
              <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
                {SpinIcon}
                <span>Đang lấy thông tin nhóm từ Zalo...</span>
              </div>
            )}

            {/* Error */}
            {linkScanError && (
              <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                ⚠️ {linkScanError}
              </div>
            )}

            {/* Success result */}
            {linkScanResult && !linkScanLoading && (
              <div className="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-xl text-xs text-green-400">
                ✅ Đã quét xong nhóm <span className="font-semibold text-green-300">"{linkScanResult.name}"</span>
                <span className="text-gray-500 ml-1">({linkScanResult.groupId})</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowLinkScanModal(false)}
                disabled={linkScanLoading && linkScanProgress !== null}
                className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 disabled:opacity-40 transition-colors">
                {linkScanResult && !linkScanLoading ? 'Đóng' : 'Hủy'}
              </button>
              {!linkScanResult && (
                <button
                  onClick={scanGroupByLink}
                  disabled={linkScanLoading || !linkScanInput.trim()}
                  className="flex-1 py-2 rounded-xl bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                  {linkScanLoading ? <>{SpinIcon} Đang quét...</> : '🔍 Quét nhóm'}
                </button>
              )}
              {linkScanResult && !linkScanLoading && (
                <button
                  onClick={() => { setLinkScanInput(''); setLinkScanResult(null); setLinkScanError(''); }}
                  className="flex-1 py-2 rounded-xl bg-purple-600 text-white text-sm hover:bg-purple-700 transition-colors">
                  Quét link khác
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Group fetch progress modal ─────────────────────────────────────── */}
      {groupFetchProgress !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-[420px] p-6 shadow-2xl">

            {groupFetchProgress.phase === 'groups' ? (
              /* ── Phase 1: Sync groups ── */
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    {SpinIcon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">Đang đồng bộ nhóm Zalo</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Tổng cộng <span className="text-white font-medium">{groupFetchProgress.total}</span> nhóm · Bước 1/2</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-gray-400">
                    Đã xử lý: <span className="text-white font-semibold">{groupFetchProgress.current}</span>
                    <span className="text-gray-600"> / {groupFetchProgress.total}</span>
                  </span>
                  <span className="text-blue-400 font-semibold text-sm">
                    {Math.round((groupFetchProgress.current / groupFetchProgress.total) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
                    style={{ width: `${(groupFetchProgress.current / groupFetchProgress.total) * 100}%` }} />
                </div>
                <p className="text-[11px] text-gray-500 mt-3 text-center">
                  Vui lòng không đóng cửa sổ trong khi đồng bộ...
                </p>
              </>
            ) : (
              /* ── Phase 2: Enrich member details ── */
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                    {SpinIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm">Đang tải chi tiết thành viên · Bước 2/2</h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Nhóm <span className="text-white font-medium">{groupFetchProgress.groupCurrent}/{groupFetchProgress.groupTotal}</span>
                      {groupFetchProgress.currentGroupName && (
                        <span className="ml-1 text-gray-500 truncate">· {groupFetchProgress.currentGroupName}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Group progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">Tiến độ nhóm</span>
                    <span className="text-green-400 font-semibold">
                      {Math.round((groupFetchProgress.groupCurrent / groupFetchProgress.groupTotal) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-300"
                      style={{ width: `${(groupFetchProgress.groupCurrent / groupFetchProgress.groupTotal) * 100}%` }} />
                  </div>
                </div>

                {/* Member progress */}
                {groupFetchProgress.memberTotal > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">
                        Thành viên: <span className="text-white">{groupFetchProgress.memberCurrent}</span>/{groupFetchProgress.memberTotal}
                      </span>
                      <span className="text-blue-400 font-semibold">
                        {Math.round((groupFetchProgress.memberCurrent / groupFetchProgress.memberTotal) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
                        style={{ width: `${(groupFetchProgress.memberCurrent / groupFetchProgress.memberTotal) * 100}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <p className="text-[11px] text-gray-600">Đang tải SĐT + thông tin thành viên từ Zalo...</p>
                  <button
                    onClick={() => { bulkEnrichStopRef.current = true; }}
                    className="flex-shrink-0 ml-3 px-3 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors">
                    Bỏ qua
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Add User to Multiple Groups ────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!isRunningAdd) setShowAddModal(false); }}>
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-[480px] max-w-full p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="font-semibold text-white text-sm">Thêm người vào nhiều nhóm</h3>
              <button onClick={() => setShowAddModal(false)} disabled={isRunningAdd}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700">✕</button>
            </div>
            
            {isRunningAdd && addProgress ? (
              <div className="py-8 text-center flex flex-col items-center gap-3">
                {SpinIcon}
                <p className="text-xs text-gray-300 font-medium">{addProgress.msg}</p>
                <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden mt-2">
                  <div className="bg-blue-500 h-full transition-all duration-300"
                    style={{ width: `${(addProgress.current / addProgress.total) * 100}%` }} />
                </div>
                <span className="text-[10px] text-gray-500">{addProgress.current}/{addProgress.total} nhóm</span>
              </div>
            ) : (
              <>
                {/* Step 1: Select User */}
                <div className="mb-4 flex flex-col overflow-hidden min-h-[160px] max-h-[220px]">
                  <span className="text-xs font-semibold text-gray-300 mb-1.5 block">1. Chọn liên hệ</span>
                  <input type="text" value={searchContact} onChange={e => setSearchContact(e.target.value)}
                    placeholder="Tìm theo tên hoặc SĐT..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 mb-2 focus:outline-none focus:border-blue-500" />
                  
                  <div className="flex-1 overflow-y-auto border border-gray-700 rounded-lg p-1 bg-gray-900/50 space-y-0.5">
                    {filteredContacts.length === 0 ? (
                      <div className="text-center py-4 text-xs text-gray-500">Không tìm thấy liên hệ nào</div>
                    ) : (
                      filteredContacts.map(c => {
                        const isSelected = selectedContact?.contact_id === c.contact_id;
                        return (
                          <button key={c.contact_id} onClick={() => setSelectedContact(c)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors
                              ${isSelected ? 'bg-blue-600 text-white font-medium' : 'text-gray-300 hover:bg-gray-800'}`}>
                            <Avatar src={c.avatar_url} name={c.display_name} size={24} />
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{c.display_name || c.contact_id}</p>
                              {c.phone && <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>{c.phone}</p>}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Step 2: Select Groups */}
                {selectedContact && (
                  <div className="mb-4 flex flex-col overflow-hidden min-h-[160px] max-h-[220px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-300">2. Chọn nhóm muốn thêm</span>
                      <button onClick={() => {
                        const notIn = groups.filter(g => managedGroupIds.has(g.contact_id) && !existingGroupMembers[g.contact_id]?.has(selectedContact.contact_id));
                        setCheckedGroupIds(new Set(notIn.map(g => g.contact_id)));
                      }}
                        className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-medium">Chọn tất cả</button>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-gray-700 rounded-lg p-1 bg-gray-900/50 space-y-0.5">
                      {groups.filter(g => managedGroupIds.has(g.contact_id)).length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-500">Không có nhóm nào bạn làm Trưởng/Phó nhóm</div>
                      ) : (
                        groups.filter(g => managedGroupIds.has(g.contact_id)).map(g => {
                          const isAlreadyIn = existingGroupMembers[g.contact_id]?.has(selectedContact.contact_id);
                          const isChecked = checkedGroupIds.has(g.contact_id);
                          return (
                            <div key={g.contact_id} onClick={() => {
                              if (isAlreadyIn) return;
                              setCheckedGroupIds(prev => {
                                const next = new Set(prev);
                                next.has(g.contact_id) ? next.delete(g.contact_id) : next.add(g.contact_id);
                                return next;
                              });
                            }}
                              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors select-none
                                ${isAlreadyIn ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-800 cursor-pointer'}`}>
                              <input type="checkbox" checked={isChecked || isAlreadyIn} disabled={isAlreadyIn} onChange={() => {}}
                                className="rounded text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500" />
                              <GroupAvatar avatarUrl={g.avatar_url} name={g.display_name} size="xs" />
                              <span className="flex-1 truncate text-gray-200">{g.display_name}</span>
                              {isAlreadyIn && <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">Đã tham gia</span>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end mt-2 flex-shrink-0">
                  <button onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold transition-colors">
                    Hủy
                  </button>
                  <button onClick={handleAddUserToGroups} disabled={!selectedContact || checkedGroupIds.size === 0}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors">
                    Xác nhận thêm
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Remove User from Multiple Groups ────────────────────────── */}
      {showRemoveModal && selectedMemberIds.size === 1 && (
        (() => {
          const targetId = Array.from(selectedMemberIds)[0];
          const memberObj = members.find(m => m.member_id === targetId);
          return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
              onClick={() => { if (!isRunningRemove) setShowRemoveModal(false); }}>
              <div className="bg-gray-800 border border-gray-700 rounded-2xl w-[440px] max-w-full p-5 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <h3 className="font-semibold text-white text-sm">Xóa thành viên khỏi nhóm</h3>
                  <button onClick={() => setShowRemoveModal(false)} disabled={isRunningRemove}
                    className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700">✕</button>
                </div>

                {isRunningRemove && removeProgress ? (
                  <div className="py-8 text-center flex flex-col items-center gap-3">
                    {SpinIcon}
                    <p className="text-xs text-gray-300 font-medium">{removeProgress.msg}</p>
                    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden mt-2">
                      <div className="bg-red-500 h-full transition-all duration-300"
                        style={{ width: `${(removeProgress.current / removeProgress.total) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500">{removeProgress.current}/{removeProgress.total} nhóm</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-700/50 mb-4 flex-shrink-0">
                      <Avatar src={memberObj?.avatar} name={memberObj?.display_name || targetId} size={36} />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">Thành viên</p>
                        <p className="text-sm font-semibold text-white truncate">{memberObj?.display_name || targetId}</p>
                        {memberObj?.phone && <p className="text-[10px] text-green-400 font-medium">{memberObj.phone}</p>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-gray-300">Chọn nhóm muốn xóa thành viên khỏi:</span>
                      <div className="flex gap-2">
                        <button onClick={() => setCheckedRemoveGroupIds(new Set(memberGroups.map(g => g.group_id)))}
                          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-medium">Chọn tất cả</button>
                        <span className="text-gray-600 text-[10px]">|</span>
                        <button onClick={() => setCheckedRemoveGroupIds(new Set())}
                          className="text-[10px] text-gray-400 hover:text-gray-300 transition-colors font-medium">Bỏ chọn</button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-gray-700 rounded-lg p-1 bg-gray-900/50 space-y-0.5 mb-4">
                      {memberGroups.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-500">
                          Thành viên này không thuộc nhóm quản lý nào của bạn.
                        </div>
                      ) : (
                        memberGroups.map(mg => {
                          const isChecked = checkedRemoveGroupIds.has(mg.group_id);
                          const gObj = groups.find(g => g.contact_id === mg.group_id);
                          const gName = gObj?.display_name || mg.group_id;
                          return (
                            <div key={mg.group_id} onClick={() => {
                              setCheckedRemoveGroupIds(prev => {
                                const next = new Set(prev);
                                next.has(mg.group_id) ? next.delete(mg.group_id) : next.add(mg.group_id);
                                return next;
                              });
                            }}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-gray-800 cursor-pointer transition-colors select-none">
                              <input type="checkbox" checked={isChecked} onChange={() => {}}
                                className="rounded text-red-600 bg-gray-800 border-gray-600 focus:ring-red-500" />
                              <GroupAvatar avatarUrl={gObj?.avatar_url} name={gName} size="xs" />
                              <span className="flex-1 truncate text-gray-200">{gName}</span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="flex gap-2 justify-end flex-shrink-0">
                      <button onClick={() => setShowRemoveModal(false)}
                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold transition-colors">
                        Hủy
                      </button>
                      <button onClick={handleRemoveUserFromGroups} disabled={checkedRemoveGroupIds.size === 0}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors">
                        Xác nhận xóa ({checkedRemoveGroupIds.size})
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* ── Pin Scheduler Modal ─────────────────────────────────────────────── */}
      {showPinScheduler && selectedGroup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => { if (!isSavingPinSchedule) setShowPinScheduler(false); }}>
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-[420px] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-700 bg-gray-800/80">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Lên lịch thông báo nhóm</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">{selectedGroup.display_name}</p>
              </div>
              <button onClick={() => setShowPinScheduler(false)}
                className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Message content */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Nội dung thông báo</label>
                <textarea
                  value={pinMessage}
                  onChange={e => setPinMessage(e.target.value)}
                  placeholder="📢 Nhắc nhở: Họp nhóm vào thứ Hai tuần tới lúc 9h sáng. Anh/chị vui lòng tham gia đúng giờ!"
                  rows={4}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Schedule type */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Lặp lại</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{v:'once',l:'🎯 Một lần'},{v:'daily',l:'📅 Mỗi ngày'},{v:'weekly',l:'🗓 Hàng tuần'}].map(t => (
                    <button key={t.v} type="button" onClick={() => setPinScheduleType(t.v as any)}
                      className={`py-2 rounded-xl border text-[11px] font-medium transition-colors ${
                        pinScheduleType === t.v
                          ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                          : 'bg-gray-700/50 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time + Weekday */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Thời gian gửi</label>
                  <input
                    type="time"
                    value={pinScheduleTime}
                    onChange={e => setPinScheduleTime(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                {pinScheduleType === 'weekly' && (
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 font-medium mb-1.5 block">Ngày trong tuần</label>
                    <select value={pinScheduleWeekday} onChange={e => setPinScheduleWeekday(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
                      {[{v:'1',l:'Thứ Hai'},{v:'2',l:'Thứ Ba'},{v:'3',l:'Thứ Tư'},{v:'4',l:'Thứ Năm'},{v:'5',l:'Thứ Sáu'},{v:'6',l:'Thứ Bảy'},{v:'0',l:'Chủ Nhật'}].map(d => (
                        <option key={d.v} value={d.v}>{d.l}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Info banner */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 text-[11px] text-amber-400/80 space-y-1">
                <p>📌 Workflow sẽ tự động tạo để gửi tin nhắn nhắc nhở đến nhóm theo lịch.</p>
                <p>💡 Tin nhắn sẽ được gửi như tin nhắn thường, không phải ghim thật trong Zalo.</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowPinScheduler(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-colors">
                  Hủy
                </button>
                <button
                  onClick={handleSavePinSchedule}
                  disabled={!pinMessage.trim() || isSavingPinSchedule}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {isSavingPinSchedule ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                  ) : pinScheduleSaved ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Đã lưu!</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Lên lịch</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
