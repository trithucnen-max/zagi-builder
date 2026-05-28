/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: 'ts-jest', // Sử dụng preset của ts-jest
  testEnvironment: 'node', // Môi trường chạy test là Node.js
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      isolatedModules: true,
    }], // Biến đổi tệp TypeScript và TSX bằng ts-jest mà không cần check kiểu (tránh OOM)
  },
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'], // Đường dẫn đến các tệp test
  maxWorkers: 1, // Chạy tuần tự để tiết kiệm RAM
  collectCoverageFrom: [
    'src/utils/profileUtils.ts',
    'src/utils/Utils.ts',
    'src/utils/Logger.ts',
    'src/utils/ApiRetryHandler.ts',
    'src/utils/AppModeManager.ts',
    'src/services/license/LicenseManager.ts',
    'src/services/event/EventBroadcaster.ts',
    'src/ui/hooks/useAppInit.ts',
    'src/ui/components/layout/ChatRightPanel.tsx',
    'src/services/crm/CRMQueueService.ts',
    'src/services/workflow/WorkflowEngineService.ts',
    'src/services/database/DatabaseMigrations.ts',
    'src/electron/ipc/router.ts',
    'src/electron/ipc/ipcValidator.ts',
  ],
};

