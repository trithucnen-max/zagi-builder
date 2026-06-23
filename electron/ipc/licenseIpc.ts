import { ipcMain, app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import licenseManager from '../../src/services/license/LicenseManager';
import { LicenseManager } from '../../src/services/license/LicenseManager';

// ─── License Gate Window ───────────────────────────────────────────────────────
let licenseWindow: BrowserWindow | null = null;

function resolveResourcePath(relativePath: string): string {
  try {
    const appPath = app.getAppPath();
    const searchPaths = [
      path.join(appPath, relativePath),
      path.join(appPath, '../', relativePath),
      path.join(appPath, '../../', relativePath),
      path.join(appPath, '../../../', relativePath),
      path.join(__dirname, relativePath),
      path.join(__dirname, '../', relativePath),
      path.join(__dirname, '../../', relativePath),
      path.join(__dirname, '../../../', relativePath),
      path.join(__dirname, '../../../../', relativePath),
    ];

    for (const p of searchPaths) {
      const unpacked = p.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) return unpacked;
      if (fs.existsSync(p)) return p;
    }
  } catch (err: any) {
    console.error('[resolveResourcePath] Error during path search:', err.message);
  }
  return path.join(__dirname, '../../', relativePath);
}

export function createLicenseWindow(startAppCallback: () => Promise<void>): void {
  const isMac = process.platform === 'darwin';

  licenseWindow = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: false,
    maximizable: false,
    title: 'Zagi — Kích hoạt bản quyền',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    backgroundColor: '#1e293b',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const popupPath = resolveResourcePath('resources/license/popup.html');
  licenseWindow.loadFile(popupPath);
  licenseWindow.setMenu(null);

  licenseWindow.on('closed', () => {
    licenseWindow = null;
    // Nếu main window chưa được tạo và app không đang thoát → quit hoàn toàn
    const { app: electronApp } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) {
      electronApp.quit();
      process.exit(0);
    }
  });
}

// ─── Load runtime config từ zagi-config.json ──────────────────────────────────
export function loadLicenseConfig(): void {
  try {
    const configPath = path.join(app.getPath('userData'), 'zagi-config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.licenseApiUrl || config.licenseApiSecret) {
      LicenseManager.setRuntimeConfig({
        apiUrl: config.licenseApiUrl,
        apiSecret: config.licenseApiSecret,
      });
      console.log('[LicenseIpc] License config loaded from zagi-config.json');
    }
  } catch (e: any) {
    console.error('[LicenseIpc] License config load failed:', e.message);
  }
}

