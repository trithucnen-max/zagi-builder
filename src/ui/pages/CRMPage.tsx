import React, { useEffect, useCallback, useState } from 'react';
import { useCRMStore, CRMContact } from '@/store/crmStore';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore, LabelData } from '@/store/appStore';
import ipc from '@/lib/ipc';

// CRM Subcomponents
import CRMContactList from '../components/crm/contacts/CRMContactList';
import CRMContactDetailPanel from '../components/crm/contacts/CRMContactDetailPanel';
import BulkActionBar from '../components/crm/contacts/BulkActionBar';
import CampaignList from '../components/crm/campaigns/CampaignList';
import CampaignDetail from '../components/crm/campaigns/CampaignDetail';
import CampaignCreateModal from '../components/crm/campaigns/CampaignCreateModal';
import CampaignCloneModal from '../components/crm/campaigns/CampaignCloneModal';
import BulkLocalLabelModal from '../components/crm/modals/BulkLocalLabelModal';
import BulkZaloLabelModal from '../components/crm/modals/BulkZaloLabelModal';
import AddToCampaignModal from '../components/crm/modals/AddToCampaignModal';
import QueueStatusBar from '../components/crm/queue/QueueStatusBar';
import SendHistoryLog from '../components/crm/queue/SendHistoryLog';
import GroupMembersTab from '../components/crm/groups/GroupMembersTab';
import CRMSearchTab from '../components/crm/search/CRMSearchTab';
import CRMRequestsTab from '../components/crm/search/CRMRequestsTab';
import CRMPipelineTab from '../components/crm/pipeline/CRMPipelineTab';
import AddToContactsModal from '../components/crm/contacts/AddToContactsModal';
import AccountSelectorDropdown from '@/components/common/AccountSelectorDropdown';

