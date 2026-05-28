// Mock uuid to bypass ES Module compilation issue in Jest
jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid-v4',
}));

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

jest.mock('../services/event/EventBroadcaster', () => ({
  emit: jest.fn(),
  onBeforeSend: jest.fn(),
  registerGroupCacheInvalidator: jest.fn(),
}));

import WorkflowEngineService from '../services/workflow/WorkflowEngineService';
import * as http from 'http';

function makePostRequest(url: string, body: any, headers: Record<string, string> = {}): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options: http.RequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          data,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

function makeGetRequest(url: string, headers: Record<string, string> = {}): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: 'GET',
      headers,
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          data,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

describe('WorkflowEngineService - Webhook Trigger Server', () => {
  let engine: WorkflowEngineService;

  beforeAll(() => {
    engine = WorkflowEngineService.getInstance();
    engine.startWebhookServer();
  });

  afterAll(() => {
    engine.stopWebhookServer();
  });

  beforeEach(() => {
    (engine as any).workflows.clear();
    jest.clearAllMocks();
  });

  it('should reject non-POST requests with 405 Method Not Allowed', async () => {
    const res = await makeGetRequest('http://localhost:5678/webhook/some-id');
    expect(res.statusCode).toBe(405);
    const parsed = JSON.parse(res.data);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Method Not Allowed');
  });

  it('should return 404 when workflow does not exist', async () => {
    const res = await makePostRequest('http://localhost:5678/webhook/non-existent-id', { test: true });
    expect(res.statusCode).toBe(404);
    const parsed = JSON.parse(res.data);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Workflow not found');
  });

  it('should return 400 when workflow is disabled', async () => {
    const wf = {
      id: 'wf-disabled',
      name: 'Disabled Workflow',
      enabled: false,
      channel: 'zalo' as const,
      pageIds: [],
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    (engine as any).workflows.set(wf.id, wf);

    const res = await makePostRequest('http://localhost:5678/webhook/wf-disabled', { test: true });
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.data);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('disabled');
  });

  it('should return 400 when workflow does not have a trigger.webhook node', async () => {
    const wf = {
      id: 'wf-no-webhook-trigger',
      name: 'Message Trigger Workflow',
      enabled: true,
      channel: 'zalo' as const,
      pageIds: [],
      nodes: [
        { id: 'n1', type: 'trigger.message', position: { x: 0, y: 0 }, config: {} }
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    (engine as any).workflows.set(wf.id, wf);

    const res = await makePostRequest('http://localhost:5678/webhook/wf-no-webhook-trigger', { test: true });
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.data);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Webhook Trigger');
  });

  it('should return 401 when auth secret is configured and authorization header is missing or incorrect', async () => {
    const wf = {
      id: 'wf-auth-secured',
      name: 'Auth Secured Workflow',
      enabled: true,
      channel: 'zalo' as const,
      pageIds: [],
      nodes: [
        { id: 'n1', type: 'trigger.webhook', position: { x: 0, y: 0 }, config: { authSecret: 'my-secret-key' } }
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    (engine as any).workflows.set(wf.id, wf);

    // No auth header/query
    let res = await makePostRequest('http://localhost:5678/webhook/wf-auth-secured', { test: true });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.data).error).toContain('Unauthorized');

    // Incorrect header
    res = await makePostRequest('http://localhost:5678/webhook/wf-auth-secured', { test: true }, {
      'Authorization': 'Bearer wrong-key'
    });
    expect(res.statusCode).toBe(401);

    // Correct header (Bearer)
    const executeSpy = jest.spyOn(engine, 'executeWorkflow').mockResolvedValue({ status: 'success', nodeResults: [] } as any);
    res = await makePostRequest('http://localhost:5678/webhook/wf-auth-secured', { test: true }, {
      'Authorization': 'Bearer my-secret-key'
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.data).success).toBe(true);
    expect(executeSpy).toHaveBeenCalled();
  });

  it('should parse body, query parameter token, and headers to execute workflow successfully', async () => {
    const wf = {
      id: 'wf-ok',
      name: 'Successful Webhook Workflow',
      enabled: true,
      channel: 'zalo' as const,
      pageIds: ['zalo_boss'],
      nodes: [
        { id: 'n1', type: 'trigger.webhook', position: { x: 0, y: 0 }, config: { authSecret: 'token123' } }
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    (engine as any).workflows.set(wf.id, wf);

    const executeSpy = jest.spyOn(engine, 'executeWorkflow').mockResolvedValue({ status: 'success', nodeResults: [] } as any);

    // Request with query param auth token
    const res = await makePostRequest('http://localhost:5678/webhook/wf-ok?token=token123&custom_param=value', {
      message: 'Hello trigger'
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.data);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Workflow triggered');

    // Wait slightly since executeWorkflow is run asynchronously (then/catch)
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(executeSpy).toHaveBeenCalledWith(
      wf,
      expect.objectContaining({
        body: { message: 'Hello trigger' },
        query: expect.objectContaining({
          token: 'token123',
          custom_param: 'value',
        }),
        zaloId: 'zalo_boss',
      }),
      'trigger.webhook'
    );
  });
});
