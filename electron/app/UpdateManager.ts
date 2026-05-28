import { autoUpdater } from 'electron-updater';
import { IS_DEV_BUILD } from '../../src/configs/BuildConfig';
import { AppManager } from './AppManager';
import { ipcRouter } from '../ipc/router';
import Logger from '../../src/utils/Logger';

export class UpdateManager {
  private static instance: UpdateManager | null = null;

  private constructor() {}

  public static getInstance(): UpdateManager {
    if (!this.instance) {
      this.instance = new UpdateManager();
    }
    return this.instance;
  }

  public initialize() {
    if (IS_DEV_BUILD) return;

    const appMgr = AppManager.getInstance();

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);

    autoUpdater.on('update-available', (info) => {
      appMgr.mainWindow?.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      appMgr.mainWindow?.webContents.send('update:progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      appMgr.mainWindow?.webContents.send('update:downloaded', {
        version: info.version,
      });
    });

    autoUpdater.on('update-not-available', () => {
      appMgr.mainWindow?.webContents.send('update:not-available');
    });

    autoUpdater.on('error', (err) => {
      Logger.error('[AutoUpdate] Error:', err.message);
      appMgr.mainWindow?.webContents.send('update:error', {
        message: err.message,
        platform: process.platform,
      });
    });

    ipcRouter.registerOn('update:download', null, () => {
      autoUpdater.downloadUpdate();
    });

    ipcRouter.registerOn('update:install', null, () => {
      autoUpdater.quitAndInstall(false, true);
    });
  }
}
export default UpdateManager;