export default function CRMPage() {
  const { activeAccountId, accounts, setActiveAccount } = useAccountStore();
  const { showNotification, openQuickChat, labels, setLabels, navigateToAnalytics, crmRequestUnseenByAccount, clearCRMRequestUnseen } = useAppStore();
  const store = useCRMStore();
  const hasUnreadRequestDot = !!(activeAccountId && crmRequestUnseenByAccount[activeAccountId]);

  const zaloLabels: LabelData[] = activeAccountId ? (labels[activeAccountId] || []) : [];

  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showCloneCampaign, setShowCloneCampaign] = useState(false);
  const [cloneCampaignId, setCloneCampaignId] = useState<number | null>(null);
  const [showBulkLocalModal, setShowBulkLocalModal] = useState(false);
  const [showBulkZaloModal, setShowBulkZaloModal] = useState(false);
  const [addToCampaignModal, setAddToCampaignModal] = useState(false);
  const [showPhoneImport, setShowPhoneImport] = useState(false);

  // ── Local labels state ──────────────────────────────────────────────────
  const [localLabels, setLocalLabels] = useState<Array<{ id: number; name: string; color: string; text_color?: string; emoji?: string }>>([]);
  const [localLabelThreadMap, setLocalLabelThreadMap] = useState<Record<string, number[]>>({});

  const loadLocalLabels = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const [labelsRes, threadsRes] = await Promise.all([
        ipc.db?.getLocalLabels({ zaloId: activeAccountId }),
        ipc.db?.getLocalLabelThreads({ zaloId: activeAccountId }),
      ]);
      setLocalLabels(labelsRes?.labels || []);
      // Build thread→labelIds map
      const map: Record<string, number[]> = {};
      (threadsRes?.threads || []).forEach((row: any) => {
        if (!map[row.thread_id]) map[row.thread_id] = [];
        map[row.thread_id].push(Number(row.label_id));
      });
      setLocalLabelThreadMap(map);
    } catch {}
  }, [activeAccountId]);

  useEffect(() => { loadLocalLabels(); }, [activeAccountId]);

  // Listen for local-labels-changed to refresh local labels
  useEffect(() => {
    const handler = () => { loadLocalLabels(); };
    window.addEventListener('local-labels-changed', handler);
    return () => window.removeEventListener('local-labels-changed', handler);
  }, [loadLocalLabels]);

  // Reset store state when exiting the CRM page (isolation requirement)
  useEffect(() => {
    return () => {
      useCRMStore.getState().reset();
    };
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    if (!activeAccountId) return;
    store.setContactsLoading(true);
    // Strip client-only filters (has_phone, has_notes) before sending to backend
    const backendContactTypes = store.filterContactTypes.filter(t => t !== 'has_phone' && t !== 'has_notes');
    const res = await ipc.crm?.getContacts({
      zaloId: activeAccountId,
      opts: {
        search: store.searchText,
        contactTypes: backendContactTypes.length > 0 ? backendContactTypes : undefined,
        contactType: backendContactTypes.length === 0 ? 'all' : undefined,
        sortBy: store.sortBy,
        sortDir: store.sortDir,
        limit: store.pageSize,
        offset: store.page * store.pageSize,
      },
    });
    store.setContactsLoading(false);
    if (res?.success) store.setContacts(res.contacts, res.total);
  }, [activeAccountId, store.searchText, store.filterContactTypes, store.sortBy, store.sortDir, store.page]);

  const loadCampaigns = useCallback(async () => {
    if (!activeAccountId) return;
    store.setCampaignsLoading(true);
    const res = await ipc.crm?.getCampaigns({ zaloId: activeAccountId });
    store.setCampaignsLoading(false);
    if (res?.success) store.setCampaigns(res.campaigns);
  }, [activeAccountId]);

  // Load group count from DB eagerly so the tab badge shows before entering the groups page
  const loadGroupCount = useCallback(async () => {
    if (!activeAccountId) return;
    const res = await ipc.db?.getContacts(activeAccountId);
    const allContacts: any[] = res?.contacts ?? res ?? [];
    const count = allContacts.filter((c: any) => c.contact_type === 'group').length;
    store.setGroupCount(count);
  }, [activeAccountId]);

  // Load request count from DB eagerly so the tab badge shows before entering the requests page
  const loadRequestCount = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const recRes = await ipc.db?.getFriendRequests({ zaloId: activeAccountId, direction: 'received' });
      const count = recRes?.requests?.length ?? 0;
      store.setRequestCount(count);
      if (count === 0) clearCRMRequestUnseen(activeAccountId);
    } catch {}
  }, [activeAccountId, clearCRMRequestUnseen]);

  useEffect(() => { loadContacts(); loadCampaigns(); loadGroupCount(); loadRequestCount(); }, [activeAccountId]);
  useEffect(() => { loadContacts(); }, [store.searchText, store.filterContactTypes, store.sortBy, store.sortDir, store.page]);
  useEffect(() => {
    if (activeAccountId && store.tab === 'requests') {
      clearCRMRequestUnseen(activeAccountId);
    }
  }, [activeAccountId, store.tab, clearCRMRequestUnseen]);

  // ── Load initial queue status when account changes ────────────────────────
  useEffect(() => {
    if (!activeAccountId) return;
    ipc.crm?.getQueueStatus({ zaloId: activeAccountId }).then(res => {
      if (res?.success && res.status) {
        store.updateQueueStatus(activeAccountId, {
          running: res.status.running,
          tokens: res.status.tokens,
          maxTokens: res.status.maxTokens ?? 60,
          lastSentAt: res.status.lastSentAt,
        });
      }
    });
  }, [activeAccountId]);

  // ── Real-time queue events ────────────────────────────────────────────────
  useEffect(() => {
    const unsubUpdate = ipc.on?.('crm:queueUpdate', (data: any) => {
      if (data.zaloId !== activeAccountId) return;
      store.updateQueueStatus(data.zaloId, {
        running: true,
        tokens: data.tokens,
        maxTokens: data.maxTokens ?? 60,
        lastSentAt: data.lastSentAt,
      });
      loadCampaigns();
    });

    // Rate-limited / status-only broadcasts (no send happened)
    const unsubStatus = ipc.on?.('crm:queueStatus', (data: any) => {
      if (data.zaloId !== activeAccountId) return;
      store.updateQueueStatus(data.zaloId, {
        running: data.running ?? true,   // false khi queue dừng hẳn
        tokens: data.tokens,
        maxTokens: data.maxTokens ?? 60,
        lastSentAt: data.lastSentAt,
      });
    });
    const unsubDone = ipc.on?.('crm:campaignDone', (data: any) => {
      if (data.zaloId !== activeAccountId) return;
      showNotification('Chiến dịch đã hoàn thành!', 'success');
      loadCampaigns();
      // Queue có thể đã dừng → refresh trạng thái để ẩn status bar nếu cần
      ipc.crm?.getQueueStatus({ zaloId: activeAccountId }).then(res => {
        if (res?.success && res.status) {
          store.updateQueueStatus(activeAccountId, {
            running: res.status.running,
            tokens: res.status.tokens,
            maxTokens: res.status.maxTokens ?? 60,
            lastSentAt: res.status.lastSentAt,
          });
        }
      });
    });
    return () => { unsubUpdate?.(); unsubStatus?.(); unsubDone?.(); };
  }, [activeAccountId]);

  // ── Campaign actions ─────────────────────────────────────────────────────
  const handleCreateCampaign = async (data: any) => {
    if (!activeAccountId) return;
    const res = await ipc.crm?.saveCampaign({ zaloId: activeAccountId, campaign: data });
    if (res?.success) {
      await loadCampaigns();
      store.setActiveCampaign(res.id);
      showNotification('Đã tạo chiến dịch', 'success');
    }
  };

  const handleUpdateCampaignStatus = async (id: number, status: string) => {
    await ipc.crm?.updateCampaignStatus({ campaignId: id, status });
    await loadCampaigns();
    showNotification(
      status === 'active' ? '▶ API Chiến dịch đang chạy'
        : status === 'paused' ? '⏸ Đã tạm dừng'
        : 'Đã cập nhật',
      'info'
    );
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!activeAccountId) return;
    await ipc.crm?.deleteCampaign({ zaloId: activeAccountId, campaignId: id });
    if (store.activeCampaignId === id) store.setActiveCampaign(null);
    await loadCampaigns();
  };

  const handleCloneCampaign = async (includeContacts: boolean, newName: string) => {
    if (!activeAccountId || cloneCampaignId === null) return;
    const res: { success: boolean; id?: number; error?: string } | undefined = await (ipc.crm?.cloneCampaign({ zaloId: activeAccountId, campaignId: cloneCampaignId, includeContacts, newName }) as any);
    if (res?.success) {
      await loadCampaigns();
      if (res.id) store.setActiveCampaign(res.id);
      showNotification('Đã nhân bản chiến dịch', 'success');
    } else {
      showNotification('Lỗi nhân bản: ' + (res?.error || 'Không rõ'), 'error');
    }
  };

  const handleAddContactsToCampaign = async (campaignId: number, contacts: any[]) => {
    if (!activeAccountId) return;
    await ipc.crm?.addCampaignContacts({ zaloId: activeAccountId, campaignId, contacts });
    await loadCampaigns();
    showNotification(`Đã thêm ${contacts.length} liên hệ vào chiến dịch`, 'success');
  };

  const handleUpdateCampaign = async (data: any) => {
    if (!activeAccountId || !store.activeCampaignId) return;
    const currentCampaign = store.campaigns.find(c => c.id === store.activeCampaignId);
    const res = await ipc.crm?.saveCampaign({
      zaloId: activeAccountId,
      campaign: {
        ...data,
        id: store.activeCampaignId,
        status: currentCampaign?.status ?? 'draft',  // giữ nguyên trạng thái hiện tại
      },
    });
    if (res?.success) {
      await loadCampaigns();
      showNotification('Đã cập nhật chiến dịch', 'success');
    } else {
      showNotification('Lỗi: Không thể lưu', 'error');
    }
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const handleBulkAddToCampaign = async () => {
    if (store.campaigns.length === 0) {
      showNotification('Hãy tạo chiến dịch trước', 'info');
      store.setTab('campaigns');
      return;
    }
    setAddToCampaignModal(true);
  };

  const handleBulkTagLocal = () => {
    setShowBulkLocalModal(true);
  };

  const handleBulkTagZalo = () => {
    setShowBulkZaloModal(true);
  };

  /** Select ALL contacts across all pages (not just current page) */
  const handleSelectAllPages = useCallback(async () => {
    if (!activeAccountId) return;
    const backendContactTypes = store.filterContactTypes.filter(t => t !== 'has_phone' && t !== 'has_notes');
    const res = await ipc.crm?.getContacts({
      zaloId: activeAccountId,
      opts: {
        search: store.searchText,
        contactTypes: backendContactTypes.length > 0 ? backendContactTypes : undefined,
        contactType: backendContactTypes.length === 0 ? 'all' : undefined,
        sortBy: store.sortBy,
        sortDir: store.sortDir,
        limit: 100000,
        offset: 0,
      },
    });
    if (res?.success) {
      store.selectAllContacts(res.contacts.map((c: any) => c.contact_id));
    }
  }, [activeAccountId, store.searchText, store.filterContactTypes, store.sortBy, store.sortDir]);

  /** Fetch toàn bộ liên hệ theo bộ lọc hiện tại (không phân trang) để xuất CSV */
  const handleExportAll = useCallback(async (): Promise<any[]> => {
    if (!activeAccountId) return [];
    const backendContactTypes = store.filterContactTypes.filter(t => t !== 'has_phone' && t !== 'has_notes');
    const res = await ipc.crm?.getContacts({
      zaloId: activeAccountId,
      opts: {
        search: store.searchText,
        contactTypes: backendContactTypes.length > 0 ? backendContactTypes : undefined,
        contactType: backendContactTypes.length === 0 ? 'all' : undefined,
        sortBy: store.sortBy,
        sortDir: store.sortDir,
        limit: 100000,
        offset: 0,
      },
    });
    return res?.success ? res.contacts : [];
  }, [activeAccountId, store.searchText, store.filterContactTypes, store.sortBy, store.sortDir]);

  const handleMessage = (contact: CRMContact) => {
    openQuickChat({
      target: { userId: contact.contact_id, displayName: contact.alias || contact.display_name, avatarUrl: contact.avatar, threadType: 0 },
      zaloId: activeAccountId ?? undefined,
    });
  };

  const queueStatus = store.queueStatus[activeAccountId || ''];
  const activeCampaign = store.campaigns.find(c => c.id === store.activeCampaignId) || null;
  const activeContact = store.contacts.find(c => c.contact_id === store.activeContactId) || null;

  // Client-side filtering: Zalo labels, local labels, has_phone, has_notes
  const filteredContacts = (() => {
    let result = store.contacts;

    // Filter by Zalo labels
    if (store.filterLabelIds.length > 0) {
      result = result.filter(c => {
        const isGroup = c.contact_type === 'group';
        const labelThreadId = isGroup ? `g${c.contact_id}` : c.contact_id;
        return store.filterLabelIds.every(labelId => {
          const convs = zaloLabels.find(l => l.id === labelId)?.conversations;
          return convs?.includes(c.contact_id) || convs?.includes(labelThreadId);
        });
      });
    }

    // Filter by local labels
    if (store.filterLocalLabelIds.length > 0) {
      result = result.filter(c => {
        const threadLIds = localLabelThreadMap[c.contact_id] || [];
        return store.filterLocalLabelIds.every(lid => threadLIds.includes(lid));
      });
    }

    // Client-side filter: has_phone
    if (store.filterContactTypes.includes('has_phone')) {
      result = result.filter(c => !!c.phone);
    }

    // Client-side filter: has_notes
    if (store.filterContactTypes.includes('has_notes')) {
      result = result.filter(c => c.note_count > 0);
    }

    // Client-side filter: gender
    if (store.filterGender === 'male') {
      result = result.filter(c => c.gender === 0);
    } else if (store.filterGender === 'female') {
      result = result.filter(c => c.gender === 1);
    } else if (store.filterGender === 'unknown') {
      result = result.filter(c => c.gender === null || c.gender === undefined);
    }

    // Client-side filter: birthday
    if (store.filterBirthday === 'has_birthday') {
      result = result.filter(c => !!c.birthday);
    } else if (store.filterBirthday === 'no_birthday') {
      result = result.filter(c => !c.birthday);
    } else if (store.filterBirthday === 'today') {
      const now = new Date();
      const todayDD = String(now.getDate()).padStart(2, '0');
      const todayMM = String(now.getMonth() + 1).padStart(2, '0');
      result = result.filter(c => {
        if (!c.birthday) return false;
        const parts = c.birthday.split('/');
        return parts.length >= 2 && parts[0] === todayDD && parts[1] === todayMM;
      });
    } else if (store.filterBirthday === 'this_week') {
      const now = new Date();
      const weekDates = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        weekDates.add(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      result = result.filter(c => {
        if (!c.birthday) return false;
        const parts = c.birthday.split('/');
        if (parts.length < 2) return false;
        return weekDates.has(`${parts[0]}/${parts[1]}`);
      });
    } else if (store.filterBirthday === 'this_month') {
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      result = result.filter(c => {
        if (!c.birthday) return false;
        const parts = c.birthday.split('/');
        return parts.length >= 2 && parts[1] === currentMonth;
      });
    }

    return result;
  })();

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-700 flex-shrink-0 bg-gray-850">
        <div className="flex bg-gray-800 rounded-lg p-0.5">
          {(['search', 'contacts', 'groups', 'requests', 'pipeline', 'campaigns', 'history'] as const).map(t => (
            <button key={t} onClick={() => store.setTab(t)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${store.tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {t === 'search' ? '🔍 Tìm kiếm'
                : t === 'contacts' ? `👤 Liên hệ${store.totalContacts ? ` (${store.totalContacts})` : ''}`
                : t === 'groups' ? `👥 Nhóm${store.groupCount ? ` (${store.groupCount})` : ''}`
                : t === 'requests' ? (
                  <span className="relative inline-flex items-center gap-1.5">
                    <span>{`📨 Lời mời${store.requestCount ? ` (${store.requestCount})` : ''}`}</span>
                    {hasUnreadRequestDot && (
                      <span className="w-2 h-2 bg-red-500 rounded-full border border-gray-900 flex-shrink-0" />
                    )}
                  </span>
                )
                : t === 'pipeline' ? '📊 Bảng Pipeline'
                : t === 'campaigns' ? `📢 Chiến dịch${store.campaigns.length ? ` (${store.campaigns.length})` : ''}`
                : t === 'history' ? '📋 Lịch sử'
                : t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Navigate to Analytics / Reports */}
        <button
          onClick={() => navigateToAnalytics('overview')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors"
          title="Xem báo cáo & phân tích"
        >
          📊
        </button>
        {/* Account selector */}
        <AccountSelectorDropdown
          options={accounts.map(a => ({ id: a.zalo_id, name: a.full_name, phone: a.phone, avatarUrl: a.avatar_url }))}
          activeId={activeAccountId}
          onSelect={setActiveAccount}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden flex-col">
        <div className="flex flex-1 overflow-hidden">

          {/* ── Contacts tab ── */}
          {store.tab === 'contacts' && (
            <>
              <div className="flex-1 flex flex-col overflow-hidden">
                <CRMContactList
                  contacts={filteredContacts}
                  total={
                    (store.filterLabelIds.length === 0 && store.filterLocalLabelIds.length === 0
                      && !store.filterContactTypes.includes('has_phone') && !store.filterContactTypes.includes('has_notes')
                      && store.filterGender === 'all' && store.filterBirthday === 'all')
                      ? store.totalContacts
                      : filteredContacts.length
                  }
                  page={store.page}
                  pageSize={store.pageSize}
                  loading={store.contactsLoading}
                  selectedIds={store.selectedContactIds}
                  activeContactId={store.activeContactId}
                  allLabels={zaloLabels}
                  filterLabelIds={store.filterLabelIds}
                  filterLocalLabelIds={store.filterLocalLabelIds}
                  filterContactTypes={store.filterContactTypes}
                  filterGender={store.filterGender}
                  filterBirthday={store.filterBirthday}
                  searchText={store.searchText}
                  sortBy={store.sortBy}
                  sortDir={store.sortDir}
                  activeAccountId={activeAccountId || ''}
                  localLabels={localLabels}
                  localLabelThreadMap={localLabelThreadMap}
                  onSelectContact={store.toggleSelectContact}
                  onActivateContact={id => store.setActiveContact(store.activeContactId === id ? null : id)}
                  onSelectAll={() => store.selectAllContacts(filteredContacts.map(c => c.contact_id))}
                  onClearAll={store.clearSelection}
                  onSelectAllPages={handleSelectAllPages}
                  onExportAll={handleExportAll}
                  onFilterChange={store.setFilter}
                  onPageChange={p => store.setFilter({ page: p })}
                  onMessage={handleMessage}
                  onImportPhones={() => setShowPhoneImport(true)}
                />
              </div>
              {activeContact && (
                <CRMContactDetailPanel
                  contact={activeContact}
                  allLabels={zaloLabels}
                  localLabels={localLabels}
                  localLabelThreadMap={localLabelThreadMap}
                  onClose={() => store.setActiveContact(null)}
                  onMessage={handleMessage}
                />
              )}
            </>
          )}

          {/* ── Campaigns tab ── */}
          {store.tab === 'campaigns' && (
            <>
              <div className="w-72 flex-shrink-0 border-r border-gray-700 overflow-hidden flex flex-col">
                <CampaignList
                  campaigns={store.campaigns}
                  loading={store.campaignsLoading}
                  activeId={store.activeCampaignId}
                  onSelect={store.setActiveCampaign}
                  onCreate={() => setShowCreateCampaign(true)}
                  onDelete={handleDeleteCampaign}
                  onClone={id => { setCloneCampaignId(id); setShowCloneCampaign(true); }}
                  onUpdateStatus={handleUpdateCampaignStatus}
                />
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                {activeCampaign ? (
                  <CampaignDetail
                     campaign={activeCampaign}
                     zaloId={activeAccountId || ''}
                     allLabels={zaloLabels}
                     localLabels={localLabels}
                     localLabelThreadMap={localLabelThreadMap}
                     onStatusChange={handleUpdateCampaignStatus}
                     onAddContacts={handleAddContactsToCampaign}
                     onUpdate={handleUpdateCampaign}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    <p className="text-sm">Chọn chiến dịch để xem chi tiết</p>
                    <button onClick={() => setShowCreateCampaign(true)}
                      className="mt-3 text-xs text-blue-400 hover:text-blue-300">Tạo chiến dịch mới →</button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── History tab ── */}
          {store.tab === 'history' && (
            <div className="flex-1 overflow-hidden">
              <SendHistoryLog campaigns={store.campaigns.map(c => ({ id: c.id, name: c.name }))} />
            </div>
          )}

          {/* ── Groups tab ── */}
          {store.tab === 'groups' && <GroupMembersTab />}

          {/* ── Search tab ── */}
          {store.tab === 'search' && (
            <div className="flex-1 overflow-hidden">
              <CRMSearchTab />
            </div>
          )}

          {/* ── Requests tab ── */}
          {store.tab === 'requests' && (
            <div className="flex-1 overflow-hidden">
              <CRMRequestsTab />
            </div>
          )}

          {/* ── Pipeline tab ── */}
          {store.tab === 'pipeline' && (
            <div className="flex-1 overflow-hidden">
              <CRMPipelineTab />
            </div>
          )}

        </div>

        <QueueStatusBar status={queueStatus} />
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={store.selectedContactIds.size}
        onClearSelection={store.clearSelection}
        onAddToCampaign={handleBulkAddToCampaign}
        onBulkTagLocal={handleBulkTagLocal}
        onBulkTagZalo={handleBulkTagZalo}
      />

      {/* ── Modals ── */}
      {showCreateCampaign && (
        <CampaignCreateModal zaloId={activeAccountId || ''} onClose={() => setShowCreateCampaign(false)} onSave={handleCreateCampaign} />
      )}

      {showCloneCampaign && cloneCampaignId !== null && (() => {
        const src = store.campaigns.find(c => c.id === cloneCampaignId);
        return src ? (
          <CampaignCloneModal
            campaignName={src.name}
            totalContacts={src.total_contacts}
            onClose={() => { setShowCloneCampaign(false); setCloneCampaignId(null); }}
            onConfirm={(includeContacts, newName) => handleCloneCampaign(includeContacts, newName)}
          />
        ) : null;
      })()}

      {/* Bulk local label modal (multi-select) */}
      <BulkLocalLabelModal
        isOpen={showBulkLocalModal}
        onClose={() => setShowBulkLocalModal(false)}
        selectedContactIds={store.selectedContactIds}
        localLabels={localLabels}
        activeAccountId={activeAccountId}
        onSuccess={loadLocalLabels}
      />

      {/* Bulk Zalo label modal (single-select) */}
      <BulkZaloLabelModal
        isOpen={showBulkZaloModal}
        onClose={() => setShowBulkZaloModal(false)}
        selectedContactIds={store.selectedContactIds}
        zaloLabels={zaloLabels}
        activeAccountId={activeAccountId}
      />

      {/* Add to campaign modal */}
      <AddToCampaignModal
        isOpen={addToCampaignModal}
        onClose={() => setAddToCampaignModal(false)}
        selectedContactIds={store.selectedContactIds}
        campaigns={store.campaigns}
        activeAccountId={activeAccountId}
        storeContacts={store.contacts}
        onSuccess={loadCampaigns}
      />

      {/* ── Phone import modal (Add SĐT to contacts) ── */}
      {showPhoneImport && (
        <AddToContactsModal
          onClose={() => setShowPhoneImport(false)}
          onDone={() => {
            setShowPhoneImport(false);
            loadContacts();
          }}
        />
      )}
    </div>
  );
}
