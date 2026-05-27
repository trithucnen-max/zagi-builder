// Mock uuid to bypass ES Module compilation issue in Jest
jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid-v4',
}));

import WorkflowEngineService from '../services/workflow/WorkflowEngineService';
import { Workflow } from '../services/workflow/WorkflowEngineService';

// Mock target dependencies
jest.mock('../utils/Logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../services/database/DatabaseService', () => {
  return {
    getInstance: jest.fn().mockReturnValue({
      saveWorkflowRunLog: jest.fn(),
    }),
  };
});

describe('WorkflowEngineService - Group Event Trigger Flow', () => {
  let engine: WorkflowEngineService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      sendMessage: jest.fn().mockResolvedValue({ message: { msgId: 'msg_12345' } }),
      sendTypingEvent: jest.fn().mockResolvedValue({}),
      getOwnId: jest.fn().mockReturnValue('page_123'),
    };

    engine = WorkflowEngineService.getInstance();
    // Inject mock api
    (engine as any).getApi = jest.fn().mockReturnValue(mockApi);
  });

  it('should trigger workflow on group event and send message to the group with threadType 1', async () => {
    // 1. Arrange a mock workflow: group join trigger -> send message
    const mockWorkflow: Workflow = {
      id: 'wf_123',
      name: 'Welcome Message Workflow',
      enabled: true,
      channel: 'zalo',
      pageIds: ['page_123'],
      nodes: [
        {
          id: 'n1',
          type: 'trigger.groupEvent',
          position: { x: 0, y: 0 },
          config: { eventType: 'join', groupId: '177639556726685920' },
        },
        {
          id: 'n2',
          type: 'zalo.sendMessage',
          label: 'Send Welcome',
          position: { x: 200, y: 0 },
          config: {
            message: 'Welcome {{ $trigger.fromName }} to group!',
            threadId: '{{ $trigger.threadId }}',
            threadType: '{{ $trigger.threadType }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Mock data from event:groupEvent socket
    const groupEventData = {
      zaloId: 'page_123',
      groupId: '177639556726685920',
      eventType: 'join',
      data: {
        groupId: '177639556726685920',
        updateMembers: [{ id: 'user_new', dName: 'New Member' }],
      },
      systemText: 'New Member joined group',
    };

    // 2. Act
    const log = await engine.executeWorkflow(mockWorkflow, groupEventData, 'trigger.groupEvent');

    // 3. Assert
    // Check that the workflow executed successfully
    expect(log.status).toBe('success');
    expect(log.nodeResults.length).toBe(2);

    const sendNodeResult = log.nodeResults[1];
    expect(sendNodeResult.status).toBe('success');
    expect(sendNodeResult.input.threadId).toBe('177639556726685920');
    expect(sendNodeResult.input.threadType).toBe('1'); // Evaluated trigger threadType

    // Check that api.sendMessage was called with correct arguments
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      { msg: 'Welcome New Member to group!' },
      '177639556726685920', // threadId
      1                     // threadType (1 = Group)
    );
  });

  it('should parse nested updateMembers from rawEvent structure in group event', async () => {
    const mockWorkflow: Workflow = {
      id: 'wf_nested',
      name: 'Welcome Nested',
      enabled: true,
      channel: 'zalo',
      pageIds: ['page_123'],
      nodes: [
        {
          id: 'n1',
          type: 'trigger.groupEvent',
          position: { x: 0, y: 0 },
          config: { eventType: 'join', groupId: '177639556726685920' },
        },
        {
          id: 'n2',
          type: 'zalo.sendMessage',
          label: 'Send Welcome',
          position: { x: 200, y: 0 },
          config: {
            message: 'Hello {{ $trigger.fromName }}!',
            threadId: '{{ $trigger.threadId }}',
            threadType: '{{ $trigger.threadType }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Deeply nested Zalo group event structure
    const groupEventData = {
      zaloId: 'page_123',
      groupId: '177639556726685920',
      eventType: 'join',
      data: {
        type: 'join',
        threadId: '177639556726685920',
        data: {
          groupId: '177639556726685920',
          updateMembers: [{ id: 'user_nested', dName: 'Nested Member' }],
        }
      },
      systemText: 'Nested Member joined',
    };

    const log = await engine.executeWorkflow(mockWorkflow, groupEventData, 'trigger.groupEvent');
    expect(log.status).toBe('success');
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      { msg: 'Hello Nested Member!' },
      '177639556726685920',
      1
    );
  });

  it('should correctly fall back and resolve node output using .output variable syntax', async () => {
    const mockWorkflow: Workflow = {
      id: 'wf_fallback',
      name: 'Fallback Output',
      enabled: true,
      channel: 'zalo',
      pageIds: ['page_123'],
      nodes: [
        {
          id: 'n1',
          type: 'trigger.reaction',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'n2',
          type: 'data.randomPick',
          label: 'Pick Random',
          position: { x: 200, y: 0 },
          config: {
            options: 'Cám ơn bạn!'
          },
        },
        {
          id: 'n3',
          type: 'zalo.sendMessage',
          label: 'Send Thanks',
          position: { x: 400, y: 0 },
          config: {
            message: '{{ $node.Pick Random.output }}',
            threadId: '{{ $trigger.threadId }}',
            threadType: '{{ $trigger.threadType }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const reactionData = {
      zaloId: 'page_123',
      reaction: {
        threadId: 'group_abc',
        isGroup: true,
        data: {
          uidFrom: 'user_xyz',
          msgId: 'msg_abc',
          react: 'heart',
        }
      }
    };

    const log = await engine.executeWorkflow(mockWorkflow, reactionData, 'trigger.reaction');
    expect(log.status).toBe('success');

    // Random pick node should have executed and generated { result: 'Cám ơn bạn!' }
    const pickNodeResult = log.nodeResults[1];
    expect(pickNodeResult.status).toBe('success');
    expect(pickNodeResult.output.result).toBe('Cám ơn bạn!');

    // Send node should resolve {{ $node.Pick Random.output }} to 'Cám ơn bạn!' via smart fallback
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      { msg: 'Cám ơn bạn!' },
      'group_abc',
      1
    );
  });
});
