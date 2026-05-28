import { PluginManager, PluginManifest } from '../services/plugins/PluginManager';

// Mock Logger to prevent console clutter during tests
jest.mock('../utils/Logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = PluginManager.getInstance();
    // Clear private plugins map before each test to maintain isolation
    const pluginsMap = (manager as any).plugins as Map<string, any>;
    pluginsMap.clear();
  });

  const mockManifest: PluginManifest = {
    id: 'com.test.my-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    contributes: {
      workflowNodes: [
        {
          type: 'com.test.my-plugin.node1',
          label: 'Test Node 1',
          execute: jest.fn().mockResolvedValue({ success: true, output: { data: 'ok' } }),
        },
      ],
      integrations: [
        {
          type: 'com.test.my-plugin.integration1',
          label: 'Test Integration 1',
        },
      ],
    },
  };

  test('should register a valid plugin successfully', () => {
    manager.register(mockManifest);
    const plugins = manager.listPlugins();

    expect(plugins.length).toBe(1);
    expect(plugins[0].manifest.id).toBe('com.test.my-plugin');
    expect(plugins[0].enabled).toBe(true);
    expect(manager.hasNodeType('com.test.my-plugin.node1')).toBe(true);
  });

  test('should skip registering duplicate plugin IDs', () => {
    manager.register(mockManifest);
    manager.register(mockManifest); // register again

    expect(manager.listPlugins().length).toBe(1);
  });

  test('should reject node contributions without proper plugin ID prefix', () => {
    const invalidManifest: PluginManifest = {
      id: 'com.test.my-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      contributes: {
        workflowNodes: [
          {
            type: 'invalid-prefix.node',
            label: 'Invalid Node',
            execute: jest.fn(),
          },
        ],
      },
    };

    manager.register(invalidManifest);
    expect(manager.hasNodeType('invalid-prefix.node')).toBe(false);
  });

  test('should unregister plugins successfully', () => {
    manager.register(mockManifest);
    expect(manager.getPlugin('com.test.my-plugin')).toBeDefined();

    const result = manager.unregister('com.test.my-plugin');
    expect(result).toBe(true);
    expect(manager.getPlugin('com.test.my-plugin')).toBeUndefined();
    expect(manager.unregister('non-existent-plugin')).toBe(false);
  });

  test('should toggle enabled state of plugins', () => {
    manager.register(mockManifest);
    expect(manager.hasNodeType('com.test.my-plugin.node1')).toBe(true);

    manager.setEnabled('com.test.my-plugin', false);
    expect(manager.getPlugin('com.test.my-plugin')?.enabled).toBe(false);
    expect(manager.hasNodeType('com.test.my-plugin.node1')).toBe(false); // node should not run if disabled

    manager.setEnabled('com.test.my-plugin', true);
    expect(manager.hasNodeType('com.test.my-plugin.node1')).toBe(true);
  });

  test('should correctly execute node handler if active', async () => {
    manager.register(mockManifest);
    const executor = manager.getNodeExecutor('com.test.my-plugin.node1');
    expect(executor).not.toBeNull();

    if (executor) {
      const res = await executor({}, { trigger: {}, variables: {} });
      expect(res.success).toBe(true);
      expect(res.output?.data).toBe('ok');
    }
  });

  test('should return all node and integration contributions correctly', () => {
    manager.register(mockManifest);

    const nodes = manager.getAllNodeContributions();
    expect(nodes.length).toBe(1);
    expect(nodes[0].type).toBe('com.test.my-plugin.node1');

    const integrations = manager.getAllIntegrationContributions();
    expect(integrations.length).toBe(1);
    expect(integrations[0].type).toBe('com.test.my-plugin.integration1');
  });

  test('should output accurate summary metrics', () => {
    manager.register(mockManifest);
    let summary = manager.getSummary();
    expect(summary.total).toBe(1);
    expect(summary.enabled).toBe(1);
    expect(summary.totalNodes).toBe(1);

    manager.setEnabled('com.test.my-plugin', false);
    summary = manager.getSummary();
    expect(summary.total).toBe(1);
    expect(summary.enabled).toBe(0);
    expect(summary.totalNodes).toBe(0);
  });
});
