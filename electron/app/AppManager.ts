import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Logger from '../../src/utils/Logger';
import { SHOW_DEV_TOOLS, IS_DEV_BUILD } from '../../src/configs/BuildConfig';
import FileStorageService from '../../src/services/file/FileStorageService';
import EventBroadcaster from '../../src/services/event/EventBroadcaster';
import HttpConnectionManager from '../../src/services/http/HttpConnectionManager';
import { ipcRouter } from '../ipc/router';

export class AppManager {
  private static instance: AppManager | null = null;
  
  public mainWindow: BrowserWindow | null = null;
  public inAppBrowserWindow: BrowserWindow | null = null;
  public tray: Tray | null = null;
  
  private cachedNormalIcon: Electron.NativeImage | null = null;
  private cachedDotIcon: Electron.NativeImage | null = null;
  private cachedOverlayDot: Electron.NativeImage | null = null;
  private currentIconIsDot = false;
  private dockBounceId: number | null = null;
  public isQuitting = false;

  private constructor() {}

  public static getInstance(): AppManager {
    if (!this.instance) {
      this.instance = new AppManager();
    }
    return this.instance;
  }

  public cancelDockBounce() {
    if (process.platform === 'darwin') {
      if (this.dockBounceId !== null && app.dock) {
        app.dock.cancelBounce(this.dockBounceId);
        this.dockBounceId = null;
      }
    } else {
      this.mainWindow?.flashFrame(false);
    }
  }

