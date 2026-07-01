import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow, BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps } from 'reactflow';
import { GROUP_COLORS, getNodeLabel } from '../workflowConfig';
import { useAppStore } from '@/store/appStore';
import AppIcon from '@/components/common/AppIcon';

const useIsLight = () => {
  return useAppStore(s => s.theme === 'light' || (s.theme === 'system' && typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches));
};

// ─── Custom deletable edge ────────────────────────────────────────────────────

export const CustomDeletableEdge = memo((props: EdgeProps) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, style, animated } = props;
  const { setEdges } = useReactFlow();
  const isLight = useIsLight();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ 
          stroke: selected ? '#3b82f6' : (style?.stroke || (isLight ? '#9ca3af' : '#4b5563')), 
          strokeWidth: selected ? 2.5 : (style?.strokeWidth || 1.5), 
          transition: 'stroke 0.15s, stroke-width 0.15s' 
        }}
        interactionWidth={12}
        className={animated ? 'animated' : ''}
      />
      <EdgeLabelRenderer>
        {/* Delete button — always visible as a faint dot, turns red ✕ on hover/select */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() => setEdges(es => es.filter(e => e.id !== id))}
            title="Xóa liên kết này"
            className={[
              'w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 shadow-md',
              selected
                ? 'bg-red-500 border-2 border-red-400 text-white opacity-100 scale-110'
                : isLight
                  ? 'bg-white border-gray-100 text-gray-400 opacity-0 hover:!opacity-100 hover:bg-red-500 hover:border-red-400 hover:text-white hover:scale-110'
                  : 'bg-gray-800 border border-gray-600 text-gray-500 opacity-0 hover:!opacity-100 hover:bg-red-500 hover:border-red-400 hover:text-white hover:scale-110',
            ].join(' ')}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
CustomDeletableEdge.displayName = 'CustomDeletableEdge';

// ─── Node components ──────────────────────────────────────────────────────────

