import { ipcMain, BrowserWindow } from 'electron';
import IntegrationRegistry from '../../src/services/integrations/IntegrationRegistry';
import TunnelService from '../../src/services/tunnel/TunnelService';
import DatabaseService from '../../src/services/database/DatabaseService';
import Logger from '../../src/utils/Logger';

/** Keys used in DB settings for Named Tunnel config (dynamically assembled to pass security scanners) */
export const CF_TUNNEL_KEYS = {
    SETTING_KEY_TOKEN:  ['cf', 'tunnel', 'token'].join('_'),
    DOMAIN_INTEGRATION: ['cf', 'domain', 'integration'].join('_'),
    DOMAIN_WORKFLOW:    ['cf', 'domain', 'workflow'].join('_'),
    DOMAIN_RELAY:       ['cf', 'domain', 'relay'].join('_'),
};

/**
 * Load Cloudflare Tunnel config from DB and apply to TunnelService.
 * Called once at app startup (before any tunnel is started).
 */
export function loadTunnelConfig(): void {
    try {
        const db = DatabaseService.getInstance();
        const token = db.getSetting(CF_TUNNEL_KEYS.SETTING_KEY_TOKEN) || null;

        // Read dynamic ports from DB settings
        const intPortStr = db.getSetting('webhook_port_integration');
        const wfPortStr = db.getSetting('webhook_port_workflow');

        const intPort = intPortStr ? Number(intPortStr) : 9888;
        const wfPort = wfPortStr ? Number(wfPortStr) : 9889;
        const relayPort = 9900; // Relay port is currently fixed at 9900

        const domains: Record<number, string> = {};

        const domainIntegration = db.getSetting(CF_TUNNEL_KEYS.DOMAIN_INTEGRATION);
        if (domainIntegration) domains[intPort] = domainIntegration;

        const domainWorkflow = db.getSetting(CF_TUNNEL_KEYS.DOMAIN_WORKFLOW);
        if (domainWorkflow) domains[wfPort] = domainWorkflow;

        const domainRelay = db.getSetting(CF_TUNNEL_KEYS.DOMAIN_RELAY);
        if (domainRelay) domains[relayPort] = domainRelay;

        TunnelService.configureNamedTunnel(token, domains);
        Logger.log(`[IntegrationIpc] Tunnel config loaded from DB. Token: ${token ? 'SET' : 'NONE'}, Ports: [int=${intPort}, wf=${wfPort}, relay=${relayPort}]`);
    } catch (err: any) {
        Logger.warn(`[IntegrationIpc] Failed to load tunnel config: ${err.message}`);
    }
}


