import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useCRMStore } from '@/store/crmStore';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import PhoneDisplay from '../common/PhoneDisplay';
import { CreateGroupModal } from './GroupModals';
import GroupInfoPanel from './GroupInfoPanel';
import MediaSection, { MediaDetailPanel, MediaTab } from './MediaSection';
import { UserActionSection } from './ConversationActions';
import { extractUserProfile } from '../../../utils/profileUtils';
import GroupAvatar from '../common/GroupAvatar';
import { toLocalMediaUrl } from '@/lib/localMedia';
import { getCapability, type Channel } from '../../../configs/channelConfig';
import { fetchContactInfo } from '@/hooks/useZaloEvents';

function muteUntilToDuration(until: number): number | string {
  if (until === 0) return -1;
  const remainSec = Math.round((until - Date.now()) / 1000);
  if (Math.abs(remainSec - 3600) <= 300) return 3600;
  if (Math.abs(remainSec - 14400) <= 300) return 14400;
  const t = new Date(until);
  if (t.getHours() === 8 && t.getMinutes() === 0) return 'until8AM';
  return remainSec > 0 ? remainSec : -1;
}



export default function ConversationInfo() {
  const { activeThreadId, activeThreadType, contacts } = useChatStore();
  const { activeAccountId } = useAccountStore();

  const contactList = activeAccountId ? (contacts[activeAccountId] || []) : [];
  const contact = contactList.find((c) => c.contact_id === activeThreadId);
  const isGroup = activeThreadType === 1 || contact?.contact_type === 'group';

  if (isGroup) return <GroupInfoPanel />;
  return <UserConversationInfo />;
}

function defaultSalutation(gender?: number | null): string {
  if (gender === 0) return 'Anh';
  if (gender === 1) return 'Chị';
  return 'Bạn';
}

