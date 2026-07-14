/**
 * contextSerializer.ts
 * Serialize / Deserialize ExecutionContext cho Persistent Checkpoint.
 * - skippedNodes: Set<string> ↔ string[]
 * - Loại bỏ các field circular/không cần thiết khi serialize
 */

export interface SerializableContext {
  trigger: Record<string, any>;
  nodes: Record<string, { output: Record<string, any> }>;
  variables: Record<string, any>;
  pageId: string;
  skippedNodes: string[];          // Array (không phải Set)
  _wfName?: string;
  _wfId?: string;                  // Workflow ID
  _wfNodes?: any[];                // Snapshot của workflow nodes
  _wfEdges?: any[];                // Snapshot của workflow edges
  _triggeredBy?: string;
  _runId?: string;
  isSandbox?: boolean;
}

/**
 * Serialize ExecutionContext → JSON string để lưu vào SQLite.
 * Chú ý: bỏ qua các field không serializable (functions, circular refs).
 */
export function serializeContext(ctx: any): string {
  const serializable: SerializableContext = {
    trigger:      safeClone(ctx.trigger || {}),
    nodes:        safeClone(ctx.nodes   || {}),
    variables:    safeClone(ctx.variables || {}),
    pageId:       ctx.pageId || '',
    skippedNodes: Array.from(ctx.skippedNodes instanceof Set ? ctx.skippedNodes : (ctx.skippedNodes || [])),
    _wfName:      ctx._wfName,
    _wfId:        ctx._wfId,
    _wfNodes:     safeClone(ctx._wfNodes || []),
    _wfEdges:     safeClone(ctx._wfEdges || []),
    _triggeredBy: ctx._triggeredBy,
    _runId:       ctx._runId,
    isSandbox:    ctx.isSandbox || false,
  };
  return JSON.stringify(serializable);
}

/**
 * Deserialize JSON string → ExecutionContext với skippedNodes là Set<string>.
 */
export function deserializeContext(json: string): any {
  const raw: SerializableContext = JSON.parse(json);
  return {
    trigger:      raw.trigger      || {},
    nodes:        raw.nodes        || {},
    variables:    raw.variables    || {},
    pageId:       raw.pageId       || '',
    skippedNodes: new Set<string>(raw.skippedNodes || []),
    _wfName:      raw._wfName      || '',
    _wfId:        raw._wfId        || '',
    _wfNodes:     raw._wfNodes     || [],
    _wfEdges:     raw._wfEdges     || [],
    _triggeredBy: raw._triggeredBy || 'unknown',
    _runId:       raw._runId       || '',
    isSandbox:    raw.isSandbox    || false,
  };
}

/**
 * Deep-clone an object, skipping non-serializable values (functions, undefined).
 * Giữ lại các primitive, arrays, plain objects.
 * Truncate strings > 10KB để tránh context_json bloat trong SQLite.
 */
function safeClone(obj: any, depth = 0): any {
  if (depth > 10) return null;
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'function') return undefined;
  if (typeof obj === 'string') {
    return obj.length > 10_000 ? obj.slice(0, 10_000) + '…[truncated]' : obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => safeClone(item, depth + 1));
  if (obj instanceof Set) return Array.from(obj).map(item => safeClone(item, depth + 1));
  if (obj instanceof Map) {
    const result: Record<string, any> = {};
    obj.forEach((v, k) => { result[String(k)] = safeClone(v, depth + 1); });
    return result;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const cloned = safeClone(v, depth + 1);
    if (cloned !== undefined) result[k] = cloned;
  }
  return result;
}
