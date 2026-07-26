/**
 * @file fileForward.test.ts
 * @description Unit tests for ZaloService File, Video, and Voice forwarding path resolution.
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
      if (typeof relOrAbs === 'string' && relOrAbs.startsWith('media/')) {
        return path.resolve('./test-userdata', relOrAbs);
      }
      return relOrAbs;
    }
  }
}));

import ZaloService from '../services/zalo/ZaloService';

describe('ZaloService File & Media Forwarding Safeguards', () => {
  let zaloService: ZaloService;
  const mockApi = {
    getOwnId: () => 'own_123',
    sendMessage: jest.fn().mockResolvedValue({ message: { success: true, msgId: 'file_123' }, attachment: [] }),
    uploadAttachment: jest.fn().mockResolvedValue([{ fileUrl: 'https://zalo.vn/file.mp4' }]),
    sendVideo: jest.fn().mockResolvedValue({ success: true, msgId: 'vid_123' })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    zaloService = new ZaloService({ cookies: 'c', imei: 'i', userAgent: 'u' });
    (zaloService as any).api = mockApi;
  });

  it('should resolve relative file paths for sendFile', async () => {
    const testDir = './test-userdata/media/zalo123';
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const localFile = path.resolve(testDir, 'contract.pdf');
    fs.writeFileSync(localFile, Buffer.from('fake-pdf-content'));

    try {
      const res = await zaloService.sendFile('media/zalo123/contract.pdf', '123456', 0 as any);
      expect(res).toBeDefined();
      expect(mockApi.sendMessage).toHaveBeenCalled();
    } finally {
      if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    }
  });

  it('should handle sendVideo relative paths safely', async () => {
    const testDir = './test-userdata/media/zalo123';
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const localVideo = path.resolve(testDir, 'demo.mp4');
    fs.writeFileSync(localVideo, Buffer.from('fake-mp4-content'));

    try {
      const res = await zaloService.sendVideo({ videoUrl: 'media/zalo123/demo.mp4', thumbnailUrl: '', msg: 'Video demo' }, '123456', 0 as any);
      expect(res).toEqual({ success: true, msgId: 'vid_123' });
    } finally {
      if (fs.existsSync(localVideo)) fs.unlinkSync(localVideo);
    }
  });
});
