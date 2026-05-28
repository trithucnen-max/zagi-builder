import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import licenseManager from '../../src/services/license/LicenseManager';
import { ipcRouter } from '../ipc/router';
import { AppManager } from './AppManager';

export class LicenseGate {
  private static instance: LicenseGate | null = null;
  public licenseWindow: BrowserWindow | null = null;

  private constructor() {}

  public static getInstance(): LicenseGate {
    if (!this.instance) {
      this.instance = new LicenseGate();
    }
    return this.instance;
  }

  public createLicenseWindow(startAppCallback: () => Promise<void>) {
    const isMac = process.platform === 'darwin';
    const appMgr = AppManager.getInstance();

    this.licenseWindow = new BrowserWindow({
      width: 520,
      height: 680,
      resizable: false,
      maximizable: false,
      title: 'License Manager',
      frame: isMac,
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
      backgroundColor: '#1e293b',
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      }
    });

    this.licenseWindow.loadFile(appMgr.resolveIconPath('resources/license/popup.html'));
    this.licenseWindow.setMenu(null);

    this.licenseWindow.on('closed', () => {
      this.licenseWindow = null;
      if (!appMgr.mainWindow && !appMgr.isQuitting) {
        app.quit();
        process.exit(0);
      }
    });
  }

  public registerLicenseIpc(startAppCallback: () => Promise<void>) {
    ipcRouter.register('license:verify', null, async (event, { email, licenseKey }: { email: string; licenseKey: string }) => {
      const result = await licenseManager.verifyEmail(email, licenseKey);
      if (result.success) {
        setTimeout(async () => {
          await startAppCallback();
          if (this.licenseWindow) {
            this.licenseWindow.close();
            this.licenseWindow = null;
          }
        }, 1500);
      }
      return result;
    });

    ipcRouter.register('license:register', null, async (event, data: any) => {
      return await licenseManager.register(data);
    });

    ipcRouter.register('license:activateAfterRegister', null, async (event, { email, licenseKey }: { email: string; licenseKey: string }) => {
      const result = await licenseManager.verifyEmail(email, licenseKey);
      if (result.success) {
        setTimeout(async () => {
          await startAppCallback();
          if (this.licenseWindow) {
            this.licenseWindow.close();
            this.licenseWindow = null;
          }
        }, 1500);
      }
      return result;
    });

    ipcRouter.register('license:get', null, async () => {
      const license = licenseManager.getCurrentLicense();
      if (!license) return null;
      return { ...license, displayMessage: licenseManager.getDisplayMessage(license) };
    });

    ipcRouter.registerOn('license:logout', null, () => {
      licenseManager.clearLicense();
      app.relaunch();
      app.exit(0);
    });
  }
}
export default LicenseGate;
