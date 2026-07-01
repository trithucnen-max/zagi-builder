import React, { useState, useEffect, useRef } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { type LeaveMode } from './BulkLeaveGroupModal';

// ─── Types ────────────────────────────────────────────────────────────────────


interface SmartGroupModalProps {
  selectedGroupIds: string[];
  activeAccountId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface LogEntry {
  time: string;
  text: string;
  status: 'success' | 'error' | 'warning' | 'info';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SpinIcon = () => (
  <svg className="animate-spin flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt={name} style={{ width: size, height: size }}
      className="rounded-full object-cover flex-shrink-0" onError={() => setErr(true)} />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── AI Farewell Helper ───────────────────────────────────────────────────────

function AIFarewellHelper({ onInsert }: { onInsert: (text: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [show, setShow] = useState(false);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      const listRes = await ipc.ai?.listAssistants();
      const assistantId = listRes?.assistants?.[0]?.id || 'default';
      const res = await ipc.ai?.chat(assistantId, [
        { role: 'system', content: 'Bạn soạn lời tạm biệt khi rời nhóm Zalo. Viết 2-4 câu ngắn gọn, lịch sự, chân thành. Không dùng cụm từ sáo rỗng. Chỉ trả về nội dung tin nhắn.' },
        { role: 'user', content: prompt },
      ]);
      if (res?.success && res?.result) {
        onInsert(res.result.trim());
        setShow(false);
        setPrompt('');
      } else {
        alert(res?.error || 'Kiểm tra cấu hình AI trong Cài đặt.');
      }
    } catch (e: any) {
      alert(`Lỗi AI: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setShow(v => !v)}
        className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full font-semibold border transition-colors ${
          show 
            ? 'bg-[#0068ff] border-[#0068ff] text-white' 
            : 'border-[#0068ff]/30 text-[#0068ff] dark:text-blue-400 hover:bg-[#0068ff]/5 dark:hover:bg-blue-500/5'
        }`}
      >
        ✨ AI soạn lời chào
      </button>
      {show && (
        <div className="mt-2 p-2.5 bg-white dark:bg-[#161616] border border-gray-200 dark:border-gray-800 rounded-xl space-y-1.5 shadow-sm">
          <div className="flex gap-1.5">
            <input value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="VD: cảm ơn nhóm, rời vì không còn hoạt động..."
              className="flex-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1 text-[11px] text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#0068ff]"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); generate(); } }} />
            <button type="button" disabled={generating || !prompt.trim()} onClick={generate}
              className="px-3 py-1 rounded-lg bg-[#0068ff] hover:bg-[#005cd9] disabled:opacity-40 text-white text-[10px] font-semibold flex items-center gap-1 flex-shrink-0 transition-colors">
              {generating ? <SpinIcon /> : null}
              {generating ? '' : 'Soạn'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main SmartGroupModal ─────────────────────────────────────────────────────

export default function SmartGroupModal({
  selectedGroupIds, activeAccountId, onClose, onSuccess,
}: SmartGroupModalProps) {
  const { showNotification } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [adminGroups, setAdminGroups] = useState<any[]>([]);
  const [memberGroups, setMemberGroups] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  
  // Owner group states
  const [ownerGroupIds, setOwnerGroupIds] = useState<Set<string>>(new Set());
  const [appointedOwners, setAppointedOwners] = useState<Record<string, string>>({});
  const [ownerGroupActions, setOwnerGroupActions] = useState<Record<string, 'leave' | 'disperse'>>({});
  const [groupMembersList, setGroupMembersList] = useState<Record<string, any[]>>({});

  // Leave Options
  const [mode, setMode] = useState<LeaveMode>('normal');
  const [blockAfterLeave, setBlockAfterLeave] = useState(false);
  const [farewellMessage, setFarewellMessage] = useState('');

  const logEndRef = useRef<HTMLDivElement>(null);

  const auth = (() => {
    const acc = useAccountStore.getState().getActiveAccount();
    return acc ? { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent } : null;
  })();

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Load data & classify roles
  useEffect(() => {
    if (!activeAccountId || !selectedGroupIds.length) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      try {
        const [contactsRes, membersRes] = await Promise.all([
          ipc.db?.getContacts(activeAccountId),
          ipc.db?.getAllGroupMembers({ zaloId: activeAccountId }),
        ]);

        const contacts: any[] = contactsRes?.contacts ?? contactsRes ?? [];
        const rows: any[] = membersRes?.rows ?? [];

        // Identify admin/owner groups
        const adminGroupIds = new Set<string>();
        const tempOwnerGroupIds = new Set<string>();
        const memMap: Record<string, Set<string>> = {};

        for (const r of rows) {
          if (!memMap[r.group_id]) memMap[r.group_id] = new Set();
          memMap[r.group_id].add(r.member_id);
          if (r.member_id === activeAccountId) {
            if (r.role === 1 || r.role === 2) {
              adminGroupIds.add(r.group_id);
            }
            if (r.role === 2) {
              tempOwnerGroupIds.add(r.group_id);
            }
          }
        }
        setOwnerGroupIds(tempOwnerGroupIds);

        // Fetch group members for each Owner group that is selected
        const ownerGroupsList = selectedGroupIds.filter(id => tempOwnerGroupIds.has(id));
        const membersListMap: Record<string, any[]> = {};
        for (const groupId of ownerGroupsList) {
          try {
            const mRes = await ipc.db?.getGroupMembers({ zaloId: activeAccountId, groupId });
            const groupMems = (mRes?.members ?? []).filter((m: any) => m.member_id !== activeAccountId);
            membersListMap[groupId] = groupMems;
          } catch (e) {
            console.error(`Error loading members for group ${groupId}:`, e);
            membersListMap[groupId] = [];
          }
        }
        setGroupMembersList(membersListMap);

        const initialActions: Record<string, 'leave' | 'disperse'> = {};
        for (const id of ownerGroupsList) {
          initialActions[id] = 'leave';
        }
        setOwnerGroupActions(initialActions);

        // Map group info
        const groupContacts: any[] = contacts.filter(c => c.contact_type === 'group');
        const mapGroup = (id: string): any => {
          const g = groupContacts.find(c => c.contact_id === id);
          return {
            contact_id: id,
            display_name: g?.display_name || id,
            avatar_url: g?.avatar_url || '',
            memberCount: memMap[id]?.size ?? 0,
          };
        };

        const admin = selectedGroupIds.filter(id => adminGroupIds.has(id)).map(mapGroup);
        const member = selectedGroupIds.filter(id => !adminGroupIds.has(id)).map(mapGroup);

        setAdminGroups(admin);
        setMemberGroups(member);
      } catch (e) {
        console.error('SmartGroupModal load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeAccountId, selectedGroupIds]);

  const addLog = (text: string, status: LogEntry['status']) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev, { time, text, status }]);
  };

  const executeLeave = async () => {
    if (!auth) return;

    // Extra validation
    const ownerGroupsToLeave = adminGroups.filter((g: any) => ownerGroupIds.has(g.contact_id) && (ownerGroupActions[g.contact_id] || 'leave') === 'leave');
    for (const g of ownerGroupsToLeave) {
      if (!appointedOwners[g.contact_id]) {
        showNotification(`Vui lòng chọn thành viên nhận quyền Trưởng nhóm cho nhóm "${g.display_name}"`, 'error');
        return;
      }
    }

    setGlobalRunning(true);
    setLogs([]);
    const allSelectedGroups = [...adminGroups, ...memberGroups];
    setTotal(allSelectedGroups.length);
    let currentProgress = 0;

    addLog(`Bắt đầu xử lý ${allSelectedGroups.length} nhóm đã chọn...`, 'info');

    const isSilent = mode === 'silent';
    const hasFarewell = mode === 'farewell' && !!farewellMessage.trim();

    for (let i = 0; i < allSelectedGroups.length; i++) {
      const g = allSelectedGroups[i];
      const isAdmin = adminGroups.some((x: any) => x.contact_id === g.contact_id);
      const isOwner = ownerGroupIds.has(g.contact_id);
      const action = ownerGroupActions[g.contact_id] || 'leave';

      currentProgress++;
      setProgress(currentProgress);

      addLog(`👉 Đang xử lý nhóm: "${g.display_name}"...`, 'info');

      try {
        // Giải tán nhóm nếu là Owner và chọn Giải tán
        if (isOwner && action === 'disperse') {
          addLog(`  ↳ Đang giải tán nhóm trên Zalo...`, 'info');
          try {
            const disperseRes = await ipc.zalo?.disperseGroup({ auth, groupId: g.contact_id });
            if (disperseRes?.success) {
              addLog(`✓ Giải tán nhóm "${g.display_name}" thành công`, 'success');
              
              // Xóa khỏi DB local
              try {
                await ipc.db?.deleteConversation({ zaloId: activeAccountId, contactId: g.contact_id });
              } catch (dbErr: any) {
                console.error('Lỗi dọn DB local:', dbErr);
              }
              
              if (i < allSelectedGroups.length - 1) {
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
              }
              continue;
            } else {
              addLog(`✗ Không thể giải tán nhóm "${g.display_name}" → ${disperseRes?.error || 'Lỗi không xác định'}`, 'error');
              continue;
            }
          } catch (err: any) {
            addLog(`✗ Lỗi hệ thống khi giải tán: ${err.message || 'Lỗi'}`, 'error');
            continue;
          }
        }

        // Chuyển quyền Trưởng nhóm trước nếu mình là Owner và chọn Nhượng quyền
        if (isOwner && action === 'leave') {
          const newOwnerId = appointedOwners[g.contact_id];
          if (newOwnerId) {
            addLog(`  ↳ Đang chuyển quyền Trưởng nhóm sang thành viên ${newOwnerId}...`, 'info');
            try {
              const ownerRes = await ipc.zalo?.changeGroupOwner({ auth, groupId: g.contact_id, userId: newOwnerId });
              if (ownerRes?.success) {
                addLog(`  ↳ Chuyển quyền Trưởng nhóm thành công.`, 'success');
                await new Promise(r => setTimeout(r, 800));
              } else {
                addLog(`  ↳ ✗ Không thể chuyển quyền Trưởng nhóm: ${ownerRes?.error || 'Lỗi không xác định'}`, 'error');
                addLog(`  ↳ Bỏ qua rời nhóm "${g.display_name}" do chuyển quyền thất bại.`, 'warning');
                continue;
              }
            } catch (err: any) {
              addLog(`  ↳ ✗ Lỗi hệ thống khi chuyển quyền: ${err.message || 'Lỗi'}`, 'error');
              continue;
            }
          } else {
            addLog(`  ↳ ✗ Bỏ qua: Chưa chọn người nhận quyền Trưởng nhóm.`, 'error');
            continue;
          }
        }

        // Gửi lời chào trước khi rời (Áp dụng cho cả nhóm quản lý và nhóm member)
        if (hasFarewell) {
          try {
            await ipc.zalo?.sendMessage({ auth, message: farewellMessage.trim(), threadId: g.contact_id, type: 1 });
            addLog(`  ↳ Đã gửi lời chào tạm biệt.`, 'success');
            await new Promise(r => setTimeout(r, 600));
          } catch (e: any) {
            addLog(`  ↳ ⚠️ Không thể gửi lời chào: ${e.message || 'Lỗi'}`, 'warning');
          }
        }

        // Gọi API rời nhóm (nhóm quản lý rời bình thường, không im lặng)
        const silentParam = !isAdmin ? isSilent : false;
        const res = await ipc.zalo?.leaveGroup({ auth, groupId: g.contact_id, silent: silentParam });

        if (res?.success) {
          addLog(`✓ Đã rời nhóm "${g.display_name}" thành công`, 'success');

          // Xóa khỏi DB local
          try {
            await ipc.db?.deleteConversation({ zaloId: activeAccountId, contactId: g.contact_id });
          } catch (dbErr: any) {
            console.error('Lỗi dọn DB local:', dbErr);
          }

          // Chặn thêm lại (chỉ áp dụng đối với nhóm member nếu người dùng chọn)
          if (!isAdmin && blockAfterLeave) {
            try {
              const membersRes = await ipc.db?.getGroupMembers({ zaloId: activeAccountId, groupId: g.contact_id });
              const groupMems = membersRes?.members || [];
              const adminsToBlock = groupMems.filter((m: any) => m.role === 1 || m.role === 2);

              for (const adm of adminsToBlock) {
                if (adm.member_id === activeAccountId) continue;
                await ipc.zalo?.blockUser({ auth, userId: adm.member_id });
                addLog(`  ↳ Đã chặn admin ${adm.display_name || adm.member_id}`, 'info');
              }
            } catch (blockErr: any) {
              addLog(`  ↳ ⚠️ Lỗi chặn admin: ${blockErr.message || 'Lỗi'}`, 'warning');
            }
          }
        } else {
          addLog(`✗ Không thể rời nhóm "${g.display_name}" → ${res?.error || 'Lỗi từ Zalo'}`, 'error');
        }
      } catch (e: any) {
        addLog(`✗ Lỗi hệ thống xử lý "${g.display_name}": ${e.message}`, 'error');
      }

      if (i < allSelectedGroups.length - 1) {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
      }
    }

    addLog(`Hoàn thành quy trình xử lý.`, 'info');
    setGlobalRunning(false);
    showNotification('Đã hoàn thành rời các nhóm đã chọn', 'success');
    onSuccess?.();
  };

  const isSingle = selectedGroupIds.length === 1;
  const targetGroup = isSingle ? (adminGroups[0] || memberGroups[0]) as any : null;
  const targetGroupId = targetGroup?.contact_id;
  const isOwner = targetGroupId ? ownerGroupIds.has(targetGroupId) : false;
  const isAdmin = targetGroupId ? adminGroups.some((x: any) => x.contact_id === targetGroupId) : false;

  const handleSilentChange = (checked: boolean) => {
    if (checked) {
      setMode('silent');
    } else {
      setMode('normal');
    }
  };

  const handleFarewellChange = (checked: boolean) => {
    if (checked) {
      setMode('farewell');
    } else {
      setMode('normal');
    }
  };

  const isFarewell = mode === 'farewell';
  const hasOwnerGroupWithoutAppointment = selectedGroupIds
    .filter(id => ownerGroupIds.has(id) && (ownerGroupActions[id] || 'leave') === 'leave')
    .some(id => !appointedOwners[id]);

  const canExecute = !globalRunning && 
    (!isFarewell || farewellMessage.trim().length > 0) &&
    !hasOwnerGroupWithoutAppointment;

  const modeOptions: { value: LeaveMode; icon: string; label: string; desc: string }[] = [
    { value: 'normal',   icon: '📢', label: 'Bình thường',      desc: 'Thông báo cho nhóm biết bạn đã rời' },
    { value: 'silent',   icon: '🤫', label: 'Im lặng',          desc: 'Rời không thông báo (Chỉ áp dụng với nhóm không quản lý)' },
    { value: 'farewell', icon: '👋', label: 'Gửi lời chào',     desc: 'Gửi tin nhắn tạm biệt trước khi rời (Hỗ trợ AI soạn tin)' },
  ];

  const ownerGroupsToAppoint = adminGroups.filter((g: any) => ownerGroupIds.has(g.contact_id));
  const hasNonOwner = selectedGroupIds.some(id => !ownerGroupIds.has(id));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onClick={() => { if (!globalRunning) onClose(); }}>
      <div className="bg-[#f4f4f4] dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl w-full max-w-[440px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="bg-white dark:bg-[#161616] flex items-center justify-between px-5 py-4 border-b border-gray-200/60 dark:border-gray-800 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm">
              {isSingle 
                ? (isOwner ? 'Rời nhóm và chuyển quyền Trưởng nhóm?' : 'Rời nhóm và xóa trò chuyện này?')
                : 'Rời nhóm hàng loạt'}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 font-normal">
              {isSingle 
                ? (targetGroup?.display_name || 'Đang xác định nhóm...') 
                : `Rời khỏi ${selectedGroupIds.length} nhóm đã tích chọn`}
            </p>
          </div>
          <button onClick={onClose} disabled={globalRunning}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16 text-gray-400 gap-2 bg-white dark:bg-[#161616]">
            <SpinIcon /><span className="text-xs">Đang tải cấu trúc nhóm...</span>
          </div>
        ) : (
          <>
            {/* ── Main Content ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              
              {/* Single Group Details */}
              {isSingle && targetGroup && (
                <div className="flex items-center gap-3 p-3.5 bg-white dark:bg-[#161616] border border-gray-200/80 dark:border-gray-800 rounded-xl shadow-sm">
                  <Avatar src={targetGroup.avatar_url} name={targetGroup.display_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-200 truncate">{targetGroup.display_name}</h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-455 mt-0.5">
                      {targetGroup.memberCount ? `${targetGroup.memberCount} thành viên` : 'Chưa có thông tin thành viên'}
                      <span className="mx-1.5 text-gray-300 dark:text-gray-700">·</span>
                      <span className={isOwner ? 'text-yellow-600 dark:text-yellow-450 font-semibold' : isAdmin ? 'text-blue-600 dark:text-blue-450 font-semibold' : 'text-gray-500 dark:text-gray-400'}>
                        {isOwner ? 'Trưởng nhóm' : isAdmin ? 'Phó nhóm' : 'Thành viên'}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Bổ nhiệm Trưởng nhóm mới hoặc Giải tán nhóm (cho cả single và bulk nếu có nhóm là owner) */}
              {ownerGroupsToAppoint.map((g: any) => {
                const members = groupMembersList[g.contact_id] || [];
                const hasMembers = members.length > 0;
                const action = ownerGroupActions[g.contact_id] || 'leave';
                return (
                  <div key={g.contact_id} className="space-y-3 p-3.5 bg-white dark:bg-[#161616] border border-gray-200/80 dark:border-gray-800 rounded-xl shadow-sm">
                    <div className="text-[10px] text-yellow-600 dark:text-yellow-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                      👑 Lựa chọn tác vụ {isSingle ? '' : `cho "${g.display_name}"`}
                    </div>
                    
                    {/* Selector chọn hành động */}
                    <div className="flex gap-2 p-1 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg border border-gray-200 dark:border-gray-800 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setOwnerGroupActions(prev => ({ ...prev, [g.contact_id]: 'leave' }))}
                        className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-all ${
                          action === 'leave'
                            ? 'bg-[#0068ff] text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-150 dark:hover:bg-gray-800'
                        }`}
                      >
                        👑 Nhượng quyền & Rời
                      </button>
                      <button
                        type="button"
                        onClick={() => setOwnerGroupActions(prev => ({ ...prev, [g.contact_id]: 'disperse' }))}
                        className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-all ${
                          action === 'disperse'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-150 dark:hover:bg-gray-800'
                        }`}
                      >
                        ❌ Giải tán nhóm
                      </button>
                    </div>

                    {action === 'leave' ? (
                      <>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                          Bạn bắt buộc phải chuyển quyền Trưởng nhóm cho một thành viên khác trước khi rời.
                        </p>
                        {hasMembers ? (
                          <select
                            value={appointedOwners[g.contact_id] || ''}
                            onChange={e => setAppointedOwners(prev => ({ ...prev, [g.contact_id]: e.target.value }))}
                            disabled={globalRunning}
                            className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#0068ff] disabled:opacity-50"
                          >
                            <option value="">-- Chọn thành viên nhận quyền Trưởng nhóm --</option>
                            {members.map(m => (
                              <option key={m.member_id} value={m.member_id}>
                                {m.display_name || m.member_id} ({m.member_id})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg p-2.5 flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <span>Chưa có dữ liệu thành viên. Hãy tải thông tin thành viên của nhóm trước.</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[10px] text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg p-2.5 flex items-start gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 flex-shrink-0">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span>⚠️ <b>Cảnh báo:</b> Hành động này sẽ giải tán/hủy nhóm Zalo vĩnh viễn, kick tất cả thành viên ra và xóa cuộc trò chuyện. Không thể khôi phục!</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Tùy chọn rời nhóm (Zalo style) */}
              <div className="space-y-2.5">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider pl-0.5">Tùy chọn rời nhóm</p>
                
                <div className="border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#161616] rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-850 shadow-sm">
                  {/* Checkbox: Rời trong im lặng */}
                  {hasNonOwner && (
                    <div 
                      onClick={() => !globalRunning && handleSilentChange(mode !== 'silent')}
                      className="flex items-start gap-3 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/10 transition-colors cursor-pointer"
                    >
                      <div className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        mode === 'silent' 
                          ? 'bg-[#0068ff] border-[#0068ff]' 
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a]'
                      }`}>
                        {mode === 'silent' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-semibold ${mode === 'silent' ? 'text-[#0068ff] dark:text-blue-400 font-bold' : 'text-gray-800 dark:text-gray-200 font-medium'}`}>
                          Rời nhóm trong im lặng
                        </span>
                        <p className="text-[10px] text-gray-500 dark:text-gray-450 mt-0.5">Chỉ trưởng và phó nhóm biết bạn rời nhóm</p>
                      </div>
                    </div>
                  )}

                  {/* Checkbox: Chặn thêm vào nhóm */}
                  {hasNonOwner && (
                    <div 
                      onClick={() => !globalRunning && setBlockAfterLeave(!blockAfterLeave)}
                      className="flex items-start gap-3 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/10 transition-colors cursor-pointer"
                    >
                      <div className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        blockAfterLeave 
                          ? 'bg-[#0068ff] border-[#0068ff]' 
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a]'
                      }`}>
                        {blockAfterLeave && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-semibold ${blockAfterLeave ? 'text-[#0068ff] dark:text-blue-400 font-bold' : 'text-gray-800 dark:text-gray-200 font-medium'}`}>
                          Chặn thêm vào nhóm này
                        </span>
                        <p className="text-[10px] text-gray-500 dark:text-gray-455 mt-0.5">Người khác phải mời bạn qua link</p>
                      </div>
                    </div>
                  )}

                  {/* Checkbox: Gửi lời chào trước khi rời */}
                  <div 
                    onClick={() => !globalRunning && handleFarewellChange(mode !== 'farewell')}
                    className="flex items-start gap-3 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/10 transition-colors cursor-pointer"
                  >
                    <div className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                      mode === 'farewell' 
                        ? 'bg-[#0068ff] border-[#0068ff]' 
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a]'
                    }`}>
                      {mode === 'farewell' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold ${mode === 'farewell' ? 'text-[#0068ff] dark:text-blue-400 font-bold' : 'text-gray-800 dark:text-gray-200 font-medium'}`}>
                        Gửi lời chào trước khi rời nhóm
                      </span>
                      <p className="text-[10px] text-gray-500 dark:text-gray-455 mt-0.5">Gửi tin nhắn tạm biệt trước khi rời (Hỗ trợ AI soạn tin)</p>
                    </div>
                  </div>
                </div>

                {/* Farewell message text area */}
                {mode === 'farewell' && (
                  <div className="space-y-2 pt-1">
                    <textarea value={farewellMessage} onChange={e => setFarewellMessage(e.target.value)}
                      disabled={globalRunning}
                      placeholder="Nhập lời chào tạm biệt..."
                      rows={3}
                      className="w-full bg-white dark:bg-[#161616] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-450 focus:outline-none focus:border-[#0068ff] resize-none transition-colors leading-relaxed disabled:opacity-50" />
                    <div className="flex items-center justify-between">
                      <AIFarewellHelper onInsert={text => setFarewellMessage(text)} />
                      {farewellMessage && <span className="text-[10px] text-gray-500">{farewellMessage.length} ký tự</span>}
                    </div>
                    {!farewellMessage.trim() && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 font-semibold flex items-center gap-1 pl-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        Cần nhập nội dung lời chào
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {globalRunning && total > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5"><SpinIcon /> Đang xử lý rời nhóm...</span>
                    <span className="font-semibold text-gray-800 dark:text-white">{progress}/{total}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0068ff] rounded-full transition-all duration-300" style={{ width: `${(progress / total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Log panel ── */}
            {logs.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-800 bg-[#f4f4f4] dark:bg-[#161616]/40 flex-shrink-0">
                <div className="px-5 py-3 max-h-32 overflow-y-auto font-mono text-[10px] space-y-0.5">
                  {logs.map((log, i) => {
                    const color = log.status === 'success' ? 'text-green-600 dark:text-green-400' : log.status === 'error' ? 'text-red-600 dark:text-red-400' : log.status === 'warning' ? 'text-amber-600 dark:text-yellow-400' : 'text-gray-500';
                    return (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-400 flex-shrink-0">[{log.time}]</span>
                        <span className={color}>{log.text}</span>
                      </div>
                    );
                  })}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="px-5 py-3 border-t border-gray-200/50 dark:border-gray-800/50 bg-[#f4f4f4] dark:bg-[#161616]/80 flex gap-2 flex-shrink-0">
              <button onClick={onClose} disabled={globalRunning}
                className="flex-1 py-2 rounded-xl bg-[#dfdfdf] dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs hover:bg-[#d5d5d5] dark:hover:bg-gray-700/80 transition-colors font-medium">
                Hủy
              </button>
              {(() => {
                const hasDisperse = selectedGroupIds.some(id => ownerGroupIds.has(id) && ownerGroupActions[id] === 'disperse');
                const isDisperseSingle = isSingle && isOwner && ownerGroupActions[targetGroupId] === 'disperse';
                const buttonText = globalRunning
                  ? 'Đang xử lý...'
                  : isSingle
                    ? (isDisperseSingle ? 'Giải tán nhóm' : 'Rời nhóm')
                    : (hasDisperse ? `Xử lý ${selectedGroupIds.length} nhóm` : `Rời ${selectedGroupIds.length} nhóm`);
                const btnBg = isDisperseSingle || (hasDisperse && !isSingle)
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-[#f28882] dark:bg-red-600 hover:bg-[#f0746d] dark:hover:bg-red-500';
                return (
                  <button onClick={executeLeave} disabled={!canExecute}
                    className={`flex-1 py-2 rounded-xl text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm ${btnBg}`}>
                    {buttonText}
                  </button>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
