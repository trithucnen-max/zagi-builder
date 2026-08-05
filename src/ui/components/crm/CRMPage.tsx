import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useCRMStore, CRMContact } from '@/store/crmStore';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore, LabelData } from '@/store/appStore';
import ipc from '@/lib/ipc';
import CRMContactList from './contacts/CRMContactList';
import CRMContactDetailPanel from './contacts/CRMContactDetailPanel';
import BulkActionBar from './contacts/BulkActionBar';
import BulkSalutationModal from './contacts/BulkSalutationModal';
import CampaignList from './campaigns/CampaignList';
import CampaignDetail from './campaigns/CampaignDetail';
import CampaignCreateModal from './campaigns/CampaignCreateModal';
import CampaignCloneModal from './campaigns/CampaignCloneModal';
import CopyCampaignToAccountsModal from './campaigns/CopyCampaignToAccountsModal';
import TargetSelector from './campaigns/TargetSelector';
import ZaloLabelSelector from './tags/ZaloLabelSelector';
import LocalLabelSelector from '@/components/common/LocalLabelSelector';
import QueueStatusBar from './queue/QueueStatusBar';
import SendHistoryLog from './queue/SendHistoryLog';
import GroupMembersTab from './groups/GroupMembersTab';
import CRMSearchTab from './search/CRMSearchTab';
import CRMRequestsTab from './search/CRMRequestsTab';
import CRMPipelineTab from './pipeline/CRMPipelineTab';
import AddToContactsModal from './contacts/AddToContactsModal';
import CRMImportModal from './contacts/CRMImportModal';
import AppIcon from '@/components/common/AppIcon';

import BulkGroupManageModal from './modals/BulkGroupManageModal';
import SmartGroupModal from './modals/SmartGroupModal';
import { forceSyncFriends } from '@/lib/zaloInitUtils';
import UnifiedLabelPickerModal, { LoadedLabelOption } from './modals/UnifiedLabelPickerModal';
import AccountSelectorDropdown from '@/components/common/AccountSelectorDropdown';
import useIsMobile from '@/hooks/useIsMobile';
import { getCapability, type Channel } from '../../../configs/channelConfig';
import ScanPanel from './scan/ScanPanel';
import ScanHistoryTab from './scan/ScanHistoryTab';
import ScanStatsTab from './scan/ScanStatsTab';
import PhoneScanPanel from './scan/PhoneScanPanel';
const TAB_ICONS: Record<string, any> = {
  search: 'search',
  contacts: 'users',
  groups: 'users',
  requests: 'user_plus',
  pipeline: 'chart',
  campaigns: 'sparkles',
  history: 'file_text',
  scan: 'zap',
  scan_history: 'file_text',
  scan_stats: 'chart',
  phone_scan: 'phone',
};


