import { app, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import DatabaseService from '../src/services/database/DatabaseService';
import WorkspaceManager from '../src/utils/WorkspaceManager';
import licenseManager, { LicenseManager } from '../src/services/license/LicenseManager';
import Logger from '../src/utils/Logger';
import { IS_DEV_BUILD } from '../src/configs/BuildConfig';
import { AppManager } from './app/AppManager';
import { LicenseGate } from './app/LicenseGate';
import { UpdateManager } from './app/UpdateManager';
import { StartupManager } from './app/StartupManager';

// ── IPC handlers ─────────────────────────────────────────────────────────────
import { registerLoginIpc } from './ipc/loginIpc';
import { registerZaloIpc } from './ipc/zaloIpc';
import { registerDatabaseIpc } from './ipc/databaseIpc';
import { registerFileIpc } from './ipc/fileIpc';
import { registerCRMIpc } from './ipc/crmIpc';
import { registerWorkflowIpc } from './ipc/workflowIpc';
import { registerIntegrationIpc } from './ipc/integrationIpc';
import { registerAIAssistantIpc } from './ipc/aiAssistantIpc';
import { registerUtilIpc } from './ipc/utilIpc';
import { registerEmployeeIpc } from './ipc/employeeIpc';
import { registerRelayIpc } from './ipc/relayIpc';
import { registerSyncIpc } from './ipc/syncIpc';
import { registerWorkspaceIpc } from './ipc/workspaceIpc';
import { registerFacebookIpc } from './ipc/facebookIpc';
import { registerErpTaskIpc } from './ipc/erpTaskIpc';
import { registerErpCalendarIpc } from './ipc/erpCalendarIpc';
import { registerErpNoteIpc } from './ipc/erpNoteIpc';
import { registerErpNotificationIpc } from './ipc/erpNotificationIpc';
import { registerErpHrmIpc } from './ipc/erpHrmIpc';
import { registerPluginIpc } from './ipc/pluginIpc';
import { registerMonitorIpc } from './ipc/monitorIpc';

// ── App bootstrap ─────────────────────────────────────────────────────────────
const isDev = IS_DEV_BUILD;
app.disableHardwareAcceleration();

if (process.platform === 'win32') {
  app.setAppUserModelId(isDev ? `com.zagi.dev.${Date.now()}` : 'com.zagi.app');
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// Register local-media:// scheme BEFORE app.ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'local-media',
  privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, stream: true },
}]);

// ── Config loaders ────────────────────────────────────────────────────────────

function loadEnvFile(): void {
  try {
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(app.getAppPath(), '.env'),
      path.join(app.getPath('userData'), 'zagi.env'),
    ];
    for (const envPath of candidates) {
      if (!fs.existsSync(envPath)) continue;
      fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      });
      Logger.log(`[main] Loaded .env from: ${envPath}`);
      break;
    }
  } catch (e: any) { Logger.error(`[main] .env load failed: ${e.message}`); }
}

function loadLicenseConfig(): void {
  try {
    const configPath = path.join(app.getPath('userData'), 'zagi-config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.licenseApiUrl || config.licenseApiSecret) {
      LicenseManager.setRuntimeConfig({ apiUrl: config.licenseApiUrl, apiSecret: config.licenseApiSecret });
      Logger.log('[main] License config loaded from zagi-config.json');
    }
  } catch (e: any) { Logger.error(`[main] License config load failed: ${e.message}`); }
}

// ── Data migration (Deplao → Zagi rename) ────────────────────────────────────

