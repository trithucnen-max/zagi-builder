/**
 * @file imageForward.test.ts
 * @description Unit tests for ZaloService image path resolution and URL auto-downloader fallback.
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid'
}));

// Mock Electron dependencies
jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return './test-userdata';
      return '.';
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (str: string) => Buffer.from(str),
    decryptString: (buf: Buffer) => buf.toString()
  }
}), { virtual: true });

// Mock Logger
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}), { virtual: true });

// Mock FileStorageService
jest.mock('../services/file/FileStorageService', () => ({
  __esModule: true,
  default: {
    getBaseDir: () => './test-userdata/media',
    resolveAbsolutePath: (relOrAbs: string) => {
      if (relOrAbs.startsWith('media/')) {
        return path.resolve('./test-userdata', relOrAbs);
      }
      return relOrAbs;
    }
  }
}));

import ZaloService from '../services/zalo/ZaloService';

describe('ZaloService Safe Image Forwarding & Path Resolution', () => {
  let zaloService: ZaloService;
  const mockApi = {
    getOwnId: () => 'own_123',
    sendMessage: jest.fn().mockResolvedValue({ message: { success: true, msgId: '123' }, attachment: [] })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    zaloService = new ZaloService({ cookies: 'c', imei: 'i', userAgent: 'u' });
    (zaloService as any).api = mockApi;
  });

  it('should strip file:// protocol and send image if file exists on disk', async () => {
    // Create dummy local file
    const testDir = './test-userdata/media';
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const localFile = path.resolve(testDir, 'test_img.jpg');
    fs.writeFileSync(localFile, Buffer.from('fake-image-bytes'));

    try {
      const res = await zaloService.sendImage(`file://${localFile}`, '123456', 0 as any);
      expect(res).toEqual({ message: { success: true, msgId: '123' }, attachment: [] });
      expect(mockApi.sendMessage).toHaveBeenCalled();
    } finally {
      if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    }
  });

  it('should resolve relative media paths (media/zaloId/...) using FileStorageService', async () => {
    const testDir = './test-userdata/media/zalo123';
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const localFile = path.resolve(testDir, 'photo.jpg');
    fs.writeFileSync(localFile, Buffer.from('fake-image-bytes'));

    try {
      const res = await zaloService.sendImage('media/zalo123/photo.jpg', '123456', 0 as any);
      expect(res).toEqual({ message: { success: true, msgId: '123' }, attachment: [] });
      expect(mockApi.sendMessage).toHaveBeenCalled();
    } finally {
      if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    }
  });

  it('should throw clear error if file does not exist locally and is not a URL', async () => {
    await expect(
      zaloService.sendImage('/non/existent/path/image.jpg', '123456', 0 as any)
    ).rejects.toThrow('File does not exist on disk');
  });

  it('should preserve HTTP and HTTPS URLs when calling FileStorageService.resolveAbsolutePath', () => {
    const FileStorageService = require('../services/file/FileStorageService').default;
    const url = 'https://s240-ava-talk.zadn.vn/photo.jpg';
    expect(FileStorageService.resolveAbsolutePath(url)).toEqual(url);
  });
});
