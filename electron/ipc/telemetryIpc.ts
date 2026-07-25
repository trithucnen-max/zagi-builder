import { ipcMain } from 'electron';
import TelemetryService from '../../src/services/telemetry/TelemetryService';
import DatabaseService from '../../src/services/database/DatabaseService';

export function registerTelemetryIpc(): void {
  ipcMain.handle('telemetry:getConfig', async () => {
    return TelemetryService.getConfig();
  });

  ipcMain.handle('telemetry:saveConfig', async (_event, config: any) => {
    TelemetryService.saveConfig(config);
    return { success: true };
  });

  ipcMain.handle('telemetry:getDeviceInfo', async () => {
    const db = DatabaseService.getInstance();
    const accounts = db.getAccounts() || [];
    return TelemetryService.getDeviceInfo(accounts.map((a: any) => ({ zaloId: a.zalo_id, displayName: a.name })));
  });

  ipcMain.handle('telemetry:sendPing', async () => {
    const db = DatabaseService.getInstance();
    const accounts = db.getAccounts() || [];
    return await TelemetryService.sendPing(accounts.map((a: any) => ({ zaloId: a.zalo_id, displayName: a.name })));
  });

  ipcMain.handle('telemetry:fetchAllDevices', async () => {
    return await TelemetryService.fetchAllDeviceTelemetry();
  });
}
