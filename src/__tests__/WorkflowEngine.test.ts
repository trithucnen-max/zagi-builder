/**
 * WorkflowEngineService Unit Tests
 * Tests node evaluation logic, condition checking, and variable resolution
 * independently from database / Electron / network dependencies.
 */

// ─── Pure helper functions (extracted from engine logic for testing) ──────────

type WorkflowContext = {
  variables: Record<string, unknown>;
  trigger?: { senderId?: string; message?: string; groupId?: string };
};

/** Evaluate a simple condition string like "{{varName}} == value" */
function evaluateCondition(condition: string, ctx: WorkflowContext): boolean {
  const resolved = condition.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(ctx.variables[key] ?? '');
  });

  if (resolved.includes('==')) {
    const [left, right] = resolved.split('==').map(s => s.trim());
    return left === right;
  }
  if (resolved.includes('!=')) {
    const [left, right] = resolved.split('!=').map(s => s.trim());
    return left !== right;
  }
  if (resolved.includes('contains')) {
    const [left, right] = resolved.split('contains').map(s => s.trim());
    return left.includes(right);
  }
  return false;
}

/** Resolve template strings with context variables */
function resolveTemplate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(ctx.variables[key] ?? `{{${key}}}`);
  });
}

/** Extract trigger data from a raw Zalo message event */
function extractTriggerData(event: {
  zaloId: string;
  message: { senderId: string; content: string; threadId: string };
}): WorkflowContext['trigger'] {
  return {
    senderId: event.message.senderId,
    message: event.message.content,
    groupId: event.message.threadId,
  };
}

/** Check if a workflow node type is a trigger node */
function isTriggerNode(type: string): boolean {
  return type.startsWith('trigger.');
}

/** Check if a workflow should run based on pageIds filter */
function shouldRunForPage(workflow: { pageIds: string[] }, zaloId: string): boolean {
  if (!workflow.pageIds || workflow.pageIds.length === 0) return true; // all pages
  return workflow.pageIds.includes(zaloId);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowEngine — Condition Evaluation', () => {
  const baseCtx: WorkflowContext = {
    variables: { status: 'active', count: '5', name: 'Nguyen Van A' },
  };

  it('should evaluate == condition correctly (match)', () => {
    expect(evaluateCondition('{{status}} == active', baseCtx)).toBe(true);
  });

  it('should evaluate == condition correctly (no match)', () => {
    expect(evaluateCondition('{{status}} == inactive', baseCtx)).toBe(false);
  });

  it('should evaluate != condition correctly', () => {
    expect(evaluateCondition('{{status}} != inactive', baseCtx)).toBe(true);
  });

  it('should evaluate contains condition correctly', () => {
    expect(evaluateCondition('{{name}} contains Nguyen', baseCtx)).toBe(true);
  });

  it('should handle missing variable with empty string', () => {
    expect(evaluateCondition('{{missing}} == ', baseCtx)).toBe(true);
  });
});

describe('WorkflowEngine — Template Resolution', () => {
  const ctx: WorkflowContext = {
    variables: { name: 'Trung', plan: 'Pro', daysLeft: '5' },
  };

  it('should resolve single variable', () => {
    expect(resolveTemplate('Xin chao {{name}}!', ctx)).toBe('Xin chao Trung!');
  });

  it('should resolve multiple variables', () => {
    expect(resolveTemplate('{{name}} dang dung goi {{plan}}.', ctx)).toBe('Trung dang dung goi Pro.');
  });

  it('should keep placeholder for unknown variables', () => {
    expect(resolveTemplate('{{unknown}}', ctx)).toBe('{{unknown}}');
  });

  it('should resolve numeric variable as string', () => {
    expect(resolveTemplate('Con {{daysLeft}} ngay.', ctx)).toBe('Con 5 ngay.');
  });
});

describe('WorkflowEngine — Trigger Data Extraction', () => {
  it('should extract trigger data from message event', () => {
    const event = {
      zaloId: 'zalo_123',
      message: { senderId: 'user_456', content: 'Xin chao', threadId: 'thread_789' },
    };
    const trigger = extractTriggerData(event);
    expect(trigger.senderId).toBe('user_456');
    expect(trigger.message).toBe('Xin chao');
    expect(trigger.groupId).toBe('thread_789');
  });
});

describe('WorkflowEngine — Node Type Classification', () => {
  it('should identify trigger nodes correctly', () => {
    expect(isTriggerNode('trigger.message')).toBe(true);
    expect(isTriggerNode('trigger.schedule')).toBe(true);
    expect(isTriggerNode('trigger.friendRequest')).toBe(true);
  });

  it('should not classify action nodes as triggers', () => {
    expect(isTriggerNode('zalo.sendMessage')).toBe(false);
    expect(isTriggerNode('logic.if')).toBe(false);
    expect(isTriggerNode('data.textFormat')).toBe(false);
  });
});

describe('WorkflowEngine — Page Filter', () => {
  it('should run for all pages when pageIds is empty', () => {
    const workflow = { pageIds: [] };
    expect(shouldRunForPage(workflow, 'any_zalo_id')).toBe(true);
  });

  it('should run when zaloId is in pageIds', () => {
    const workflow = { pageIds: ['zalo_1', 'zalo_2'] };
    expect(shouldRunForPage(workflow, 'zalo_1')).toBe(true);
  });

  it('should NOT run when zaloId is not in pageIds', () => {
    const workflow = { pageIds: ['zalo_1', 'zalo_2'] };
    expect(shouldRunForPage(workflow, 'zalo_999')).toBe(false);
  });
});