  public resolveIconPath(relativePath: string): string {
    const fromDir = path.join(__dirname, '../../../', relativePath);
    const unpackedPath = fromDir.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpackedPath)) return unpackedPath;
    return fromDir;
  }

  private loadIcon(baseName: string): Electron.NativeImage {
    const png128 = this.resolveIconPath(`resources/icons/${baseName}_128.png`);
    if (fs.existsSync(png128)) {
      const img = nativeImage.createFromPath(png128);
      if (!img.isEmpty()) return img;
    }
    const pngOrig = this.resolveIconPath(`resources/icons/${baseName}.png`);
    if (fs.existsSync(pngOrig)) {
      const raw = nativeImage.createFromPath(pngOrig);
      if (!raw.isEmpty()) return raw.resize({ width: 128, height: 128 });
    }
    return nativeImage.createEmpty();
  }

  public loadIcons() {
    this.cachedNormalIcon = this.loadIcon('icon');
    this.cachedDotIcon    = this.loadIcon('icon_dot');
    const overlayPath = this.resolveIconPath('resources/icons/overlay_dot.png');
    if (fs.existsSync(overlayPath)) {
      this.cachedOverlayDot = nativeImage.createFromPath(overlayPath);
      if (this.cachedOverlayDot.isEmpty()) this.cachedOverlayDot = null;
    }
  }

  public createWindow(): BrowserWindow {
    const isMac = process.platform === 'darwin';

    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      title: 'Zagi',
      frame: isMac,
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
      backgroundColor: '#1a1a2e',
      icon: this.cachedNormalIcon && !this.cachedNormalIcon.isEmpty()
        ? this.cachedNormalIcon
        : (process.platform === 'win32'
          ? this.resolveIconPath('resources/icons/icon.ico')
          : this.resolveIconPath('resources/icons/icon.png')),
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      show: false,
    });

    if (IS_DEV_BUILD) {
      this.mainWindow.loadURL('http://localhost:5173');
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../../../dist/index.html'));
    }

    if (SHOW_DEV_TOOLS) {
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.webContents.on('before-input-event', (_event, input) => {
        if (input.type !== 'keyDown') return;
        const blocked =
          input.key === 'F12' ||
          (input.control && input.shift && ['I', 'J', 'C', 'K'].includes(input.key.toUpperCase()));
        if (blocked) _event.preventDefault();
      });
      this.mainWindow.webContents.on('devtools-opened', () => {
        this.mainWindow?.webContents.closeDevTools();
      });
      this.mainWindow.webContents.on('context-menu', (e) => e.preventDefault());
    }

    this.mainWindow.once('ready-to-show', () => {
      if (this.cachedNormalIcon && !this.cachedNormalIcon.isEmpty()) {
        this.mainWindow?.setIcon(this.cachedNormalIcon);
      }
      this.mainWindow?.show();
    });

    let crashCount = 0;
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      Logger.error(`[main] Renderer process gone: ${details.reason} (exitCode=${details.exitCode})`);
      crashCount++;
      if (crashCount <= 2 && this.mainWindow && !this.mainWindow.isDestroyed()) {
        Logger.log(`[main] Attempting renderer reload (attempt ${crashCount})...`);
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (IS_DEV_BUILD) {
              this.mainWindow.loadURL('http://localhost:5173');
            } else {
              this.mainWindow.loadFile(path.join(__dirname, '../../../dist/index.html'));
            }
          }
        }, 1500);
      } else {
        Logger.error(`[main] Renderer crashed ${crashCount} times — quitting app`);
        this.isQuitting = true;
        app.quit();
      }
    });

    this.mainWindow.on('unresponsive', () => {
      Logger.warn('[main] Window unresponsive — reloading renderer');
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.reload();
      }
    });

    this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      Logger.error(`[main] did-fail-load: ${errorCode} ${errorDescription} — ${validatedURL}`);
      if (IS_DEV_BUILD) {
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.loadURL('http://localhost:5713');
          }
        }, 2000);
      }
    });

    if (!IS_DEV_BUILD) {
      this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: local-media: blob: https:; media-src 'self' local-media: blob: https:; connect-src 'self' https: wss:; font-src 'self' data: https:; frame-src 'self' https:;",
            ],
          },
        });
      });
    }

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    this.mainWindow.on('closed', () => { this.mainWindow = null; });

    this.mainWindow.on('focus', () => {
      this.cancelDockBounce();
      this.mainWindow?.webContents.send('app:windowFocus', true);
    });
    this.mainWindow.on('blur', () => this.mainWindow?.webContents.send('app:windowFocus', false));
    this.mainWindow.on('minimize', () => this.mainWindow?.webContents.send('app:windowFocus', false));
    this.mainWindow.on('restore', () => {
      this.cancelDockBounce();
      this.mainWindow?.webContents.send('app:windowFocus', true);
    });
    this.mainWindow.on('hide', () => this.mainWindow?.webContents.send('app:windowFocus', false));
    this.mainWindow.on('show', () => {
      this.cancelDockBounce();
      this.mainWindow?.webContents.send('app:windowFocus', true);
      if (process.platform === 'win32' && this.currentIconIsDot && this.cachedOverlayDot && !this.cachedOverlayDot.isEmpty()) {
        this.mainWindow?.setOverlayIcon(this.cachedOverlayDot, 'Tin chưa đọc');
      }
    });

    EventBroadcaster.setWindow(this.mainWindow);
    HttpConnectionManager.getInstance().setMainWindow(this.mainWindow);

    return this.mainWindow;
  }

  public createTray() {
    let icon = this.cachedNormalIcon && !this.cachedNormalIcon.isEmpty()
      ? this.cachedNormalIcon
      : nativeImage.createFromPath(this.resolveIconPath(
          process.platform === 'win32' ? 'resources/icons/icon.ico' : 'resources/icons/icon.png'
        ));

    if (process.platform === 'darwin' && !icon.isEmpty()) {
      icon = icon.resize({ width: 18, height: 18 });
    }

    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mở Zagi',
        click: () => { this.mainWindow?.show(); this.mainWindow?.focus(); },
      },
      { type: 'separator' },
      {
        label: 'Thoát hoàn toàn',
        click: () => {
          this.isQuitting = true;
          app.quit();
          setTimeout(() => process.exit(0), 3000).unref();
        },
      },
    ]);

    this.tray.setToolTip('Zagi');
    this.tray.setContextMenu(contextMenu);

    this.tray.on('double-click', () => { this.mainWindow?.show(); this.mainWindow?.focus(); });
    this.tray.on('click', () => {
      if (this.mainWindow?.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow?.show();
        this.mainWindow?.focus();
      }
    });
  }

  public registerWindowControls() {
    ipcRouter.registerOn('window:minimize', null, () => this.mainWindow?.minimize());
    ipcRouter.registerOn('window:maximize', null, () => {
      if (this.mainWindow?.isMaximized()) this.mainWindow.unmaximize();
      else this.mainWindow?.maximize();
    });
    ipcRouter.registerOn('window:close', null, () => {
      this.mainWindow?.hide();
    });
    ipcRouter.registerOn('window:quit', null, () => {
      this.isQuitting = true;
      app.quit();
      setTimeout(() => process.exit(0), 3000).unref();
    });
    ipcRouter.register('window:isMaximized', null, async () => this.mainWindow?.isMaximized() ?? false);

    ipcRouter.registerOn('shell:openExternal', null, (_event, url: string) => {
      shell.openExternal(url);
    });

    ipcRouter.register('shell:openPath', null, async (_event, filePath: string) => {
      try {
        const resolved = FileStorageService.resolveAbsolutePath(filePath);
        if (!resolved || !fs.existsSync(resolved)) {
          return { success: false, error: 'Không tìm thấy tệp đính kèm' };
        }
        const error = await shell.openPath(resolved);
        return error ? { success: false, error } : { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message || 'Không thể mở tệp' };
      }
    });

    ipcRouter.register('shell:openInApp', null, async (_event, url: string) => {
      try {
        if (!/^https?:\/\//i.test(url)) {
          return { success: false, error: 'Chỉ hỗ trợ liên kết web http/https' };
        }

        if (!this.inAppBrowserWindow || this.inAppBrowserWindow.isDestroyed()) {
          this.inAppBrowserWindow = new BrowserWindow({
            width: 1180,
            height: 820,
            minWidth: 860,
            minHeight: 620,
            title: 'Trình duyệt nội bộ',
            autoHideMenuBar: true,
            parent: this.mainWindow ?? undefined,
            backgroundColor: '#111827',
            webPreferences: {
              contextIsolation: true,
              sandbox: true,
            },
          });
          this.inAppBrowserWindow.on('closed', () => {
            this.inAppBrowserWindow = null;
          });
        }

        await this.inAppBrowserWindow.loadURL(url);
        if (this.inAppBrowserWindow.isMinimized()) this.inAppBrowserWindow.restore();
        this.inAppBrowserWindow.show();
        this.inAppBrowserWindow.focus();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message || 'Không thể mở liên kết trong app' };
      }
    });

    ipcRouter.registerOn('app:setBadge', null, (_event, count: number) => {
      if (!this.mainWindow) return;
      if (process.platform === 'darwin') {
        app.setBadgeCount(count > 0 ? count : 0);
      } else if (process.platform === 'win32') {
        if (count > 0) {
          if (!this.currentIconIsDot) {
            this.currentIconIsDot = true;
            if (this.cachedOverlayDot && !this.cachedOverlayDot.isEmpty()) {
              this.mainWindow.setOverlayIcon(this.cachedOverlayDot, `${count} tin chưa đọc`);
            }
            if (this.cachedDotIcon && !this.cachedDotIcon.isEmpty()) {
              this.tray?.setImage(this.cachedDotIcon);
            }
          }
          this.tray?.setToolTip(`Zagi — ${count} tin chưa đọc`);
        } else {
          if (this.currentIconIsDot) {
            this.currentIconIsDot = false;
            this.mainWindow.setOverlayIcon(null, '');
            if (this.cachedNormalIcon && !this.cachedNormalIcon.isEmpty()) {
              this.tray?.setImage(this.cachedNormalIcon);
            }
          }
          this.tray?.setToolTip('Zagi');
        }
      } else {
        try { app.setBadgeCount(count > 0 ? count : 0); } catch {}
      }
    });

    ipcRouter.registerOn('app:flashFrame', null, (_event, { active }: { active: boolean }) => {
      if (!this.mainWindow) return;
      if (process.platform === 'darwin') {
        if (active && app.dock) {
          this.dockBounceId = app.dock.bounce('informational');
        } else if (!active) {
          this.cancelDockBounce();
        }
      } else {
        this.mainWindow.flashFrame(active);
      }
    });

    ipcRouter.registerOn('app:openThread', null, (_event, { zaloId, threadId, threadType }: { zaloId: string; threadId: string; threadType: number }) => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        if (!this.mainWindow.isVisible()) this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.webContents.send('app:openThread', { zaloId, threadId, threadType });
      }
    });
  }
}