// ─── UserConversationInfo ─────────────────────────────────────────────────────
function UserConversationInfo() {
  const { activeThreadId, activeThreadType, contacts, updateContact } = useChatStore();
  const { activeAccountId, getActiveAccount } = useAccountStore();
  const { showNotification, setMuted, clearMuted, isMuted: isMutedFn } = useAppStore();

  const [isPinned, setIsPinned] = useState(false);
  const [isLocalPinned, setIsLocalPinned] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editAlias, setEditAlias] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editGender, setEditGender] = useState<number>(0);
  const [editSalutation, setEditSalutation] = useState('');
  const [hovering, setHovering] = useState(false);

  const [muteDropdownOpen, setMuteDropdownOpen] = useState(false);
  const [muteDropdownPos, setMuteDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const muteRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [mediaDetailTab, setMediaDetailTab] = useState<MediaTab | null>(null);
  const [showMutualGroups, setShowMutualGroups] = useState(false);
  const [mutualGroups, setMutualGroups] = useState<{ groupId: string; name: string; avatar: string }[]>([]);
  const [mutualGroupsLoading, setMutualGroupsLoading] = useState(false);
  // isFriendDB: check thực từ bảng friends trong DB (đáng tin hơn contact.is_friend)
  const [isFriendDB, setIsFriendDB] = useState<boolean | null>(null);
  const [aliasRefreshing, setAliasRefreshing] = useState(false);

  const contactList = activeAccountId ? (contacts[activeAccountId] || []) : [];
  const contact = contactList.find((c) => c.contact_id === activeThreadId);
  const channelCap = getCapability((contact?.channel || 'zalo') as Channel);
  // Hiển thị: ưu tiên alias → display_name
  const displayName = contact?.alias || contact?.display_name || activeThreadId || '';
  const avatarUrl = contact?.avatar_url || '';

  // Check friends table mỗi khi thread thay đổi
  useEffect(() => {
    setIsFriendDB(null);
    if (!activeAccountId || !activeThreadId) return;
    ipc.db?.isFriend({ zaloId: activeAccountId, userId: activeThreadId })
      .then((res: any) => setIsFriendDB(!!res?.isFriend))
      .catch(() => setIsFriendDB(!!(contact?.is_friend)));
  }, [activeAccountId, activeThreadId]);
  // Reset editing mode when switching threads
  useEffect(() => {
    setIsEditingProfile(false);
  }, [activeThreadId]);

  const getAuth = () => {
    const acc = getActiveAccount();
    if (!acc) return null;
    return { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
  };

  // Load pin status on mount / thread change
  useEffect(() => {
    if (!activeAccountId || !activeThreadId) return;
    loadPinStatus();
    // Always load local pin status regardless of channel
    ipc.db?.getLocalPinnedConversations({ zaloId: activeAccountId })
      .then((res: any) => setIsLocalPinned((res?.threadIds || []).includes(activeThreadId)))
      .catch(() => {});
  }, [activeAccountId, activeThreadId]);

  // Close mute dropdown on outside click
  useEffect(() => {
    if (!muteDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (muteRef.current && !muteRef.current.contains(e.target as Node)) setMuteDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [muteDropdownOpen]);

  // ── Auto-fetch user info khi vào hội thoại chưa có thông tin ──────────
  useEffect(() => {
    if (!activeAccountId || !activeThreadId) return;
    if (activeThreadType === 1) return; // Group — không áp dụng

    const ctList = useChatStore.getState().contacts[activeAccountId] || [];
    const ct = ctList.find((c) => c.contact_id === activeThreadId);
    if (!ct) return;

    const channel = ct.channel || 'zalo';
    const hasRealName = !!(ct.display_name && ct.display_name !== activeThreadId && !/^\d+$/.test(ct.display_name));
    const hasAvatar = !!ct.avatar_url;
    if (hasRealName && hasAvatar) return; // Đã có đủ thông tin

    if (channel === 'zalo') {
      // Dùng fetchContactInfo có cache 7 ngày + xử lý alias
      fetchContactInfo(activeAccountId, activeThreadId).catch(() => {});
    } else if (channel === 'facebook') {
      ipc.fb?.getUserInfoFacebookHtml({ accountId: activeAccountId, userId: activeThreadId })
        .then((res: any) => {
          if (res?.success && (res.name || res.avatarUrl)) {
            const patch: any = { contact_id: activeThreadId, channel: 'facebook' };
            if (res.name) patch.display_name = res.name;
            if (res.avatarUrl) patch.avatar_url = res.avatarUrl;
            useChatStore.getState().updateContact(activeAccountId!, patch);
          }
        })
        .catch(() => {});
      if (/^\d+$/.test(activeThreadId)) {
        ipc.fb?.refreshContactAvatar({ accountId: activeAccountId, userId: activeThreadId })
          .then((res: any) => {
            if (res?.success && res.avatarUrl) {
              useChatStore.getState().updateContact(activeAccountId!, {
                contact_id: activeThreadId,
                avatar_url: res.avatarUrl,
              });
            }
          })
          .catch(() => {});
      }
    }
  }, [activeAccountId, activeThreadId, activeThreadType]);

  const loadPinStatus = async () => {
    if (!channelCap.supportsPinConversation) return;
    const auth = getAuth();
    if (!auth) return;
    try {
      const res = await ipc.zalo?.getPinConversations(auth);
      // FIX: response is { conversations: string[], version: number }
      // IDs are prefixed with 'u' (user) or 'g' (group)
      const convIds: string[] = res?.response?.conversations || [];
      setIsPinned(convIds.some((id: string) => id.replace(/^[ug]/, '') === activeThreadId));
    } catch {}
  };

  const handleRefresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await loadPinStatus();
      // Zalo-only: fetch fresh user profile (avatar, name, phone) via API
      if (activeAccountId && activeThreadId && channelCap.supportsAlias) {
        const auth = getAuth();
        if (auth) {
          try {
            const res = await ipc.zalo?.getUserInfo({ auth, userId: activeThreadId });
            const profile = res?.response?.changed_profiles?.[activeThreadId]
              || res?.response?.data?.[activeThreadId];
            if (profile) {
              const { displayName: newName, avatar: newAvatar, phone: newPhone, gender, birthday, alias: newAlias } = extractUserProfile(profile);
              // Only patch fields that have actual values — never spread undefined
              const patch: any = { contact_id: activeThreadId };
              if (newName) patch.display_name = newName;
              if (newAvatar) patch.avatar_url = newAvatar;
              if (newPhone) patch.phone = newPhone;
              if (newAlias) patch.alias = newAlias;
              if (newName || newAvatar || newPhone || newAlias) {
                updateContact(activeAccountId, patch);
                await ipc.db?.updateContactProfile({
                  zaloId: activeAccountId, contactId: activeThreadId,
                  displayName: newName, avatarUrl: newAvatar, phone: newPhone,
                  gender, birthday,
                });
                // Lưu alias vào DB (field riêng, không overwrite display_name)
                if (newAlias) {
                  ipc.db?.setContactAlias({
                    zaloId: activeAccountId,
                    contactId: activeThreadId,
                    alias: newAlias,
                  }).catch(() => {});
                }
              }
            }
          } catch {}
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMuteWithTime = (until: number) => {
    if (!activeAccountId || !activeThreadId) return;
    setMuted(activeAccountId, activeThreadId, until);
    showNotification('Đã tắt thông báo', 'success');
    setMuteDropdownOpen(false);
    // Gọi API đồng bộ lên Zalo (fire-and-forget) — chỉ khi kênh hỗ trợ
    if (channelCap.supportsMuteSync) {
      const auth = getAuth();
      if (auth) {
        const duration = muteUntilToDuration(until);
        ipc.zalo?.setMute({ auth, threadId: activeThreadId, threadType: 0, duration, action: 1 }).catch(() => {});
      }
    }
  };

  const handleUnmute = () => {
    if (!activeAccountId || !activeThreadId) return;
    clearMuted(activeAccountId, activeThreadId);
    showNotification('Đã bật thông báo', 'success');
    // Gọi API đồng bộ lên Zalo (fire-and-forget) — chỉ khi kênh hỗ trợ
    if (channelCap.supportsMuteSync) {
      const auth = getAuth();
      if (auth) {
        ipc.zalo?.setMute({ auth, threadId: activeThreadId, threadType: 0, action: 3 }).catch(() => {});
      }
    }
  };

  const handleTogglePin = async () => {
    if (!activeThreadId) return;
    if (!channelCap.supportsPinConversation) {
      // FB / non-Zalo: use local pin only
      if (!activeAccountId) return;
      const newVal = !isLocalPinned;
      await ipc.db?.setLocalPinnedConversation({ zaloId: activeAccountId, threadId: activeThreadId, isPinned: newVal });
      setIsLocalPinned(newVal);
      showNotification(newVal ? 'Đã ghim trong app' : 'Đã bỏ ghim khỏi app', 'success');
      return;
    }
    const auth = getAuth();
    if (!auth) return;
    try {
      await ipc.zalo?.setPinConversation({
        auth,
        conversations: [{ threadId: activeThreadId, type: activeThreadType }],
        isPin: !isPinned,
      });
      setIsPinned(!isPinned);
      showNotification(isPinned ? 'Đã bỏ ghim hội thoại' : 'Đã ghim hội thoại', 'success');
    } catch (e: any) {
      showNotification('Lỗi: ' + e.message, 'error');
    }
  };

  const startEditingProfile = () => {
    if (!contact) return;
    setEditAlias(contact.alias || contact.display_name || '');
    setEditPhone(contact.phone || '');
    setEditBirthday(contact.birthday || '');
    setEditGender(contact.gender ?? 0);
    setEditSalutation(contact.salutation || '');
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!activeAccountId || !contact) return;
    try {
      const trimmedAlias = editAlias.trim();
      const oldAlias = contact.alias || '';
      if (trimmedAlias !== oldAlias && channelCap.supportsAlias) {
        const auth = getAuth();
        if (auth && activeThreadId) {
          try {
            const res = await ipc.zalo?.changeFriendAlias({ auth, alias: trimmedAlias, friendId: activeThreadId });
            if (res && !res.success && res.error) {
              showNotification('Cảnh báo Zalo: ' + res.error, 'warning');
            }
          } catch (e: any) {
            console.error('Error changing Zalo alias:', e);
          }
        }
      }

      await ipc.db?.updateContactProfile({
        zaloId: activeAccountId,
        contactId: contact.contact_id,
        displayName: contact.display_name,
        avatarUrl: contact.avatar_url,
        phone: editPhone.trim(),
        contactType: contact.contact_type,
        gender: editGender,
        birthday: editBirthday.trim()
      });

      if (trimmedAlias !== oldAlias) {
        await ipc.db?.setContactAlias({
          zaloId: activeAccountId,
          contactId: contact.contact_id,
          alias: trimmedAlias
        }).catch(() => {});
      }

      // Save salutation via patchContactFields
      await ipc.db?.patchContactFields({
        zaloId: activeAccountId,
        contactId: contact.contact_id,
        fields: { salutation: editSalutation.trim() || null }
      });

      updateContact(activeAccountId, {
        contact_id: contact.contact_id,
        alias: trimmedAlias,
        phone: editPhone.trim(),
        gender: editGender,
        birthday: editBirthday.trim(),
        salutation: editSalutation.trim() || null
      });

      // Sync with crmStore if it has data
      try {
        const crmStore = useCRMStore.getState();
        if (crmStore.contacts && crmStore.contacts.length > 0) {
          crmStore.setContacts(
            crmStore.contacts.map(c =>
              c.contact_id === contact.contact_id
                ? {
                    ...c,
                    alias: trimmedAlias,
                    phone: editPhone.trim(),
                    gender: editGender,
                    birthday: editBirthday.trim(),
                    salutation: editSalutation.trim() || null
                  }
                : c
            ),
            crmStore.totalContacts
          );
        }
      } catch (err) {
        console.error('Error syncing crmStore from chat:', err);
      }

      showNotification('Đã cập nhật thông tin liên hệ', 'success');
      setIsEditingProfile(false);
    } catch (e: any) {
      showNotification('Lỗi cập nhật: ' + e.message, 'error');
    }
  };

  /** Reload alias + user info từ API Zalo — lưu toàn bộ alias + cập nhật thông tin hội thoại hiện tại */
  const handleRefreshAlias = async () => {
    if (!channelCap.supportsAlias) return;
    const auth = getAuth();
    if (!auth || !activeThreadId || !activeAccountId) return;
    setAliasRefreshing(true);
    try {
      // 1. Update toàn bộ alias từ getAliasList
      const res = await ipc.zalo?.getAliasList({ auth, count: 5000 });
      if (!res?.success) return;
      const items: { userId: string; alias: string }[] = res?.response?.items || [];
      for (const item of items) {
        if (item.alias && item.userId) {
          updateContact(activeAccountId, { contact_id: item.userId, alias: item.alias });
          ipc.db?.setContactAlias({ zaloId: activeAccountId, contactId: item.userId, alias: item.alias }).catch(() => {});
        }
      }
      // 2. Fetch full profile (tên, avatar, SĐT) cho hội thoại hiện tại
      const infoRes = await ipc.zalo?.getUserInfo({ auth, userId: activeThreadId });
      const rawProfile = infoRes?.response?.changed_profiles?.[activeThreadId]
        || infoRes?.response?.data?.[activeThreadId];
      if (rawProfile) {
        const { displayName: newName, avatar: newAvatar, phone: newPhone, gender, birthday, alias: newAlias } = extractUserProfile(rawProfile);
        const patch: any = { contact_id: activeThreadId };
        if (newName) patch.display_name = newName;
        if (newAvatar) patch.avatar_url = newAvatar;
        if (newPhone) patch.phone = newPhone;
        if (newAlias) patch.alias = newAlias;
        if (Object.keys(patch).length > 1) {
          updateContact(activeAccountId, patch);
          await ipc.db?.updateContactProfile({
            zaloId: activeAccountId, contactId: activeThreadId,
            displayName: newName, avatarUrl: newAvatar, phone: newPhone,
            gender, birthday,
          });
          if (newAlias) {
            ipc.db?.setContactAlias({ zaloId: activeAccountId, contactId: activeThreadId, alias: newAlias }).catch(() => {});
          }
        }
      }
    } catch {} finally {
      setAliasRefreshing(false);
    }
  };

  // Load mutual groups khi mở sub-panel
  const handleOpenMutualGroups = () => {
    if (!channelCap.supportsMutualGroups) return;
    setShowMutualGroups(true);
    if (mutualGroups.length > 0) return;
    if (!activeAccountId || !activeThreadId) return;
    const acc = getActiveAccount();
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
    setMutualGroupsLoading(true);
    ipc.zalo?.getRelatedFriendGroup({ auth, userId: activeThreadId })
      .then((res: any) => {
        if (!res?.success || !res.response) return;
        const raw = res.response;
        let groupIds: string[] = [];
        if (raw.groupRelateds && typeof raw.groupRelateds === 'object') {
          const val = raw.groupRelateds[activeThreadId] || raw.groupRelateds['all'];
          if (Array.isArray(val)) groupIds = val;
          else if (val && typeof val === 'object') groupIds = Object.keys(val);
          else {
            const firstVal = Object.values(raw.groupRelateds)[0];
            if (Array.isArray(firstVal)) groupIds = firstVal as string[];
          }
        } else if (Array.isArray(raw.groupIds)) {
          groupIds = raw.groupIds;
        } else if (Array.isArray(raw)) {
          groupIds = raw;
        }
        const allContacts = useChatStore.getState().contacts[activeAccountId] || [];
        const groups = groupIds.map((gid: string) => {
          const cached = useAppStore.getState().groupInfoCache?.[activeAccountId]?.[gid];
          if (cached?.name) return { groupId: String(gid), name: cached.name, avatar: cached.avatar || '' };
          const gc = allContacts.find((c: any) => c.contact_id === String(gid));
          return { groupId: String(gid), name: gc?.display_name || '', avatar: gc?.avatar_url || '' };
        });
        setMutualGroups(groups);
      })
      .catch(() => {})
      .finally(() => setMutualGroupsLoading(false));
  };

  const isMuted = activeAccountId && activeThreadId ? isMutedFn(activeAccountId, activeThreadId) : false;

  // Mutual groups sub-panel
  if (showMutualGroups && activeThreadId) {
    return (
      <div className="w-72 h-full flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-700">
          <button onClick={() => setShowMutualGroups(false)}
            className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-white flex-1 text-center pr-6">
            Nhóm chung ({mutualGroups.length})
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {mutualGroupsLoading && mutualGroups.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <svg className="animate-spin w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}
          {mutualGroups.map(g => (
            <button key={g.groupId}
              onClick={() => { useChatStore.getState().setActiveThread(g.groupId, 1); setShowMutualGroups(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700/50 transition-colors text-left">
              <GroupAvatar
                name={g.name || g.groupId}
                avatarUrl={g.avatar}
                groupInfo={useAppStore.getState().groupInfoCache?.[activeAccountId || '']?.[g.groupId] || null}
                size="sm"
              />
              <span className="text-sm text-gray-200 truncate flex-1">{g.name || g.groupId}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 flex-shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
          {!mutualGroupsLoading && mutualGroups.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-8">Không có nhóm chung</p>
          )}
        </div>
      </div>
    );
  }

  // Media detail — thay thế toàn bộ panel
  if (mediaDetailTab !== null && activeThreadId) {
    return (
      <MediaDetailPanel
        threadId={activeThreadId}
        activeAccountId={activeAccountId || ''}
        tab={mediaDetailTab}
        onBack={() => setMediaDetailTab(null)}
      />
    );
  }

  const isFriend = isFriendDB !== null
    ? isFriendDB
    : !!(contact?.is_friend || contact?.isFr === 1);

  // @ts-ignore
  // @ts-ignore
  return (
    <>
    <div className="w-72 h-full flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-700">
        <span className="flex-1 text-sm font-semibold text-white text-center">Thông tin liên hệ</span>
        {channelCap.supportsAlias && (
        <button title="Cập nhật thông tin" onClick={handleRefresh} disabled={loading}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-50 flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={loading ? 'animate-spin' : ''}>
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        )}
      </div>

      {/* Avatar + name */}
      <div className="flex flex-col items-center py-6 px-4 border-b border-gray-700">
        {avatarUrl ? (
          <img src={toLocalMediaUrl(avatarUrl)} alt={displayName} className="w-16 h-16 rounded-full object-cover mb-3" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3 bg-blue-600">
            {(displayName || 'U').charAt(0).toUpperCase()}
          </div>
        )}
        {isEditingProfile ? (
          <div className="flex flex-col gap-2.5 w-full mt-2">
            <div className="flex flex-col gap-0.5 w-full">
              <label className="text-[10px] uppercase font-bold text-gray-400 self-start">Biệt danh / Tên</label>
              <input
                value={editAlias}
                onChange={e => setEditAlias(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="Tên gợi nhớ..."
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-0.5 w-full">
              <label className="text-[10px] uppercase font-bold text-gray-400 self-start">Số điện thoại</label>
              <input
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="Số điện thoại..."
              />
            </div>
            <div className="flex flex-col gap-0.5 w-full">
              <label className="text-[10px] uppercase font-bold text-gray-400 self-start">Ngày sinh (DD/MM hoặc DD/MM/YYYY)</label>
              <input
                value={editBirthday}
                onChange={e => setEditBirthday(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="VD: 16/07 hoặc 24/11/1994"
              />
            </div>
            <div className="flex flex-col gap-0.5 w-full">
              <label className="text-[10px] uppercase font-bold text-gray-400 self-start">Xưng hô (tùy chỉnh)</label>
              <input
                value={editSalutation}
                onChange={e => setEditSalutation(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="Ví dụ: Cô, Chú, Anh, Chị..."
              />
            </div>
            <div className="flex flex-col gap-0.5 w-full">
              <label className="text-[10px] uppercase font-bold text-gray-400 self-start">Giới tính</label>
              <select
                value={editGender ?? ''}
                onChange={e => setEditGender(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Chưa xác định</option>
                <option value={0}>Nam</option>
                <option value={1}>Nữ</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end mt-1.5 w-full">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="px-2.5 py-1 bg-gray-700 rounded-lg text-xs text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveProfile}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white transition-colors"
              >
                Lưu
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="group flex items-center gap-1.5 mt-1 cursor-pointer"
              onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
              onClick={startEditingProfile}>
              <p className="text-white font-semibold text-base text-center">{displayName}</p>
              {channelCap.supportsAlias && (
                <button
                  title="Cập nhật thông tin từ Zalo"
                  onClick={(e) => { e.stopPropagation(); handleRefreshAlias(); }}
                  className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                  disabled={aliasRefreshing}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={aliasRefreshing ? 'animate-spin' : ''}>
                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                  </svg>
                </button>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray-400 hover:text-blue-400 transition-colors flex-shrink-0 opacity-70 hover:opacity-100`}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            {contact?.alias && contact?.display_name && contact.alias !== contact.display_name && (
              <p className="text-gray-500 text-xs mt-0.5 text-center">({contact.display_name})</p>
            )}
            {contact?.phone && (
              <p className="text-gray-400 text-xs mt-0.5">
                📞 <PhoneDisplay phone={contact.phone} className="text-gray-400 text-xs" />
              </p>
            )}
            <p className="text-gray-400 text-xs mt-0.5">
              🗣 Xưng hô: {contact?.salutation || defaultSalutation(contact?.gender)}
            </p>
            {contact?.birthday && (
              <p className="text-gray-400 text-xs mt-0.5">
                🎂 {contact.birthday}
              </p>
            )}
            {(contact?.gender === 0 || contact?.gender === 1) && (
              <p className="text-gray-400 text-xs mt-0.5">
                {contact.gender === 0 ? '♂ Nam' : '♀ Nữ'}
              </p>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-around py-3 border-b border-gray-700 relative">
        {/* Mute with time picker dropdown */}
        <div className="relative" ref={muteRef}>
          <UserActionBtn
            icon={isMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0" /><path d="M18.63 13A17.89 17.89 0 0 1 18 8" /><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" /><path d="M18 8a6 6 0 0 0-9.33-5" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            )}
            label={isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
            onClick={isMuted ? handleUnmute : () => {
              if (muteRef.current) {
                const rect = muteRef.current.getBoundingClientRect();
                setMuteDropdownPos({ top: rect.bottom + 4, left: Math.max(4, rect.left - 60) });
              }
              setMuteDropdownOpen(p => !p);
            }}
            active={isMuted}
          />
          {muteDropdownOpen && !isMuted && muteDropdownPos && (
            <div className="fixed z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl min-w-[210px] py-1"
              style={{ top: muteDropdownPos.top, left: muteDropdownPos.left }}>
              {[
                { label: 'Trong 1 giờ',             until: () => Date.now() + 60 * 60 * 1000 },
                { label: 'Trong 4 giờ',             until: () => Date.now() + 4 * 60 * 60 * 1000 },
                { label: 'Cho đến 8:00 AM',         until: () => { const d = new Date(); d.setDate(d.getDate() + (d.getHours() >= 8 ? 1 : 0)); d.setHours(8,0,0,0); return d.getTime(); } },
                { label: 'Cho đến khi được mở lại', until: () => 0 },
              ].map(opt => (
                <button key={opt.label} onClick={() => handleMuteWithTime(opt.until())}
                  className="w-full flex items-center px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white text-left transition-colors">
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {channelCap.supportsPinConversation && (
          <UserActionBtn
            icon={isPinned ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.55A2 2 0 0 1 15 9.2V5H9v4.2c0 .45-.15.88-.44 1.24l-2.78 3.55A2 2 0 0 0 5 15.24z" fill="currentColor" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.55A2 2 0 0 1 15 9.2V5H9v4.2c0 .45-.15.88-.44 1.24l-2.78 3.55A2 2 0 0 0 5 15.24z" /></svg>
            )}
            label={isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
            onClick={handleTogglePin}
            active={isPinned}
          />
        )}
        {!channelCap.supportsPinConversation && (
          <UserActionBtn
            icon={isLocalPinned ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            )}
            label={isLocalPinned ? 'Bỏ ghim app' : 'Ghim trong app'}
            onClick={handleTogglePin}
            active={isLocalPinned}
          />
        )}
        {channelCap.supportsCreateGroup && (
          <UserActionBtn
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            label="Tạo nhóm"
            onClick={() => setCreateGroupOpen(true)}
          />
        )}
        <UserActionBtn
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>}
          label="Sửa thông tin"
          onClick={startEditingProfile}
        />
      </div>


      {/* Shared media / file / link section */}
      {activeThreadId && (
        <MediaSection
          threadId={activeThreadId}
          onOpenDetail={(t) => setMediaDetailTab(t)}
        />
      )}

      {/* User actions: nhóm chung, chặn, báo xấu, xoá bạn, xoá lịch sử */}
      {activeThreadId && (
        <UserActionSection
          userId={activeThreadId}
          userName={displayName}
          isFriend={isFriend}
          onMutualGroupsOpen={handleOpenMutualGroups}
          channelCap={channelCap}
          onFriendRemoved={() => {
            setIsFriendDB(false);
            if (activeAccountId) {
              useChatStore.getState().updateContact(activeAccountId, { contact_id: activeThreadId, is_friend: 0 });
            }
          }}
        />
      )}


      {/* Create group modal */}
      {createGroupOpen && activeThreadId && (
        <CreateGroupModal preSelected={[activeThreadId]} onClose={() => setCreateGroupOpen(false)} />
      )}
    </div>
    </>
  );
}

function UserActionBtn({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 py-1.5 px-0.5 rounded-xl hover:bg-gray-700/40 transition-colors text-center w-16"
      title={label}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-blue-600 text-white-important' : 'bg-gray-700 text-gray-400'
      }`}>
        {icon}
      </div>
      <span className={`text-[9px] leading-tight transition-colors ${active ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>{label}</span>
    </button>
  );
}
