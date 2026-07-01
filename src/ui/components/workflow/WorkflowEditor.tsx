import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  MarkerType, ReactFlowInstance, Connection, Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { CustomDeletableEdge } from './nodes/WorkflowNodes';
import { reactFlowNodeTypes } from './nodeRegistry';
import NodePalette from './NodePalette';
import NodeConfigPanel from './NodeConfigPanel';
import RunHistoryPanel from './RunHistoryPanel';
import WorkflowAIDialog from './WorkflowAIDialog';
import { DEFAULT_CONFIGS, nodeTypeGroup, getNodeLabel } from './workflowConfig';
import ipc from '../../lib/ipc';
import { useAppStore } from '@/store/appStore';
import type { Channel } from '../../../configs/channelConfig';

// Use node types from registry (centralized node component mapping)
const nodeTypes = reactFlowNodeTypes;

const edgeTypes = {
  custom: CustomDeletableEdge,
};

interface Props {
  workflowId: string;
  onBack: () => void;
}

const normalizeWorkflowChannel = (channel?: string): Channel => channel === 'facebook' ? 'facebook' : 'zalo';

// ── Test-run recipient picker modal ──────────────────────────────────────────
function TestRunModal({ accounts, workflowPageIds, triggerType, onRun, onClose }: {
  accounts: { zalo_id: string; full_name: string; avatar_url: string; phone?: string }[];
  workflowPageIds: string[];
  triggerType?: string;
  onRun: (triggerData: any) => void;
  onClose: () => void;
}) {
  const isFriendRequest = triggerType === 'trigger.friendRequest';
  const [selectedAccount, setSelectedAccount] = useState('');
  // Tab: 'friend' | 'group'
  const [tab, setTab] = useState<'friend' | 'group'>('friend');
  const [runRealMode, setRunRealMode] = useState(false);
  const [friends, setFriends] = useState<{ userId: string; displayName: string; avatar: string }[]>([]);
  const [groups, setGroups] = useState<{ contactId: string; displayName: string; avatar: string }[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<{ id: string; name: string; isGroup: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [testContent, setTestContent] = useState('Xin chào, đây là tin nhắn thử nghiệm từ workflow');

  // Filter accounts: only show accounts in workflow's pageIds (or all if none set)
  const availableAccounts = workflowPageIds.length > 0
    ? accounts.filter(a => workflowPageIds.includes(a.zalo_id))
    : accounts;

  // Auto-select first account
  useEffect(() => {
    if (availableAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(availableAccounts[0].zalo_id);
    }
  }, [availableAccounts]);

  // Load friends when account changes
  useEffect(() => {
    if (!selectedAccount) return;
    setLoadingFriends(true);
    setSelectedTarget(null);
    ipc.db?.getFriends({ zaloId: selectedAccount }).then((res: any) => {
      if (res?.success) {
        const list = (res.friends || []).filter((f: any) => f.userId !== selectedAccount);
        setFriends(list);
      }
    }).catch(() => {}).finally(() => setLoadingFriends(false));
  }, [selectedAccount]);

  // Load groups when account changes
  useEffect(() => {
    if (!selectedAccount) return;
    setLoadingGroups(true);
    ipc.db?.getContacts(selectedAccount).then((res: any) => {
      if (res?.success) {
        const groupList = (res.contacts || [])
          .filter((c: any) => c.contactType === 'group' || c.contact_type === 'group')
          .map((c: any) => ({
            contactId: c.contactId || c.contact_id,
            displayName: c.displayName || c.display_name || c.name || c.contactId,
            avatar: c.avatar || c.avatar_url || c.avatarUrl || '',
          }));
        setGroups(groupList);
      }
    }).catch(() => {}).finally(() => setLoadingGroups(false));
  }, [selectedAccount]);

  // Reset selection when switching tabs
  useEffect(() => { setSelectedTarget(null); setSearch(''); }, [tab]);

  const currentList = tab === 'friend'
    ? friends.filter(f => !search.trim() || f.displayName?.toLowerCase().includes(search.toLowerCase()) || f.userId?.includes(search))
    : groups.filter(g => !search.trim() || g.displayName?.toLowerCase().includes(search.toLowerCase()) || g.contactId?.includes(search));

  const handleRun = () => {
    if (!selectedAccount) return;
    if (runRealMode) {
      onRun({
        zaloId: selectedAccount,
        content: testContent,
        isOverrideTarget: false, // chạy thực theo node
        timestamp: Date.now(),
      });
    } else {
      if (!selectedTarget) return;
      if (isFriendRequest) {
        onRun({
          userId: selectedTarget.id,
          displayName: selectedTarget.name,
          phone: '',
          message: '',
          zaloId: selectedAccount,
        });
      } else {
        onRun({
          zaloId: selectedAccount,
          threadId: selectedTarget.id,
          threadType: selectedTarget.isGroup ? 1 : 0,
          fromId: selectedTarget.id,
          fromName: selectedTarget.name,
          content: testContent,
          isGroup: selectedTarget.isGroup,
          isOverrideTarget: true, // ghi đè đích gửi sang target test được chọn
          isSelf: false,
          timestamp: Date.now(),
        });
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-[460px] max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-white font-semibold text-sm flex items-center gap-2">▶️ Chạy thử Workflow</p>
            <p className="text-gray-500 text-[11px] mt-0.5">
              {isFriendRequest ? 'Chọn người để mô phỏng lời mời kết bạn' : 'Chọn người hoặc nhóm để gửi thử'}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Account selector */}
          {availableAccounts.length > 1 && (
            <div>
              <label className="text-gray-400 text-xs font-medium mb-1.5 block">Tài khoản gửi</label>
              <div className="space-y-1.5">
                {availableAccounts.map(acc => (
                  <button key={acc.zalo_id} type="button"
                    onClick={() => setSelectedAccount(acc.zalo_id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                      selectedAccount === acc.zalo_id
                        ? 'bg-blue-600/20 border-blue-500/60 ring-1 ring-blue-500/30'
                        : 'bg-gray-800/60 border-gray-700/50 hover:border-gray-600'
                    }`}>
                    {acc.avatar_url
                      ? <img src={acc.avatar_url} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                      : <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-xs text-white font-bold">
                          {(acc.full_name || acc.zalo_id).charAt(0).toUpperCase()}
                        </div>}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${selectedAccount === acc.zalo_id ? 'text-blue-300' : 'text-gray-200'}`}>
                        {acc.full_name || acc.zalo_id}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toggle Chạy thực tế hay Chạy gửi đè */}
          {!isFriendRequest && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800/40 border border-gray-700/50">
              <div className="flex-1 pr-4">
                <p className="text-xs font-semibold text-gray-200">Gửi thực tế theo cấu hình Node</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Tin nhắn/ảnh sẽ gửi trực tiếp đến các nhóm hoặc cá nhân được lưu cứng trong từng Node của Workflow thay vì gửi đè
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRunRealMode(p => !p)}
                className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex-shrink-0 ${
                  runRealMode ? 'bg-green-600' : 'bg-gray-700'
                }`}
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${
                    runRealMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Test message content */}
          {!isFriendRequest && (
          <div>
            <label className="text-gray-400 text-xs font-medium mb-1.5 block">Nội dung tin nhắn thử ($trigger.content)</label>
            <textarea
              value={testContent}
              onChange={e => setTestContent(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 outline-none resize-none"
              rows={2}
              placeholder="Nhập tin nhắn thử nghiệm..."
            />
          </div>
          )}

          {/* Hiển thị thông báo khi chạy thực */}
          {runRealMode && !isFriendRequest && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-2.5">
              <span className="text-amber-500 text-sm flex-shrink-0">⚠️</span>
              <p className="text-amber-400 text-xs leading-relaxed">
                <strong>Chế độ gửi thực tế đang bật:</strong> Hệ thống sẽ gửi tin nhắn trực tiếp vào đúng các nhóm hoặc cá nhân được cấu hình bên trong các Node (ví dụ: nhóm bạn đã gán cứng trong Node gửi tin). Hãy cẩn thận để không gửi nhầm nội dung test tới khách hàng thực tế!
              </p>
            </div>
          )}

          {/* Tab switcher: Bạn bè / Nhóm (hidden for friendRequest trigger or when runRealMode is enabled) */}
          {!isFriendRequest && !runRealMode && (
            <div className="flex rounded-xl bg-gray-800/60 border border-gray-700/50 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setTab('friend')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === 'friend'
                    ? 'bg-gray-700 text-white shadow'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                👤 Bạn bè <span className="text-gray-600">({friends.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('group')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === 'group'
                    ? 'bg-gray-700 text-white shadow'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                🏠 Nhóm <span className="text-gray-600">({groups.length})</span>
              </button>
            </div>
          )}

          {/* Contact / Group list (hidden when runRealMode is enabled) */}
          {!runRealMode && (
            <div>
              <label className="text-gray-400 text-xs font-medium mb-1.5 block">
                {isFriendRequest
                  ? 'Chọn người gửi lời mời kết bạn'
                  : tab === 'friend' ? 'Chọn bạn bè để gửi thử' : 'Chọn nhóm để gửi thử'}
              </label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 outline-none mb-2"
                placeholder="🔍 Tìm tên hoặc ID..."
              />

              {(tab === 'friend' ? loadingFriends : loadingGroups) ? (
                <div className="flex items-center gap-2 py-4 justify-center text-gray-500 text-xs">
                  <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  {tab === 'friend' ? 'Đang tải danh bạ…' : 'Đang tải danh sách nhóm…'}
                </div>
              ) : currentList.length === 0 ? (
                <div className="py-4 text-center text-gray-600 text-xs">
                  {tab === 'friend'
                    ? (friends.length === 0 ? 'Chưa có bạn bè nào' : 'Không tìm thấy')
                    : (groups.length === 0 ? 'Chưa có nhóm nào (cần tải nhóm từ Zalo trước)' : 'Không tìm thấy')}
                </div>
              ) : (
                <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
                  {currentList.slice(0, 60).map((item: any) => {
                    const id = item.userId || item.contactId;
                    const name = item.displayName || id;
                    const avatar = item.avatar || '';
                    const isGroup = tab === 'group';
                    const isActive = selectedTarget?.id === id;
                    return (
                      <button key={id} type="button"
                        onClick={() => setSelectedTarget(isActive ? null : { id, name, isGroup })}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all ${
                          isActive
                            ? 'bg-green-600/20 border-green-500/60 ring-1 ring-green-500/30'
                            : 'bg-gray-800/40 border-gray-700/40 hover:border-gray-600'
                        }`}>
                        {avatar
                          ? <img src={avatar} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                          : <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${isGroup ? 'bg-emerald-700 text-emerald-200' : 'bg-gray-700 text-gray-400'}`}>
                              {isGroup ? '🏠' : (name || '?').charAt(0).toUpperCase()}
                            </div>}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-green-300' : 'text-gray-200'}`}>
                            {name}
                          </p>
                          <p className="text-[10px] text-gray-600 truncate">{id}</p>
                        </div>
                        {isActive && (
                          <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selected target summary */}
          {selectedTarget && !runRealMode && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-600/10 border border-green-500/30 rounded-xl">
              <span className="text-green-400 text-xs">✓</span>
              <p className="text-green-300 text-xs flex-1 truncate">
                Sẽ gửi đến: <strong>{selectedTarget.name}</strong>
                <span className="text-green-500 ml-1">({selectedTarget.isGroup ? 'Nhóm — threadType: 1' : 'Cá nhân — threadType: 0'})</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl transition-colors">
            Hủy
          </button>
          <button
            onClick={handleRun}
            disabled={runRealMode ? !selectedAccount : (!selectedTarget || !selectedAccount)}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Chạy thử
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to check if adding a connection would create a cyclic loop (infinite loop)
const wouldCreateCycle = (source: string, target: string, currentEdges: any[]): boolean => {
  const visited = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === source) return true;
    visited.add(curr);
    const nextNodes = currentEdges
      .filter(e => e.source === curr)
      .map(e => e.target);
    for (const nextNode of nextNodes) {
      if (!visited.has(nextNode)) queue.push(nextNode);
    }
  }
  return false;
};

export default function WorkflowEditor({ workflowId, onBack }: Props) {
  const { showNotification, theme } = useAppStore();
  const isLight = theme === 'light' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [activeDebugLog, setActiveDebugLog] = useState<any | null>(null);
  const [runAsSandbox, setRunAsSandbox] = useState(false);
  const [workflowMeta, setWorkflowMeta] = useState({
    name: '', description: '', enabled: true, channel: 'zalo' as Channel,
    pageIds: [] as string[],   // new: multi-page
  });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [accounts, setAccounts] = useState<{ zalo_id: string; full_name: string; avatar_url: string; phone?: string; channel?: string }[]>([]);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [showTestRunModal, setShowTestRunModal] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // States and refs for Smart Connect (Option C)
  const [showSuggestionMenu, setShowSuggestionMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; flowPos: { x: number; y: number } } | null>(null);
  const connectingNodeRef = useRef<{ nodeId: string; handleId: string | null; handleType: 'source' | 'target' | null } | null>(null);

  // States and methods for Undo/Redo (v27.2.3)
  const [history, setHistory] = useState<{ nodes: any[]; edges: any[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const recordState = useCallback((newNodes: any[], newEdges: any[]) => {
    setHistory(prev => {
      const sliced = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
      return [...sliced, { 
        nodes: JSON.parse(JSON.stringify(newNodes)), 
        edges: JSON.parse(JSON.stringify(newEdges)) 
      }];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  // Set initial history snapshot once loaded
  useEffect(() => {
    if (nodes.length > 0 && history.length === 0) {
      setHistory([{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
      setHistoryIndex(0);
    }
  }, [nodes, edges, history.length]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevSnapshot = history[prevIndex];
      setNodes(prevSnapshot.nodes);
      setEdges(prevSnapshot.edges);
      setHistoryIndex(prevIndex);
      showNotification('Đã hoàn tác (Undo)', 'success');
    }
  }, [history, historyIndex, setNodes, setEdges, showNotification]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextSnapshot = history[nextIndex];
      setNodes(nextSnapshot.nodes);
      setEdges(nextSnapshot.edges);
      setHistoryIndex(nextIndex);
      showNotification('Đã làm lại (Redo)', 'success');
    }
  }, [history, historyIndex, setNodes, setEdges, showNotification]);

  // Keyboard shortcut listener for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (isCmdOrCtrl && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Silent Background Auto-save
  const autoSave = useCallback(async (updatedNodes?: any[], updatedEdges?: any[]) => {
    try {
      const wNodes = (updatedNodes || nodes).map((n: any) => ({
        id: n.id, type: n.data.type, label: n.data.label, position: n.position, config: n.data.config,
      }));
      const wEdges = (updatedEdges || edges).map((e: any) => ({
        id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target
      }));
      
      const payload = {
        id: workflowId,
        name: workflowMeta.name,
        description: workflowMeta.description,
        enabled: workflowMeta.enabled,
        channel: workflowMeta.channel,
        pageIds: workflowMeta.pageIds,
        nodes: wNodes,
        edges: wEdges,
      };
      await ipc.workflow?.save(payload);
    } catch (err) {
      console.error('Auto save error:', err);
    }
  }, [workflowId, workflowMeta, nodes, edges]);

  // Auto layout / alignment (BFS Level-by-Level tree mapping starting from trigger)
  const autoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    const triggerNode = nodes.find(n => n.type === 'trigger' || (n.data?.type || '').startsWith('trigger.'));
    const startId = triggerNode?.id || nodes[0].id;
    
    const levels: Record<string, number> = {};
    const queue: string[] = [startId];
    levels[startId] = 0;
    
    while (queue.length > 0) {
      const currId = queue.shift()!;
      const currLvl = levels[currId];
      const childIds = edges.filter(e => e.source === currId).map(e => e.target);
      for (const cid of childIds) {
        if (levels[cid] === undefined) {
          levels[cid] = currLvl + 1;
          queue.push(cid);
        }
      }
    }
    
    const groups: Record<number, string[]> = {};
    const unmapped: string[] = [];
    
    for (const n of nodes) {
      const lvl = levels[n.id];
      if (lvl !== undefined) {
        if (!groups[lvl]) groups[lvl] = [];
        groups[lvl].push(n.id);
      } else {
        unmapped.push(n.id);
      }
    }
    
    const maxL = Object.keys(groups).length > 0 ? Math.max(...Object.keys(groups).map(Number)) : -1;
    if (unmapped.length > 0) {
      groups[maxL + 1] = unmapped;
    }
    
    const nextNodes = nodes.map(n => {
      let lvl = levels[n.id];
      if (lvl === undefined) lvl = maxL + 1;
      const g = groups[lvl];
      const idx = g.indexOf(n.id);
      const y = 80 + lvl * 160;
      const width = (g.length - 1) * 265;
      const x = 200 + idx * 265 - width / 2;
      return { ...n, position: { x, y } };
    });
    
    setNodes(nextNodes);
    recordState(nextNodes, edges);
    autoSave(nextNodes, edges);
    showNotification('Đã căn chỉnh tự động sơ đồ Workflow', 'success');
  }, [nodes, edges, setNodes, recordState, autoSave, showNotification]);

  const customOnEdgesChange = useCallback((changes: any) => {
    onEdgesChange(changes);
    const hasRemoval = changes.some((c: any) => c.type === 'remove');
    if (hasRemoval) {
      setTimeout(() => {
        setEdges(currentEdges => {
          setNodes(currentNodes => {
            recordState(currentNodes, currentEdges);
            autoSave(currentNodes, currentEdges);
            return currentNodes;
          });
          return currentEdges;
        });
      }, 0);
    }
  }, [onEdgesChange, setEdges, setNodes, recordState, autoSave]);

  // Load connected accounts for page selector
  useEffect(() => {
    ipc.login?.getAccounts().then((res: any) => {
      if (res?.success) setAccounts(res.accounts || []);
    }).catch(() => {});
  }, []);

  const toRFNode = useCallback((n: any, debugLog?: any) => {
    const debugResult = debugLog?.nodeResults?.find((r: any) => r.nodeId === n.id);
    return {
      id: n.id,
      type: nodeTypeGroup(n.type),
      position: n.position || { x: 100, y: 100 },
      data: {
        ...n,
        type: n.type,
        label: n.label || getNodeLabel(n.type),
        config: n.config || {},
        debugResult,
      },
    };
  }, []);

  // Load workflow
  useEffect(() => {
    if (!workflowId) return;
    ipc.workflow?.get(workflowId).then((res: any) => {
      if (!res?.success || !res.workflow) return;
      const wf = res.workflow;
      setWorkflowMeta({
        name: wf.name,
        description: wf.description || '',
        enabled: wf.enabled,
        channel: normalizeWorkflowChannel(wf.channel),
        pageIds: Array.isArray(wf.pageIds) ? wf.pageIds : (wf.pageId ? [wf.pageId] : []),
      });
      setNodes(wf.nodes.map((n: any) => toRFNode(n)));
      setEdges(wf.edges.map((e: any) => ({
        ...e, type: 'custom',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#4b5563' },
      })));
    });
  }, [workflowId, toRFNode]);

  // Update node debug results and edge colors on canvas when activeDebugLog changes
  useEffect(() => {
    setNodes(ns => ns.map(n => {
      const result = activeDebugLog?.nodeResults?.find((r: any) => r.nodeId === n.id);
      return {
        ...n,
        data: {
          ...n.data,
          debugResult: result,
        }
      };
    }));

    setEdges(es => es.map(e => {
      if (!activeDebugLog) {
        return { ...e, animated: false, style: { stroke: '#4b5563' } };
      }
      const sourceResult = activeDebugLog.nodeResults?.find((r: any) => r.nodeId === e.source);
      const targetResult = activeDebugLog.nodeResults?.find((r: any) => r.nodeId === e.target);
      
      let strokeColor = '#4b5563'; // default dark gray
      let isAnimated = false;
      
      if (sourceResult?.status === 'success' && targetResult?.status === 'success') {
        strokeColor = '#10b981'; // green path
        isAnimated = true;
      } else if (sourceResult?.status === 'success' && targetResult?.status === 'waiting') {
        strokeColor = '#f59e0b'; // orange waiting path
        isAnimated = true;
      } else if (targetResult?.status === 'skipped') {
        strokeColor = '#374151'; // skipped dark path
      } else if (sourceResult?.status === 'error' || targetResult?.status === 'error') {
        strokeColor = '#ef4444'; // red error path
      }

      return {
        ...e,
        animated: isAnimated,
        style: { stroke: strokeColor, strokeWidth: isAnimated ? 2.5 : 1.5 }
      };
    }));
  }, [activeDebugLog, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection | Edge) => {
    // Prevent self-connection
    if (params.source === params.target) {
      showNotification('Không thể tự kết nối tới chính nó!', 'error');
      return;
    }

    // Cycle detection
    if (wouldCreateCycle(params.source!, params.target!, edges)) {
      showNotification('Không thể kết nối: Phát hiện vòng lặp vô hạn!', 'error');
      return;
    }

    setEdges(es => {
      const nextEdges = addEdge({
        ...params,
        type: 'custom',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#4b5563' },
      }, es);
      
      // Save history and autoSave
      setTimeout(() => {
        setNodes(currNodes => {
          recordState(currNodes, nextEdges);
          autoSave(currNodes, nextEdges);
          return currNodes;
        });
      }, 0);
      
      return nextEdges;
    });
  }, [setEdges, edges, recordState, autoSave, showNotification]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType');
    if (!nodeType || !rfInstanceRef.current) return;
    const pos = rfInstanceRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode = {
      id: uuidv4(),
      type: nodeType,
      label: getNodeLabel(nodeType),
      position: pos,
      config: { ...(DEFAULT_CONFIGS[nodeType] || {}) },
    };
    
    setNodes(ns => {
      const nextNodes = [...ns, toRFNode(newNode)];
      setEdges(currEdges => {
        recordState(nextNodes, currEdges);
        autoSave(nextNodes, currEdges);
        return currEdges;
      });
      return nextNodes;
    });
  }, [setNodes, setEdges, toRFNode, recordState, autoSave]);

  const onConnectStart = useCallback((event: any, { nodeId, handleId, handleType }: any) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback((event: any) => {
    if (!connectingNodeRef.current || !rfInstanceRef.current) return;

    // Use document.elementFromPoint to reliably detect drop target under pointer
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
    const target = document.elementFromPoint(clientX, clientY);
    if (!target) {
      connectingNodeRef.current = null;
      return;
    }

    const isOverNode = target.closest('.react-flow__node');
    const isOverHandle = target.closest('.react-flow__handle');
    const targetIsPane = !isOverNode && !isOverHandle;

    if (targetIsPane) {
      const pos = rfInstanceRef.current.screenToFlowPosition({ x: clientX, y: clientY });
      setMenuPosition({ x: clientX, y: clientY, flowPos: pos });
      setShowSuggestionMenu(true);
    } else {
      connectingNodeRef.current = null;
    }
  }, []);

  const addSuggestedNode = useCallback((nodeType: string) => {
    if (!connectingNodeRef.current || !menuPosition) return;

    const newId = uuidv4();
    const newNode = {
      id: newId,
      type: nodeType,
      label: getNodeLabel(nodeType),
      position: menuPosition.flowPos,
      config: { ...(DEFAULT_CONFIGS[nodeType] || {}) },
    };

    const addedNode = toRFNode(newNode);

    setNodes(ns => {
      const nextNodes = [...ns, addedNode];
      
      const { nodeId, handleId, handleType } = connectingNodeRef.current!;
      const edgeParams = {
        id: `e-${nodeId}-${newId}`,
        source: handleType === 'source' ? nodeId : newId,
        sourceHandle: handleType === 'source' ? handleId : null,
        target: handleType === 'target' ? nodeId : newId,
        targetHandle: handleType === 'target' ? handleId : null,
        type: 'custom',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#4b5563' },
      };

      setEdges(es => {
        const nextEdges = addEdge(edgeParams, es);
        
        // Save history and autoSave
        recordState(nextNodes, nextEdges);
        autoSave(nextNodes, nextEdges);
        
        return nextEdges;
      });

      return nextNodes;
    });

    // Clear state
    setShowSuggestionMenu(false);
    connectingNodeRef.current = null;
  }, [menuPosition, setNodes, setEdges, toRFNode, recordState, autoSave]);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node.data);
    setShowSuggestionMenu(false);
  }, []);

  const updateNodeConfig = (nodeId: string, config: Record<string, any>) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, config } } : n));
    if (selectedNode?.id === nodeId) setSelectedNode((p: any) => ({ ...p, config }));
  };

  const updateNodeLabel = (nodeId: string, label: string) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, label } } : n));
    if (selectedNode?.id === nodeId) setSelectedNode((p: any) => ({ ...p, label }));
  };

  const buildWorkflow = () => ({
    id: workflowId,
    name: workflowMeta.name,
    description: workflowMeta.description,
    enabled: workflowMeta.enabled,
    channel: workflowMeta.channel,
    pageIds: workflowMeta.pageIds,
    nodes: nodes.map(n => ({
      id: n.id, type: n.data.type, label: n.data.label, position: n.position, config: n.data.config,
    })),
    edges: edges.map(e => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target })),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await ipc.workflow?.save(buildWorkflow());
      if (res?.success) {
        showNotification('Đã lưu workflow', 'success');
        // Apply generated webhook token to local node state
        if (res.webhookToken) {
          setNodes(prev => prev.map(n => {
            if ((n.data?.type || '').startsWith('trigger.webhook')) {
              return {
                ...n,
                data: {
                  ...n.data,
                  config: { ...(n.data?.config || {}), webhookToken: res.webhookToken }
                }
              };
            }
            return n;
          }));
        }
      }
      else showNotification(res?.error || 'Lỗi lưu workflow', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (triggerData?: any, isSandbox?: boolean) => {
    setRunning(true);
    try {
      // Save first, then run
      await ipc.workflow?.save(buildWorkflow());
      const res = await ipc.workflow?.runManual(workflowId, triggerData, isSandbox);
      if (res?.success) {
        showNotification(isSandbox ? 'Chạy giả lập Sandbox thành công!' : `Chạy thành công — ${res.log?.status}`, 'success');
        if (res.log) {
          setActiveDebugLog(res.log);
        }
      }
      else showNotification(res?.error || 'Lỗi chạy workflow', 'error');
    } finally {
      setRunning(false);
    }
  };

  // ── Check if workflow has send-message nodes → need recipient picker ─────
  const triggerNode = nodes.find(n => (n.data?.type || '').startsWith('trigger.'));
  const triggerType = triggerNode?.data?.type || '';
  const hasSendNodes = nodes.some(n => {
    const t = n.data?.type || '';
    return t === 'zalo.sendMessage' || t === 'zalo.sendImage' || t === 'zalo.sendFile'
      || t === 'zalo.sendVoice' || t === 'zalo.sendTyping';
  });

  const handleRunClick = () => {
    setRunAsSandbox(false);
    if (hasSendNodes || triggerType === 'trigger.friendRequest') {
      setShowTestRunModal(true);
    } else {
      handleRun(undefined, false);
    }
  };

  const handleSandboxClick = () => {
    setRunAsSandbox(true);
    if (hasSendNodes || triggerType === 'trigger.friendRequest') {
      setShowTestRunModal(true);
    } else {
      handleRun(undefined, true);
    }
  };

  // ── Apply AI-generated nodes & edges (append to canvas) ──────────────
  const handleAIApply = (newNodes: any[], newEdges: any[]) => {
    setNodes(ns => [...ns, ...newNodes.map((n: any) => toRFNode(n))]);
    setEdges(es => [...es, ...newEdges.map((e: any) => ({
      ...e, type: 'custom',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#4b5563' },
    }))]);
    setSelectedNode(null);
  };

  // ── Export workflow as JSON ──────────────────────────────────────────────
  const handleExport = () => {
    const wf = buildWorkflow();
    const exportData = {
      _zagiWorkflow: true,
      _version: 1,
      _exportedAt: new Date().toISOString(),
      channel: workflowMeta.channel,
      name: wf.name,
      description: wf.description,
      nodes: wf.nodes,
      edges: wf.edges,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${wf.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF]/g, '_').substring(0, 50)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Đã xuất workflow thành file JSON', 'success');
  };

  // ── Import workflow from JSON ───────────────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data._zagiWorkflow) {
          showNotification('File không phải workflow Zagi hợp lệ', 'error');
          return;
        }
        // File cũ không có channel → mặc định Zalo
        const importChannel = data.channel === 'facebook' ? 'facebook' : 'zalo';

        // Assign new IDs to avoid conflicts
        // Assign new IDs to avoid conflicts
        const idMap: Record<string, string> = {};
        const originalNodes = data.nodes || [];
        originalNodes.forEach((n: any) => { idMap[n.id] = uuidv4(); });

        // Remap $node.xxx references in configs to use new UUIDs
        const remapRef = (str: string) =>
          str.replace(/\$node\.([\w-]+)\./g, (m, ref) => {
            if (idMap[ref]) return `$node.${idMap[ref]}.`;
            return m;
          });
        const deepRemap = (obj: any): any => {
          if (typeof obj === 'string') return remapRef(obj);
          if (Array.isArray(obj)) return obj.map(item => typeof item === 'string' ? remapRef(item) : item && typeof item === 'object' ? deepRemap(item) : item);
          if (obj && typeof obj === 'object') { const r: any = {}; for (const [k, v] of Object.entries(obj)) r[k] = deepRemap(v); return r; }
          return obj;
        };

        const importedNodes = originalNodes.map((n: any) => ({
          ...n,
          id: idMap[n.id],
          config: deepRemap(n.config),
        }));
        const importedEdges = (data.edges || []).map((e: any) => ({
          ...e,
          id: uuidv4(),
          source: idMap[e.source] || e.source,
          target: idMap[e.target] || e.target,
        }));

        // Replace current nodes & edges
        setNodes(importedNodes.map((n: any) => toRFNode(n)));
        setEdges(importedEdges.map((e: any) => ({
          ...e, type: 'custom',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#4b5563' },
        })));
        setWorkflowMeta(m => ({
          ...m,
          channel: importChannel,
          name: data.name || m.name,
          description: data.description || m.description,
        }));
        setSelectedNode(null);
        showNotification(`Đã nhập workflow "${data.name || 'Imported'}" — nhớ Lưu để áp dụng!`, 'success');
      } catch (err: any) {
        showNotification('Lỗi đọc file JSON: ' + (err.message || 'Invalid JSON'), 'error');
      }
    };
    reader.readAsText(file);
    // reset input so same file can be re-imported
    e.target.value = '';
  };

  const channelLabel = workflowMeta.channel === 'zalo' ? 'Zalo' : 'Facebook';

  // Filter accounts by workflow channel — only show matching accounts
  const filteredAccounts = accounts.filter(a => {
    const accChannel = a.channel || 'zalo';
    return accChannel === workflowMeta.channel;
  });

  // Page selector label
  const pageLabel = workflowMeta.pageIds.length === 0
    ? <span className="text-amber-400">⚠ Tất cả tài khoản {channelLabel} ({filteredAccounts.length})</span>
    : workflowMeta.pageIds.length === 1
      ? <span className="text-blue-300">📱 {accounts.find(a => a.zalo_id === workflowMeta.pageIds[0])?.full_name || workflowMeta.pageIds[0]}</span>
      : <span className="text-blue-300">📱 {workflowMeta.pageIds.length} tài khoản</span>;

  const togglePage = (zaloId: string) => {
    setWorkflowMeta(m => ({
      ...m,
      pageIds: m.pageIds.includes(zaloId)
        ? m.pageIds.filter(id => id !== zaloId)
        : [...m.pageIds, zaloId],
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hidden file input for import */}
      <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0 flex-wrap">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          ← Quay lại
        </button>
        <div className="w-px h-5 bg-gray-700" />
        <input
          value={workflowMeta.name}
          onChange={e => setWorkflowMeta(m => ({ ...m, name: e.target.value }))}
          className="bg-transparent border-b border-gray-700 focus:border-blue-500 text-white text-sm px-1 py-0.5 outline-none min-w-0 w-48"
          placeholder="Tên workflow..."
        />

        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
          workflowMeta.channel === 'zalo'
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            : 'bg-[#1877F2]/10 border-[#1877F2]/30 text-[#1877F2]'
        }`}>
          <span>Kênh: {channelLabel}</span>
        </div>

        {/* ── Page selector ─────────────────────────────────────────── */}
        <div className="relative">
          <button
            onClick={() => setShowPagePicker(p => !p)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 text-xs transition-colors"
          >
            {pageLabel}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-500">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showPagePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl min-w-[220px] py-2">
              <p className="text-[11px] text-gray-500 px-3 pb-1.5 font-medium uppercase tracking-wider">
                Workflow áp dụng cho tài khoản {channelLabel}
              </p>
              {filteredAccounts.length === 0 && (
                <p className="text-gray-600 text-xs px-3 py-2">Chưa có tài khoản {channelLabel} nào</p>
              )}
              {filteredAccounts.map(acc => (
                <label key={acc.zalo_id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={workflowMeta.pageIds.includes(acc.zalo_id)}
                    onChange={() => togglePage(acc.zalo_id)}
                    className="accent-blue-500 w-3.5 h-3.5"
                  />
                  {acc.avatar_url && (
                    <img src={acc.avatar_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0" alt="" />
                  )}
                  <div className="min-w-0">
                    <div className="text-white text-xs font-medium truncate">{acc.full_name || acc.zalo_id}</div>
                    {acc.phone && <div className="text-gray-400 text-[11px]">{acc.phone}</div>}
                    <div className="text-gray-600 text-[11px]">{acc.zalo_id}</div>
                  </div>
                </label>
              ))}
              <div className="border-t border-gray-800 mt-1 pt-1 px-3">
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  {workflowMeta.pageIds.length === 0
                    ? `⚠ Chưa chọn tài khoản — workflow sẽ chạy cho TẤT CẢ tài khoản ${channelLabel} (${filteredAccounts.length})`
                    : `✓ Sẽ chạy cho ${workflowMeta.pageIds.length} tài khoản ${channelLabel} đã chọn`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Export */}
          <button onClick={handleExport} title="Xuất workflow ra JSON"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-xl transition-colors">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Xuất
          </button>
          {/* Import */}
          <button onClick={() => importFileRef.current?.click()} title="Nhập workflow từ JSON"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-xl transition-colors">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Nhập
          </button>
          {/* AI Builder */}
          <button onClick={() => setShowAIDialog(true)} title="Dùng AI để tạo workflow tự động"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border border-blue-500/50 text-white/90 text-xs font-medium rounded-xl transition-all shadow-sm shadow-blue-500/20">
            ✨ AI
          </button>

          <div className="w-px h-4 bg-gray-700" />

          {/* enabled toggle */}
          <button
            onClick={() => setWorkflowMeta(m => ({ ...m, enabled: !m.enabled }))}
            className="flex items-center gap-2 cursor-pointer"
            title={workflowMeta.enabled ? 'Đang bật — nhấn để tắt' : 'Đang tắt — nhấn để bật'}
          >
            <div className={`w-8 h-[18px] rounded-full transition-colors relative ${workflowMeta.enabled ? 'bg-blue-600' : 'bg-gray-700'}`}>
              <span className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-all ${workflowMeta.enabled ? 'left-[18px]' : 'left-[2px]'}`} />
            </div>
            <span className={`text-xs font-medium transition-colors ${workflowMeta.enabled ? 'text-blue-400' : 'text-gray-500'}`}>
              {workflowMeta.enabled ? 'Bật' : 'Tắt'}
            </span>
          </button>

          <div className="w-px h-4 bg-gray-700" />

          {/* Undo/Redo & Auto Align controls */}
          <button onClick={undo} disabled={historyIndex <= 0}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 text-gray-300 text-xs font-semibold rounded-xl transition-colors border border-gray-700/50"
            title="Hoàn tác (Ctrl+Z)">
            ↩️ Hoàn tác
          </button>
          
          <button onClick={redo} disabled={historyIndex >= history.length - 1}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 text-gray-300 text-xs font-semibold rounded-xl transition-colors border border-gray-700/50"
            title="Làm lại (Ctrl+Y)">
            ↪️ Làm lại
          </button>

          <button onClick={autoLayout}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl transition-all"
            title="Căn chỉnh tự động các Node sơ đồ">
            ✨ Căn chỉnh
          </button>

          <div className="w-px h-4 bg-gray-700" />

          <button onClick={handleSandboxClick} disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition-colors"
            title="Chạy mô phỏng toàn bộ luồng mà không gửi tin nhắn/API thật">
            {running && runAsSandbox ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <span className="text-[10px]">🧪</span>}
            Chạy Sandbox
          </button>

          <button onClick={handleRunClick} disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition-colors">
            {running && !runAsSandbox ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
            Chạy thử
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition-colors">
            {saving ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>}
            Lưu
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden" onClick={() => setShowPagePicker(false)}>
        <NodePalette channel={workflowMeta.channel} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative" onDrop={onDrop} onDragOver={e => e.preventDefault()}
            onClick={e => e.stopPropagation()}>
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={customOnEdgesChange}
              onConnect={onConnect} onNodeClick={onNodeClick}
              onPaneClick={() => { setSelectedNode(null); setShowSuggestionMenu(false); }}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onMoveStart={() => setShowSuggestionMenu(false)}
              onNodeDragStop={() => {
                recordState(nodes, edges);
                autoSave();
              }}
              onNodesDelete={deleted => {
                if (selectedNode && deleted.some(n => n.id === selectedNode.id)) setSelectedNode(null);
                setTimeout(() => {
                  setEdges(currentEdges => {
                    setNodes(currentNodes => {
                      recordState(currentNodes, currentEdges);
                      autoSave(currentNodes, currentEdges);
                      return currentNodes;
                    });
                    return currentEdges;
                  });
                }, 0);
              }}
              nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              deleteKeyCode={['Backspace', 'Delete']}
              onInit={inst => { rfInstanceRef.current = inst; }}
              fitView proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: 'custom', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#4b5563' } }}
            >
              <Background color={isLight ? '#c8c2b8' : '#374151'} gap={20} />
              <Controls />
            </ReactFlow>

            {/* Smart Connect Next-Node Suggestion Menu (Option C) */}
            {showSuggestionMenu && menuPosition && (
              <div 
                onClick={e => e.stopPropagation()}
                className="fixed z-[9999] w-64 bg-gray-900/95 border border-gray-700/60 rounded-2xl shadow-2xl backdrop-blur-md p-2 flex flex-col gap-1 overflow-hidden"
                style={{ 
                  left: Math.min(menuPosition.x, window.innerWidth - 270), 
                  top: Math.min(menuPosition.y, window.innerHeight - 380) 
                }}
              >
                <div className="px-3 py-1.5 border-b border-gray-800 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                  ⚡ Gợi ý Node tiếp theo
                </div>
                <div className="max-h-[300px] overflow-y-auto pr-1 flex flex-col gap-0.5">
                  {[
                    { type: 'zalo.sendMessage', label: '💬 Gửi tin nhắn Zalo', desc: 'Gửi văn bản kèm nút bấm' },
                    { type: 'zalo.sendImage', label: '🖼️ Gửi ảnh Zalo', desc: 'Gửi một hoặc nhiều hình ảnh' },
                    { type: 'crm.getContacts', label: '👤 Lọc CRM Contacts', desc: 'Lấy danh sách khách hàng từ CRM' },
                    { type: 'logic.condition', label: '🔀 Bộ lọc Điều kiện', desc: 'Phân nhánh IF/ELSE' },
                    { type: 'logic.loop', label: '🔄 Vòng lặp (forEach)', desc: 'Lặp qua danh sách liên hệ' },
                    { type: 'logic.delay', label: '⏳ Chờ đợi (Delay)', desc: 'Tạm dừng luồng trong vài phút/giờ' },
                    { type: 'integration.assistant', label: '🔮 Trợ lý AI (Gemini)', desc: 'Xử lý nội dung bằng AI' },
                  ].map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => addSuggestedNode(item.type)}
                      className="w-full flex flex-col items-start px-3 py-2 rounded-xl text-left hover:bg-gray-850 hover:text-white transition-colors duration-150 group"
                    >
                      <span className="text-xs font-semibold text-gray-200 group-hover:text-blue-400 transition-colors">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-gray-500 line-clamp-1">
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* UX hint */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-gray-600 pointer-events-none select-none whitespace-nowrap">
              Click liên kết → nhấn ✕ hoặc <kbd className="bg-gray-800 border border-gray-700 rounded px-1">Del</kbd> để xóa
            </div>
          </div>
          <RunHistoryPanel workflowId={workflowId} onSelectLog={setActiveDebugLog} />
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            workflowId={workflowId}
            onConfigChange={cfg => updateNodeConfig(selectedNode.id, cfg)}
            onLabelChange={label => updateNodeLabel(selectedNode.id, label)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Test Run Modal */}
      {showTestRunModal && (
        <TestRunModal
          accounts={accounts}
          workflowPageIds={workflowMeta.pageIds}
          triggerType={triggerType}
          onRun={(triggerData) => handleRun(triggerData, runAsSandbox)}
          onClose={() => setShowTestRunModal(false)}
        />
      )}

      {/* AI Workflow Builder Dialog */}
      {showAIDialog && (
        <WorkflowAIDialog
          currentNodes={buildWorkflow().nodes}
          currentEdges={buildWorkflow().edges}
          channel={workflowMeta.channel}
          onApply={handleAIApply}
          onClose={() => setShowAIDialog(false)}
        />
      )}
    </div>
  );
}

