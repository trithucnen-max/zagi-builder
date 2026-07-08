import { ipcMain, BrowserWindow } from 'electron';
import IntegrationRegistry from '../../src/services/integrations/IntegrationRegistry';
import TunnelService from '../../src/services/tunnel/TunnelService';
import DatabaseService from '../../src/services/database/DatabaseService';
import Logger from '../../src/utils/Logger';

/** Keys used in DB settings for Named Tunnel config */
export const CF_TUNNEL_KEYS = {
    TOKEN:             'cf_tunnel_token',
    DOMAIN_INTEGRATION:'cf_domain_integration',
    DOMAIN_WORKFLOW:   'cf_domain_workflow',
    DOMAIN_RELAY:      'cf_domain_relay',
};

/**
 * Load Cloudflare Tunnel config from DB and apply to TunnelService.
 * Called once at app startup (before any tunnel is started).
 */
export function loadTunnelConfig(): void {
    try {
        const db = DatabaseService.getInstance();
        const token = db.getSetting(CF_TUNNEL_KEYS.TOKEN) || null;

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
    ipcMain.handle('integration:list', async () => {
        try {
            const items = IntegrationRegistry.listConfigs();
            const port  = IntegrationRegistry.getWebhookPort();
            return { success: true, integrations: items, webhookPort: port };
        } catch (e: any) {
            Logger.error(`[IntegrationIpc] list: ${e.message}`);
            return { success: false, error: e.message, integrations: [] };
        }
    });

    // ─── Get single (masked credentials) ─────────────────────────────────────
    ipcMain.handle('integration:get', async (_e, { id }: { id: string }) => {
        try {
            const item = IntegrationRegistry.getConfig(id);
            if (!item) return { success: false, error: 'Không tìm thấy' };
            return { success: true, integration: item };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

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
    ipcMain.handle('integration:getWebhookPort', async () => {
        return { success: true, port: IntegrationRegistry.getWebhookPort() };
    });

    // ─── Tunnel: start ────────────────────────────────────────────────────────
    ipcMain.handle('tunnel:start', async () => {
        try {
            const port = IntegrationRegistry.getWebhookPort();
            const url = await TunnelService.start(port, 'Webhook Gateway');
            // Notify all renderer windows of the tunnel URL change
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('tunnel:changed', { port, url }));
            return { success: true, url };
        } catch (e: any) {
            Logger.error(`[TunnelIpc] start: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    // ─── Tunnel: stop ─────────────────────────────────────────────────────────
    ipcMain.handle('tunnel:stop', async () => {
        try {
            const port = IntegrationRegistry.getWebhookPort();
            await TunnelService.stop(port);
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('tunnel:changed', { port, url: null }));
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // ─── Tunnel: status ───────────────────────────────────────────────────────
    ipcMain.handle('tunnel:status', () => {
        const port = IntegrationRegistry.getWebhookPort();
        return {
            active: TunnelService.isActive(port),
            url: TunnelService.getUrl(port),
        };
    });

    // ─── Tunnel: get all ─────────────────────────────────────────────────────
    ipcMain.handle('tunnel:getAll', () => ({
        tunnels: TunnelService.getAllTunnels(),
    }));

    // ─── Tunnel: get Named Tunnel config ────────────────────────────────────
    ipcMain.handle('tunnel:getConfig', () => {
        try {
            const db = DatabaseService.getInstance();
            return {
                success: true,
                token: db.getSetting(CF_TUNNEL_KEYS.TOKEN) || '',
                domainIntegration: db.getSetting(CF_TUNNEL_KEYS.DOMAIN_INTEGRATION) || '',
                domainWorkflow:    db.getSetting(CF_TUNNEL_KEYS.DOMAIN_WORKFLOW) || '',
                domainRelay:       db.getSetting(CF_TUNNEL_KEYS.DOMAIN_RELAY) || '',
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // ─── Tunnel: save Named Tunnel config ───────────────────────────────────
    ipcMain.handle('tunnel:saveConfig', (_e, config: {
        token: string;
        domainIntegration: string;
        domainWorkflow: string;
        domainRelay: string;
    }) => {
        try {
            const db = DatabaseService.getInstance();
            db.setSetting(CF_TUNNEL_KEYS.TOKEN,              config.token?.trim() || '');
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
    });

}