// ─── Đăng ký tất cả IPC handlers cho License ──────────────────────────────────
export function registerLicenseIpc(startAppCallback?: () => Promise<void>): void {
  const channels = [
    'license:verify',
    'license:register',
    'license:activateAfterRegister',
    'license:get',
    'license:getPlans',
    'license:logout',
    'license:isInGracePeriod',
    'license:isExpiringSoon',
    'license:recheck'
  ];
  channels.forEach(ch => ipcMain.removeHandler(ch));

  // Xác thực license (từ license popup hoặc Settings → Bản quyền)
  ipcMain.handle('license:verify', async (_event, { email, licenseKey }: { email: string; licenseKey: string | null }) => {
    const result = await licenseManager.verifyEmail(email, licenseKey);
    if (result.success && startAppCallback) {
      // Đóng license window và mở main app
      setTimeout(async () => {
        try {
          await startAppCallback();
          if (licenseWindow && !licenseWindow.isDestroyed()) {
            licenseWindow.close();
            licenseWindow = null;
          }
        } catch (err: any) {
          console.error('[LicenseIpc] startApp error after verify:', err.message);
        }
      }, 1500);
    }
    return result;
  });

  // Đăng ký license mới (trial hoặc mua)
  ipcMain.handle('license:register', async (_event, data: any) => {
    return await licenseManager.register(data);
  });

  // Kích hoạt sau khi đăng ký + thanh toán thành công
  ipcMain.handle('license:activateAfterRegister', async (_event, { email, licenseKey }: { email: string; licenseKey: string }) => {
    const result = await licenseManager.verifyEmail(email, licenseKey);
    if (result.success && startAppCallback) {
      setTimeout(async () => {
        try {
          await startAppCallback();
          if (licenseWindow && !licenseWindow.isDestroyed()) {
            licenseWindow.close();
            licenseWindow = null;
          }
        } catch (err: any) {
          console.error('[LicenseIpc] startApp error after activate:', err.message);
        }
      }, 1500);
    }
    return result;
  });

  // Lấy thông tin license hiện tại (dùng trong Settings → tab Bản quyền)
  ipcMain.handle('license:get', async () => {
    const license = licenseManager.getCurrentLicense();
    if (!license) return null;
    return { ...license, displayMessage: licenseManager.getDisplayMessage(license) };
  });

  // Lấy danh sách gói và config ngân hàng từ GAS
  ipcMain.handle('license:getPlans', async () => {
    return await licenseManager.getPlans();
  });

  // Đăng xuất bản quyền → xóa license.dat + database + cache + restart app
  // Đăng xuất bản quyền → xóa license.dat + database + cache + restart app (nếu clearData = true)
  ipcMain.handle('license:logout', async (_event, options?: { clearData?: boolean }) => {
    const clearData = options?.clearData ?? false;
    
    try {
      // Xóa license key file
      licenseManager.clearLicense();
    } catch (licenseErr: any) {
      console.error('[LicenseIpc] Failed to clear license key file:', licenseErr.message);
    }

    if (clearData) {
      try {
        // 1. Đóng kết nối database trước khi xóa file
        const DatabaseService = require('../../src/services/database/DatabaseService').default;
        DatabaseService.getInstance().close();
      } catch (dbErr: any) {
        console.error('[LicenseIpc] Failed to close database on logout:', dbErr.message);
      }

      const userData = app.getPath('userData');

      // Hàm xóa thư mục đệ quy an toàn (bỏ qua file bị khóa)
      const deleteFolderRecursive = (dirPath: string, deleteSelf = true) => {
        if (fs.existsSync(dirPath)) {
          try {
            fs.readdirSync(dirPath).forEach((file) => {
              const curPath = path.join(dirPath, file);
              if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath, true);
              } else {
                try {
                  fs.unlinkSync(curPath);
                } catch (_) {}
              }
            });
            if (deleteSelf) {
              fs.rmdirSync(dirPath);
            }
          } catch (_) {}
        }
      };

      try {
        // Xóa các file cấu hình và database chính
        const filesToDelete = [
          'workspaces.json',
          'zagi-config.json',
          'zagi-tool.db',
          'zagi-tool.db-wal',
          'zagi-tool.db-shm'
        ];

        filesToDelete.forEach((fileName) => {
          const filePath = path.join(userData, fileName);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (_) {}
          }
        });

        // Xóa các thư mục workspace phụ (workspace-ws*)
        fs.readdirSync(userData).forEach((file) => {
          if (file.startsWith('workspace-')) {
            const workspacePath = path.join(userData, file);
            deleteFolderRecursive(workspacePath, true);
          }
        });

        // Xóa cache và session tài khoản của Facebook/Zalo
        const cacheFolders = ['Local Storage', 'Session Storage', 'Network', 'Cache', 'Code Cache'];
        cacheFolders.forEach((folder) => {
          const folderPath = path.join(userData, folder);
          deleteFolderRecursive(folderPath, false); // Xóa nội dung bên trong, giữ lại thư mục cha
        });

        console.log('[LicenseIpc] All local databases, configurations, and cache files cleared on logout.');
      } catch (cleanErr: any) {
        console.error('[LicenseIpc] Cleanup error during logout:', cleanErr.message);
      }
    } else {
      console.log('[LicenseIpc] Logged out license. Kept database and cache session.');
    }

    app.relaunch();
    app.exit(0);
  });

  // Kiểm tra đang trong grace period
  ipcMain.handle('license:isInGracePeriod', async () => {
    return licenseManager.isInGracePeriod();
  });

  // Kiểm tra sắp hết hạn (≤ 7 ngày)
  ipcMain.handle('license:isExpiringSoon', async () => {
    return licenseManager.isExpiringSoon();
  });

  // Re-verify online và trả về trạng thái mới nhất
  ipcMain.handle('license:recheck', async () => {
    const cached = licenseManager.getCurrentLicense();
    if (!cached) return { isInGracePeriod: false, status: 'none' };
    try {
      const result = await licenseManager.verifyEmail(cached.email, cached.licenseKey);
      if (result.success) {
        return {
          isInGracePeriod: licenseManager.isInGracePeriod(),
          status: licenseManager.getCurrentLicense()?.status ?? 'unknown',
        };
      }
    } catch (_) {}
    return {
      isInGracePeriod: licenseManager.isInGracePeriod(),
      status: licenseManager.getCurrentLicense()?.status ?? 'unknown',
    };
  });

  console.log('[LicenseIpc] License IPC handlers registered');
}