// ── Wizard Step Indicator ────────────────────────────────────────────────
function WizardStepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: 'Tạo chiến dịch' },
    { num: 2, label: 'Thêm liên hệ' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {steps.map((s, i) => (
        <React.Fragment key={s.num}>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              s.num < currentStep
                ? 'bg-blue-600 text-white'
                : s.num === currentStep
                  ? 'bg-blue-600/20 text-blue-400 border-2 border-blue-500'
                  : 'bg-gray-700 text-gray-500'
            }`}>
              {s.num < currentStep ? '✓' : s.num}
            </div>
            <span className={`text-xs font-medium ${
              s.num <= currentStep ? 'text-gray-200' : 'text-gray-500'
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-0.5 ${
              s.num < currentStep ? 'bg-blue-500' : 'bg-gray-700'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ReassignOwnerModal({
  selectedCount,
  fromZaloId,
  accounts,
  onConfirm,
  onClose,
}: {
  selectedCount: number;
  fromZaloId: string;
  accounts: any[];
  onConfirm: (targetZaloId: string, mode: 'share' | 'move') => Promise<void>;
  onClose: () => void;
}) {
  const otherAccounts = accounts.filter(a => a.zalo_id !== fromZaloId);
  const [targetId, setTargetId] = useState<string>(otherAccounts[0]?.zalo_id || '');
  const [mode, setMode] = useState<'share' | 'move'>('share');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      await onConfirm(targetId, mode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>🔄</span> Chuyển / Chia sẻ liên hệ Zalo
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-300">
          Bạn đang chọn <strong className="text-blue-400 font-bold">{selectedCount}</strong> liên hệ. Vui lòng chọn tài khoản Zalo đích và hình thức xử lý:
        </p>

        {otherAccounts.length === 0 ? (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-xs text-yellow-300">
            ⚠️ Bạn chỉ đang đăng nhập 1 tài khoản Zalo. Vui lòng đăng nhập thêm tài khoản Zalo khác trên Zagi để thực hiện chuyển liên hệ.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Tài khoản Zalo đích nhận dữ liệu:</label>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
              >
                {otherAccounts.map(acc => (
                  <option key={acc.zalo_id} value={acc.zalo_id}>
                    {acc.name || acc.display_name || acc.zalo_id} ({acc.phone || acc.zalo_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2 border-t border-gray-700/60">
              <label className="text-xs font-medium text-gray-300 block">Hình thức thực hiện:</label>
              
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${mode === 'share' ? 'bg-blue-600/15 border-blue-500/60 text-white' : 'bg-gray-900/60 border-gray-700/70 text-gray-400 hover:border-gray-600'}`}>
                <input
                  type="radio"
                  name="reassign_mode"
                  value="share"
                  checked={mode === 'share'}
                  onChange={() => setMode('share')}
                  className="mt-0.5 accent-blue-500"
                />
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold text-gray-200">🤝 1. Chia sẻ liên hệ (Share)</div>
                  <div className="text-[11px] text-gray-400 leading-normal">
                    Sao chép dữ liệu + Nhãn sang Zalo mới để chạy chiến dịch. Zalo hiện tại <strong>vẫn giữ nguyên</strong> thông tin.
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${mode === 'move' ? 'bg-red-600/15 border-red-500/60 text-white' : 'bg-gray-900/60 border-gray-700/70 text-gray-400 hover:border-gray-600'}`}>
                <input
                  type="radio"
                  name="reassign_mode"
                  value="move"
                  checked={mode === 'move'}
                  onChange={() => setMode('move')}
                  className="mt-0.5 accent-red-500"
                />
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold text-gray-200">📦 2. Chuyển hẳn quyền sở hữu (Move)</div>
                  <div className="text-[11px] text-gray-400 leading-normal">
                    Chuyển toàn bộ dữ liệu + Nhãn sang Zalo mới và <strong>XÓA SẠCH</strong> khỏi danh sách Zalo hiện tại.
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Hủy
          </button>
          <button
            disabled={submitting || otherAccounts.length === 0 || !targetId}
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40 transition-colors flex items-center gap-1.5 ${mode === 'move' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {submitting && (
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {mode === 'move' ? 'Xác nhận Chuyển Hẳn' : 'Xác nhận Chia Sẻ'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const isMobile = useIsMobile();
  const { activeAccountId, accounts, setActiveAccount } = useAccountStore();
  const { showNotification, openQuickChat, labels, setLabels, navigateToAnalytics, crmRequestUnseenByAccount, clearCRMRequestUnseen } = useAppStore();
  const store = useCRMStore();
  const hasUnreadRequestDot = !!(activeAccountId && crmRequestUnseenByAccount[activeAccountId]);

  const activeAccount = accounts.find(a => a.zalo_id === activeAccountId);
  const isFacebookAccount = (activeAccount?.channel || 'zalo') === 'facebook';
  const channelCap = getCapability((activeAccount?.channel || 'zalo') as Channel);

  const zaloLabels: LabelData[] = activeAccountId ? (labels[activeAccountId] || []) : [];

  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showCloneCampaign, setShowCloneCampaign] = useState(false);
  const [cloneCampaignId, setCloneCampaignId] = useState<number | null>(null);
  const [copyToAccountsCampaign, setCopyToAccountsCampaign] = useState<CRMCampaign | null>(null);
  const [showBulkLocalModal, setShowBulkLocalModal] = useState(false);
  const [selectedUnifiedLabelValues, setSelectedUnifiedLabelValues] = useState<string[]>([]);
  const [indeterminateUnifiedLabelValues, setIndeterminateUnifiedLabelValues] = useState<string[]>([]);
  const [showBulkZaloModal, setShowBulkZaloModal] = useState(false);
  const [showBulkSalutationModal, setShowBulkSalutationModal] = useState(false);
  const [showBulkGroupModal, setShowBulkGroupModal] = useState<'add' | 'remove' | null>(null);
  const [bulkLabelIds, setBulkLabelIds] = useState<number[]>([]);
  const [bulkLocalLabelIds, setBulkLocalLabelIds] = useState<number[]>([]);
  const [applyingBulkLabel, setApplyingBulkLabel] = useState(false);
  const [showSmartGroupModal, setShowSmartGroupModal] = useState(false);
  const [addToCampaignModal, setAddToCampaignModal] = useState(false);
  const [selectedCampaignForAdd, setSelectedCampaignForAdd] = useState<number | null>(null);
  const [showCreateInAddModal, setShowCreateInAddModal] = useState(false);
  const [showPhoneImport, setShowPhoneImport] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSyncingZaloFriends, setIsSyncingZaloFriends] = useState(false);
  const creatingCampaignRef = useRef(false);

  const handleSyncZaloFriends = async () => {
    if (!activeAccountId) return;
    setIsSyncingZaloFriends(true);
    try {
      const acc = useAccountStore.getState().accounts.find(a => a.zalo_id === activeAccountId);
      if (!acc) {
        showNotification('Không tìm thấy tài khoản trong danh sách', 'error');
        return;
      }
      const auth = { cookies: acc.cookies || '', imei: acc.imei || '', userAgent: acc.user_agent || '', zaloId: acc.zalo_id };
      showNotification('Đang làm mới danh sách bạn bè mới nhất từ ứng dụng Zalo...', 'info');
      await forceSyncFriends(activeAccountId, auth);
      await loadContacts();
      showNotification('Làm mới danh bạ Zalo thành công!', 'success');
    } catch (err: any) {
      showNotification('Lỗi làm mới danh bạ Zalo: ' + (err?.message || 'Lỗi không xác định'), 'error');
    } finally {
      setIsSyncingZaloFriends(false);
    }
  };


  // ── Campaign creation wizard state ──────────────────────────────────
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); // 0=off, 2=add contacts
  const [wizardCampaignId, setWizardCampaignId] = useState<number | null>(null);


  // ── AI Assistants state ──────────────────────────────────────────────────
  const [assistants, setAssistants] = useState<any[]>([]);

  useEffect(() => {
    ipc.ai?.listAssistants().then(res => {
      if (res?.success) setAssistants(res.assistants || []);
    }).catch(() => {});
  }, []);


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

  // Listen for local-labels-changed & ui:threadLabelsChanged to refresh local labels
  useEffect(() => {
    const handler = () => { loadLocalLabels(); };
    window.addEventListener('local-labels-changed', handler);
    window.addEventListener('ui:threadLabelsChanged', handler);
    return () => {
      window.removeEventListener('local-labels-changed', handler);
      window.removeEventListener('ui:threadLabelsChanged', handler);
    };
  }, [loadLocalLabels]);

  // Option A: 100% Account Isolation — Auto-reset all filters & selections when switching activeAccountId
  const prevAccountIdRef = useRef(activeAccountId);
  useEffect(() => {
    if (prevAccountIdRef.current !== activeAccountId) {
      prevAccountIdRef.current = activeAccountId;

      // Reset selection & active contact detail view
      store.clearSelection();
      store.setActiveContact(null);

      // Reset all search & filter controls to default
      store.setFilter({
        searchText: '',
        filterLabelIds: [],
        filterLocalLabelIds: [],
        filterContactTypes: [],
        filterGender: 'all',
        filterBirthday: 'all',
        filterSalutation: 'all',
        page: 0,
      });
    }
  }, [activeAccountId, store]);

  // ── Load data ────────────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    if (!activeAccountId) return;

    store.setContactsLoading(true);
    // Strip client-only filters (has_phone, has_notes, has_real_name) before sending to backend
    const backendContactTypes = store.filterContactTypes.filter(t => t !== 'has_phone' && t !== 'has_notes' && t !== 'has_real_name');

    // Compute allowed contact IDs for selected Zalo labels
    const selectedZaloLabelContactIds = store.filterLabelIds.length > 0
      ? store.filterLabelIds.flatMap(labelId => {
          const conversations = zaloLabels.find(l => l.id === labelId)?.conversations || [];
          return conversations.map(cId => String(cId).startsWith('g') ? String(cId).slice(1) : String(cId));
        })
      : undefined;

    const res = await ipc.crm?.getContacts({
      zaloId: activeAccountId,
      opts: {
        search: store.searchText,
        tagIds: store.filterLocalLabelIds.length > 0 ? store.filterLocalLabelIds : undefined,
        contactIds: selectedZaloLabelContactIds,
        contactTypes: backendContactTypes.length > 0 ? backendContactTypes : undefined,
        contactType: backendContactTypes.length === 0 ? 'all' : undefined,
        sortBy: store.sortBy,
        sortDir: store.sortDir,
        limit: store.pageSize,
        offset: store.page * store.pageSize,
        gender: store.filterGender,
        birthdayFilter: store.filterBirthday,
        salutation: store.filterSalutation,
        hasPhone: store.filterContactTypes.includes('has_phone'),
        hasNotes: store.filterContactTypes.includes('has_notes'),
        hasRealName: store.filterContactTypes.includes('has_real_name'),
      },
    });
    store.setContactsLoading(false);
    if (res?.success) store.setContacts(res.contacts, res.total);
  }, [
    activeAccountId,
    store.searchText,
    store.filterContactTypes,
    store.filterLabelIds,
    store.filterLocalLabelIds,
    zaloLabels,
    store.sortBy,
    store.sortDir,
    store.page,
    store.filterGender,
    store.filterBirthday,
    store.filterSalutation
  ]);

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

  useEffect(() => {
    const disabledTabs: Record<string, boolean> = {
      search: !channelCap.supportsCRMSearch,
      requests: !channelCap.supportsFriendRequest,
      campaigns: !channelCap.supportsCampaigns,
      history: !channelCap.supportsCRMHistory,
      groups: !channelCap.supportsCRMGroups,
      scan: !channelCap.supportsScanData,
      scan_history: !channelCap.supportsScanData,
      scan_stats: !channelCap.supportsScanData,
      phone_scan: isFacebookAccount,
    };
    if (disabledTabs[store.tab]) store.setTab('contacts');
    loadContacts(); loadCampaigns(); loadGroupCount(); loadRequestCount();
  }, [activeAccountId]);
  useEffect(() => { loadContacts(); }, [store.searchText, store.filterContactTypes, store.filterLabelIds, store.filterLocalLabelIds, store.sortBy, store.sortDir, store.page, store.filterGender, store.filterBirthday, store.filterSalutation]);
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
          dailyPaused: res.status.dailyPaused,
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
        dailyPaused: false,
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
        dailyPaused: data.dailyPaused,
        type: data.type,
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
    // Remote campaign changes (boss/employee sync)
    const handleCampaignChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.ownerZaloId || detail.ownerZaloId === activeAccountId) {
        loadCampaigns();
      }
    };
    window.addEventListener('ui:campaignChanged', handleCampaignChange);
    return () => { unsubUpdate?.(); unsubStatus?.(); unsubDone?.(); window.removeEventListener('ui:campaignChanged', handleCampaignChange); };
  }, [activeAccountId]);

  // ── Campaign actions ─────────────────────────────────────────────────────
  const handleCreateCampaign = async (data: any) => {
    if (!activeAccountId || creatingCampaignRef.current) return;
    creatingCampaignRef.current = true;
    try {
      const res = await ipc.crm?.saveCampaign({ zaloId: activeAccountId, campaign: data });
      if (res?.success) {
        await loadCampaigns();
        if (res.id) {
          store.setActiveCampaign(res.id);
        }
        showNotification('🎉 Đã tạo chiến dịch thành công!', 'success');
        setShowCreateCampaign(false);
        if (wizardActive && res.id) {
          setWizardCampaignId(res.id);
          setWizardStep(2);
        }
      } else {
        showNotification(res?.error || 'Không thể tạo chiến dịch. Vui lòng thử lại.', 'error');
      }
    } catch (err: any) {
      showNotification('Lỗi khi tạo chiến dịch: ' + err.message, 'error');
    } finally {
      creatingCampaignRef.current = false;
    }
  };

  const handleUpdateCampaignStatus = async (id: number, status: string) => {
    const res = await ipc.crm?.updateCampaignStatus({ campaignId: id, status });
    await loadCampaigns();
    if (res && res.success === false) {
      showNotification(res.error || 'Không thể cập nhật trạng thái chiến dịch', 'error');
    } else {
      showNotification(
        status === 'active' ? '▶ Chiến dịch đang chạy'
          : status === 'paused' ? '⏸ Đã tạm dừng'
          : 'Đã cập nhật',
        'info'
      );
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!activeAccountId) return;
    await ipc.crm?.deleteCampaign({ zaloId: activeAccountId, campaignId: id });
    if (store.activeCampaignId === id) store.setActiveCampaign(null);
    await loadCampaigns();
  };

  const handleCloneCampaign = async (includeContacts: boolean, newName: string) => {
    if (!activeAccountId || cloneCampaignId === null) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const res = await ipc.crm?.addCampaignContacts({ zaloId: activeAccountId, campaignId, contacts });
    await loadCampaigns();
    if (res?.success) {
      if (res.limitExceeded) {
        showNotification(
          `Chiến dịch chỉ cho tối đa 1000 người. Đã thêm ${res.addedCount} và loại bỏ ${res.discardedCount} người vượt quá.`,
          'warning'
        );
      } else {
        showNotification(`Đã thêm ${res.addedCount || contacts.length} liên hệ vào chiến dịch`, 'success');
      }
    } else {
      showNotification('Lỗi: ' + (res?.error || 'Không thể thêm liên hệ'), 'error');
    }
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

  const handleCreateCampaignInAddModal = async (data: any) => {
    if (!activeAccountId || creatingCampaignRef.current) return;
    creatingCampaignRef.current = true;
    try {
      const res = await ipc.crm?.saveCampaign({ zaloId: activeAccountId, campaign: data });
      if (res?.success) {
        await loadCampaigns();
        showNotification('Đã tạo chiến dịch mới', 'success');
        if (res.id) {
          setSelectedCampaignForAdd(res.id);
          const contactMap = new Map(store.contacts.map(c => [c.contact_id, c]));
          const contacts = Array.from(store.selectedContactIds).map(id => {
            const c = contactMap.get(id);
            return {
              contactId: id,
              displayName: c?.alias || c?.display_name || c?.name || id,
              avatar: c?.avatar_url || c?.avatar || '',
              phone: c?.phone || '',
            };
          });
          if (contacts.length > 0) {
            await handleAddContactsToCampaign(res.id, contacts);
            store.clearSelection();
          }
          setShowCreateInAddModal(false);
          setAddToCampaignModal(false);
        }
      }
    } finally {
      creatingCampaignRef.current = false;
    }
  };

  // ── Wizard handlers ─────────────────────────────────────────────────────
  const handleWizardConfirmTargets = async (contacts: any[]) => {
    if (!wizardCampaignId || !activeAccountId) return;
    const toAdd = contacts.map(c => ({
      contactId: c.contact_id,
      displayName: c.alias || c.display_name,
      avatar: c.avatar,
      phone: c.phone || '',
    }));
    await handleAddContactsToCampaign(wizardCampaignId, toAdd);
    // Wizard complete
    setWizardActive(false);
    setWizardStep(0);
    setWizardCampaignId(null);
  };

  const handleWizardDismiss = () => {
    setWizardActive(false);
    setWizardStep(0);
    setWizardCampaignId(null);
  };

  const handleWizardCreateClose = () => {
    // On close in wizard mode = advance to step 2
    setShowCreateCampaign(false);
    setWizardStep(2);
  };

  const startWizard = () => {
    setWizardActive(true);
    setWizardStep(0);
    setWizardCampaignId(null);
    setShowCreateCampaign(true);
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const handleBulkAddToCampaign = async () => {
    setSelectedCampaignForAdd(null);
    setAddToCampaignModal(true);
    if (store.campaigns.filter(c => c.status !== 'done').length === 0) {
      setShowCreateInAddModal(true);
    }
  };

  const handleConfirmBulkSalutation = async (salutation: string, customSelfRef?: string) => {
    if (!activeAccountId || store.selectedContactIds.size === 0) return;

    if (customSelfRef) {
      try {
        const res = await ipc.crm.getSalutationMap();
        const currentMap = res?.map || {};
        const updatedMap = { ...currentMap, [salutation.trim().toLowerCase()]: customSelfRef.trim() };
        await ipc.crm.saveSalutationMap({ map: updatedMap });
      } catch (err: any) {
        console.error('[CRMPage] Error saving custom salutation map:', err);
      }
    }

    const selectedIds = Array.from(store.selectedContactIds);
    let successCount = 0;
    for (const cid of selectedIds) {
      try {
        const res = await ipc.db?.patchContactFields({
          zaloId: activeAccountId,
          contactId: cid,
          fields: { salutation }
        });
        if (res?.success !== false) successCount++;
      } catch (e) { /* ignore single error */ }
    }

    await loadContacts();
    showNotification(`🎉 Đã gán xưng hô "${salutation}" cho ${successCount} liên hệ`, 'success');
  };

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
      value: `zalo:${(l as any).zalo_id || (l as any).pageId || activeAccountId || ''}:${l.id}`,
      label: `${l.emoji || '🏷️'} ${l.text} (Zalo)`,
      source: 'zalo',
      color: l.color || '#3b82f6',
      textColor: '#ffffff',
      emoji: l.emoji || '🏷️',
      name: l.text,
      pageId: (l as any).zalo_id || (l as any).pageId || activeAccountId || '',
    }));

    return [...localOpts, ...zaloOpts];
  }, [localLabels, zaloLabels, activeAccountId]);

  const handleBulkTagLocal = () => {
    const selectedIds = Array.from(store.selectedContactIds);
    if (selectedIds.length === 0) return;
    const totalContacts = selectedIds.length;

    // Đếm tần suất xuất hiện của từng nhãn Local trên tập liên hệ được chọn
    const localLabelCounts: Record<number, number> = {};
    for (const contactId of selectedIds) {
      const labelIds = localLabelThreadMap[contactId] || [];
      const uniqueIds = new Set(labelIds);
      uniqueIds.forEach(id => {
        localLabelCounts[id] = (localLabelCounts[id] || 0) + 1;
      });
    }

    // Đếm tần suất xuất hiện của từng nhãn Zalo trên tập liên hệ được chọn
    const zaloLabelCounts: Record<string, number> = {};
    for (const contactId of selectedIds) {
      zaloLabels.forEach(zl => {
        if (zl.conversations && zl.conversations.includes(contactId)) {
          const key = `zalo:${(zl as any).zalo_id || (zl as any).pageId || activeAccountId || ''}:${zl.id}`;
          zaloLabelCounts[key] = (zaloLabelCounts[key] || 0) + 1;
        }
      });
    }

    const checkedSet = new Set<string>();
    const indeterminateSet = new Set<string>();

    // Phân loại nhãn Local: 100% người có -> Checked [✓] | 1..N-1 người có -> Indeterminate [-]
    Object.entries(localLabelCounts).forEach(([idStr, count]) => {
      const val = `local:${idStr}`;
      if (count === totalContacts) {
        checkedSet.add(val);
      } else if (count > 0) {
        indeterminateSet.add(val);
      }
    });

    // Phân loại nhãn Zalo
    Object.entries(zaloLabelCounts).forEach(([val, count]) => {
      if (count === totalContacts) {
        checkedSet.add(val);
      } else if (count > 0) {
        indeterminateSet.add(val);
      }
    });

    setSelectedUnifiedLabelValues(Array.from(checkedSet));
    setIndeterminateUnifiedLabelValues(Array.from(indeterminateSet));
    setShowBulkLocalModal(true);
  };

  const handleBulkTagZalo = () => {
    setBulkLabelIds([]);
    setShowBulkZaloModal(true);
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(store.selectedContactIds);
    if (ids.length === 0) return;
    if (window.confirm(`Bạn có chắc chắn muốn xóa ${ids.length} liên hệ đã chọn? Toàn bộ lịch sử tin nhắn, nhãn và ghi chú sẽ bị xóa khỏi ứng dụng.`)) {
      store.setContactsLoading(true);
      let successCount = 0;
      for (const contactId of ids) {
        const res = await ipc.db?.deleteConversation({ zaloId: activeAccountId || '', contactId });
        if (res?.success) successCount++;
      }
      store.clearSelection();
      loadContacts();
      showNotification(`Đã xóa thành công ${successCount}/${ids.length} liên hệ`, "success");
    }
  };

  /** Bulk-assign Zalo labels to all selected contacts via Zalo API */
  const handleApplyBulkLabel = async () => {
    if (!activeAccountId || bulkLabelIds.length === 0) return;
    setApplyingBulkLabel(true);
    try {
      const acc = useAccountStore.getState().getActiveAccount();
      if (!acc) throw new Error('No account');
      const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

      // Fetch fresh labels to avoid version mismatch
      const freshRes = await ipc.zalo?.getLabels({ auth });
      const freshLabels: LabelData[] = freshRes?.response?.labelData || zaloLabels;
      const version: number = freshRes?.response?.version || 0;

      const selectedContactIds = [...store.selectedContactIds];
      const updated = freshLabels.map(label => {
        if (!bulkLabelIds.includes(label.id)) return label;
        const existing = new Set(label.conversations || []);
        selectedContactIds.forEach(id => existing.add(id));
        return { ...label, conversations: [...existing] };
      });

      const res = await ipc.zalo?.updateLabels({ auth, labelData: updated, version });
      if (res?.success) {
        const finalLabels: LabelData[] = res.response?.labelData || updated;
        setLabels(activeAccountId, finalLabels);
        showNotification(`Đã gán nhãn Zalo cho ${store.selectedContactIds.size} liên hệ`, 'success');
        setShowBulkZaloModal(false);
        setBulkLabelIds([]);
        store.clearSelection();
      } else {
        throw new Error(res?.error || 'Không thể gán nhãn');
      }
    } catch (err: any) {
      showNotification('Lỗi: ' + (err?.message || 'Không rõ'), 'error');
    }
    setApplyingBulkLabel(false);
  };

  /** Bulk-sync both local and Zalo labels for all selected contacts (3-state aware: empty = clear all) */
  const handleApplyUnifiedLabels = async (selectedValues: string[], indeterminateValues: string[] = []) => {
    if (!activeAccountId) return;
    setApplyingBulkLabel(true);
    try {
      const selectedContactIds = [...store.selectedContactIds];
      const addLocalLabelIds = new Set<number>();
      const addZaloLabelIds = new Set<number>();

      const keepLocalLabelIds = new Set<number>();
      const keepZaloLabelIds = new Set<number>();

      selectedValues.forEach(val => {
        if (val.startsWith('local:')) {
          const id = parseInt(val.replace('local:', ''), 10);
          if (!isNaN(id)) addLocalLabelIds.add(id);
        } else if (val.startsWith('zalo:')) {
          const parts = val.split(':');
          const id = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(id)) addZaloLabelIds.add(id);
        }
      });

      indeterminateValues.forEach(val => {
        if (val.startsWith('local:')) {
          const id = parseInt(val.replace('local:', ''), 10);
          if (!isNaN(id)) keepLocalLabelIds.add(id);
        } else if (val.startsWith('zalo:')) {
          const parts = val.split(':');
          const id = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(id)) keepZaloLabelIds.add(id);
        }
      });

      // 1. Process Local Labels for each selected contact
      for (const contactId of selectedContactIds) {
        const currentLabelIds = new Set(localLabelThreadMap[contactId] || []);

        // A) Xóa nhãn bị gỡ (Không có trong addLocalLabelIds VÀ không có trong keepLocalLabelIds)
        for (const oldId of currentLabelIds) {
          if (!addLocalLabelIds.has(oldId) && !keepLocalLabelIds.has(oldId)) {
            await ipc.db?.removeLocalLabelFromThread({ zaloId: activeAccountId, labelId: oldId, threadId: contactId });
          }
        }

        // B) Gán nhãn được chọn gán cho tất cả ([✓]) nếu liên hệ chưa có
        for (const newId of addLocalLabelIds) {
          if (!currentLabelIds.has(newId)) {
            await ipc.db?.assignLocalLabelToThread({ zaloId: activeAccountId, labelId: newId, threadId: contactId });
          }
        }
        // Các nhãn thuộc keepLocalLabelIds ([-] Indeterminate) sẽ GIỮ NGUYÊN trên liên hệ đó
      }

      // 2. Process Zalo Labels (if present)
      if (zaloLabels.length > 0) {
        const acc = useAccountStore.getState().getActiveAccount();
        if (acc) {
          const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
          const freshRes = await ipc.zalo?.getLabels({ auth });
          const freshLabels: LabelData[] = freshRes?.response?.labelData || zaloLabels;
          const version: number = freshRes?.response?.version || 0;

          const updated = freshLabels.map(label => {
            let conversations = label.conversations || [];
            if (addZaloLabelIds.has(label.id)) {
              // Gán cho tất cả liên hệ được chọn
              selectedContactIds.forEach(cid => {
                if (!conversations.includes(cid)) conversations = [...conversations, cid];
              });
            } else if (!keepZaloLabelIds.has(label.id)) {
              // Bị gỡ bỏ: xóa tất cả liên hệ được chọn khỏi nhãn Zalo này
              conversations = conversations.filter(cid => !selectedContactIds.includes(cid));
            }
            return { ...label, conversations };
          });

          const res = await ipc.zalo?.updateLabels({ auth, labelData: updated, version });
          if (res?.success) {
            setLabels(activeAccountId, res.response?.labelData || updated);
          }
        }
      }

      const isClearing = selectedValues.length === 0 && indeterminateValues.length === 0;
      showNotification(
        isClearing
          ? `Đã xóa toàn bộ nhãn cho ${selectedContactIds.length} liên hệ`
          : `Đã cập nhật nhãn cho ${selectedContactIds.length} liên hệ`,
        'success'
      );
      setShowBulkLocalModal(false);
      setSelectedUnifiedLabelValues([]);
      setIndeterminateUnifiedLabelValues([]);
      store.clearSelection();
      window.dispatchEvent(new CustomEvent('local-labels-changed', { detail: { zaloId: activeAccountId } }));
      loadLocalLabels();
    } catch (err: any) {
      showNotification('Lỗi: ' + (err?.message || 'Không rõ'), 'error');
    }
    setApplyingBulkLabel(false);
  };

  /** Smart group management (admin actions / leave groups) */
  const handleManageGroups = () => setShowSmartGroupModal(true);


  /** Select ALL contacts across all pages (not just current page) */
  const handleSelectAllPages = useCallback(async () => {
    if (!activeAccountId) return;
    const backendContactTypes = store.filterContactTypes.filter(t => t !== 'has_phone' && t !== 'has_notes' && t !== 'has_real_name');
    const res = await ipc.crm?.getContacts({
      zaloId: activeAccountId,
      opts: {
        search: store.searchText,
        contactTypes: backendContactTypes.length > 0 ? backendContactTypes : undefined,
        contactType: backendContactTypes.length === 0 ? 'all' : undefined,
        sortBy: store.sortBy,
        sortDir: store.sortDir,
        hasPhone: store.filterContactTypes.includes('has_phone'),
        hasNotes: store.filterContactTypes.includes('has_notes'),
        hasRealName: store.filterContactTypes.includes('has_real_name'),
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
    const backendContactTypes = store.filterContactTypes.filter(t => t !== 'has_phone' && t !== 'has_notes' && t !== 'has_real_name');
    const res = await ipc.crm?.getContacts({
      zaloId: activeAccountId,
      opts: {
        search: store.searchText,
        contactTypes: backendContactTypes.length > 0 ? backendContactTypes : undefined,
        contactType: backendContactTypes.length === 0 ? 'all' : undefined,
        sortBy: store.sortBy,
        sortDir: store.sortDir,
        hasPhone: store.filterContactTypes.includes('has_phone'),
        hasNotes: store.filterContactTypes.includes('has_notes'),
        hasRealName: store.filterContactTypes.includes('has_real_name'),
        limit: 100000,
        offset: 0,
      },
    });
    return res?.success ? res.contacts : [];
  }, [activeAccountId, store.searchText, store.filterContactTypes, store.sortBy, store.sortDir]);

  const handleMessage = (contact: CRMContact) => {    openQuickChat({
      target: { userId: contact.contact_id, displayName: contact.alias || contact.display_name, avatarUrl: contact.avatar, threadType: 0 },
      zaloId: activeAccountId ?? undefined,
    });
  };

  const queueStatus = store.queueStatus[activeAccountId || ''];
  const activeCampaign = store.campaigns.find(c => c.id === store.activeCampaignId) || null;
  const activeContact = store.contacts.find(c => c.contact_id === store.activeContactId) || null;

  // Client-side filtering: now handled entirely at DB/Backend level
  const filteredContacts = store.contacts;

  const [showReassignModal, setShowReassignModal] = useState(false);

  const handleConfirmReassign = async (targetZaloId: string, mode: 'share' | 'move' = 'share') => {
    if (!activeAccountId || !targetZaloId) return;
    const contactIds = Array.from(store.selectedContactIds);
    if (!contactIds.length) return;

    try {
      const res = await ipc.crm?.reassignContactsOwner({
        fromZaloId: activeAccountId,
        targetZaloId,
        contactIds,
        mode,
      });

      if (res?.success) {
        const targetAcc = accounts.find(a => a.zalo_id === targetZaloId);
        const targetName = targetAcc?.name || targetAcc?.display_name || targetZaloId;
        const actionText = mode === 'move' ? 'chuyển hẳn' : 'chia sẻ (kèm nhãn)';
        showNotification(`Đã ${actionText} ${res.reassignedCount || contactIds.length} liên hệ sang tài khoản ${targetName}`, 'success');
        store.clearSelection();
        setShowReassignModal(false);
        loadContacts();
        loadLocalLabels();
      } else {
        showNotification(res?.error || 'Lỗi: Không thể thực hiện chuyển liên hệ', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'Có lỗi xảy ra', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 md:px-5 py-2.5 md:py-3 border-b border-gray-700 flex-shrink-0 bg-gray-850">
        {/* Mobile Hamburger menu button */}
        {isMobile && (
          <button
            onClick={() => useAppStore.getState().setMobileSidebarOpen(true)}
            title="Menu"
            className="w-8.5 h-8.5 flex items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}

        {isMobile ? (
          /* Mobile Dropdown Hamburger Selector for CRM sub-tabs */
          <div className="relative flex-1 min-w-0">
            <select
              value={store.tab}
              onChange={(e) => store.setTab(e.target.value as any)}
              className="w-full bg-gray-800 text-white font-bold text-xs rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 appearance-none pr-8 cursor-pointer"
            >
              <option value="contacts">👥 Liên hệ ({store.totalContacts || 0})</option>
              {channelCap.supportsCampaigns && <option value="campaigns">🚀 Chiến dịch ({store.campaigns.length || 0})</option>}
              {channelCap.supportsCRMGroups && <option value="groups">👥 Nhóm ({store.groupCount || 0})</option>}
              {channelCap.supportsFriendRequest && <option value="requests">📩 Lời mời kết bạn ({store.requestCount || 0})</option>}
              {channelCap.supportsCRMSearch && <option value="search">🔍 Tìm kiếm CRM</option>}
              {channelCap.supportsScanData && <option value="scan">🔍 Quét dữ liệu & Nhóm</option>}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none text-gray-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        ) : (
          /* Desktop sub-tabs bar */
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {(['search', 'contacts', 'groups', 'requests', 'pipeline', 'phone_scan', 'campaigns', 'history', 'scan', 'scan_history', 'scan_stats'] as const).filter(t => {
              if (t === 'search') return channelCap.supportsCRMSearch;
              if (t === 'requests') return channelCap.supportsFriendRequest;
              if (t === 'campaigns') return channelCap.supportsCampaigns;
              if (t === 'history') return channelCap.supportsCRMHistory;
              if (t === 'groups') return channelCap.supportsCRMGroups;
              if (t === 'scan' || t === 'scan_history' || t === 'scan_stats') return channelCap.supportsScanData;
              if (t === 'phone_scan') return !isFacebookAccount;
              return true; // contacts and pipeline always shown
            }).map(t => (
              <button key={t} onClick={() => store.setTab(t)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${store.tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                <span className="flex items-center gap-1.5">
                  <AppIcon
                    name={TAB_ICONS[t] || 'zap'}
                    className={store.tab === t ? 'text-white' : 'text-black dark:text-gray-400'}
                    size={14}
                  />
                  <span>
                    {t === 'search' ? 'Tìm kiếm'
                      : t === 'contacts' ? `Liên hệ${store.totalContacts ? ` (${store.totalContacts})` : ''}`
                      : t === 'groups' ? `Nhóm${store.groupCount ? ` (${store.groupCount})` : ''}`
                      : t === 'requests' ? `Lời mời${store.requestCount ? ` (${store.requestCount})` : ''}`
                      : t === 'pipeline' ? 'Bảng Pipeline'
                      : t === 'campaigns' ? `Chiến dịch${store.campaigns.length ? ` (${store.campaigns.length})` : ''}`
                      : t === 'history' ? 'Lịch sử'
                      : t === 'scan' ? 'Quét dữ liệu'
                      : t === 'scan_history' ? 'Lịch sử quét'
                      : t === 'scan_stats' ? 'Thống kê'
                      : t === 'phone_scan' ? 'Quét SĐT hàng loạt'
                      : t}
                  </span>
                  {t === 'requests' && hasUnreadRequestDot && (
                    <span className="w-2 h-2 bg-red-500 rounded-full border border-gray-900 flex-shrink-0" />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {/* Làm mới danh bạ Zalo (chỉ hiện trên Desktop) */}
        {!isMobile && !isFacebookAccount && (
          <button
            onClick={handleSyncZaloFriends}
            disabled={isSyncingZaloFriends}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            title="Cập nhật ngay bạn bè mới kết bạn trên ứng dụng Zalo"
          >
            <AppIcon name="rotate-cw" size={14} className={isSyncingZaloFriends ? 'animate-spin text-blue-400' : 'text-blue-400'} />
            <span>{isSyncingZaloFriends ? 'Đang làm mới...' : 'Làm mới danh bạ'}</span>
          </button>
        )}
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
                  total={store.totalContacts}
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
                  filterSalutation={store.filterSalutation}
                  allContactsForFilter={store.contacts}
                  searchText={store.searchText}
                  sortBy={store.sortBy}
                  sortDir={store.sortDir}
                  activeAccountId={activeAccountId || ''}
                  localLabels={localLabels}
                  localLabelThreadMap={localLabelThreadMap}
                  assistants={assistants}
                  onSelectContact={store.toggleSelectContact}
                  onActivateContact={id => store.setActiveContact(store.activeContactId === id ? null : id)}
                  onSelectAll={() => store.selectAllContacts(filteredContacts.map(c => c.contact_id))}
                  onClearAll={store.clearSelection}
                  onSelectAllPages={handleSelectAllPages}
                  onExportAll={handleExportAll}
                  onFilterChange={store.setFilter}
                  onPageChange={p => store.setFilter({ page: p })}
                  onMessage={handleMessage}
                  onImportPhones={channelCap.supportsCRMPhoneImport ? () => setShowPhoneImport(true) : undefined}
                  onImportData={channelCap.supportsCRMPhoneImport ? () => setShowImportModal(true) : undefined}
                  onDeleteContact={async (contactId) => {
                    if (window.confirm("Bạn có chắc chắn muốn xóa liên hệ này? Toàn bộ lịch sử tin nhắn, nhãn và ghi chú sẽ bị xóa khỏi ứng dụng.")) {
                      const res = await ipc.db?.deleteConversation({ zaloId: activeAccountId || '', contactId });
                      if (res?.success) {
                        loadContacts();
                        showNotification("Đã xóa liên hệ thành công", "success");
                      } else {
                        showNotification("Xóa liên hệ thất bại: " + (res?.error || 'Lỗi không xác định'), "error");
                      }
                    }
                  }}
                  onPatchContact={async (contactId, fields) => {
                    const aiFields = {
                      assistantId: fields.ai_assistant_id,
                      autoSummary: fields.ai_auto_summary,
                      threshold: fields.ai_auto_summary_threshold,
                    };
                    const normalFields = {
                      alias: fields.alias,
                      salutation: fields.salutation,
                      phone: fields.phone,
                      gender: fields.gender,
                      birthday: fields.birthday,
                      real_name: fields.real_name,
                      full_name_raw: fields.full_name_raw,
                    };

                    let hasAiUpdate = aiFields.assistantId !== undefined || aiFields.autoSummary !== undefined || aiFields.threshold !== undefined;
                    let hasNormalUpdate = normalFields.alias !== undefined || normalFields.salutation !== undefined || normalFields.phone !== undefined || normalFields.gender !== undefined || normalFields.birthday !== undefined || normalFields.real_name !== undefined || normalFields.full_name_raw !== undefined;

                    try {
                      let success = true;
                      if (hasAiUpdate && activeAccountId) {
                        const res = await ipc.db?.updateContactAIConfig({
                          ownerZaloId: activeAccountId,
                          contactId,
                          ...aiFields
                        });
                        if (!res?.success) success = false;
                      }
                      if (hasNormalUpdate) {
                        const res = await ipc.db?.patchContactFields({
                          zaloId: activeAccountId || '',
                          contactId,
                          fields: normalFields
                        });
                        if (!res?.success) success = false;
                      }

                      if (success) {
                        loadContacts();
                      } else {
                        showNotification("Lưu thất bại: Lỗi không xác định", "error");
                      }
                    } catch (err: any) {
                      showNotification("Lưu thất bại: " + err.message, "error");
                    }
                  }}
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
              {isMobile ? (
                <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-900">
                  {activeCampaign ? (
                    <div className="absolute inset-0 z-30 bg-gray-900 flex flex-col">
                      <div className="px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => store.setActiveCampaign(null)}
                          className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 py-1.5 px-3 rounded-xl bg-blue-500/10 border border-blue-500/30"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                          </svg>
                          <span>Danh sách chiến dịch</span>
                        </button>
                        <span className="text-xs text-gray-300 font-bold truncate flex-1">{activeCampaign.name}</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <CampaignDetail
                          campaign={activeCampaign}
                          zaloId={activeAccountId || ''}
                          allLabels={zaloLabels}
                          localLabels={localLabels}
                          localLabelThreadMap={localLabelThreadMap}
                          onStatusChange={handleUpdateCampaignStatus}
                          onAddContacts={handleAddContactsToCampaign}
                          onUpdate={handleUpdateCampaign}
                        queueStatus={queueStatus}
                         />
                      </div>
                    </div>
                  ) : (
                    <CampaignList
                      campaigns={store.campaigns}
                      loading={store.campaignsLoading}
                      activeId={store.activeCampaignId}
                      onSelect={store.setActiveCampaign}
                      onCreate={startWizard}
                      onDelete={handleDeleteCampaign}
                      onClone={id => { setCloneCampaignId(id); setShowCloneCampaign(true); }}
                      onCopyToAccounts={c => setCopyToAccountsCampaign(c)}
                      onUpdateStatus={handleUpdateCampaignStatus}
                      zaloId={activeAccountId || ''}
                      queueStatus={queueStatus}
                    />
                  )}
                </div>
              ) : (
                <>
                  <div className="w-[340px] flex-shrink-0 overflow-hidden flex flex-col">
                    <CampaignList
                      campaigns={store.campaigns}
                      loading={store.campaignsLoading}
                      activeId={store.activeCampaignId}
                      onSelect={store.setActiveCampaign}
                      onCreate={startWizard}
                      onDelete={handleDeleteCampaign}
                      onClone={id => { setCloneCampaignId(id); setShowCloneCampaign(true); }}
                      onCopyToAccounts={c => setCopyToAccountsCampaign(c)}
                      onUpdateStatus={handleUpdateCampaignStatus}
                      zaloId={activeAccountId || ''}
                      queueStatus={queueStatus}
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
                        onClone={id => { setCloneCampaignId(id); setShowCloneCampaign(true); }}
                        onCopyToAccounts={c => setCopyToAccountsCampaign(c)}
                        queueStatus={queueStatus}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
                          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                        </svg>
                        <p className="text-sm font-medium">Chọn chiến dịch để xem chi tiết</p>
                        <button onClick={startWizard}
                          className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-semibold">Tạo chiến dịch mới →</button>
                      </div>
                    )}
                  </div>
                </>
              )}
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
              {isMobile ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-gray-900 text-gray-400">
                  <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mb-3 text-2xl">📊</div>
                  <h4 className="text-sm font-bold text-gray-200 mb-1">Bảng Pipeline Kanban</h4>
                  <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                    Tính năng kéo thả Kanban tối ưu cho màn hình máy tính PC. Vui lòng chuyển sang tab Liên hệ để quản lý trên di động.
                  </p>
                  <button
                    onClick={() => store.setTab('contacts')}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow transition-colors"
                  >
                    Về danh sách Liên hệ
                  </button>
                </div>
              ) : (
                <CRMPipelineTab />
              )}
            </div>
          )}

          {/* ── Scan Data tab ── */}
          {store.tab === 'scan' && (
            <div className="flex-1 overflow-hidden">
              <ScanPanel accountId={activeAccountId || ''} />
            </div>
          )}

          {/* ── Scan History tab ── */}
          {store.tab === 'scan_history' && (
            <div className="flex-1 overflow-hidden">
              <ScanHistoryTab accountId={activeAccountId || ''} />
            </div>
          )}

          {/* ── Scan Stats tab ── */}
          {store.tab === 'scan_stats' && (
            <div className="flex-1 overflow-hidden">
              <ScanStatsTab accountId={activeAccountId || ''} />
            </div>
          )}

          {/* ── Phone Scan tab ── */}
          {store.tab === 'phone_scan' && (
            <div className="flex-1 overflow-hidden">
              <PhoneScanPanel />
            </div>
          )}

        </div>

        <QueueStatusBar status={queueStatus} />
      </div>

      {store.tab === 'contacts' && (
        <BulkActionBar
          channel={activeAccount?.channel || 'zalo'}
          selectedCount={store.selectedContactIds.size}
          hasGroupSelected={store.contacts.some(c => store.selectedContactIds.has(c.contact_id) && c.contact_type === 'group')}
          onClearSelection={store.clearSelection}
          onAddToCampaign={handleBulkAddToCampaign}
          onBulkTagLocal={handleBulkTagLocal}
          onBulkTagZalo={handleBulkTagZalo}
          onBulkSalutation={() => setShowBulkSalutationModal(true)}
          onManageGroups={handleManageGroups}
          onBulkManageGroups={(mode) => setShowBulkGroupModal(mode)}
          onReassignOwner={() => setShowReassignModal(true)}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      {/* ── Modals ── */}
      {showBulkSalutationModal && (
        <BulkSalutationModal
          selectedCount={store.selectedContactIds.size}
          onConfirm={handleConfirmBulkSalutation}
          onClose={() => setShowBulkSalutationModal(false)}
        />
      )}
      {showReassignModal && (
        <ReassignOwnerModal
          selectedCount={store.selectedContactIds.size}
          fromZaloId={activeAccountId || ''}
          accounts={accounts}
          onConfirm={handleConfirmReassign}
          onClose={() => setShowReassignModal(false)}
        />
      )}
      {showCreateCampaign && (
        <CampaignCreateModal
          zaloId={activeAccountId || ''}
          onClose={wizardActive ? handleWizardCreateClose : () => setShowCreateCampaign(false)}
          onSave={handleCreateCampaign}
        />
      )}

      {/* Wizard: Step 2 — Add contacts */}
      {wizardActive && wizardStep === 2 && wizardCampaignId !== null && (
        <TargetSelector
          zaloId={activeAccountId || ''}
          allLabels={zaloLabels}
          localLabels={localLabels}
          localLabelThreadMap={localLabelThreadMap}
          existingContactIds={new Set()}
          onConfirm={handleWizardConfirmTargets}
          onClose={handleWizardDismiss}
          headerContent={<WizardStepIndicator currentStep={2} />}
        />
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

      {copyToAccountsCampaign && (
        <CopyCampaignToAccountsModal
          campaignId={copyToAccountsCampaign.id}
          campaignName={copyToAccountsCampaign.name}
          currentZaloId={activeAccountId || ''}
          onClose={() => setCopyToAccountsCampaign(null)}
          onSuccess={() => {
            loadCampaigns();
          }}
        />
      )}

      {/* Unified Label Picker modal (multi-select 3-state, supports empty = clear all, local & zalo) */}
      {showBulkLocalModal && (
        <UnifiedLabelPickerModal
          open={showBulkLocalModal}
          onClose={() => setShowBulkLocalModal(false)}
          options={unifiedLabelOptions}
          selected={selectedUnifiedLabelValues}
          indeterminate={indeterminateUnifiedLabelValues}
          onChange={setSelectedUnifiedLabelValues}
          onIndeterminateChange={setIndeterminateUnifiedLabelValues}
          onConfirm={handleApplyUnifiedLabels}
          accounts={accounts}
          selectedCount={store.selectedContactIds.size}
          applying={applyingBulkLabel}
          onNewLabelCreated={() => {
            loadLocalLabels();
          }}
        />
      )}

      {/* Bulk Zalo label modal (single-select) */}
      {showBulkZaloModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowBulkZaloModal(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-80 p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-white mb-1">☁️ Gán nhãn Zalo</h3>
            <p className="text-xs text-gray-400 mb-3">
              Áp dụng cho <span className="text-blue-400 font-medium">{store.selectedContactIds.size}</span> liên hệ đã chọn
              <span className="text-gray-500 ml-1">(chỉ 1 nhãn / hội thoại)</span>
            </p>
            {zaloLabels.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">Chưa có nhãn Zalo nào. Hãy đồng bộ nhãn từ header trước.</p>
            ) : (
              <ZaloLabelSelector
                allLabels={zaloLabels}
                selectedIds={bulkLabelIds}
                onChange={setBulkLabelIds}
                singleSelect
              />
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowBulkZaloModal(false)}
                className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">
                Hủy
              </button>
              <button onClick={handleApplyBulkLabel}
                disabled={bulkLabelIds.length === 0 || applyingBulkLabel}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40">
                {applyingBulkLabel ? 'Đang gán...' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkGroupModal && (
        <BulkGroupManageModal
          isOpen={!!showBulkGroupModal}
          mode={showBulkGroupModal}
          initialContactIds={Array.from(store.selectedContactIds)}
          activeAccountId={activeAccountId}
          onClose={() => {
            setShowBulkGroupModal(null);
            store.clearSelection();
          }}
          onSuccess={() => {
            // onSuccess callback to refresh list if needed
          }}
        />
      )}

      {/* Add to campaign modal */}
      {addToCampaignModal && !showCreateInAddModal && (() => {
        const availableCampaigns = store.campaigns.filter(c => c.status !== 'done');
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setAddToCampaignModal(false)}>
            <div className="bg-gray-800 border border-gray-600 rounded-2xl w-80 p-5 shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Chọn chiến dịch</h3>
                <button
                  onClick={() => setShowCreateInAddModal(true)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg hover:bg-blue-500/10">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Tạo mới
                </button>
              </div>

              {availableCampaigns.length === 0 ? (
                /* ── Empty state ── */
                <div className="flex flex-col items-center py-4 gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  </div>
                  <p className="text-sm text-gray-300 text-center font-medium">Chưa có chiến dịch phù hợp</p>
                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    Tất cả chiến dịch đã hoàn thành hoặc chưa có chiến dịch nào.
                  </p>
                  <button
                    onClick={() => setShowCreateInAddModal(true)}
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors flex items-center justify-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Tạo chiến dịch mới
                  </button>
                  <button onClick={() => setAddToCampaignModal(false)}
                    className="w-full py-1.5 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">
                    Hủy
                  </button>
                </div>
              ) : (
                /* ── Campaign list ── */
                <>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableCampaigns.map(c => (
                      <button key={c.id} onClick={() => setSelectedCampaignForAdd(c.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors
                          ${selectedCampaignForAdd === c.id
                            ? 'border-blue-500 bg-blue-500/20 text-white'
                            : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                        <span className="flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            c.status === 'active' ? 'bg-green-400' : c.status === 'paused' ? 'bg-yellow-400' : 'bg-gray-500'
                          }`} />
                          {c.name}
                        </span>
                        <span className="block text-xs text-gray-500 mt-0.5 pl-3">{c.total_contacts} liên hệ</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setAddToCampaignModal(false)}
                      className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">Hủy</button>
                    <button disabled={!selectedCampaignForAdd}
                      onClick={async () => {
                        if (!selectedCampaignForAdd || !activeAccountId) return;
                        const contactMap = new Map(store.contacts.map(c => [c.contact_id, c]));
                        const contacts = Array.from(store.selectedContactIds).map(id => {
                          const c = contactMap.get(id);
                          return {
                            contactId: id,
                            displayName: c?.alias || c?.display_name || c?.name || id,
                            avatar: c?.avatar_url || c?.avatar || '',
                            phone: c?.phone || '',
                          };
                        });
                        await handleAddContactsToCampaign(selectedCampaignForAdd, contacts);
                        store.clearSelection();
                        setAddToCampaignModal(false);
                      }}
                      className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40">
                      Thêm {store.selectedContactIds.size} liên hệ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Inline create campaign from add-to-campaign modal */}
      {showCreateInAddModal && (
        <CampaignCreateModal
          zaloId={activeAccountId || ''}
          onClose={() => setShowCreateInAddModal(false)}
          onSave={handleCreateCampaignInAddModal}
        />
      )}

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

      {/* ── CSV Import modal (Import danh sách khách hàng) ── */}
      {showImportModal && (
        <CRMImportModal
          onClose={() => setShowImportModal(false)}
          onDone={() => {
            setShowImportModal(false);
            loadContacts();
          }}
        />
      )}


      {showSmartGroupModal && (
        <SmartGroupModal
          selectedGroupIds={store.contacts
            .filter(c => store.selectedContactIds.has(c.contact_id) && c.contact_type === 'group')
            .map(c => c.contact_id)}
          activeAccountId={activeAccountId || ''}
          onClose={() => setShowSmartGroupModal(false)}
          onSuccess={() => {
            loadContacts();
            store.clearSelection();
          }}
        />
      )}
    </div>
  );
}

