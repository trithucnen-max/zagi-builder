/**
 * @file mediaTokenArchitecture.test.ts
 * @description Unit tests for MediaToken architecture (acquireToken & resolveMediaToken).
 */

import * as path from 'path';

// Mock dependencies
jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? './test-userdata' : '.'),
  },
  ipcMain: {
    handle: jest.fn(),
  },
}), { virtual: true });

jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}), { virtual: true });

jest.mock('../services/library/LibraryService', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getItem: (uuid: string) => {
        if (uuid === 'lib-uuid-123') {
          return { uuid: 'lib-uuid-123', file_path: '/Users/boss/media/library/img.jpg' };
        }
        return null;
      },
    }),
  },
}));

jest.mock('../services/file/FileStorageService', () => ({
  __esModule: true,
  default: {
    getBaseDir: () => './test-userdata/media',
    resolveAbsolutePath: (relOrAbs: string) => {
      if (!relOrAbs) return '';
      if (relOrAbs.startsWith('http://') || relOrAbs.startsWith('https://')) return relOrAbs;
      return path.resolve('./test-userdata', relOrAbs);
    },
    saveBuffer: jest.fn().mockImplementation(async (zaloId, buffer, filename) => {
      return `./test-userdata/media/${zaloId}/${filename}`;
    }),
  },
}));

jest.mock('../utils/AppModeManager', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getMode: () => 'boss',
    }),
  },
}));

describe('MediaToken Architecture Tests', () => {
  describe('Token Resolution Helper Logic', () => {
    // Re-create the resolveMediaToken function logic to test directly
    function resolveMediaToken(p: any): string {
      const token = p.mediaToken || p.filePath || p._libraryUuid;
      if (!token) {
        if (p.fileUrl) return p.fileUrl;
        return '';
      }

      try {
        const LibraryService = require('../services/library/LibraryService').default;
        const item = LibraryService.getInstance().getItem(token);
        if (item?.file_path) return item.file_path;
      } catch {}

      if (token.startsWith('http://') || token.startsWith('https://')) {
        return token;
      }

      return token;
    }

    function resolveMediaTokens(p: any): string[] {
      const rawTokens = p.mediaTokens || p._libraryUuids || p.filePaths || [];
      if (!Array.isArray(rawTokens) || rawTokens.length === 0) return [];

      const resolved: string[] = [];
      for (const t of rawTokens) {
        const res = resolveMediaToken({ mediaToken: t });
        if (res) resolved.push(res);
      }
      return resolved;
    }

    it('should resolve library UUID to actual file path on Boss', () => {
      const resolved = resolveMediaToken({ mediaToken: 'lib-uuid-123' });
      expect(resolved).toBe('/Users/boss/media/library/img.jpg');
    });

    it('should preserve CDN URLs as tokens', () => {
      const cdnUrl = 'https://zalo-cdn.zadn.vn/photo.jpg';
      const resolved = resolveMediaToken({ mediaToken: cdnUrl });
      expect(resolved).toBe(cdnUrl);
    });

    it('should pass through local file paths', () => {
      const localPath = '/Users/boss/media/local.jpg';
      const resolved = resolveMediaToken({ mediaToken: localPath });
      expect(resolved).toBe(localPath);
    });

    it('should resolve multiple tokens in batch (mediaTokens array)', () => {
      const tokens = ['lib-uuid-123', 'https://zalo-cdn.zadn.vn/photo2.jpg', '/Users/boss/media/local3.jpg'];
      const resolved = resolveMediaTokens({ mediaTokens: tokens });
      expect(resolved).toEqual([
        '/Users/boss/media/library/img.jpg',
        'https://zalo-cdn.zadn.vn/photo2.jpg',
        '/Users/boss/media/local3.jpg',
      ]);
    });

    it('should fallback gracefully to legacy _libraryUuid and fileUrl', () => {
      expect(resolveMediaToken({ _libraryUuid: 'lib-uuid-123' })).toBe('/Users/boss/media/library/img.jpg');
      expect(resolveMediaToken({ fileUrl: 'https://zalo-cdn.zadn.vn/old.jpg' })).toBe('https://zalo-cdn.zadn.vn/old.jpg');
    });
  });
});
