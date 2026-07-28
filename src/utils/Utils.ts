import { ThreadType } from "zca-js";
import path from "path";

export const IMAGE_EXTENSION = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

export const convertThreadType = (type?: ThreadType | number): ThreadType => {
    return type && type == 1 ? ThreadType.Group : ThreadType.User;
};

export const isImageFile = (filePath: string): boolean => {
    const ext = path.extname(filePath).toLowerCase();
    return IMAGE_EXTENSION.includes(ext);
};

/**
 * Chuẩn hóa timestamp thành miligiây (ms)
 * Nếu Zalo/FB trả về timestamp theo giây (10 chữ số < 10,000,000,000) ➔ nhân 1000 sang ms
 */
export const normalizeTimestamp = (rawTs: any): number => {
  if (!rawTs) return Date.now();
  let ts = typeof rawTs === 'string' ? parseInt(rawTs, 10) : Number(rawTs);
  if (isNaN(ts) || ts <= 0) return Date.now();
  if (ts < 10000000000) {
    ts = ts * 1000;
  }
  return ts;
};

/**
 * Bóc tách toàn bộ các trường CDN URL hình ảnh từ Zalo API / WebZalo / AppZalo
 */
export const extractMediaRemoteUrl = (msgContent: any, attachmentsJson?: any): string => {
  let url = '';
  try {
    const parsed = typeof msgContent === 'string' ? JSON.parse(msgContent || '{}') : (msgContent || {});
    if (parsed && typeof parsed === 'object') {
      let p: any = parsed.params;
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
      url = p?.hdUrl || p?.normalUrl || p?.rawUrl || p?.hd || p?.url
         || parsed.hdUrl || parsed.normalUrl || parsed.thumbUrl || parsed.url || parsed.href || parsed.thumb || parsed.hd || '';
    }
  } catch {}
  if (!url && attachmentsJson) {
    try {
      const atts = typeof attachmentsJson === 'string' ? JSON.parse(attachmentsJson || '[]') : (attachmentsJson || []);
      url = atts[0]?.url || atts[0]?.href || atts[0]?.thumb || atts[0]?.hdUrl || atts[0]?.normalUrl || atts[0]?.rawUrl || '';
    } catch {}
  }
  return url;
};