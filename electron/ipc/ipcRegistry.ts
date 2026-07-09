/**
 * Shared IPC handler registry.
 * Used by HttpRelayService to invoke IPC handlers directly on the Boss side
 * without going through Electron's internal ipcMain._invokeHandlers.
 *
 * All IPC modules (zaloIpc, crmIpc, etc.) should register their handlers here
 * so that the HTTP Relay can route proxy actions from Employee clients correctly.
 */
export const ipcHandlerRegistry = new Map<string, (event: any, params: any) => Promise<any>>();
