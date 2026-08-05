/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: 'ts-jest', // Sử dụng preset của ts-jest
  testEnvironment: 'node', // Môi trường chạy test là Node.js
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }], // Biến đổi tệp TypeScript và TSX bằng ts-jest với isolatedModules để tránh OOM
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/ui/$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist-electron/'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'], // Đường dẫn đến các tệp test
};