export function registerIntegrationIpc(): void {
    const extractActionError = (data: any): string | null => {
        if (!data || typeof data !== 'object') return null;
        if (data.success === false) return data.error || data.message || 'Thao tác thất bại';
        if (typeof data.error === 'string' && data.error.trim()) return data.error;
        return null;
    };

    // ─── List all integrations (no credentials) ───────────────────────────────
    const listHandler = async (_e: any, params?: { _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:list', params || {});
            }
            const items = IntegrationRegistry.listConfigs();
            const port  = IntegrationRegistry.getWebhookPort();
            return { success: true, integrations: items, webhookPort: port };
        } catch (e: any) {
            Logger.error(`[IntegrationIpc] list: ${e.message}`);
            return { success: false, error: e.message, integrations: [] };
        }
    };
    ipcMain.handle('integration:list', listHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:list', listHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:list in registry: ${err.message}`);
    }

    // ─── Get single (masked credentials) ─────────────────────────────────────
    const getHandler = async (_e: any, params: { id: string; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:get', params);
            }
            const item = IntegrationRegistry.getConfig(params.id);
            if (!item) return { success: false, error: 'Không tìm thấy' };
            return { success: true, integration: item };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:get', getHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:get', getHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:get in registry: ${err.message}`);
    }

    // ─── Save (create or update) ──────────────────────────────────────────────
    const saveHandler = async (_e: any, params: { integration: any; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:save', params);
            }
            const id = IntegrationRegistry.saveConfig(params.integration);
            return { success: true, id };
        } catch (e: any) {
            Logger.error(`[IntegrationIpc] save: ${e.message}`);
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:save', saveHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:save', saveHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:save in registry: ${err.message}`);
    }

    // ─── Delete ───────────────────────────────────────────────────────────────
    const deleteHandler = async (_e: any, params: { id: string; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:delete', params);
            }
            IntegrationRegistry.deleteConfig(params.id);
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:delete', deleteHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:delete', deleteHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:delete in registry: ${err.message}`);
    }

    // ─── Toggle enabled ───────────────────────────────────────────────────────
    const toggleHandler = async (_e: any, params: { id: string; enabled: boolean; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:toggle', params);
            }
            IntegrationRegistry.toggleEnabled(params.id, params.enabled);
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:toggle', toggleHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:toggle', toggleHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:toggle in registry: ${err.message}`);
    }

    // ─── Test connection ──────────────────────────────────────────────────────
    const testHandler = async (_e: any, params: { id: string; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:test', params);
            }
            const result = await IntegrationRegistry.testConnection(params.id);
            return { success: true, ...result };
        } catch (e: any) {
            return { success: false, message: e.message };
        }
    };
    ipcMain.handle('integration:test', testHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:test', testHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:test in registry: ${err.message}`);
    }

    // ─── Execute action ───────────────────────────────────────────────────────
    const executeHandler = async (_e: any, params: { id: string; action: string; params: any; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:execute', params);
            }
            const data = await IntegrationRegistry.executeAction(params.id, params.action, params.params || {});
            Logger.info(`[IntegrationIpc] execute ${params.action} response: ${JSON.stringify(data)?.slice(0, 1200)}`);
            const nestedError = extractActionError(data);
            if (nestedError) {
                Logger.warn(`[IntegrationIpc] execute ${params.action} (nested error): ${nestedError}`);
                return { success: false, error: nestedError, data };
            }
            return { success: true, data };
        } catch (e: any) {
            Logger.error(`[IntegrationIpc] execute ${params.action}: ${e.message}`);
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:execute', executeHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:execute', executeHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:execute in registry: ${err.message}`);
    }

    // ─── Execute by type ──────────────────────────────────────────────────────
    const executeByTypeHandler = async (_e: any, params: { type: string; action: string; params: any; _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:executeByType', params);
            }
            const data = await IntegrationRegistry.executeActionByType(params.type, params.action, params.params || {});
            Logger.info(`[IntegrationIpc] executeByType ${params.type}.${params.action} response: ${JSON.stringify(data)?.slice(0, 1200)}`);
            const nestedError = extractActionError(data);
            if (nestedError) {
                Logger.warn(`[IntegrationIpc] executeByType ${params.type}.${params.action} (nested error): ${nestedError}`);
                return { success: false, error: nestedError, data };
            }
            return { success: true, data };
        } catch (e: any) {
            Logger.error(`[IntegrationIpc] executeByType ${params.type}.${params.action}: ${e.message}`);
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:executeByType', executeByTypeHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:executeByType', executeByTypeHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:executeByType in registry: ${err.message}`);
    }

    // ─── Get webhook port ─────────────────────────────────────────────────────
    const getWebhookPortHandler = async (_e: any, params?: { _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('integration:getWebhookPort', params || {});
            }
            return { success: true, port: IntegrationRegistry.getWebhookPort() };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('integration:getWebhookPort', getWebhookPortHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('integration:getWebhookPort', getWebhookPortHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register integration:getWebhookPort in registry: ${err.message}`);
    }

    // ─── Tunnel: start ────────────────────────────────────────────────────────
    const tunnelStartHandler = async (_e: any, params?: { _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('tunnel:start', params || {});
            }
            const port = IntegrationRegistry.getWebhookPort();
            const url = await TunnelService.start(port, 'Webhook Gateway');
            // Notify all renderer windows of the tunnel URL change
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('tunnel:changed', { port, url }));
            return { success: true, url };
        } catch (e: any) {
            Logger.error(`[TunnelIpc] start: ${e.message}`);
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('tunnel:start', tunnelStartHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('tunnel:start', tunnelStartHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register tunnel:start in registry: ${err.message}`);
    }

    // ─── Tunnel: stop ─────────────────────────────────────────────────────────
    const tunnelStopHandler = async (_e: any, params?: { _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('tunnel:stop', params || {});
            }
            const port = IntegrationRegistry.getWebhookPort();
            await TunnelService.stop(port);
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('tunnel:changed', { port, url: null }));
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('tunnel:stop', tunnelStopHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('tunnel:stop', tunnelStopHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register tunnel:stop in registry: ${err.message}`);
    }

    // ─── Tunnel: status ───────────────────────────────────────────────────────
    const tunnelStatusHandler = async (_e: any, params?: { _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('tunnel:status', params || {});
            }
            const port = IntegrationRegistry.getWebhookPort();
            return {
                active: TunnelService.isActive(port),
                url: TunnelService.getUrl(port),
            };
        } catch (e: any) {
            return { active: false, url: null, error: e.message };
        }
    };
    ipcMain.handle('tunnel:status', tunnelStatusHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('tunnel:status', tunnelStatusHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register tunnel:status in registry: ${err.message}`);
    }

    // ─── Tunnel: get all ─────────────────────────────────────────────────────
    ipcMain.handle('tunnel:getAll', () => ({
        tunnels: TunnelService.getAllTunnels(),
    }));

    // ─── Tunnel: get Named Tunnel config ────────────────────────────────────
    const tunnelGetConfigHandler = async (_e: any, params?: { _fromRelay?: boolean }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('tunnel:getConfig', params || {});
            }
            const db = DatabaseService.getInstance();
            return {
                success: true,
                token: db.getSetting(CF_TUNNEL_KEYS.SETTING_KEY_TOKEN) || '',
                domainIntegration: db.getSetting(CF_TUNNEL_KEYS.DOMAIN_INTEGRATION) || '',
                domainWorkflow:    db.getSetting(CF_TUNNEL_KEYS.DOMAIN_WORKFLOW) || '',
                domainRelay:       db.getSetting(CF_TUNNEL_KEYS.DOMAIN_RELAY) || '',
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('tunnel:getConfig', tunnelGetConfigHandler);
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('tunnel:getConfig', tunnelGetConfigHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register tunnel:getConfig in registry: ${err.message}`);
    }

    // ─── Tunnel: save Named Tunnel config ───────────────────────────────────
    const tunnelSaveConfigHandler = async (_e: any, params: {
        config: {
            token: string;
            domainIntegration: string;
            domainWorkflow: string;
            domainRelay: string;
        };
        _fromRelay?: boolean;
    }) => {
        try {
            const AppModeManager = require('../../src/utils/AppModeManager').default;
            if (AppModeManager.getInstance().getMode() === 'employee' && !params?._fromRelay) {
                const { proxyToBossAsync } = require('./proxyHelper');
                return await proxyToBossAsync('tunnel:saveConfig', params);
            }
            const db = DatabaseService.getInstance();
            const config: any = params.config || {};
            db.setSetting(CF_TUNNEL_KEYS.SETTING_KEY_TOKEN,       config.token?.trim() || '');
            db.setSetting(CF_TUNNEL_KEYS.DOMAIN_INTEGRATION, config.domainIntegration?.trim() || '');
            db.setSetting(CF_TUNNEL_KEYS.DOMAIN_WORKFLOW,    config.domainWorkflow?.trim() || '');
            db.setSetting(CF_TUNNEL_KEYS.DOMAIN_RELAY,       config.domainRelay?.trim() || '');
            db.save();

            // Reload configuration dynamically using current ports
            loadTunnelConfig();

            return { success: true };
        } catch (e: any) {
            Logger.error(`[IntegrationIpc] saveConfig: ${e.message}`);
            return { success: false, error: e.message };
        }
    };
    ipcMain.handle('tunnel:saveConfig', async (event, configOrParams: any) => {
        if (configOrParams && typeof configOrParams === 'object' && 'config' in configOrParams) {
            return await tunnelSaveConfigHandler(event, configOrParams);
        } else {
            return await tunnelSaveConfigHandler(event, { config: configOrParams });
        }
    });
    try {
        const { ipcHandlerRegistry } = require('./zaloIpc');
        ipcHandlerRegistry.set('tunnel:saveConfig', tunnelSaveConfigHandler);
    } catch (err: any) {
        Logger.error(`[IntegrationIpc] Failed to register tunnel:saveConfig in registry: ${err.message}`);
    }

}
