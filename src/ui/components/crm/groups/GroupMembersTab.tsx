import React, { useEffect, useState, useCallback, useRef } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { useCRMStore } from '@/store/crmStore';
import PhoneDisplay from '@/components/common/PhoneDisplay';
import GroupAvatar from '@/components/common/GroupAvatar';
import CampaignCreateModal from '@/components/crm/campaigns/CampaignCreateModal';
import AddToContactsModal from '@/components/crm/contacts/AddToContactsModal';
import BulkGroupManageModal from '../modals/BulkGroupManageModal';
import SmartGroupModal from '../modals/SmartGroupModal';
import { syncZaloGroups, MemberPlaceholder, SyncGroupsProgress } from '@/lib/zaloGroupUtils';
import Logger from '../../../../utils/Logger';
import useIsMobile from '@/hooks/useIsMobile';

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
  if (role === 2) return { text: '👑 Trưởng nhóm', cls: 'text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30' };
  if (role === 1) return { text: '🛡️ Phó nhóm', cls: 'text-sky-400 font-semibold bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/30' };
  return { text: 'Thành viên', cls: 'text-gray-400' };
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
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const RefreshIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.97" />
  </svg>
);
const SpinIcon = (
  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default function GroupMembersTab() {
  const isMobile = useIsMobile();
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
  const [groupFilter, setGroupFilter] = useState<'managed' | 'not_managed'>('managed');
  const [managedGroupIds, setManagedGroupIds] = useState<Set<string>>(new Set());

  // ── Bulk Group management modal state ───────────────────────────────────
  const [showBulkGroupModal, setShowBulkGroupModal] = useState<'add' | 'remove' | null>(null);

  // ── Selected groups state for SmartGroupModal ─────────────────────────────
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [showSmartGroupModal, setShowSmartGroupModal] = useState(false);

  // ── Group link & ID copy state ─────────────────────────────────────────────
  const [currentGroupLink, setCurrentGroupLink] = useState<string>('');
  const [copyingLink, setCopyingLink] = useState(false);
  const [copiedLinkSuccess, setCopiedLinkSuccess] = useState(false);

  useEffect(() => {
    setCurrentGroupLink('');
    setCopiedLinkSuccess(false);
  }, [selectedGroupId]);

  const handleCopyGroupId = useCallback(async () => {
    if (!selectedGroupId) return;
    const rawGid = selectedGroupId.startsWith('g') ? selectedGroupId.slice(1) : selectedGroupId;
    await navigator.clipboard.writeText(rawGid).catch(() => {});
    useAppStore.getState().showNotification(`📋 Đã sao chép ID nhóm: ${rawGid}`, 'success');
  }, [selectedGroupId]);

  const handleCopyGroupLink = useCallback(async () => {
    if (!activeAccountId || !selectedGroupId) return;
    setCopyingLink(true);
    try {
      const rawGid = selectedGroupId.startsWith('g') ? selectedGroupId.slice(1) : selectedGroupId;

      // 1. Ưu tiên lấy trực tiếp từ Cache (Instant Copy 0ms)
      const cachedInfo = (groupInfoCache[activeAccountId] || {})[rawGid] || (groupInfoCache[activeAccountId] || {})[selectedGroupId];
      const cachedLinkId = cachedInfo?.linkId || cachedInfo?.link_id || cachedInfo?.groupLink || cachedInfo?.link;
      if (cachedLinkId && !/^\d{15,22}$/.test(String(cachedLinkId))) {
        const link = String(cachedLinkId).startsWith('http') ? String(cachedLinkId) : `https://zalo.me/g/${cachedLinkId}`;
        setCurrentGroupLink(link);
        await navigator.clipboard.writeText(link);
        setCopiedLinkSuccess(true);
        setTimeout(() => setCopiedLinkSuccess(false), 3000);
        useAppStore.getState().showNotification(`📋 Đã sao chép link nhóm: ${link}`, 'success');
        setCopyingLink(false);
        return;
      }

      // 2. Nếu Cache chưa có linkId thì mới gọi API Zalo để lấy bổ sung
      const acc = useAccountStore.getState().getActiveAccount();
      if (!acc) throw new Error('Không tìm thấy tài khoản Zalo hoạt động');
      const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

      const infoRes = await ipc.zalo?.getGroupInfo({ auth, groupId: rawGid });
      const gridMap: Record<string, any> =
        infoRes?.response?.gridInfoMap ?? infoRes?.response?.changed_groups ?? infoRes?.response?.data?.gridInfoMap ?? {};
      const gData = gridMap[rawGid] ?? gridMap[selectedGroupId] ?? Object.values(gridMap)[0];

      let link = '';
      if (gData) {
        const linkId = gData.linkId || gData.link_id || gData.linkJoin || gData.joinLink;
        if (linkId && !/^\d{15,22}$/.test(String(linkId))) {
          link = String(linkId).startsWith('http') ? String(linkId) : `https://zalo.me/g/${linkId}`;
        } else if (gData.groupLink || gData.inviteUrl || gData.link) {
          const rawLink = String(gData.groupLink || gData.inviteUrl || gData.link);
          if (rawLink && !rawLink.match(/\/g\/\d{15,22}$/)) {
            link = rawLink;
          }
        }
      }

      if (link) {
        setCurrentGroupLink(link);
        await navigator.clipboard.writeText(link);
        setCopiedLinkSuccess(true);
        setTimeout(() => setCopiedLinkSuccess(false), 3000);
        useAppStore.getState().showNotification(`📋 Đã sao chép link nhóm: ${link}`, 'success');
      } else {
        const fallbackLink = `https://zalo.me/g/${rawGid}`;
        setCurrentGroupLink(fallbackLink);
        await navigator.clipboard.writeText(fallbackLink);
        setCopiedLinkSuccess(true);
        setTimeout(() => setCopiedLinkSuccess(false), 3000);
        useAppStore.getState().showNotification(`📋 Đã sao chép link nhóm: ${fallbackLink}`, 'success');
      }
    } catch (err: any) {
      console.error('[GroupMembersTab] Copy group link error:', err);
      const rawGid = selectedGroupId.startsWith('g') ? selectedGroupId.slice(1) : selectedGroupId;
      const fallbackLink = `https://zalo.me/g/${rawGid}`;
      await navigator.clipboard.writeText(fallbackLink).catch(() => {});
      setCopiedLinkSuccess(true);
      setTimeout(() => setCopiedLinkSuccess(false), 3000);
      useAppStore.getState().showNotification(`📋 Đã sao chép link nhóm: ${fallbackLink}`, 'success');
    } finally {
      setCopyingLink(false);
    }
  }, [activeAccountId, selectedGroupId]);

  const toggleGroupSelected = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };


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

  // ── Sub-tab state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'members' | 'scan'>('members');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | 'admin' | 'member'>('all');

  // ── Quét nâng cao (Scan tab) state ──────────────────────────────────────
  const [scanLinkInput, setScanLinkInput] = useState('');
  const [scanTabLoading, setScanTabLoading] = useState(false);
  const [scanTabError, setScanTabError] = useState('');
  const [scanTabResults, setScanTabResults] = useState<Array<{ userId: string; displayName: string; avatar: string }>>([]);
  const [scanTabGroupId, setScanTabGroupId] = useState<string | null>(null);
  const [scanJoinLoading, setScanJoinLoading] = useState(false);
  const [scanJoinMsg, setScanJoinMsg] = useState('');
  const [scanJoinType, setScanJoinType] = useState<'idle' | 'success' | 'pending' | 'already' | 'error'>('idle');

  // ── Premium state ────────────────────────────────────────────────────────
  const [premiumLoaded, setPremiumLoaded] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<string | null>(null);

  // ── Red dot badge cho tab Quét nâng cao ──────────────────────────────────
  const [scanTabSeen, setScanTabSeen] = useState(() => {
    try { return localStorage.getItem('scanTabSeen') === 'true'; } catch { return false; }
  });

  // ── Resolved group info ──────────────────────────────────────────────────
  const [resolvedGroupInfo, setResolvedGroupInfo] = useState<{ groupId: string; name: string; avatar: string; creatorId?: string; adminIds?: string[] } | null>(null);


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
    const contactsRes = await ipc.crm?.getContacts({ zaloId: activeAccountId, opts: { contactType: 'group', limit: 10000 } });
    let allContacts: any[] = contactsRes?.contacts ?? (await ipc.db?.getContacts(activeAccountId))?.contacts ?? [];
    let groupContacts = allContacts.filter((c: any) => c.contact_type === 'group' || (c.contact_id && String(c.contact_id).startsWith('g')) || c.is_group);

    // Fallback: Nếu contacts table chưa nạp nhóm, lấy từ contactsWithFlags
    if (groupContacts.length === 0) {
      try {
        const directRes = await ipc.db?.getContactsWithFlags?.({ zaloId: activeAccountId });
        if (directRes?.contacts) {
          groupContacts = directRes.contacts.filter((c: any) => c.contact_type === 'group' || (c.contact_id && String(c.contact_id).startsWith('g')));
        }
      } catch {}
    }

    const allMembersRes = await ipc.db?.getAllGroupMembers({ zaloId: activeAccountId });
    const memberRows: any[] = allMembersRes?.rows ?? [];
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
    } catch (e: any) {
      console.error('[GroupMembersTab] fetchMembersFromAPI error:', e);
      useAppStore.getState().showNotification('Không thể tải thành viên: ' + (e?.message || 'Lỗi không xác định'), 'error');
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
      // ── Step 1: getGroupLinkInfo — phân trang đến khi hết (hasMoreMember = 0) ──
      let groupId = '';
      let name = '';
      let avatar = '';
      let creatorId = '';
      let adminIds: string[] = [];
      const currentMems: any[] = [];
      let page = 1;
      let isLockedLinkInfo = false;
      let totalMemberLinkInfo = 0;

      while (true) {
        if (linkScanStopRef.current) break;
        const res = await ipc.zalo?.getGroupLinkInfo({ auth, link: linkScanInput.trim(), memberPage: page });
        if (!res?.success) {
          setLinkScanError(res?.error || 'Không thể lấy thông tin nhóm. Kiểm tra lại đường dẫn.');
          return;
        }
        const data = res.response;
        if (page === 1) {
          groupId = data.groupId || '';
          name = data.name || data.groupId || '';
          avatar = data.fullAvt || data.avt || '';
          creatorId = (data.creatorId || '').replace(/_0$/, '');
          adminIds = (data.adminIds || []).map((a: string) => a.replace(/_0$/, ''));
          isLockedLinkInfo = data.setting?.lockViewMember === 1 || data.lockViewMember === 1 || data.setting?.lockViewMember === true;
          totalMemberLinkInfo = Number(data.totalMember || data.memberCount || 0);
        }
        const pageMems: any[] = data.currentMems || [];
        currentMems.push(...pageMems);

        if (!data.hasMoreMember) break;
        page++;
        // polite delay between pages to avoid rate limit
        await new Promise(r => setTimeout(r, 300));
      }

      if (!groupId) {
        setLinkScanError('Không tìm thấy thông tin nhóm từ link này.');
        return;
      }

      // ── Step 2: Save group contact to DB ─────────────────────────────────
      await ipc.db?.updateContactProfile({
        zaloId: activeAccountId, contactId: groupId,
        displayName: name, avatarUrl: avatar, phone: '', contactType: 'group',
      });

      // ── Step 3: Build + save initial member list ──────────────────────────
      const adminSet = new Set([creatorId, ...adminIds]);
      const memberIds: string[] = [];
      const memInfoMap: Record<string, { displayName: string; avatar: string; role: number }> = {};

      // ── [Option C] Fallback: nếu nhóm bị ẩn hoặc danh sách không đầy đủ
      let usedFallback = false;
      const isLockedLink = isLockedLinkInfo || currentMems.length === 0;
      if ((isLockedLink || (totalMemberLinkInfo > 0 && currentMems.length < totalMemberLinkInfo) || currentMems.length <= 15) && groupId) {
        Logger.log('[GroupMembersTab] Group is locked or incomplete → trying getGroupInfo fallback for', groupId);
        try {
          const gRes = await ipc.zalo?.getGroupInfo({ auth, groupId });
          if (gRes?.success) {
            const gridMap: Record<string, any> =
              gRes.response?.gridInfoMap ?? gRes.response?.changed_groups ?? gRes.response?.data?.gridInfoMap ?? {};
            const gData: any = gridMap[groupId] ?? Object.values(gridMap)[0];
            if (gData) {
              // Cập nhật lại adminIds/creatorId nếu getGroupInfo trả về đầy đủ hơn
              const gCreatorId = (gData.creatorId || creatorId).replace(/_0$/, '');
              const gAdminIds: string[] = (gData.adminIds || adminIds).map((a: string) => a.replace(/_0$/, ''));
              adminIds = gAdminIds;
              creatorId = gCreatorId;

              // Cập nhật lại tên và ảnh đại diện nếu có thông tin mới
              if (gData.name) name = gData.name;
              const gAvatar = gData.fullAvt || gData.avt || '';
              if (gAvatar) avatar = gAvatar;

              // Ưu tiên: memberIds > currentMems > memVerList keys
              const rawMemberIds: string[] = gData.memberIds || [];
              const rawCurrentMems: any[] = gData.currentMems || [];
              const memVerList = gData.memVerList;
              const memVerEntries: string[] =
                rawMemberIds.length > 0 ? rawMemberIds :
                  rawCurrentMems.length > 0 ? rawCurrentMems.map((m: any) => String(m.id || '')) :
                    (Array.isArray(memVerList) ? memVerList :
                      (memVerList && typeof memVerList === 'object' ? Object.keys(memVerList) : []));

              const tempIds = new Set<string>();
              for (const rawId of memVerEntries) {
                const memberId = rawId.replace(/_0$/, '').trim();
                if (!memberId || !/^\d+$/.test(memberId)) continue;
                tempIds.add(memberId);
              }

              const isLocked = gData.setting?.lockViewMember === 1 || gData.lockViewMember === 1 || gData.setting?.lockViewMember === true;
              const totalMember = Number(gData.totalMember || 0);

              // Nếu nhóm bị khóa danh sách hoặc số UID quét được nhỏ hơn tổng số thành viên thực tế
              // -> Kích hoạt công nghệ Quét Bóng Thụ Động (Passive Shadow Scanning - PSS)
              if (isLocked || (totalMember > 0 && tempIds.size < totalMember) || tempIds.size <= 5) {
                Logger.log(`[GroupMembersTab] Group is locked or incomplete (found ${tempIds.size}/${totalMember}) -> running Passive Shadow Scanning (PSS)...`);
                
                // 1. Quét lịch sử trò chuyện (100 tin nhắn gần nhất)
                try {
                  const histRes = await ipc.zalo?.getGroupChatHistory({ auth, groupId, count: 100 });
                  const msgs = histRes?.response?.groupMsgs || [];
                  for (const msg of msgs) {
                    // 1.1. Lấy thông tin người gửi tin nhắn
                    const senderId = msg.data?.uidFrom || msg.senderId;
                    if (senderId) {
                      const uid = String(senderId).replace(/_0$/, '').trim();
                      if (/^\d+$/.test(uid)) tempIds.add(uid);
                    }

                    // 1.2. Lấy thông tin người thả cảm xúc (Inline reactions)
                    const reactions = msg.reactions || msg.data?.reactions || [];
                    if (Array.isArray(reactions)) {
                      reactions.forEach((r: any) => {
                        const rUid = r.userId || r.uid || r.uidFrom;
                        if (rUid) {
                          const uid = String(rUid).replace(/_0$/, '').trim();
                          if (/^\d+$/.test(uid)) tempIds.add(uid);
                        }
                      });
                    }
                    const reactsObj = msg.reacts || msg.data?.reacts || {};
                    if (reactsObj && typeof reactsObj === 'object' && !Array.isArray(reactsObj)) {
                      Object.keys(reactsObj).forEach(rUid => {
                        const uid = String(rUid).replace(/_0$/, '').trim();
                        if (/^\d+$/.test(uid)) tempIds.add(uid);
                      });
                    }

                    // 1.3. Lấy thông tin người được nhắc tên (Mentions)
                    const mentions = msg.mentions || msg.data?.mentions || [];
                    if (Array.isArray(mentions)) {
                      mentions.forEach((m: any) => {
                        const mUid = m.uid || m.userId;
                        if (mUid) {
                          const uid = String(mUid).replace(/_0$/, '').trim();
                          if (/^\d+$/.test(uid)) tempIds.add(uid);
                        }
                      });
                    }

                    // 1.4. Lấy thông tin từ tin nhắn hệ thống (System messages metadata)
                    try {
                      const rawInfo = msg.msgInfo || msg.data?.msgInfo;
                      const info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
                      if (info && typeof info === 'object') {
                        const possibleKeys = ['memberId', 'operatorId', 'targetId', 'opId', 'creatorId'];
                        possibleKeys.forEach(k => {
                          const val = info[k];
                          if (val) {
                            const uid = String(val).replace(/_0$/, '').trim();
                            if (/^\d+$/.test(uid)) tempIds.add(uid);
                          }
                        });
                        const arrayKeys = ['mIds', 'uids', 'members'];
                        arrayKeys.forEach(k => {
                          const arr = info[k];
                          if (Array.isArray(arr)) {
                            arr.forEach((item: any) => {
                              const uid = String(item).replace(/_0$/, '').trim();
                              if (/^\d+$/.test(uid)) tempIds.add(uid);
                            });
                          }
                        });
                      }
                    } catch {}

                    try {
                      const rawParams = msg.params || msg.data?.params;
                      const params = typeof rawParams === 'string' ? JSON.parse(rawParams) : rawParams;
                      if (params && typeof params === 'object') {
                        const possibleKeys = ['memberId', 'operatorId', 'targetId', 'opId', 'creatorId'];
                        possibleKeys.forEach(k => {
                          const val = params[k];
                          if (val) {
                            const uid = String(val).replace(/_0$/, '').trim();
                            if (/^\d+$/.test(uid)) tempIds.add(uid);
                          }
                        });
                      }
                    } catch {}
                  }
                } catch (e) {
                  Logger.warn('[GroupMembersTab] getGroupChatHistory error:', e);
                }

                // 2. Quét bảng tin nhóm để tìm người viết bài, comment, reactions
                try {
                  const boardRes = await ipc.zalo?.getListBoard({ auth, options: { page: 1, count: 50 }, groupId });
                  const items = boardRes?.response?.items || [];
                  const pollIds: string[] = [];
                  for (const item of items) {
                    const creatorId = item.data?.creatorId || item.data?.params?.senderUid;
                    if (creatorId) {
                      const uid = String(creatorId).replace(/_0$/, '').trim();
                      if (/^\d+$/.test(uid)) tempIds.add(uid);
                    }
                    // Comments
                    const comments = item.data?.comments || item.comments || [];
                    comments.forEach((c: any) => {
                      const cUid = c.creatorId || c.uid || c.userId;
                      if (cUid) {
                        const uid = String(cUid).replace(/_0$/, '').trim();
                        if (/^\d+$/.test(uid)) tempIds.add(uid);
                      }
                    });
                    // Reactions
                    const likes = item.data?.likes || item.likes || [];
                    likes.forEach((l: any) => {
                      const lUid = l.userId || l.uid;
                      if (lUid) {
                        const uid = String(lUid).replace(/_0$/, '').trim();
                        if (/^\d+$/.test(uid)) tempIds.add(uid);
                      }
                    });
                    // Lấy Poll ID nếu có (BoardType.Poll = 3)
                    const pId = item.data?.poll_id || (item.boardType === 3 ? item.data?.id : null);
                    if (pId) {
                      pollIds.push(String(pId));
                    }
                  }

                  // 3. Quét chi tiết các bình chọn (Poll)
                  for (const pollId of pollIds) {
                    try {
                      const pollRes = await ipc.zalo?.getPollDetail({ auth, pollId });
                      const pollData = pollRes?.response?.data || pollRes?.response || {};
                      const options = pollData.options || [];
                      for (const opt of options) {
                        const voters = opt.voters || opt.userIds || [];
                        for (const voter of voters) {
                          const uid = String(voter.userId || voter).replace(/_0$/, '').trim();
                          if (/^\d+$/.test(uid)) tempIds.add(uid);
                        }
                      }
                    } catch (e) {
                      Logger.warn('[GroupMembersTab] getPollDetail error:', e);
                    }
                  }
                } catch (e) {
                  Logger.warn('[GroupMembersTab] getListBoard error:', e);
                }
              }

              // Đưa toàn bộ vào danh sách memberIds cuối cùng
              for (const id of tempIds) {
                memberIds.push(id);
              }

              if (memberIds.length > 0) {
                usedFallback = true;
                Logger.log(`[GroupMembersTab] Group scan completed: found ${memberIds.length} UIDs via fallback + interaction scanning`);
              }
            }
          }
        } catch (fbErr) {
          Logger.warn('[GroupMembersTab] getGroupInfo fallback error:', fbErr);
        }

        if (!usedFallback) {
          // getGroupInfo cũng không có data — tài khoản chưa join nhóm hoặc bị kick
          setLinkScanError(
            'Nhóm này đã bật khoá danh sách thành viên và tài khoản không phải thành viên của nhóm. ' +
            'Hãy dùng tài khoản đã tham gia nhóm để quét.'
          );
          return;
        }
      }

      // Build memInfoMap từ currentMems (nếu không dùng fallback)
      if (!usedFallback) {
        for (const mem of currentMems) {
          const memberId = String(mem.id || '').replace(/_0$/, '').trim();
          if (!memberId || !/^\d+$/.test(memberId)) continue;
          memberIds.push(memberId);
          let role = 0;
          if (memberId === creatorId) role = 2;
          else if (adminSet.has(memberId)) role = 1;
          memInfoMap[memberId] = { displayName: mem.dName || mem.zaloName || '', avatar: mem.avatar || mem.avatar_25 || '', role };
        }
      }

      // Gán role cho các uid lấy từ fallback (memVerList không có tên/avatar)
      const finalAdminSet = new Set([creatorId, ...adminIds]);
      for (const memberId of memberIds) {
        if (!memInfoMap[memberId]) {
          let role = 0;
          if (memberId === creatorId) role = 2;
          else if (finalAdminSet.has(memberId)) role = 1;
          memInfoMap[memberId] = { displayName: '', avatar: '', role };
        }
      }

      if (memberIds.length > 0) {
        const initMembers = memberIds.map(id => ({
          memberId: id,
          displayName: memInfoMap[id]?.displayName || '',
          avatar: memInfoMap[id]?.avatar || '',
          role: memInfoMap[id]?.role || 0,
        }));
        // mergeGroupMembers: giữ lại avatar/tên nếu nhóm này đã từng được scan trước đó
        await ipc.db?.mergeGroupMembers({ zaloId: activeAccountId, groupId, members: initMembers });
      }

      // Cập nhật lại thông tin nhóm vào contacts DB (đặc biệt hữu ích khi fallback quét được tên/ảnh thực tế của nhóm bị ẩn)
      await ipc.db?.updateContactProfile({
        zaloId: activeAccountId,
        contactId: groupId,
        displayName: name,
        avatarUrl: avatar,
        phone: '',
        contactType: 'group',
      });

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
              // mergeGroupMembers: giữ lại avatar cũ nếu batch getUserInfo không trả về
              if (updates.length > 0) await ipc.db?.mergeGroupMembers({ zaloId: activeAccountId, groupId, members: updates });
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
  const selectAllMembers = () => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      filteredMembers.forEach(m => next.add(m.member_id));
      return next;
    });
  };
  const unselectAllFilteredMembers = () => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      filteredMembers.forEach(m => next.delete(m.member_id));
      return next;
    });
  };
  const clearSelection = () => setSelectedMemberIds(new Set());

  const selectAdminMembers = () => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      members.filter(m => m.role === 1 || m.role === 2).forEach(m => next.add(m.member_id));
      return next;
    });
  };
  const unselectAdminMembers = () => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      members.filter(m => m.role === 1 || m.role === 2).forEach(m => next.delete(m.member_id));
      return next;
    });
  };

  const selectRegularMembers = () => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      members.filter(m => m.role === 0 || !m.role).forEach(m => next.add(m.member_id));
      return next;
    });
  };
  const unselectRegularMembers = () => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      members.filter(m => m.role === 0 || !m.role).forEach(m => next.delete(m.member_id));
      return next;
    });
  };

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
  const creatingCampaignRef = useRef(false);
  const handleCreateCampaignInPicker = useCallback(async (data: any) => {
    if (!activeAccountId || creatingCampaignRef.current) return;
    creatingCampaignRef.current = true;
    try {
      const res = await ipc.crm?.saveCampaign({ zaloId: activeAccountId, campaign: data });
      if (res?.success) {
        // Refresh local campaign list and auto-select the new one
        const res2 = await ipc.crm?.getCampaigns({ zaloId: activeAccountId });
        if (res2?.success) {
          const available = (res2.campaigns || []).filter((c: any) => c.status !== 'done');
          setLocalCampaigns(available);
          if (res.id) setPickedCampaignId(res.id);
        }
        setShowCreateCampaign(false);
      }
    } finally {
      creatingCampaignRef.current = false;
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
      const res = await ipc.crm?.addCampaignContacts({ zaloId: activeAccountId, campaignId: pickedCampaignId, contacts });
      if (res?.success) {
        if (res.limitExceeded) {
          useAppStore.getState().showNotification(
            `Chiến dịch chỉ cho tối đa 1000 người. Đã thêm ${res.addedCount} và loại bỏ ${res.discardedCount} người vượt quá.`,
            'warning'
          );
        } else {
          useAppStore.getState().showNotification(`Đã thêm ${res.addedCount || contacts.length} liên hệ vào chiến dịch`, 'success');
        }
      } else {
        useAppStore.getState().showNotification((res as any)?.error || 'Không thể thêm liên hệ', 'error');
      }
      setShowCampaignPicker(false);
      setSelectedMemberIds(new Set());
      setPickedCampaignId(null);
    } finally {
      setAddingToCampaign(false);
    }
  }, [activeAccountId, pickedCampaignId, selectedMemberIds, members]);

  // ── Helper: Resolve group link → get info + save to DB ────────────────────
  const resolveAndSaveGroupInfo = useCallback(async (auth: any, linkOrId: string): Promise<{ groupId: string; name: string; avatar: string; creatorId: string; adminIds: string[] } | null> => {
    try {
      const linkRes: any = await ipc.zalo?.getGroupLinkInfo({ auth, link: linkOrId, memberPage: 1 });
      if (!linkRes?.success || !linkRes?.response?.groupId) return null;
      const data = linkRes.response;
      const groupId = data.groupId || '';
      const name = data.name || data.groupId || '';
      const avatar = data.fullAvt || data.avt || '';
      const creatorId = String(data.creatorId || '').replace(/_0$/, '');
      const adminIds: string[] = (data.adminIds || []).map((a: string) => String(a).replace(/_0$/, ''));

      if (groupId && activeAccountId) {
        await ipc.db?.updateContactProfile({
          zaloId: activeAccountId, contactId: groupId,
          displayName: name, avatarUrl: avatar, phone: '', contactType: 'group',
        });
        await loadGroupsFromDB();
      }
      return { groupId, name, avatar, creatorId, adminIds };
    } catch (err) {
      console.warn('[GroupMembersTab] resolveAndSaveGroupInfo error:', err);
      return null;
    }
  }, [activeAccountId, loadGroupsFromDB]);

  // ── Scan from "Quét nâng cao" tab (Ủy quyền về Boss qua scanAdvancedGroup) ──────────────
  const handleScanTab = useCallback(async () => {
    if (!activeAccountId || !scanLinkInput.trim()) return;

    if (!isPremium) {
      setScanTabError('Cần kích hoạt gói Premium để sử dụng tính năng này. Bấm nút mua gói hoặc liên hệ hỗ trợ.');
      return;
    }

    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) { setScanTabError('Không tìm thấy tài khoản'); return; }

    setScanTabLoading(true);
    setScanTabError('');
    setScanTabResults([]);
    setScanTabGroupId(null);
    try {
      let result: any = null;

      // 1. Ưu tiên gọi qua IPC scanAdvancedGroup (Boss sẽ giải mã auth & quét an toàn)
      if (ipc.zalo?.scanAdvancedGroup) {
        result = await ipc.zalo.scanAdvancedGroup({
          zaloId: activeAccountId,
          linkOrGroupId: scanLinkInput.trim(),
        });
      } else {
        // Fallback cho môi trường không có Electron IPC
        const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
        let groupId = scanLinkInput.trim();
        if (groupId.includes('zalo.me') || groupId.includes('chat.zalo.me') || /^\d+$/.test(groupId)) {
          const info = await resolveAndSaveGroupInfo(auth, groupId);
          if (info) {
            groupId = info.groupId;
            setResolvedGroupInfo(info);
          }
        }
        const { scanGroupViaBackend } = await import('@/lib/backendService');
        result = await scanGroupViaBackend({
          pageId: activeAccountId,
          cookie: acc.cookies || '',
          imei: acc.imei || '',
          groupId,
        });
      }

      if (!result?.success) {
        setScanTabError(result?.error || 'Quét thất bại');
        return;
      }

      const groupId = result.groupId || scanLinkInput.trim();
      const members = result.members || [];
      if (result.groupInfo) {
        setResolvedGroupInfo(result.groupInfo);
      }

      setScanTabResults(members.map((m: any) => ({
        userId: m.userId || m.id,
        displayName: m.displayName || m.zaloName || m.userId || m.id,
        avatar: m.avatar || '',
      })));
      setScanTabGroupId(groupId);

      await loadGroupsFromDB();
      await loadMembersFromDB(groupId);
    } catch (err: any) {
      setScanTabError(err?.message || 'Lỗi không xác định khi quét nhóm');
    } finally {
      setScanTabLoading(false);
    }
  }, [activeAccountId, scanLinkInput, isPremium, loadGroupsFromDB, loadMembersFromDB, resolveAndSaveGroupInfo]);

  // ── Join group from scan tab ──────────────────────────────────────────
  const handleJoinFromScanTab = useCallback(async () => {
    if (!activeAccountId || !scanLinkInput.trim()) return;
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

    setScanJoinLoading(true);
    setScanJoinType('idle');
    setScanJoinMsg('');
    try {
      const info = await resolveAndSaveGroupInfo(auth, scanLinkInput.trim());
      if (info) setResolvedGroupInfo(info);

      const res = await ipc.zalo?.joinGroupLink({ auth, link: scanLinkInput.trim() });
      const errCode = res?.errorCode ?? res?.error_code ?? (res?.response?.error);
      if (errCode === 178 || res?.response?.msg?.includes('already')) {
        setScanJoinType('already');
        setScanJoinMsg('Bạn đã là thành viên của nhóm này.');
      } else if (errCode === 240 || res?.response?.msg?.includes('pending') || res?.response?.msg?.includes('approval')) {
        setScanJoinType('pending');
        setScanJoinMsg('Nhóm bật chế độ duyệt thành viên. Yêu cầu đã được gửi, chờ admin duyệt. Bạn có thể quét thành viên nhóm được rồi!');
      } else if (!res?.success && errCode) {
        setScanJoinType('error');
        setScanJoinMsg(res?.error || `Lỗi (${errCode}): Không thể tham gia nhóm.`);
      } else {
        setScanJoinType('success');
        setScanJoinMsg('Đã tham gia nhóm thành công!');
        await loadGroupsFromDB();
      }
    } catch (err: any) {
      setScanJoinType('error');
      setScanJoinMsg(err?.message || 'Lỗi không xác định');
    } finally {
      setScanJoinLoading(false);
    }
  }, [activeAccountId, scanLinkInput, loadGroupsFromDB, resolveAndSaveGroupInfo]);

  // ── Load premium status ───────────────────────────────────────────────
  const loadPremiumStatus = useCallback(async (fromBackend = false) => {
    if (!activeAccountId) return;
    const storageKey = `premium_${activeAccountId}`;

    let cached = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        const expiresDate = new Date(data.expiresAt);
        setIsPremium(expiresDate > new Date());
        setPremiumExpiresAt(data.expiresAt);
        cached = true;
      }
    } catch {}

    if (!cached) {
      setIsPremium(false);
      setPremiumExpiresAt(null);
    }
    setPremiumLoaded(true);

    if (cached && !fromBackend) return;

    setPremiumLoading(true);
    try {
      const { getPremiumStatus } = await import('@/lib/backendService');
      const status = await getPremiumStatus(activeAccountId);

      setIsPremium(status.isPremium);
      setPremiumExpiresAt(status.expiresAt);

      localStorage.setItem(storageKey, JSON.stringify({
        expiresAt: status.expiresAt,
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('[GroupMembersTab] loadPremiumStatus error:', err);
      setIsPremium(true);
    } finally {
      setPremiumLoading(false);
    }
  }, [activeAccountId]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'scan' && !premiumLoaded) {
      loadPremiumStatus();
    }
  }, [activeTab, premiumLoaded, loadPremiumStatus]);

  useEffect(() => {

    setGroups([]); setMembers([]); setSelectedGroupId(null);
    setMembersLastFetched(0); setSelectedMemberIds(new Set());
    setSelectedGroupIds(new Set());
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

  // Lắng nghe sự kiện crm:groupMembersChanged từ máy Boss để tự động reload UI thời gian thực
  useEffect(() => {
    const handler = (evtData: any) => {
      if (!evtData || String(evtData.ownerZaloId) !== String(activeAccountId)) return;
      loadGroupsFromDB();
      if (selectedGroupId && String(evtData.groupId) === String(selectedGroupId)) {
        loadMembersFromDB(selectedGroupId);
      }
    };
    const unsub = window.electronAPI?.on?.('crm:groupMembersChanged', handler);
    return () => {
      unsub?.();
    };
  }, [activeAccountId, selectedGroupId, loadGroupsFromDB, loadMembersFromDB]);

  const handleBulkGroupSuccess = async () => {
    await loadGroupsFromDB();
    if (selectedGroupId) {
      await loadMembersFromDB(selectedGroupId);
    }
  };

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredGroups = groups.filter(g => {
    if (groupFilter === 'managed' && !managedGroupIds.has(g.contact_id)) return false;
    if (groupFilter === 'not_managed' && managedGroupIds.has(g.contact_id)) return false;
    return (
      !searchGroup.trim() ||
      g.display_name.toLowerCase().includes(searchGroup.toLowerCase()) ||
      g.contact_id.includes(searchGroup)
    );
  });
  const adminMembers = useMemo(() => members.filter(m => m.role === 1 || m.role === 2), [members]);
  const regularMembers = useMemo(() => members.filter(m => m.role === 0 || !m.role), [members]);

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      if (memberRoleFilter === 'admin' && !(m.role === 1 || m.role === 2)) return false;
      if (memberRoleFilter === 'member' && (m.role === 1 || m.role === 2)) return false;
      return (
        !searchMember.trim() ||
        (m.display_name && m.display_name.toLowerCase().includes(searchMember.toLowerCase())) ||
        (m.member_id && m.member_id.includes(searchMember)) ||
        (m.phone && m.phone.includes(searchMember))
      );
    });
  }, [members, memberRoleFilter, searchMember]);

  const allFilteredSelected = filteredMembers.length > 0 &&
    filteredMembers.every(m => selectedMemberIds.has(m.member_id));

  const allAdminSelected = adminMembers.length > 0 &&
    adminMembers.every(m => selectedMemberIds.has(m.member_id));

  const allRegularSelected = regularMembers.length > 0 &&
    regularMembers.every(m => selectedMemberIds.has(m.member_id));

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
    <div className="flex flex-col flex-1 overflow-hidden relative">

      {/* ── Sub-tab switcher ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-gray-900 border-b border-gray-700/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === 'members'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Thành viên nhóm
          </button>
          <button
            onClick={() => {
              setActiveTab('scan');
              if (!scanTabSeen) {
                setScanTabSeen(true);
                try { localStorage.setItem('scanTabSeen', 'true'); } catch {}
              }
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 relative ${
              activeTab === 'scan'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Quét nâng cao
            {!scanTabSeen && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {activeTab === 'scan' ? (
        /* ── Tab: Quét nâng cao (Light Mode UI matching Zagi theme) ────────────── */
        <div className="flex-1 overflow-y-auto bg-gray-50/60 p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Scan input container */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={scanLinkInput}
                  onChange={e => { setScanLinkInput(e.target.value); setScanTabError(''); setResolvedGroupInfo(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !scanTabLoading) handleScanTab(); }}
                  placeholder="Dán link nhóm Zalo (vd: https://zalo.me/g/xxxxxx)"
                  disabled={scanTabLoading}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 transition-all"
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleJoinFromScanTab}
                    disabled={scanJoinLoading || !scanLinkInput.trim()}
                    className="flex-1 sm:flex-initial px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                    {scanJoinLoading ? <>{SpinIcon} Đang join...</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> Tham gia</>}
                  </button>
                  <button
                    onClick={handleScanTab}
                    disabled={scanTabLoading || !scanLinkInput.trim()}
                    className="flex-1 sm:flex-initial px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm">
                    {scanTabLoading ? (
                      <>{SpinIcon} Đang quét...</>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        Quét
                      </>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Kết quả sau khi quét sẽ tự động đồng bộ vào tab Thành viên nhóm & CSDL máy Boss
              </p>
            </div>

            {/* Resolved group info card */}
            {resolvedGroupInfo && (
              <div className="bg-white border border-blue-200 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
                {resolvedGroupInfo.avatar ? (
                  <img src={resolvedGroupInfo.avatar} alt={resolvedGroupInfo.name}
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm">
                    {(resolvedGroupInfo.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{resolvedGroupInfo.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 font-mono">ID: {resolvedGroupInfo.groupId}</p>
                </div>
                <button onClick={() => setResolvedGroupInfo(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Join status */}
            {scanJoinType !== 'idle' && (
              <div className={`px-4 py-3 rounded-2xl text-xs border flex items-center gap-2.5 shadow-sm ${
                scanJoinType === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                scanJoinType === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                scanJoinType === 'already' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <span className="font-bold">{scanJoinType === 'success' ? '✓' : scanJoinType === 'pending' ? '⏳' : 'ℹ'}</span>
                <span>{scanJoinMsg}</span>
              </div>
            )}

            {/* Scan error */}
            {scanTabError && (
              <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2 shadow-sm">
                <span className="font-bold">⚠️</span> {scanTabError}
              </div>
            )}

            {/* Scan results */}
            {scanTabResults.length > 0 && (
              <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>🎉 Đã quét xong</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                        {scanTabResults.length} thành viên
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Dữ liệu đã tự động lưu vào tab Thành viên nhóm & CSDL máy Boss
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('members');
                      if (scanTabGroupId) setSelectedGroupId(scanTabGroupId);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm flex items-center gap-1">
                    Xem trong tab Thành viên →
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {scanTabResults.slice(0, 50).map((m, i) => (
                    <div key={m.userId || i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/50 transition-colors">
                      <Avatar src={m.avatar} name={m.displayName || m.userId} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 font-medium truncate">{m.displayName || m.userId}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{m.userId}</p>
                      </div>
                    </div>
                  ))}
                  {scanTabResults.length > 50 && (
                    <div className="px-4 py-2.5 bg-gray-50 text-xs text-gray-500 text-center font-medium">
                      ... và {scanTabResults.length - 50} thành viên khác. Bấm "Xem trong tab Thành viên" để sử dụng đầy đủ tính năng.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Premium status */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={`w-2.5 h-2.5 rounded-full ${isPremium ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  <span className="text-sm text-gray-900 font-bold">Quét nâng cao</span>
                  <button
                    onClick={() => loadPremiumStatus(true)}
                    disabled={premiumLoading}
                    title="Cập nhật trạng thái"
                    className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors flex items-center justify-center">
                    {premiumLoading ? SpinIcon : RefreshIcon}
                  </button>
                  {isPremium && premiumExpiresAt && (
                    <span className="text-xs text-gray-500">· Hết hạn: {new Date(premiumExpiresAt).toLocaleDateString('vi-VN')}</span>
                  )}
                </div>
                <div>
                  {isPremium ? (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full">Đang hoạt động</span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">Chưa kích hoạt</span>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden relative">


      {/* ── Left: Groups ──────────────────────────────────────────────────── */}
      <div className={`${isMobile ? (selectedGroupId ? 'hidden' : 'w-full') : 'w-72 flex-shrink-0'} border-r border-gray-700 flex flex-col overflow-hidden`}>
        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">
              Nhóm Zalo
              {groups.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">({groups.length})</span>}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Từ danh sách hội thoại</p>
          </div>

          {/* Nút Refresh nhanh */}
          <button
            onClick={fetchGroupsFromAPI}
            disabled={groupsLoading}
            title="Đồng bộ lại tất cả nhóm & quyền từ Zalo"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 transition-colors flex-shrink-0"
          >
            {groupsLoading ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.97" />
              </svg>
            )}
          </button>

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
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
                onClick={() => setGroupFilter('managed')}
                className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${groupFilter === 'managed' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Tôi quản lý ({managedGroupIds.size})
              </button>
              <button
                onClick={() => setGroupFilter('not_managed')}
                className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-colors ${groupFilter === 'not_managed' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Không quản lý ({Math.max(0, groups.length - managedGroupIds.size)})
              </button>
            </div>

            {groups.length > 0 && (
              <button
                onClick={() => setShowBulkGroupModal('add')}
                className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm"
              >
                <span>➕ Thêm người vào nhóm</span>
              </button>
            )}

            {filteredGroups.length > 0 && (
              <div className="flex items-center justify-between text-[10px] text-gray-500 px-0.5 mt-0.5">
                <button
                  onClick={() => {
                    setSelectedGroupIds(prev => {
                      const next = new Set(prev);
                      filteredGroups.forEach(g => next.add(g.contact_id));
                      return next;
                    });
                  }}
                  className="hover:text-gray-300 transition-colors"
                >
                  Chọn các nhóm đang hiện ({filteredGroups.length})
                </button>
                {selectedGroupIds.size > 0 && (
                  <button
                    onClick={() => setSelectedGroupIds(new Set())}
                    className="hover:text-red-400 transition-colors"
                  >
                    Bỏ chọn ({selectedGroupIds.size})
                  </button>
                )}
              </div>
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
                : 'Không có nhóm nào mà bạn là thành viên thường.'}
            </div>
          ) : (
            <div className="py-1">
              {filteredGroups.map(group => {
                const isGroupChecked = selectedGroupIds.has(group.contact_id);
                return (
                  <div key={group.contact_id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700/50 transition-colors
                      ${selectedGroupId === group.contact_id ? 'bg-blue-500/10 border-r-2 border-blue-500' : ''}`}>
                    {/* Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupSelected(group.contact_id);
                      }}
                      className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border cursor-pointer transition-colors
                        ${isGroupChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-800 hover:border-gray-500'}`}
                    >
                      {isGroupChecked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    {/* Group detail trigger */}
                    <button
                      onClick={() => setSelectedGroupId(group.contact_id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Action Bar */}
        {selectedGroupIds.size > 0 && (
          <div className="p-3 border-t border-gray-700 bg-gray-800/95 flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Đã chọn: <strong className="text-blue-400">{selectedGroupIds.size}</strong> nhóm</span>
              <button onClick={() => setSelectedGroupIds(new Set())} className="text-gray-500 hover:text-gray-300 transition-colors">Bỏ chọn</button>
            </div>
            <button
              onClick={() => setShowSmartGroupModal(true)}
              className="w-full py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Rời các nhóm đã chọn
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Members ────────────────────────────────────────────────── */}
      <div className={`${isMobile ? (selectedGroupId ? 'w-full' : 'hidden') : 'flex-1'} flex flex-col overflow-hidden`}>
        {!selectedGroup ? (
          <EmptyState icon={GroupIcon} title="Chọn một nhóm để xem thành viên"
            desc={groups.length === 0
              ? 'Hãy tải danh sách nhóm từ API trước.'
              : 'Chọn một nhóm bên trái để xem danh sách thành viên.'} />
        ) : (
          <>
            {/* Members header */}
            <div className="px-4 py-3 border-b border-gray-700 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0">
              {/* Row 1: Back button & Group Title Info */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {isMobile && (
                  <button
                    onClick={() => setSelectedGroupId(null)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 py-1.5 px-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 flex-shrink-0"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                    </svg>
                    Danh sách nhóm
                  </button>
                )}
                <GroupAvatar
                  avatarUrl={selectedGroup.avatar_url}
                  groupInfo={activeAccountId ? (groupInfoCache[activeAccountId] || {})[selectedGroup.contact_id] : undefined}
                  name={selectedGroup.display_name}
                  size="xs"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white truncate">{selectedGroup.display_name}</h3>
                    
                    {/* Badge ID nhóm - Bấm vào copy ID nhóm số */}
                    <button
                      onClick={handleCopyGroupId}
                      title="Bấm vào đây để sao chép ID nhóm Zalo dạng số"
                      className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 transition-colors cursor-pointer"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span>{selectedGroup.contact_id.replace(/^g/, '')}</span>
                    </button>

                    {/* Badge Link rút gọn nếu đã tải */}
                    {currentGroupLink && currentGroupLink.includes('zalo.me/g/') && !currentGroupLink.match(/\/g\/\d{15,22}$/) && (
                      <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 truncate max-w-[200px]" title={currentGroupLink}>
                        🔗 {currentGroupLink}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {members.length > 0
                      ? <>{members.length} thành viên{membersLastFetched > 0 && <span className="ml-1.5 text-gray-500">· {formatTime(membersLastFetched)}</span>}</>
                      : 'Chưa có dữ liệu thành viên'}
                  </p>
                </div>
              </div>

              {/* Row 2: Action Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  onClick={handleCopyGroupLink}
                  disabled={copyingLink}
                  title="Sao chép link tham gia nhóm Zalo rút gọn (zalo.me/g/slug)"
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                >
                  {copyingLink ? (
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  )}
                  <span>{copiedLinkSuccess ? 'Đã sao chép!' : 'Sao chép link nhóm'}</span>
                </button>
                <button onClick={fetchMembersFromAPI} disabled={membersLoading || manualLoadProgress !== null}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-sm">
                  {membersLoading ? SpinIcon : RefreshIcon}
                  <span>{membersLoading ? 'Đang tải...' : 'Tải thông tin thành viên'}</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedGroupIds(new Set([selectedGroup.contact_id]));
                    setShowSmartGroupModal(true);
                  }}
                  title="Rời khỏi nhóm này"
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white !text-white text-xs font-semibold transition-colors shadow-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span className="text-white !text-white font-semibold">Rời khỏi nhóm</span>
                </button>
              </div>
              {/* Stop button shown only during getUserInfo fallback */}
              {manualLoadProgress !== null && (
                <button onClick={() => { manualLoadStopRef.current = true; }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors flex-shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
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

            {/* ── Member Role Tabs + Search & Quick Action Toolbar ── */}
            <div className="px-4 py-2.5 border-b border-gray-700/50 flex flex-col gap-2.5 flex-shrink-0 bg-gray-800/40">
              {/* Top row: Role filter tabs & Quick Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-gray-900/80 p-1 rounded-xl border border-gray-700/60">
                  <button
                    type="button"
                    onClick={() => setMemberRoleFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      memberRoleFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                    }`}
                  >
                    🌐 Tất cả ({members.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemberRoleFilter('admin')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      memberRoleFilter === 'admin'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-gray-400 hover:text-amber-400 hover:bg-gray-700/50'
                    }`}
                  >
                    <span>👑 Ban Quản lý</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      memberRoleFilter === 'admin' ? 'bg-amber-800 text-white' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {adminMembers.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemberRoleFilter('member')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      memberRoleFilter === 'member'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-gray-400 hover:text-emerald-400 hover:bg-gray-700/50'
                    }`}
                  >
                    <span>👥 Thành viên</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      memberRoleFilter === 'member' ? 'bg-emerald-800 text-white' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {regularMembers.length}
                    </span>
                  </button>
                </div>

                {/* Quick selection action buttons */}
                {members.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {adminMembers.length > 0 && (
                      <button
                        type="button"
                        onClick={allAdminSelected ? unselectAdminMembers : selectAdminMembers}
                        title={allAdminSelected ? 'Bỏ chọn toàn bộ Ban Quản lý' : 'Chọn nhanh toàn bộ Ban Quản lý (Trưởng + Phó nhóm)'}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 cursor-pointer border ${
                          allAdminSelected
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                            : 'bg-gray-800 border-gray-700 hover:border-amber-500/50 text-gray-300 hover:text-amber-400'
                        }`}
                      >
                        <span>👑</span>
                        <span>{allAdminSelected ? 'Bỏ Quản lý' : `+ Quản lý (${adminMembers.length})`}</span>
                      </button>
                    )}
                    {regularMembers.length > 0 && (
                      <button
                        type="button"
                        onClick={allRegularSelected ? unselectRegularMembers : selectRegularMembers}
                        title={allRegularSelected ? 'Bỏ chọn toàn bộ Thành viên' : 'Chọn nhanh toàn bộ Thành viên thông thường'}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 cursor-pointer border ${
                          allRegularSelected
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30'
                            : 'bg-gray-800 border-gray-700 hover:border-emerald-500/50 text-gray-300 hover:text-emerald-400'
                        }`}
                      >
                        <span>👥</span>
                        <span>{allRegularSelected ? 'Bỏ TV thường' : `+ TV thường (${regularMembers.length})`}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom row: Select all current filtered & search bar */}
              <div className="flex items-center gap-2">
                {members.length > 0 && (
                  <button
                    type="button"
                    onClick={allFilteredSelected ? unselectAllFilteredMembers : selectAllMembers}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors border cursor-pointer
                      ${allFilteredSelected
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30'
                        : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    {allFilteredSelected ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        Bỏ chọn {memberRoleFilter === 'admin' ? 'Quản lý' : memberRoleFilter === 'member' ? 'Thành viên' : 'tất cả'}
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 11 12 14 22 4" /></svg>
                        Chọn tất cả ({filteredMembers.length})
                      </>
                    )}
                  </button>
                )}
                <input
                  type="text"
                  value={searchMember}
                  onChange={e => setSearchMember(e.target.value)}
                  placeholder={
                    memberRoleFilter === 'admin'
                      ? `Tìm trong ${adminMembers.length} quản lý (tên, SĐT, UID)...`
                      : memberRoleFilter === 'member'
                      ? `Tìm trong ${regularMembers.length} thành viên (tên, SĐT, UID)...`
                      : `Tìm trong ${members.length} thành viên (tên, SĐT, UID)...`
                  }
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto pb-16">
              {members.length === 0 ? (
                <EmptyState
                  icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
                  title="Chưa có dữ liệu thành viên"
                  desc={<>Nhấn <span className="text-blue-400 font-medium">Tải thành viên</span> để đồng bộ từ Zalo về DB.<br /><span className="text-gray-600 text-[11px]">Lưu ý: cần tải nhóm từ API trước để có danh sách UID.</span></>}
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
                              <polyline points="20 6 9 17 4 12" />
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
                <div className="flex-1" />
                <button onClick={clearSelection}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors">
                  Bỏ chọn
                </button>
                {selectedMemberIds.size >= 1 && selectedGroupId && managedGroupIds.has(selectedGroupId) && (
                  <button onClick={() => setShowBulkGroupModal('remove')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                    Xóa khỏi các nhóm
                  </button>
                )}
                <button onClick={openCampaignPicker}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  Thêm vào chiến dịch
                </button>
                <button onClick={() => setShowAddToContacts(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
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
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
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
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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
          zaloId={activeAccountId || ''}
          onClose={() => setShowCreateCampaign(false)}
          onSave={handleCreateCampaignInPicker}
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
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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

      {showBulkGroupModal && (
        <BulkGroupManageModal
          isOpen={!!showBulkGroupModal}
          mode={showBulkGroupModal}
          initialContactIds={showBulkGroupModal === 'remove' ? Array.from(selectedMemberIds) : []}
          activeAccountId={activeAccountId}
          groupFilter={groupFilter}
          onClose={() => {
            setShowBulkGroupModal(null);
            setSelectedMemberIds(new Set());
          }}
          onSuccess={handleBulkGroupSuccess}
        />
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
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Lên lịch thông báo nhóm</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">{selectedGroup.display_name}</p>
              </div>
              <button onClick={() => setShowPinScheduler(false)}
                className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
                  {[{ v: 'once', l: '🎯 Một lần' }, { v: 'daily', l: '📅 Mỗi ngày' }, { v: 'weekly', l: '🗓 Hàng tuần' }].map(t => (
                    <button key={t.v} type="button" onClick={() => setPinScheduleType(t.v as any)}
                      className={`py-2 rounded-xl border text-[11px] font-medium transition-colors ${pinScheduleType === t.v
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
                      {[{ v: '1', l: 'Thứ Hai' }, { v: '2', l: 'Thứ Ba' }, { v: '3', l: 'Thứ Tư' }, { v: '4', l: 'Thứ Năm' }, { v: '5', l: 'Thứ Sáu' }, { v: '6', l: 'Thứ Bảy' }, { v: '0', l: 'Chủ Nhật' }].map(d => (
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
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                  ) : pinScheduleSaved ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>Đã lưu!</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>Lên lịch</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSmartGroupModal && (
        <SmartGroupModal
          selectedGroupIds={Array.from(selectedGroupIds)}
          activeAccountId={activeAccountId}
          onClose={() => {
            setShowSmartGroupModal(false);
            setSelectedGroupIds(new Set());
          }}
          onSuccess={() => {
            handleBulkGroupSuccess();
            setSelectedGroupIds(new Set());
          }}
        />
      )}
      </div>
      )}
    </div>
  );
}
