import Logger from '../../utils/Logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  /** Unique plugin ID, e.g. 'com.example.my-plugin' */
  id: string;
  /** Human-readable display name */
  name: string;
  /** SemVer version string */
  version: string;
  /** Author name or email */
  author?: string;
  /** Short description shown in the UI */
  description?: string;
  /** Min app version required */
  minAppVersion?: string;
  /** Workflow node types contributed by this plugin */
  contributes?: {
    workflowNodes?: WorkflowNodeContribution[];
    integrations?: IntegrationContribution[];
  };
}

export interface WorkflowNodeContribution {
  /** Node type identifier, must be prefixed with plugin ID, e.g. 'com.example.my-plugin.myNode' */
  type: string;
  /** Display label shown in workflow editor */
  label: string;
  /** Emoji or icon identifier */
  icon?: string;
  /** Node category in the picker */
  category?: string;
  /** Short description */
  description?: string;
  /**
   * Executor function: receives node config + context, returns result.
   * Called by WorkflowEngineService when the node is reached.
   */
  execute: (config: Record<string, any>, ctx: PluginNodeContext) => Promise<PluginNodeResult>;
}

export interface IntegrationContribution {
  /** Integration type identifier */
  type: string;
  label: string;
  icon?: string;
  description?: string;
}

export interface PluginNodeContext {
  /** Trigger data (e.g. incoming message) */
  trigger: Record<string, any>;
  /** Resolved variable values */
  variables: Record<string, any>;
  /** Account Zalo ID executing this workflow */
  accountId?: string;
}

export interface PluginNodeResult {
  success: boolean;
  output?: Record<string, any>;
  error?: string;
}

export interface RegisteredPlugin {
  manifest: PluginManifest;
  /** All contributed workflow node types, keyed by type string */
  nodeExecutors: Map<string, WorkflowNodeContribution['execute']>;
  enabled: boolean;
  loadedAt: number;
}

// ─── PluginManager ────────────────────────────────────────────────────────────

/**
 * PluginManager — Manages third-party plugin registration and lifecycle.
 *
 * Plugins can contribute:
 * - Custom workflow node types (with async execute handlers)
 * - Custom integration types
 *
 * Usage:
 *   PluginManager.getInstance().register(manifest, nodeHandlers);
 *   PluginManager.getInstance().getNodeExecutor('com.example.myNode');
 */
export class PluginManager {
  private static instance: PluginManager | null = null;
  private readonly plugins = new Map<string, RegisteredPlugin>();

  static getInstance(): PluginManager {
    if (!PluginManager.instance) PluginManager.instance = new PluginManager();
    return PluginManager.instance;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a plugin with its manifest and optional node handler overrides.
   * Node executors are automatically extracted from manifest.contributes.workflowNodes.
   */
  register(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      Logger.warn(`[PluginManager] Plugin '${manifest.id}' already registered — skipping.`);
      return;
    }

    const nodeExecutors = new Map<string, WorkflowNodeContribution['execute']>();

    for (const node of manifest.contributes?.workflowNodes ?? []) {
      if (!node.type.startsWith(manifest.id)) {
        Logger.warn(`[PluginManager] Node type '${node.type}' must be prefixed with plugin ID '${manifest.id}'. Skipping.`);
        continue;
      }
      nodeExecutors.set(node.type, node.execute);
    }

    this.plugins.set(manifest.id, {
      manifest,
      nodeExecutors,
      enabled: true,
      loadedAt: Date.now(),
    });

    Logger.log(`[PluginManager] Plugin registered: '${manifest.id}' v${manifest.version} (${nodeExecutors.size} nodes)`);
  }

  /** Unregister a plugin by ID */
  unregister(pluginId: string): boolean {
    if (!this.plugins.has(pluginId)) return false;
    this.plugins.delete(pluginId);
    Logger.log(`[PluginManager] Plugin unregistered: '${pluginId}'`);
    return true;
  }

  /** Enable or disable a plugin without unregistering it */
  setEnabled(pluginId: string, enabled: boolean): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    plugin.enabled = enabled;
    Logger.log(`[PluginManager] Plugin '${pluginId}' ${enabled ? 'enabled' : 'disabled'}`);
  }

  // ── Lookup ────────────────────────────────────────────────────────────────

  /** Get the execute function for a given workflow node type, or null if not found */
  getNodeExecutor(nodeType: string): WorkflowNodeContribution['execute'] | null {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      const executor = plugin.nodeExecutors.get(nodeType);
      if (executor) return executor;
    }
    return null;
  }

  /** Returns true if a given node type is provided by any active plugin */
  hasNodeType(nodeType: string): boolean {
    return this.getNodeExecutor(nodeType) !== null;
  }

  /** List all registered plugins */
  listPlugins(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  /** Get a specific plugin by ID */
  getPlugin(pluginId: string): RegisteredPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /** Get all contributed workflow node metadata (for UI display) */
  getAllNodeContributions(): WorkflowNodeContribution[] {
    const result: WorkflowNodeContribution[] = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      for (const node of plugin.manifest.contributes?.workflowNodes ?? []) {
        result.push(node);
      }
    }
    return result;
  }

  /** Get all contributed integration metadata */
  getAllIntegrationContributions(): IntegrationContribution[] {
    const result: IntegrationContribution[] = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      for (const integration of plugin.manifest.contributes?.integrations ?? []) {
        result.push(integration);
      }
    }
    return result;
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  getSummary(): { total: number; enabled: number; totalNodes: number } {
    let enabled = 0;
    let totalNodes = 0;
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) { enabled++; totalNodes += plugin.nodeExecutors.size; }
    }
    return { total: this.plugins.size, enabled, totalNodes };
  }
}

export default PluginManager;
