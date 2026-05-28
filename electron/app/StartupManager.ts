import { app, protocol, session, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Logger from '../../src/utils/Logger';
import { IS_DEV_BUILD } from '../../src/configs/BuildConfig';
import FileStorageService from '../../src/services/file/FileStorageService';

/**
 * StartupManager — tách biệt toàn bộ logic khởi động ứng dụng ra khỏi main.ts.
 * Quản lý: CSP, protocol handler, migrations, anti-debug, background services.
 */
export class StartupManager {
  private static instance: StartupManager | null = null;
  private readonly isDev = IS_DEV_BUILD;

  static getInstance(): StartupManager {
    if (!StartupManager.instance) StartupManager.instance = new StartupManager();
    return StartupManager.instance;
  }

  // ── CSP + Local-media protocol ──────────────────────────────────────────

  setupCSP(): void {
    const scriptCsp = this.isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            `default-src 'self' local-media:; script-src ${scriptCsp}; style-src 'self' 'unsafe-inline'; img-src 'self' data: local-media: https:; connect-src 'self' https: wss:;`,
          ],
        },
      });
    });
    Logger.log('[StartupManager] CSP configured.');
  }

  setupLocalMediaProtocol(): void {
    protocol.handle('local-media', (request) => {
      let filePath = decodeURIComponent(new URL(request.url).pathname);
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }
      const configFolder = path.dirname(FileStorageService.getBaseDir());

      if (!path.isAbsolute(filePath)) {
        filePath = path.join(configFolder, filePath);
      } else if (!fs.existsSync(filePath)) {
        const normalized = filePath.replace(/\\/g, '/');
        const mediaIdx = normalized.lastIndexOf('/media/');
        if (mediaIdx >= 0) {
          filePath = path.join(configFolder, normalized.slice(mediaIdx + 1));
        }
      }

      if (!fs.existsSync(filePath)) return new Response('Not Found', { status: 404 });
      const normalised = filePath.replace(/\\/g, '/');
      return net.fetch('file://' + (process.platform === 'win32' ? '/' : '') + normalised);
    });
    Logger.log('[StartupManager] local-media:// protocol registered.');
  }

  // ── Anti-debug guard ────────────────────────────────────────────────────

  setupAntiDebug(): void {
    if (this.isDev || process.env.PLAYWRIGHT_TEST) return;
    const inspector = require('inspector') as typeof import('inspector');
    if (inspector.url()) { app.quit(); process.exit(1); }
    setInterval(() => { if (inspector.url()) app.quit(); }, 30_000);
    Logger.log('[StartupManager] Anti-debug guard active.');
  }

  // ── Background services (sequential delayed startup) ───────────────────

  startBackgroundServices(): void {
    Logger.log('[StartupManager] Scheduling background service startup...');

    // 0s: Start monitor immediately (crash reporting should be active ASAP)
    this._startAppMonitor();

    // 2s: Workflow engine + DB path migration
    setTimeout(() => this._startWorkflowEngine(), 2_000);
    setTimeout(() => this._runDbPathMigration(), 2_000);

    // 2.5s: Integration registry
    setTimeout(() => this._startIntegrationRegistry(), 2_500);

    // 3s: CRM queue resume
    setTimeout(() => this._resumeCRMCampaigns(), 3_000);

    // 3.5s: ERP calendar schedulers
    setTimeout(() => this._startErpCalendar(), 3_500);

    // 3.7s: ERP notification schedulers
    setTimeout(() => this._startErpNotifications(), 3_700);

    // 4s: Facebook reconnect + HTTP relay auto-start
    setTimeout(() => this._reconnectFacebook(), 4_000);
    setTimeout(() => this._startHttpRelay(), 4_000);

    // 5s: HTTP workspace connections
    setTimeout(() => this._connectWorkspaces(), 5_000);

    // 6s: Database backup scheduler
    setTimeout(() => this._startDbBackup(), 6_000);

    Logger.log('[StartupManager] All background services scheduled.');
  }

  // ── Private service starters ────────────────────────────────────────────

  private _runDbPathMigration(): void {
    try {
      const DatabaseService = require('../../src/services/database/DatabaseService').default;
      const migrated = DatabaseService.getInstance().migrateAllAbsolutePathsToRelative();
      if (migrated > 0) {
        DatabaseService.getInstance().forceFlush();
        Logger.log(`[StartupManager] Path migration: converted ${migrated} message(s) to relative paths`);
      }
    } catch (e: any) { Logger.warn(`[StartupManager] Path migration failed: ${e.message}`); }
  }

  private _startAppMonitor(): void {
    try {
      const AppMonitorService = require('../../src/services/monitor/AppMonitorService').default;
      AppMonitorService.getInstance().initialize();
    } catch (e: any) { Logger.warn(`[StartupManager] AppMonitor init failed: ${e.message}`); }
  }

  private _startWorkflowEngine(): void {
    try {
      const WorkflowEngineService = require('../../src/services/workflow/WorkflowEngineService').default;
      WorkflowEngineService.getInstance().initialize();
      Logger.log('[StartupManager] WorkflowEngine initialized.');
    } catch (e: any) { Logger.error(`[StartupManager] WorkflowEngine init error: ${e.message}`); }
  }

  private _startIntegrationRegistry(): void {
    try {
      const IntegrationRegistry = require('../../src/services/integrations/IntegrationRegistry').default;
      const EventBroadcaster = require('../../src/services/event/EventBroadcaster').default;
      const WorkflowEngineService = require('../../src/services/workflow/WorkflowEngineService').default;
      IntegrationRegistry.initialize();
      EventBroadcaster.onBeforeSend('integration:payment', (data: any) => {
        WorkflowEngineService.getInstance()['triggerWorkflows']('trigger.payment', data);
      });
      Logger.log('[StartupManager] IntegrationRegistry initialized.');
    } catch (e: any) { Logger.error(`[StartupManager] IntegrationRegistry init error: ${e.message}`); }
  }

  private _resumeCRMCampaigns(): void {
    try {
      const CRMQueueService = require('../../src/services/crm/CRMQueueService').default;
      CRMQueueService.getInstance().resumeActiveCampaigns();
      Logger.log('[StartupManager] CRM active campaigns resumed.');
    } catch (e: any) { Logger.error(`[StartupManager] CRM resume error: ${e.message}`); }
  }

  private _startErpCalendar(): void {
    try {
      const ErpCalendarService = require('../../src/services/erp/ErpCalendarService').default;
      ErpCalendarService.getInstance().initSchedulers();
      Logger.log('[StartupManager] ERP calendar schedulers started.');
    } catch (e: any) { Logger.error(`[StartupManager] ERP calendar error: ${e.message}`); }
  }

  private _startErpNotifications(): void {
    try {
      const ErpNotificationService = require('../../src/services/erp/ErpNotificationService').default;
      ErpNotificationService.getInstance().startSchedulers();
      Logger.log('[StartupManager] ERP notification schedulers started.');
    } catch (e: any) { Logger.error(`[StartupManager] ERP notification error: ${e.message}`); }
  }

  private _reconnectFacebook(): void {
    try {
      const { reconnectAllFBAccounts } = require('../ipc/facebookIpc');
      reconnectAllFBAccounts();
      Logger.log('[StartupManager] Facebook reconnect triggered.');
    } catch (e: any) { Logger.error(`[StartupManager] Facebook reconnect error: ${e.message}`); }
  }

  private _startHttpRelay(): void {
    try {
      const WorkspaceManager = require('../../src/utils/WorkspaceManager').default;
      const wsMgr = WorkspaceManager.getInstance();
      const activeWs = wsMgr.getActiveWorkspace();
      if (activeWs?.type === 'local' && activeWs.relayAutoStart) {
        const port = activeWs.relayPort || 9900;
        const HttpRelayService = require('../../src/services/http/HttpRelayService').default;
        HttpRelayService.getInstance().start(port).then((res: any) => {
          if (res?.success) Logger.log(`[StartupManager] Relay server started on port ${res.port}`);
        }).catch((e: any) => Logger.error(`[StartupManager] Relay start failed: ${e.message}`));
      }
    } catch (e: any) { Logger.error(`[StartupManager] Relay auto-start error: ${e.message}`); }
  }

  private _connectWorkspaces(): void {
    try {
      const HttpConnectionManager = require('../../src/services/http/HttpConnectionManager').default;
      HttpConnectionManager.getInstance().connectAutoWorkspaces();
      Logger.log('[StartupManager] HTTP workspace connections initiated.');
    } catch (e: any) { Logger.error(`[StartupManager] Workspace connect error: ${e.message}`); }
  }

  private _startDbBackup(): void {
    try {
      const { DatabaseBackupService } = require('../../src/services/database/DatabaseBackupService');
      DatabaseBackupService.getInstance().startScheduler();
      Logger.log('[StartupManager] Database backup scheduler started.');
    } catch (e: any) { Logger.error(`[StartupManager] DB backup init error: ${e.message}`); }
  }

  // ── Graceful shutdown ───────────────────────────────────────────────────

  shutdown(): void {
    Logger.log('[StartupManager] Shutting down background services...');
    try {
      const CRMQueueService = require('../../src/services/crm/CRMQueueService').default;
      const crmTimers = CRMQueueService.getInstance() as any;
      if (crmTimers?.timers) {
        for (const [, timer] of crmTimers.timers) clearInterval(timer);
        crmTimers.timers.clear();
      }
    } catch {}

    try {
      const WorkflowEngineService = require('../../src/services/workflow/WorkflowEngineService').default;
      const wfe = WorkflowEngineService.getInstance() as any;
      if (wfe?.cronJobs) {
        for (const [, job] of wfe.cronJobs) { try { job.stop(); } catch {} }
        wfe.cronJobs.clear();
      }
    } catch {}

    try {
      const IntegrationRegistry = require('../../src/services/integrations/IntegrationRegistry').default;
      IntegrationRegistry.stopWebhookServer();
    } catch {}

    try {
      const DatabaseService = require('../../src/services/database/DatabaseService').default;
      DatabaseService.getInstance().forceFlush();
    } catch {}

    try {
      const HttpConnectionManager = require('../../src/services/http/HttpConnectionManager').default;
      HttpConnectionManager.getInstance().disconnectAll();
    } catch {}

    try {
      const { DatabaseBackupService } = require('../../src/services/database/DatabaseBackupService');
      DatabaseBackupService.getInstance().stopScheduler();
    } catch {}

    Logger.log('[StartupManager] Shutdown complete.');
  }
}