function migrateDataFromDeplaoToZagi(): void {
  const appData = app.getPath('appData');
  const deplaoDir = path.join(appData, 'Deplao');
  const zagiDir = path.join(appData, 'Zagi');

  if (fs.existsSync(deplaoDir) && !fs.existsSync(zagiDir)) {
    Logger.log(`[main] Migrating userData: ${deplaoDir} → ${zagiDir}`);
    try {
      const copyDir = (src: string, dest: string) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
          const s = path.join(src, child), d = path.join(dest, child);
          fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
        });
      };
      fs.mkdirSync(zagiDir, { recursive: true });
      copyDir(deplaoDir, zagiDir);
      Logger.log('[main] Data migration completed.');
    } catch (e: any) { Logger.error(`[main] Data migration failed: ${e.message}`); }
  }

  if (fs.existsSync(zagiDir)) {
    const renames: [string, string][] = [
      [path.join(zagiDir, 'deplao-config.json'), path.join(zagiDir, 'zagi-config.json')],
      [path.join(zagiDir, 'deplao-tool.db'), path.join(zagiDir, 'zagi-tool.db')],
    ];
    for (const [oldPath, newPath] of renames) {
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        try { fs.renameSync(oldPath, newPath); Logger.log(`[main] Renamed ${path.basename(oldPath)}`); }
        catch (e: any) { Logger.error(`[main] Rename failed: ${e.message}`); }
      }
    }
    const workspacesJson = path.join(zagiDir, 'workspaces.json');
    if (fs.existsSync(workspacesJson)) {
      try {
        let content = fs.readFileSync(workspacesJson, 'utf-8');
        if (content.includes('deplao-tool.db')) {
          fs.writeFileSync(workspacesJson, content.replace(/deplao-tool\.db/g, 'zagi-tool.db'), 'utf-8');
          Logger.log('[main] Updated workspaces.json DB names.');
        }
      } catch (e: any) { Logger.error(`[main] workspaces.json update failed: ${e.message}`); }
    }
  }
}

// ── Main startup sequence ─────────────────────────────────────────────────────

let appStarted = false;
async function startApp(): Promise<void> {
  if (appStarted) return;
  appStarted = true;

  const startup = StartupManager.getInstance();
  startup.setupCSP();
  migrateDataFromDeplaoToZagi();
  startup.setupLocalMediaProtocol();
  startup.setupAntiDebug();

  WorkspaceManager.getInstance().initialize();
  await DatabaseService.getInstance().initialize();

  // Create window + register IPC
  const appMgr = AppManager.getInstance();
  appMgr.loadIcons();
  const mainWindow = appMgr.createWindow();
  appMgr.createTray();
  appMgr.registerWindowControls();

  registerLoginIpc(mainWindow);
  registerZaloIpc();
  registerDatabaseIpc();
  registerFileIpc();
  registerCRMIpc();
  registerWorkflowIpc();
  registerIntegrationIpc();
  registerAIAssistantIpc();
  registerUtilIpc();
  registerEmployeeIpc();
  registerRelayIpc();
  registerSyncIpc();
  registerWorkspaceIpc(mainWindow);
  registerFacebookIpc();
  registerErpTaskIpc();
  registerErpCalendarIpc();
  registerErpNoteIpc();
  registerErpNotificationIpc();
  registerErpHrmIpc();
  registerPluginIpc();
  registerMonitorIpc();

  // Kick off all background services via StartupManager
  startup.startBackgroundServices();
  UpdateManager.getInstance().initialize();
}

// ── Electron app lifecycle ────────────────────────────────────────────────────

app.whenReady().then(async () => {
  loadEnvFile();
  loadLicenseConfig();
  const gate = LicenseGate.getInstance();
  gate.registerLicenseIpc(startApp);
  licenseManager.needsActivation() ? gate.createLicenseWindow(startApp) : await startApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    setTimeout(() => process.exit(0), 3000).unref();
  }
});

app.on('activate', () => {
  const appMgr = AppManager.getInstance();
  if (appMgr.mainWindow === null) appMgr.createWindow();
  else { appMgr.mainWindow.show(); appMgr.mainWindow.focus(); }
});

app.on('before-quit', () => {
  AppManager.getInstance().isQuitting = true;
  StartupManager.getInstance().shutdown();
});

process.on('uncaughtException', (error) => {
  Logger.error(`[main] Uncaught exception: ${error}`);
  try {
    const { AppMonitorService } = require('./app/StartupManager');
    const monitor = require('../src/services/monitor/AppMonitorService').default;
    monitor.getInstance().reportCrash(error, 'uncaughtException');
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  Logger.error(`[main] Unhandled rejection: ${reason}`);
  try {
    const monitor = require('../src/services/monitor/AppMonitorService').default;
    monitor.getInstance().reportCrash(String(reason), 'unhandledRejection');
  } catch {}
});
