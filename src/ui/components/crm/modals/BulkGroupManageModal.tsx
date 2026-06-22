import React, { useState, useEffect, useRef } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import GroupAvatar from '@/components/common/GroupAvatar';
import Logger from '../../../../utils/Logger';

const SpinIcon = (
  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

interface ZaloGroup {
  contact_id: string;
  display_name: string;
  avatar_url: string;
  last_message_time: number;
  memberCount: number;
}

interface BulkGroupManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'remove';
  initialContactIds: string[];
  activeAccountId: string | null;
  groupFilter?: 'managed' | 'not_managed' | 'all';
  onSuccess?: () => void;
}

interface LogEntry {
  time: string;
  text: string;
  status: 'success' | 'error' | 'warning' | 'info';
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

export default function BulkGroupManageModal({
  isOpen,
  onClose,
  mode,
  initialContactIds,
  activeAccountId,
  groupFilter,
  onSuccess,
}: BulkGroupManageModalProps) {
  const { showNotification } = useAppStore();
  
  // Contacts states
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<any[]>([]);
  const [searchContact, setSearchContact] = useState('');
  
  // Groups states
  const [groups, setGroups] = useState<ZaloGroup[]>([]);
  const [managedGroupIds, setManagedGroupIds] = useState<Set<string>>(new Set());
  const [checkedGroupIds, setCheckedGroupIds] = useState<Set<string>>(new Set());
  const [searchGroup, setSearchGroup] = useState('');
  
  // Existing memberships mapping: groupId -> Set of memberIds
  const [existingGroupMembers, setExistingGroupMembers] = useState<Record<string, Set<string>>>({});
  
  // Loading/Running states
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isResting, setIsResting] = useState(false);
  const [restCountdown, setRestCountdown] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalOperations, setTotalOperations] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [activeTaskMsg, setActiveTaskMsg] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Load contacts and groups
  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    
    setLoading(true);
    stopRef.current = false;
    setLogs([]);
    setCurrentProgress(0);
    setTotalOperations(0);
    setSuccessCount(0);
    setFailCount(0);
    setIsRunning(false);
    setIsResting(false);
    
    const loadData = async () => {
      try {
        // 1. Get contacts
        const contactsRes = await ipc.db?.getContacts(activeAccountId);
        const list = contactsRes?.contacts ?? contactsRes ?? [];
        const friends = list.filter((c: any) => c.contact_type !== 'group');
        setAllContacts(friends);
        
        // Setup initial contacts
        if (initialContactIds && initialContactIds.length > 0) {
          const matched = friends.filter((c: any) => initialContactIds.includes(c.contact_id));
          // If some IDs are not in DB, create dummy contacts so we don't drop them
          const matchedIds = matched.map((c: any) => c.contact_id);
          const dummies = initialContactIds
            .filter(id => !matchedIds.includes(id))
            .map(id => ({ contact_id: id, display_name: id, avatar_url: '', phone: '' }));
          setSelectedContacts([...matched, ...dummies]);
        } else {
          setSelectedContacts([]);
        }
        
        // 2. Get group memberships
        const membersRes = await ipc.db?.getAllGroupMembers({ zaloId: activeAccountId });
        const rows = membersRes?.rows ?? [];
        const memMap: Record<string, Set<string>> = {};
        const managedIds = new Set<string>();
        
        for (const r of rows) {
          if (!memMap[r.group_id]) memMap[r.group_id] = new Set();
          memMap[r.group_id].add(r.member_id);
          
          if (r.member_id === activeAccountId && (r.role === 1 || r.role === 2)) {
            managedIds.add(r.group_id);
          }
        }
        setExistingGroupMembers(memMap);
        setManagedGroupIds(managedIds);
        
        // 3. Map groups
        const groupContacts = list.filter((c: any) => c.contact_type === 'group');
        const mappedGroups = groupContacts.map((c: any) => ({
          contact_id: c.contact_id,
          display_name: c.display_name || c.contact_id,
          avatar_url: c.avatar_url || '',
          last_message_time: c.last_message_time || 0,
          memberCount: memMap[c.contact_id]?.size ?? 0,
        }));
        setGroups(mappedGroups);
        setCheckedGroupIds(new Set());
      } catch (err) {
        Logger.error('Error loading data in BulkGroupManageModal:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [isOpen, activeAccountId, initialContactIds]);

  if (!isOpen) return null;

  const addLog = (text: string, status: LogEntry['status'] = 'info') => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev, { time, text, status }]);
  };

  const handleToggleGroup = (groupId: string) => {
    setCheckedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSelectAllGroups = () => {
    const effectiveFilter = groupFilter || 'managed';
    const targetGroups = groups.filter(g => {
      if (effectiveFilter === 'managed' && !managedGroupIds.has(g.contact_id)) return false;
      if (effectiveFilter === 'not_managed' && managedGroupIds.has(g.contact_id)) return false;
      if (mode === 'add') {
        // Only select groups where not ALL selected contacts have already joined
        const members = existingGroupMembers[g.contact_id] || new Set();
        const allJoined = selectedContacts.length > 0 && selectedContacts.every(c => members.has(c.contact_id));
        return !allJoined;
      } else {
        // Only select groups where AT LEAST ONE selected contact is in it
        const members = existingGroupMembers[g.contact_id] || new Set();
        const hasMember = selectedContacts.some(c => members.has(c.contact_id));
        return hasMember;
      }
    });
    setCheckedGroupIds(new Set(targetGroups.map(g => g.contact_id)));
  };

  const handleDeselectAllGroups = () => {
    setCheckedGroupIds(new Set());
  };

  const handleToggleContact = (contact: any) => {
    setSelectedContacts(prev => {
      const isSelected = prev.some(c => c.contact_id === contact.contact_id);
      if (isSelected) {
        return prev.filter(c => c.contact_id !== contact.contact_id);
      } else {
        return [...prev, contact];
      }
    });
    // Clear checked groups as members change
    setCheckedGroupIds(new Set());
  };

  // Execution
  const handleExecute = async () => {
    if (!activeAccountId || selectedContacts.length === 0 || checkedGroupIds.size === 0) return;
    
    const acc = useAccountStore.getState().getActiveAccount();
    if (!acc) {
      showNotification('Không tìm thấy tài khoản Zalo hoạt động', 'error');
      return;
    }
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
    
    setIsRunning(true);
    stopRef.current = false;
    setSuccessCount(0);
    setFailCount(0);
    setLogs([]);
    
    const groupsArray = Array.from(checkedGroupIds);
    const totalGroups = groupsArray.length;
    
    // Build actual tasks list to have an accurate total count
    // A task: { contact, groupId, groupName }
    const tasks: { contact: any; groupId: string; groupName: string }[] = [];
    
    for (const gId of groupsArray) {
      const groupObj = groups.find(g => g.contact_id === gId);
      const groupName = groupObj?.display_name || gId;
      const groupMems = existingGroupMembers[gId] || new Set();
      
      for (const contact of selectedContacts) {
        const isJoined = groupMems.has(contact.contact_id);
        if (mode === 'add' && !isJoined) {
          tasks.push({ contact, groupId: gId, groupName });
        } else if (mode === 'remove' && isJoined) {
          tasks.push({ contact, groupId: gId, groupName });
        }
      }
    }
    
    const totalTasks = tasks.length;
    setTotalOperations(totalTasks);
    
    if (totalTasks === 0) {
      addLog('Không có hành động nào cần thực hiện (các liên hệ đã ở đúng trạng thái nhóm).', 'warning');
      setIsRunning(false);
      return;
    }
    
    addLog(`Bắt đầu tiến trình ${mode === 'add' ? 'Thêm' : 'Xóa'} hàng loạt. Tổng cộng ${totalTasks} tác vụ cần xử lý.`, 'info');
    
    // Group tasks by group so we can batch them and rest after 20 groups
    const tasksByGroup: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (!tasksByGroup[task.groupId]) {
        tasksByGroup[task.groupId] = [];
      }
      tasksByGroup[task.groupId].push(task);
    }
    
    const uniqueGroupIds = Object.keys(tasksByGroup);
    const BATCH_SIZE = 20;
    
    let processedGroupsCount = 0;
    let taskIndex = 0;
    
    for (let b = 0; b < uniqueGroupIds.length; b += BATCH_SIZE) {
      if (stopRef.current) break;
      
      const groupBatch = uniqueGroupIds.slice(b, b + BATCH_SIZE);
      
      // Process groups in this batch
      for (const gId of groupBatch) {
        if (stopRef.current) break;
        
        processedGroupsCount++;
        const groupTasks = tasksByGroup[gId];
        
        for (const task of groupTasks) {
          if (stopRef.current) break;
          
          taskIndex++;
          setCurrentProgress(taskIndex);
          
          const { contact, groupId, groupName } = task;
          const cName = contact.display_name || contact.contact_id;
          
          setActiveTaskMsg(`Đang xử lý: ${cName} -> ${groupName}`);
          
          try {
            if (mode === 'add') {
              const res = await ipc.zalo?.addUserToGroup({ auth, userId: contact.contact_id, groupId });
              if (res?.success) {
                setSuccessCount(c => c + 1);
                addLog(`[Thành công] Thêm ${cName} vào nhóm "${groupName}"`, 'success');
                
                // Save to local DB
                await ipc.db?.upsertGroupMember({
                  zaloId: activeAccountId,
                  groupId,
                  member: {
                    memberId: contact.contact_id,
                    displayName: contact.display_name || '',
                    avatar: contact.avatar_url || contact.avatar || '',
                    role: 0
                  }
                });
                // Update local memory state
                setExistingGroupMembers(prev => {
                  const copy = { ...prev };
                  if (!copy[groupId]) copy[groupId] = new Set();
                  copy[groupId].add(contact.contact_id);
                  return copy;
                });
              } else {
                setFailCount(c => c + 1);
                addLog(`[Thất bại] Thêm ${cName} vào nhóm "${groupName}". Lỗi: ${res?.error || 'Không rõ'}`, 'error');
              }
            } else {
              const res = await ipc.zalo?.removeUserFromGroup({ auth, userId: contact.contact_id, groupId });
              if (res?.success) {
                setSuccessCount(c => c + 1);
                addLog(`[Thành công] Xóa ${cName} khỏi nhóm "${groupName}"`, 'success');
                
                // Remove from local DB
                await ipc.db?.removeGroupMember({ zaloId: activeAccountId, groupId, memberId: contact.contact_id });
                // Update local memory state
                setExistingGroupMembers(prev => {
                  const copy = { ...prev };
                  if (copy[groupId]) {
                    const newSet = new Set(copy[groupId]);
                    newSet.delete(contact.contact_id);
                    copy[groupId] = newSet;
                  }
                  return copy;
                });
              } else {
                setFailCount(c => c + 1);
                addLog(`[Thất bại] Xóa ${cName} khỏi nhóm "${groupName}". Lỗi: ${res?.error || 'Không rõ'}`, 'error');
              }
            }
          } catch (err: any) {
            setFailCount(c => c + 1);
            addLog(`[Lỗi hệ thống] Tác vụ với ${cName} ở "${groupName}". Chi tiết: ${err.message}`, 'error');
          }
          
          // Random delay between calls
          // <= 40 groups: 1-2s. > 40 groups: 2-3s.
          const isMoreThan40 = totalGroups > 40;
          const minDelay = isMoreThan40 ? 2000 : 1000;
          const maxDelay = isMoreThan40 ? 3000 : 2000;
          const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
          
          // Wait only if not the last task
          if (taskIndex < totalTasks && !stopRef.current) {
            await new Promise(r => setTimeout(r, randomDelay));
          }
        }
      }
      
      // resting period after batch of 20 groups (if there are more batches remaining)
      const hasMoreBatches = b + BATCH_SIZE < uniqueGroupIds.length;
      if (hasMoreBatches && !stopRef.current) {
        setIsResting(true);
        addLog(`Đã hoàn thành đợt ${b / BATCH_SIZE + 1}. Tạm nghỉ 30 giây để bảo vệ tài khoản...`, 'warning');
        
        for (let seconds = 30; seconds > 0; seconds--) {
          if (stopRef.current) break;
          setRestCountdown(seconds);
          await new Promise(r => setTimeout(r, 1000));
        }
        setIsResting(false);
      }
    }
    
    setIsRunning(false);
    setActiveTaskMsg('');
    
    if (stopRef.current) {
      addLog('Tiến trình đã bị dừng bởi người dùng.', 'warning');
      showNotification('Đã dừng tiến trình', 'warning');
    } else {
      addLog(`Hoàn thành toàn bộ tiến trình. Thành công: ${successCount}, Thất bại: ${failCount}`, 'info');
      showNotification(`Đã hoàn thành! Thành công: ${successCount}, Thất bại: ${failCount}`, 'success');
    }
    
    if (onSuccess) onSuccess();
  };

  const handleStop = () => {
    stopRef.current = true;
    addLog('Đang yêu cầu dừng tiến trình...', 'warning');
  };

  // Filtered lists
  const filteredContacts = allContacts.filter(c =>
    !searchContact.trim() ||
    (c.display_name || '').toLowerCase().includes(searchContact.toLowerCase()) ||
    (c.phone || '').includes(searchContact) ||
    (c.contact_id || '').includes(searchContact)
  );

  const filteredGroups = groups.filter(g => {
    const effectiveFilter = groupFilter || 'managed';
    if (effectiveFilter === 'managed' && !managedGroupIds.has(g.contact_id)) return false;
    if (effectiveFilter === 'not_managed' && managedGroupIds.has(g.contact_id)) return false;
    
    const matchesSearch = !searchGroup.trim() ||
      g.display_name.toLowerCase().includes(searchGroup.toLowerCase()) ||
      g.contact_id.includes(searchGroup);
      
    if (!matchesSearch) return false;
    
    // In remove mode, only show groups where at least one selected contact is in it
    if (mode === 'remove') {
      const groupMems = existingGroupMembers[g.contact_id] || new Set();
      return selectedContacts.some(c => groupMems.has(c.contact_id));
    }
    
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => { if (!isRunning) onClose(); }}>
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-[500px] max-w-full p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white"
        onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0 border-b border-gray-700 pb-2.5">
          <div>
            <h3 className="font-semibold text-white text-base">
              {mode === 'add' ? 'Thêm người vào nhiều nhóm' : 'Xóa thành viên khỏi nhóm'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Đang chọn <span className="text-blue-400 font-semibold">{selectedContacts.length}</span> liên hệ
            </p>
          </div>
          <button onClick={onClose} disabled={isRunning}
            className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors disabled:opacity-40">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            {SpinIcon}
            <span className="text-xs">Đang tải dữ liệu...</span>
          </div>
        ) : isRunning ? (
          /* Execution View */
          <div className="flex-1 flex flex-col overflow-hidden min-h-[350px]">
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-2 mb-3 bg-gray-900/50 p-2.5 rounded-xl border border-gray-700/50 text-center">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-semibold">Tác vụ</span>
                <span className="text-sm font-bold text-white">{currentProgress} / {totalOperations}</span>
              </div>
              <div>
                <span className="text-[10px] text-green-400 block uppercase font-semibold">Thành công</span>
                <span className="text-sm font-bold text-green-400">{successCount}</span>
              </div>
              <div>
                <span className="text-[10px] text-red-400 block uppercase font-semibold">Thất bại</span>
                <span className="text-sm font-bold text-red-400">{failCount}</span>
              </div>
            </div>

            {/* Active Task / Rest State */}
            <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs">
              {isResting ? (
                <div className="flex items-center justify-between text-yellow-400">
                  <span className="font-medium animate-pulse">⏰ Đang tạm nghỉ tránh spam Zalo...</span>
                  <span className="font-bold">Tiếp tục sau {restCountdown}s</span>
                </div>
              ) : (
                <div className="text-gray-200 font-medium truncate flex items-center gap-2">
                  {SpinIcon}
                  <span>{activeTaskMsg || 'Đang chuẩn bị...'}</span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {totalOperations > 0 && (
              <div className="mb-3">
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${(currentProgress / totalOperations) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Real-time log list */}
            <div className="flex-1 bg-gray-900 border border-gray-700 rounded-xl p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-300 space-y-1 mb-4 min-h-[160px]">
              {logs.map((log, index) => {
                let colorClass = 'text-gray-400';
                if (log.status === 'success') colorClass = 'text-green-400';
                if (log.status === 'error') colorClass = 'text-red-400';
                if (log.status === 'warning') colorClass = 'text-yellow-400';
                
                return (
                  <div key={index} className="flex gap-2 items-start">
                    <span className="text-gray-600 flex-shrink-0 select-none">[{log.time}]</span>
                    <span className={colorClass}>{log.text}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>

            {/* Bottom Actions for Running */}
            <div className="flex justify-end gap-2 flex-shrink-0 pt-2 border-t border-gray-700">
              <button
                onClick={handleStop}
                disabled={stopRef.current}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
                {stopRef.current ? 'Đang dừng...' : 'Dừng tiến trình'}
              </button>
              {!isRunning && (
                <button onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold transition-colors">
                  Đóng
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Selection View */
          <>
            {/* Step 1: Select Users (Only visible if initialContactIds was empty) */}
            {(!initialContactIds || initialContactIds.length === 0) && (
              <div className="mb-3.5 flex flex-col overflow-hidden min-h-[150px] max-h-[180px]">
                <span className="text-xs font-semibold text-gray-300 mb-1.5 block">1. Chọn liên hệ</span>
                <input type="text" value={searchContact} onChange={e => setSearchContact(e.target.value)}
                  placeholder="Tìm theo tên hoặc SĐT..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 mb-2 focus:outline-none focus:border-blue-500" />
                
                <div className="flex-1 overflow-y-auto border border-gray-700 rounded-lg p-1 bg-gray-900/50 space-y-0.5">
                  {filteredContacts.length === 0 ? (
                    <div className="text-center py-4 text-xs text-gray-500">Không tìm thấy liên hệ nào</div>
                  ) : (
                    filteredContacts.map(c => {
                      const isSelected = selectedContacts.some(sc => sc.contact_id === c.contact_id);
                      return (
                        <button key={c.contact_id} onClick={() => handleToggleContact(c)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors
                            ${isSelected ? 'bg-blue-600 text-white font-medium' : 'text-gray-300 hover:bg-gray-800'}`}>
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                            ${isSelected ? 'bg-blue-500 border-blue-400' : 'border-gray-600 bg-gray-700'}`}>
                            {isSelected && (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </div>
                          <Avatar src={c.avatar_url || c.avatar} name={c.display_name} size={22} />
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">{c.display_name || c.contact_id}</p>
                            {c.phone && <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>{c.phone}</p>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Select Groups */}
            <div className="mb-4 flex flex-col overflow-hidden flex-1 min-h-[220px]">
              <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-300">
                  {(!initialContactIds || initialContactIds.length === 0) ? '2. Chọn nhóm' : 'Chọn các nhóm muốn áp dụng'}
                </span>
                <div className="flex gap-2">
                  <button onClick={handleSelectAllGroups} disabled={selectedContacts.length === 0}
                    className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">Chọn tất cả</button>
                  <span className="text-gray-600 text-[10px]">|</span>
                  <button onClick={handleDeselectAllGroups} disabled={selectedContacts.length === 0}
                    className="text-[10px] text-gray-400 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">Bỏ chọn</button>
                </div>
              </div>
              
              <input type="text" value={searchGroup} onChange={e => setSearchGroup(e.target.value)}
                placeholder="Lọc nhóm theo tên..."
                disabled={selectedContacts.length === 0}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 mb-2 focus:outline-none focus:border-blue-500 disabled:opacity-50" />

              <div className="flex-1 overflow-y-auto border border-gray-700 rounded-lg p-1 bg-gray-900/50 space-y-0.5">
                {selectedContacts.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-500 italic">Vui lòng chọn liên hệ trước</div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-500">
                    {mode === 'remove' 
                      ? 'Không tìm thấy nhóm quản lý nào có chứa các liên hệ này.'
                      : 'Không có nhóm quản lý phù hợp.'}
                  </div>
                ) : (
                  filteredGroups.map(g => {
                    const groupMems = existingGroupMembers[g.contact_id] || new Set();
                    const joinedCount = selectedContacts.filter(c => groupMems.has(c.contact_id)).length;
                    const allJoined = joinedCount === selectedContacts.length;
                    const isChecked = checkedGroupIds.has(g.contact_id);
                    
                    let statusLabel = '';
                    let isDisabled = false;
                    let checkboxColor = mode === 'add' ? 'text-blue-600' : 'text-red-600';
                    
                    if (mode === 'add') {
                      if (allJoined) {
                        statusLabel = 'Đã tham gia';
                        isDisabled = true;
                      } else if (joinedCount > 0) {
                        statusLabel = `${joinedCount}/${selectedContacts.length} đã tham gia`;
                      }
                    } else {
                      if (joinedCount === 0) {
                        isDisabled = true;
                      } else {
                        statusLabel = `Có ${joinedCount} liên hệ`;
                      }
                    }

                    return (
                      <div key={g.contact_id} onClick={() => {
                        if (isDisabled) return;
                        handleToggleGroup(g.contact_id);
                      }}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors select-none
                          ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-800 cursor-pointer'}`}>
                        <input type="checkbox" checked={isChecked || (mode === 'add' && allJoined)} disabled={isDisabled} onChange={() => {}}
                          className={`rounded bg-gray-800 border-gray-600 focus:ring-blue-500 ${checkboxColor}`} />
                        <GroupAvatar avatarUrl={g.avatar_url} name={g.display_name} size="xs" />
                        <span className="flex-1 truncate text-gray-200">{g.display_name}</span>
                        {statusLabel && <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">{statusLabel}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Actions for Selection */}
            <div className="flex gap-2 justify-end flex-shrink-0 pt-2 border-t border-gray-700">
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold transition-colors">
                Hủy
              </button>
              <button
                onClick={handleExecute}
                disabled={selectedContacts.length === 0 || checkedGroupIds.size === 0}
                className={`px-4 py-2 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
                  mode === 'add' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {mode === 'add' ? 'Xác nhận thêm' : 'Xác nhận xóa'} ({checkedGroupIds.size} nhóm)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