function NodeBase({ data, color, children }: { data: any; color: string; children?: React.ReactNode }) {
  const { setNodes, setEdges } = useReactFlow();
  const isLight = useIsLight();
  const showNotification = useAppStore(s => s.showNotification);
  const [showInspect, setShowInspect] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(ns => ns.filter(n => n.id !== data.id));
    setEdges(es => es.filter(e => e.source !== data.id && e.target !== data.id));
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('Đã sao chép vào bộ nhớ tạm!', 'success');
  };

  const debug = data.debugResult;
  const status = debug?.status;
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isSkipped = status === 'skipped';

  let borderColor = color;
  if (debug) {
    if (isSuccess) borderColor = '#22c55e';
    else if (isError) borderColor = '#ef4444';
    else if (isSkipped) borderColor = isLight ? '#d1d5db' : '#4b5563';
  }

  const badge = () => {
    if (!debug) return null;
    if (isSuccess) return <span className="text-[10px] text-green-500 font-bold" title={`Chạy thành công trong ${debug.durationMs}ms`}>✓ {debug.durationMs}ms</span>;
    if (isError) return <span className="text-[10px] text-red-500 font-bold" title={debug.error || 'Lỗi thực thi'}>⚠ Lỗi</span>;
    if (isSkipped) return <span className="text-[10px] text-gray-400" title="Bị bỏ qua">⏭️ Skipped</span>;
    return null;
  };

  return (
    <div className={`rounded-lg border-2 shadow-lg min-w-[180px] max-w-[240px] group/node relative transition-all duration-200 ${isSkipped ? 'opacity-60 scale-95' : ''}`}
      style={{ borderColor, background: isLight ? '#f8f7f4' : '#1e1e2e' }}>
      <div className="px-3 py-2 rounded-t-md flex items-center gap-2"
        style={{ background: borderColor + (isLight ? '30' : '22') }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: borderColor }} />
        <span className={`text-xs font-semibold truncate flex-1 ${isLight ? 'text-gray-800' : 'text-white'}`}>
          {data.label || getNodeLabel(data.type)}
        </span>
        {badge()}
        {/* Inspect button */}
        {debug && (debug.input || debug.output || debug.error) && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowInspect(!showInspect); }}
            className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border transition-colors ${
              showInspect
                ? 'bg-blue-600 border-blue-500 text-white'
                : isLight
                  ? 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-600'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-300'
            }`}
            title="Xem chi tiết chạy thử"
          >
            ℹ️
          </button>
        )}
        {/* Delete button — visible on hover */}
        {!debug && (
          <button
            onClick={handleDelete}
            className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-opacity hover:bg-red-500/30 text-gray-500 hover:text-red-400 flex-shrink-0"
            title="Xóa node"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
      {children && (
        <div className={`px-3 py-2 text-[11px] leading-tight ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>{children}</div>
      )}

      {/* Floating inspect details card */}
      {showInspect && debug && (
        <div className={`absolute left-full top-0 ml-2 rounded-xl border shadow-2xl p-3 z-50 text-[10px] font-mono leading-relaxed transition-all duration-200 ${
          isExpanded ? 'w-[480px]' : 'w-80'
        } ${
          isLight ? 'bg-white border-gray-200 text-gray-800' : 'bg-gray-900 border-gray-700 text-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center pb-1.5 border-b border-gray-700/50 mb-2">
            <span className="font-bold text-xs flex items-center gap-1"><AppIcon name="search" className="text-current" size={12} /> Chi tiết Node</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-0.5 mr-1"
                title={isExpanded ? "Thu nhỏ" : "Phóng to"}
              >
                {isExpanded ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H4.5m0 0V4.5m0 0L9 9M15 9h4.5m0 0V4.5m0 0l-4.5 4.5M9 15H4.5m0 0v4.5m0 0l4.5-4.5M15 15h4.5m0 0v4.5m0 0l-4.5-4.5" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                  </svg>
                )}
                <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
              <button
                onClick={() => {
                  const allData = {
                    input: debug.input,
                    output: debug.output,
                    error: debug.error,
                  };
                  handleCopyText(JSON.stringify(allData, null, 2));
                }}
                className="text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
                title="Sao chép toàn bộ thông tin"
              >
                <AppIcon name="copy" size={10} />
                <span>Copy all</span>
              </button>
              <button onClick={() => { setShowInspect(false); setIsExpanded(false); }} className="text-gray-500 hover:text-gray-300 font-bold">✕</button>
            </div>
          </div>
          <div className={`space-y-2.5 overflow-y-auto transition-all duration-200 ${isExpanded ? 'max-h-[460px]' : 'max-h-64'}`}>
            {debug.error && (
              <div className="space-y-1">
                <span className="font-semibold block text-red-500 flex items-center justify-between">
                  <span>❌ Lỗi:</span>
                  <button
                    onClick={() => handleCopyText(debug.error)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    title="Sao chép lỗi"
                  >
                    <AppIcon name="copy" size={10} />
                  </button>
                </span>
                <div className="text-red-500 border-l-2 border-red-500 pl-1.5 font-semibold select-all">
                  {debug.error}
                </div>
              </div>
            )}
            {debug.input && Object.keys(debug.input).length > 0 && (
              <div className="space-y-1">
                <span className={`font-semibold block flex items-center justify-between ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                  <span className="flex items-center gap-1"><AppIcon name="download" className="text-current" size={10} /> Input:</span>
                  <button
                    onClick={() => handleCopyText(JSON.stringify(debug.input, null, 2))}
                    className="text-gray-500 hover:text-blue-400 transition-colors"
                    title="Sao chép Input"
                  >
                    <AppIcon name="copy" size={10} />
                  </button>
                </span>
                <pre className={`p-1.5 rounded overflow-auto whitespace-pre-wrap break-all select-all transition-all duration-200 ${isExpanded ? 'max-h-[220px]' : 'max-h-24'} ${isLight ? 'bg-gray-100 border border-gray-200 text-gray-800' : 'bg-gray-800/40 border border-gray-700/30 text-gray-200'}`}>
                  {JSON.stringify(debug.input, null, 2)}
                </pre>
              </div>
            )}
            {debug.output && Object.keys(debug.output).length > 0 && (
              <div className="space-y-1">
                <span className={`font-semibold block flex items-center justify-between ${isLight ? 'text-green-600' : 'text-green-400'}`}>
                  <span className="flex items-center gap-1"><AppIcon name="send" className="text-current" size={10} /> Output:</span>
                  <button
                    onClick={() => handleCopyText(JSON.stringify(debug.output, null, 2))}
                    className="text-gray-500 hover:text-green-400 transition-colors"
                    title="Sao chép Output"
                  >
                    <AppIcon name="copy" size={10} />
                  </button>
                </span>
                <pre className={`p-1.5 rounded overflow-auto whitespace-pre-wrap break-all select-all border-none transition-all duration-200 ${isExpanded ? 'max-h-[220px]' : 'max-h-24'} ${isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-800/40 text-gray-200'}`}>
                  {JSON.stringify(debug.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const TriggerNode = memo(({ data }: NodeProps) => {
  const color = GROUP_COLORS['trigger'];
  const isLight = useIsLight();
  return (
    <div style={{ background: 'transparent' }}>
      <NodeBase data={data} color={color}>
        <div className={`text-[11px] leading-tight ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
          ⚡ {getTriggerSummary(data, isLight)}
        </div>
      </NodeBase>
      <Handle type="source" position={Position.Bottom} id="default" style={{ background: color }} />
    </div>
  );
});
TriggerNode.displayName = 'TriggerNode';

export const ActionNode = memo(({ data }: NodeProps) => {
  const color = GROUP_COLORS['action'];
  const isLight = useIsLight();
  return (
    <div style={{ background: 'transparent' }}>
      <Handle type="target" position={Position.Top} id="default" style={{ background: color }} />
      <NodeBase data={data} color={color}>
        <div className={`text-[11px] leading-tight ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
          {getActionSummary(data, isLight)}
        </div>
      </NodeBase>
      <Handle type="source" position={Position.Bottom} id="default" style={{ background: color }} />
    </div>
  );
});
ActionNode.displayName = 'ActionNode';

export const LogicNode = memo(({ data }: NodeProps) => {
  const color = GROUP_COLORS['logic'];
  const isIf = data.type === 'logic.if';
  const isSwitch = data.type === 'logic.switch';
  const isLight = useIsLight();
  return (
    <div style={{ background: 'transparent' }}>
      <Handle type="target" position={Position.Top} id="default" style={{ background: color }} />
      <NodeBase data={data} color={color}>
        <div className={`text-[11px] leading-tight ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>
          {getLogicSummary(data, isLight)}
        </div>
      </NodeBase>
      {isIf ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true"
            style={{ background: '#22c55e', left: '30%' }}>
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-green-400">true</span>
          </Handle>
          <Handle type="source" position={Position.Bottom} id="false"
            style={{ background: '#ef4444', left: '70%' }}>
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-red-400">false</span>
          </Handle>
        </>
      ) : isSwitch ? (
        <>
          {(data.config?.cases || []).map((c: any, i: number) => (
            <Handle key={i} type="source" position={Position.Bottom} id={c[1] || c.label || String(i)}
              style={{ background: color, left: `${((i + 1) / ((data.config.cases.length || 1) + 2)) * 100}%` }} />
          ))}
          <Handle type="source" position={Position.Bottom} id={data.config?.defaultLabel || 'default'}
            style={{ background: '#6b7280', right: '1rem', left: 'auto' }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} id="default" style={{ background: color }} />
      )}
    </div>
  );
});
LogicNode.displayName = 'LogicNode';

export const DataNode = memo(({ data }: NodeProps) => {
  const color = GROUP_COLORS['data'];
  const isLight = useIsLight();
  return (
    <div style={{ background: 'transparent' }}>
      <Handle type="target" position={Position.Top} id="default" style={{ background: color }} />
      <NodeBase data={data} color={color}>
        <div className={`text-[11px] leading-tight ${isLight ? 'text-teal-800' : 'text-teal-300'}`}>
          {getDataSummary(data, isLight)}
        </div>
      </NodeBase>
      <Handle type="source" position={Position.Bottom} id="default" style={{ background: color }} />
    </div>
  );
});
DataNode.displayName = 'DataNode';

export const OutputNode = memo(({ data }: NodeProps) => {
  const color = GROUP_COLORS['output'];
  const isHttp = data.type === 'output.httpRequest';
  const isLog  = data.type === 'output.log';
  const cfg = data.config || {};
  const isLight = useIsLight();
  // Màu text nhẹ hơn cho output nodes
  const textClass = isLight ? 'text-gray-700' : 'text-rose-300';

  const body = isHttp ? (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono leading-none
          ${cfg.method === 'GET'    ? 'bg-green-500/20 text-green-500 border border-green-500/30' :
            cfg.method === 'DELETE' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
            cfg.method === 'PUT' || cfg.method === 'PATCH' ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30' :
            'bg-blue-500/20 text-blue-500 border border-blue-500/30'}`}>
          {cfg.method || 'POST'}
        </span>
        <span className={`${textClass} text-[11px] truncate flex-1`}>
          {cfg.url ? (() => { try { return new URL(cfg.url.replace(/\{\{.*?}}/g,'')).hostname || cfg.url; } catch { return truncate(cfg.url, 22); } })() : 'URL chưa đặt'}
        </span>
      </div>
      {cfg.body && (
        <span className="text-gray-500 text-[9px] truncate">body: {truncate(String(cfg.body), 24)}</span>
      )}
    </div>
  ) : isLog ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none flex-shrink-0
        ${cfg.level === 'error' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
          cfg.level === 'warn'  ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
          'bg-gray-500/20 text-gray-500 border border-gray-500/30'}`}>
        {(cfg.level || 'info').toUpperCase()}
      </span>
      <span className={`${textClass} text-[11px] truncate flex-1`}>
        {renderRichValue(truncate(cfg.message, 26) || 'Nội dung log...', isLight)}
      </span>
    </div>
  ) : (
    <div className={textClass}>{getOutputSummary(data, isLight)}</div>
  );

  return (
    <div style={{ background: 'transparent' }}>
      <Handle type="target" position={Position.Top} id="default" style={{ background: color }} />
      <NodeBase data={data} color={color}>{body}</NodeBase>
      {/* httpRequest có source handle vì output có thể dùng ở bước sau */}
      {isHttp && (
        <Handle type="source" position={Position.Bottom} id="default" style={{ background: color }} />
      )}
    </div>
  );
});
OutputNode.displayName = 'OutputNode';

export const IntegrationNode = memo(({ data }: NodeProps) => {
  const color = GROUP_COLORS['integration'];
  const isLight = useIsLight();
  return (
    <div style={{ background: 'transparent' }}>
      <Handle type="target" position={Position.Top} id="default" style={{ background: color }} />
      <NodeBase data={data} color={color}>
        <div className={`text-[11px] leading-tight ${isLight ? 'text-green-700' : 'text-green-300'}`}>
          {getIntegrationSummary(data, isLight)}
        </div>
      </NodeBase>
      <Handle type="source" position={Position.Bottom} id="default" style={{ background: color }} />
    </div>
  );
});
IntegrationNode.displayName = 'IntegrationNode';

// ─── Summary helpers ──────────────────────────────────────────────────────────

const VARIABLE_MAP: Record<string, string> = {
  '$trigger.content': 'Nội dung tin nhắn',
  '$trigger.fromName': 'Tên người gửi',
  '$trigger.fromPhone': 'SĐT người gửi',
  '$trigger.threadId': 'ID hội thoại',
  '$trigger.fromId': 'ID người gửi',
  '$trigger.msgId': 'ID tin nhắn',
  '$trigger.userId': 'User ID',
  '$trigger.groupId': 'Group ID',
  '$vars.contact.zaloId': 'Zalo ID contact',
};

const OPERATOR_MAP: Record<string, string> = {
  'equals': 'bằng',
  '=': 'bằng',
  'not_equals': 'khác',
  '!=': 'khác',
  'contains': 'bao gồm',
  'contains_any': 'bao gồm từ',
  'contains_all': 'bao gồm tất cả từ',
  'not_contains': 'không bao gồm',
  'starts_with': 'bắt đầu bằng',
  'ends_with': 'kết thúc bằng',
  'empty': 'rỗng',
  'not_empty': 'không rỗng',
  'greater_than': 'lớn hơn',
  'less_than': 'nhỏ hơn',
};

function renderRichValue(val: any, isLight: boolean): React.ReactNode {
  if (val === undefined || val === null) return '';
  const str = String(val);
  
  const parts = str.split(/(\{\{[\s\S]*?\}\})/gu);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 font-medium">
      {parts.map((part, index) => {
        if (part.startsWith('{{') && part.endsWith('}}')) {
          const inner = part.slice(2, -2).trim();
          const cleanVar = inner.replace(/^\$/, '');
          const displayName = VARIABLE_MAP[inner] || VARIABLE_MAP[cleanVar] || inner;
          return (
            <span
              key={index}
              className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] border leading-none ${
                isLight 
                  ? 'bg-gray-200/60 text-gray-800 border-gray-300' 
                  : 'bg-gray-850 text-gray-200 border-gray-700'
              }`}
            >
              {displayName}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

function renderOperator(op: string, isLight: boolean): React.ReactNode {
  const friendly = OPERATOR_MAP[op] || op;
  return (
    <span className={`mx-1 font-semibold ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
      {friendly}
    </span>
  );
}

function getTriggerSummary(data: any, isLight: boolean): React.ReactNode {
  const cfg = data.config || {};
  switch (data.type) {
    case 'trigger.message':
      return cfg.keyword ? (
        <div className="flex flex-wrap items-center gap-1">
          <span>Tin nhắn chứa:</span>
          <span className="font-semibold">"{cfg.keyword}"</span>
        </div>
      ) : (
        <span>Tất cả tin nhắn</span>
      );
    case 'trigger.friendRequest':
      return <span>Lời mời kết bạn</span>;
    case 'trigger.groupEvent':
      return <span>Sự kiện nhóm: {cfg.eventType !== 'all' ? cfg.eventType : 'Tất cả'}</span>;
    case 'trigger.labelAssigned': {
      const action = cfg.action === 'assigned' ? 'Gán nhãn' : cfg.action === 'removed' ? 'Gỡ nhãn' : 'Gán/gỡ nhãn';
      const count = Array.isArray(cfg.labelIds) && cfg.labelIds.length;
      const labelPart = count ? `${count} nhãn` : 'nhãn bất kỳ';
      return (
        <span>
          {action}: <span className="font-semibold">{labelPart}</span>
        </span>
      );
    }
    case 'trigger.schedule':
      return <span>Lịch trình: <span className="font-mono text-xs">{cfg.cronExpression || 'Cron'}</span></span>;
    case 'trigger.manual':
      return <span>Chạy thủ công</span>;
    default:
      return '';
  }
}

function getActionSummary(data: any, isLight: boolean): React.ReactNode {
  const cfg = data.config || {};
  switch (data.type) {
    case 'zalo.sendMessage':
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 font-medium">Gửi tin nhắn:</span>
          {renderRichValue(truncate(cfg.message, 45), isLight)}
        </div>
      );
    case 'zalo.sendTyping':
      return <span>⌨️ Đang gõ… rồi chờ {cfg.delaySeconds || 3}s</span>;
    case 'zalo.sendImage':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="image" className="text-current" size={11} /> Gửi ảnh:</span>
          {cfg.filePath ? renderRichValue(truncate(cfg.filePath, 24), isLight) : <span className="italic text-gray-500">Chưa chọn</span>}
        </div>
      );
    case 'zalo.sendFile':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="paperclip" className="text-current" size={11} /> Gửi file:</span>
          {cfg.filePath ? renderRichValue(truncate(cfg.filePath, 24), isLight) : <span className="italic text-gray-500">Chưa chọn</span>}
        </div>
      );
    case 'zalo.findUser':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="search" className="text-current" size={11} /> Tìm SĐT:</span>
          {cfg.phone ? renderRichValue(cfg.phone, isLight) : <span className="italic text-gray-500">...</span>}
        </div>
      );
    case 'zalo.getUserInfo':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="users" className="text-current" size={11} /> Lấy thông tin:</span>
          {cfg.userId ? renderRichValue(cfg.userId, isLight) : <span className="italic text-gray-500">Người gửi</span>}
        </div>
      );
    case 'zalo.acceptFriendRequest':
      return <span className="flex items-center gap-1"><AppIcon name="check" className="text-green-500" size={11} /> Chấp nhận kết bạn</span>;
    case 'zalo.rejectFriendRequest':
      return <span className="flex items-center gap-1"><AppIcon name="x" className="text-red-500" size={11} /> Từ chối kết bạn</span>;
    case 'zalo.sendFriendRequest':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="user_plus" className="text-current" size={11} /> Kết bạn:</span>
          {cfg.userId ? renderRichValue(cfg.userId, isLight) : <span className="italic text-gray-500">...</span>}
        </div>
      );
    case 'zalo.addToGroup':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="users" className="text-current" size={11} /><AppIcon name="plus" className="text-current" size={9} /> Thêm vào nhóm:</span>
          {cfg.userId ? renderRichValue(cfg.userId, isLight) : <span className="italic text-gray-500">Người gửi</span>}
        </div>
      );
    case 'zalo.removeFromGroup':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="users" className="text-current" size={11} /><AppIcon name="x" className="text-red-400" size={9} /> Xóa khỏi nhóm:</span>
          {cfg.userId ? renderRichValue(cfg.userId, isLight) : <span className="italic text-gray-500">...</span>}
        </div>
      );
    case 'zalo.setMute':
      return <span className="flex items-center gap-1">{cfg.action === 'unmute' ? <AppIcon name="notifications" className="text-current" size={11} /> : <AppIcon name="bell_off" className="text-current" size={11} />}{cfg.action === 'unmute' ? 'Bật thông báo' : 'Tắt thông báo'}</span>;
    case 'zalo.forwardMessage':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="reply" className="text-current" size={11} /> Chuyển tiếp đến:</span>
          {cfg.toThreadId ? renderRichValue(cfg.toThreadId, isLight) : <span className="italic text-gray-500">...</span>}
        </div>
      );
    case 'zalo.undoMessage':
      return <span className="flex items-center gap-1"><AppIcon name="reply" className="text-current" size={11} /> Thu hồi tin nhắn</span>;
    case 'zalo.createPoll':
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1"><AppIcon name="chart" className="text-current" size={10} /> Tạo bình chọn:</span>
          <span className="font-semibold truncate">{cfg.question || 'Chưa nhập câu hỏi'}</span>
        </div>
      );
    case 'zalo.getMessageHistory':
      return <span className="flex items-center gap-1"><AppIcon name="clock" className="text-current" size={11} /> Lấy {cfg.count || 20} tin nhắn</span>;
    case 'zalo.addReaction':
      return <span className="flex items-center gap-1"><AppIcon name="smile" className="text-current" size={11} /> React tin nhắn</span>;
    case 'zalo.assignLabel': {
      const cnt = Array.isArray(cfg.labelIds) && cfg.labelIds.length;
      return <span className="flex items-center gap-1"><AppIcon name="labels" className="text-current" size={11} /> Gắn {cnt ? `${cnt} nhãn` : 'nhãn'}</span>;
    }
    case 'zalo.removeLabel': {
      const cnt = Array.isArray(cfg.labelIds) && cfg.labelIds.length;
      return <span className="flex items-center gap-1"><AppIcon name="labels" className="text-current" size={11} /> Gỡ {cnt ? `${cnt} nhãn` : 'nhãn'}</span>;
    }
    default:
      return '';
  }
}

function getLogicSummary(data: any, isLight: boolean): React.ReactNode {
  const cfg = data.config || {};
  switch (data.type) {
    case 'logic.if':
      return (
        <div className="flex flex-wrap items-center gap-0.5">
          {renderRichValue(cfg.left, isLight)}
          {renderOperator(cfg.operator || '=', isLight)}
          {renderRichValue(cfg.right, isLight)}
        </div>
      );
    case 'logic.wait':
      return <span>Chờ {cfg.delaySeconds || 1}s</span>;
    case 'logic.setVariable':
      return (
        <div className="flex flex-wrap items-center gap-0.5">
          <span className="font-semibold">{cfg.name || 'Biến'}</span>
          <span className="mx-1 text-gray-500">=</span>
          {renderRichValue(cfg.value, isLight)}
        </div>
      );
    case 'logic.stopIf':
      return (
        <div className="flex flex-wrap items-center gap-0.5">
          <span>Dừng nếu:</span>
          {renderOperator(cfg.operator || '=', isLight)}
        </div>
      );
    case 'logic.switch':
      return (
        <div className="flex flex-wrap items-center gap-0.5">
          <span>Chọn theo:</span>
          {renderRichValue(cfg.value, isLight)}
        </div>
      );
    default:
      return '';
  }
}

function getDataSummary(data: any, isLight: boolean): React.ReactNode {
  const cfg = data.config || {};
  switch (data.type) {
    case 'data.textFormat':
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 font-medium">Định dạng chữ:</span>
          {renderRichValue(truncate(cfg.template, 30), isLight)}
        </div>
      );
    case 'data.randomPick':
      return <span>Chọn ngẫu nhiên</span>;
    case 'data.dateFormat':
      return <span className="flex items-center gap-1"><AppIcon name="calendar" className="text-current" size={11} /> Định dạng ngày: <span className="font-semibold">{cfg.format || 'datetime'}</span></span>;
    case 'data.jsonParse':
      return <span>Parse JSON</span>;
    default:
      return '';
  }
}

function getOutputSummary(data: any, isLight: boolean): React.ReactNode {
  const cfg = data.config || {};
  switch (data.type) {
    case 'output.httpRequest':
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="font-bold text-blue-500">{cfg.method || 'POST'}</span>
            <span className="truncate">{cfg.url || 'URL...'}</span>
          </div>
        </div>
      );
    case 'output.log':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span>Log:</span>
          {renderRichValue(truncate(cfg.message, 26), isLight)}
        </div>
      );
    default:
      return '';
  }
}

function getIntegrationSummary(data: any, isLight: boolean): React.ReactNode {
  const cfg = data.config || {};
  switch (data.type) {
    case 'sheets.appendRow':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="chart" className="text-current" size={11} /> Ghi Sheets:</span>
          {cfg.sheetName || cfg.spreadsheetId ? (
            <span className="font-semibold truncate">{truncate(cfg.sheetName || cfg.spreadsheetId, 18)}</span>
          ) : (
            <span className="italic text-gray-500">Sheet</span>
          )}
        </div>
      );
    case 'sheets.readValues':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="chart" className="text-current" size={11} /> Đọc Sheets:</span>
          {cfg.range ? <span className="font-semibold">{truncate(cfg.range, 18)}</span> : <span className="italic text-gray-500">range...</span>}
        </div>
      );
    case 'sheets.updateCell':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="chart" className="text-current" size={11} /> Cập nhật ô:</span>
          {cfg.range ? <span className="font-semibold">{cfg.range}</span> : <span className="italic text-gray-500">...</span>}
        </div>
      );
    case 'ai.generateText': {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1"><AppIcon name="ai" className="text-current" size={11} /> AI tạo văn bản:</span>
          {renderRichValue(truncate(cfg.prompt, 35), isLight)}
        </div>
      );
    }
    case 'ai.classify': {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1"><AppIcon name="ai" className="text-current" size={11} /> AI Phân loại:</span>
          <span className="font-semibold truncate">{truncate(cfg.categories, 25) || '...'}</span>
        </div>
      );
    }
    case 'notify.telegram':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="send" className="text-current" size={11} /> Gửi Telegram:</span>
          {cfg.chatId ? renderRichValue(cfg.chatId, isLight) : <span className="italic text-gray-500">Chat ID...</span>}
        </div>
      );
    case 'notify.discord':
      return <span className="flex items-center gap-1"><AppIcon name="chat" className="text-current" size={11} /> Gửi tin nhắn Discord</span>;
    case 'notify.email':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="at_sign" className="text-current" size={11} /> Gửi Email:</span>
          {cfg.to ? renderRichValue(cfg.to, isLight) : <span className="italic text-gray-500">Email...</span>}
        </div>
      );
    case 'notify.notion':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-1"><AppIcon name="file_text" className="text-current" size={11} /> Notion DB:</span>
          {cfg.databaseId ? <span className="font-semibold truncate">{truncate(cfg.databaseId, 12)}</span> : <span className="italic text-gray-500">DB...</span>}
        </div>
      );
    default:
      return '';
  }
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

