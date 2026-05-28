/**
 * Utils.test.ts — Unit tests cho các pure utility functions
 * isImageFile, convertThreadType, IMAGE_EXTENSION
 */

// Mock zca-js ThreadType enum
jest.mock('zca-js', () => ({
  ThreadType: {
    User: 0,
    Group: 1,
  },
}));

import { isImageFile, IMAGE_EXTENSION, convertThreadType } from '../utils/Utils';

describe('isImageFile', () => {
  describe('recognized image extensions', () => {
    it.each([
      ['photo.jpg', true],
      ['photo.jpeg', true],
      ['image.png', true],
      ['animation.gif', true],
      ['bitmap.bmp', true],
      ['modern.webp', true],
    ])('%s → %s', (filename, expected) => {
      expect(isImageFile(filename)).toBe(expected);
    });
  });

  describe('non-image extensions', () => {
    it.each([
      ['document.pdf', false],
      ['spreadsheet.xlsx', false],
      ['archive.zip', false],
      ['video.mp4', false],
      ['audio.mp3', false],
      ['code.ts', false],
      ['noextension', false],
    ])('%s → %s', (filename, expected) => {
      expect(isImageFile(filename)).toBe(expected);
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase extensions', () => {
      expect(isImageFile('PHOTO.JPG')).toBe(true);
      expect(isImageFile('IMAGE.PNG')).toBe(true);
    });

    it('should handle mixed case extensions', () => {
      expect(isImageFile('photo.Jpg')).toBe(true);
    });
  });

  describe('path with directories', () => {
    it('should work with full paths', () => {
      expect(isImageFile('/home/user/images/photo.jpg')).toBe(true);
      expect(isImageFile('/home/user/docs/file.pdf')).toBe(false);
    });

    it('should work with Windows-style paths', () => {
      expect(isImageFile('C:\\Users\\user\\photo.png')).toBe(true);
    });
  });
});

describe('IMAGE_EXTENSION', () => {
  it('should contain the expected extensions', () => {
    expect(IMAGE_EXTENSION).toContain('.jpg');
    expect(IMAGE_EXTENSION).toContain('.jpeg');
    expect(IMAGE_EXTENSION).toContain('.png');
    expect(IMAGE_EXTENSION).toContain('.gif');
    expect(IMAGE_EXTENSION).toContain('.bmp');
    expect(IMAGE_EXTENSION).toContain('.webp');
  });

  it('should have at least 5 extensions', () => {
    expect(IMAGE_EXTENSION.length).toBeGreaterThanOrEqual(5);
  });

  it('all entries should start with a dot', () => {
    IMAGE_EXTENSION.forEach(ext => {
      expect(ext.startsWith('.')).toBe(true);
    });
  });

  it('all entries should be lowercase', () => {
    IMAGE_EXTENSION.forEach(ext => {
      expect(ext).toBe(ext.toLowerCase());
    });
  });
});

describe('convertThreadType', () => {
  it('should return Group when type is 1', () => {
    const { ThreadType } = require('zca-js');
    expect(convertThreadType(1)).toBe(ThreadType.Group);
  });

  it('should return User when type is 0', () => {
    const { ThreadType } = require('zca-js');
    expect(convertThreadType(0)).toBe(ThreadType.User);
  });

  it('should return User when type is undefined', () => {
    const { ThreadType } = require('zca-js');
    expect(convertThreadType(undefined)).toBe(ThreadType.User);
  });

  it('should return User for any non-1 numeric value', () => {
    const { ThreadType } = require('zca-js');
    expect(convertThreadType(2)).toBe(ThreadType.User);
    expect(convertThreadType(99)).toBe(ThreadType.User);
  });
});
