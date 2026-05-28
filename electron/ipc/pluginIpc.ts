import { ipcMain } from 'electron';
import { PluginManager } from '../../src/services/plugins/PluginManager';
import Logger from '../../src/utils/Logger';

/**
 * Plugin IPC handler — exposes PluginManager state to the renderer process.
 * Allows the UI to display installed plugins and their contributed node types.
 */
export function registerPluginIpc(): void {
  const manager = PluginManager.getInstance();

  // List all registered plugins
  ipcMain.handle('plugin:list', () => {
    try {
      return manager.listPlugins().map(p => ({
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        author: p.manifest.author,
        description: p.manifest.description,
        enabled: p.enabled,
        nodeCount: p.nodeExecutors.size,
        loadedAt: p.loadedAt,
      }));
    } catch (e: any) {
      Logger.error(`[pluginIpc] plugin:list error: ${e.message}`);
      return [];
    }
  });

  // Get all contributed workflow node types (for editor node picker)
  ipcMain.handle('plugin:getNodeContributions', () => {
    try {
      return manager.getAllNodeContributions().map(n => ({
        type: n.type,
        label: n.label,
        icon: n.icon,
        category: n.category,
        description: n.description,
      }));
    } catch (e: any) {
      Logger.error(`[pluginIpc] plugin:getNodeContributions error: ${e.message}`);
      return [];
    }
  });

  // Enable / disable a plugin at runtime
  ipcMain.handle('plugin:setEnabled', (_e, pluginId: string, enabled: boolean) => {
    try {
      manager.setEnabled(pluginId, enabled);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // Summary stats
  ipcMain.handle('plugin:getSummary', () => {
    try {
      return manager.getSummary();
    } catch (e: any) {
      return { total: 0, enabled: 0, totalNodes: 0 };
    }
  });

  Logger.log('[pluginIpc] Plugin IPC handlers registered.');
}
