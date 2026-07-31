import { ImportIssue } from './types';

export interface PhoneResult {
  normalized: string | null;
  raw: string;
  valid: boolean;
  issues: ImportIssue[];
  isLandline: boolean;
}

export function normalizePhone(rawInput: unknown): PhoneResult {
  const rawStr = rawInput === null || rawInput === undefined ? '' : String(rawInput).trim();
  const issues: ImportIssue[] = [];

  if (!rawStr) {
    issues.push({
      code: 'PHONE_MISSING',
      severity: 'error',
      message: 'Số điện thoại trống',
    });
    return { normalized: null, raw: rawStr, valid: false, issues, isLandline: false };
  }

  let str = rawStr;

  // 1. Handle scientific notation (e.g. 9.85999959e8 or 9.85999959e+08)
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = BigInt(Math.round(num)).toString();
      issues.push({
        code: 'EXCEL_SCIENTIFIC_NOTATION',
        severity: 'warning',
        message: 'Định dạng số khoa học từ Excel đã được chuyển đổi thành chuỗi',
        autofixed: true,
      });
    }
  }

  // 2. Handle Excel float string ending in .0 (e.g. "0985999959.0" or "985999959.0")
  if (/\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
    issues.push({
      code: 'EXCEL_FLOAT_FORMAT',
      severity: 'warning',
      message: 'Bỏ phần đuôi thập phân .0 từ Excel',
      autofixed: true,
    });
  }

  // Clean common non-digit separators
  let cleaned = str.replace(/[\s().-]/g, '');

  if (!cleaned) {
    issues.push({
      code: 'PHONE_MISSING',
      severity: 'error',
      message: 'Số điện thoại không hợp lệ',
    });
    return { normalized: null, raw: rawStr, valid: false, issues, isLandline: false };
  }

  // 3. Handle +84 / 84 prefix
  if (cleaned.startsWith('+84')) {
    const local = cleaned.slice(3).replace(/^0+/, '');
    cleaned = `0${local}`;
    issues.push({
      code: 'INTL_PREFIX_CONVERTED',
      severity: 'warning',
      message: 'Chuyển mã quốc gia +84 thành đầu số 0',
      autofixed: true,
    });
  } else if (cleaned.startsWith('84') && cleaned.length >= 10) {
    const local = cleaned.slice(2).replace(/^0+/, '');
    cleaned = `0${local}`;
    issues.push({
      code: 'INTL_PREFIX_CONVERTED',
      severity: 'warning',
      message: 'Chuyển đầu số 84 thành 0',
      autofixed: true,
    });
  }

  // 4. Handle Excel missing leading zero (9 digits starting with 3, 5, 7, 8, 9)
  if (/^[35789]\d{8}$/.test(cleaned)) {
    cleaned = `0${cleaned}`;
    issues.push({
      code: 'EXCEL_LOST_LEADING_ZERO',
      severity: 'warning',
      message: 'Bổ sung số 0 bị mất do Excel',
      autofixed: true,
    });
  }

  // Check legacy 11-digit prefix 01x
  if (/^01\d{9}$/.test(cleaned)) {
    issues.push({
      code: 'PHONE_LEGACY_PREFIX',
      severity: 'error',
      message: 'Đầu số 11 số cũ (01x) không còn hợp lệ, vui lòng chuyển đổi sang đầu số 10 số mới',
    });
    return { normalized: null, raw: rawStr, valid: false, issues, isLandline: false };
  }

  // Check mobile 10 digits
  if (/^0[35789]\d{8}$/.test(cleaned)) {
    return { normalized: cleaned, raw: rawStr, valid: true, issues, isLandline: false };
  }

  // Check landline (02x + 8 or 9 digits)
  if (/^02\d{8,9}$/.test(cleaned)) {
    issues.push({
      code: 'LANDLINE_NUMBER',
      severity: 'warning',
      message: 'Số điện thoại cố định (Zalo thường không hỗ trợ)',
    });
    return { normalized: cleaned, raw: rawStr, valid: true, issues, isLandline: true };
  }

  // Too short or invalid
  if (cleaned.length < 10) {
    issues.push({
      code: 'PHONE_TOO_SHORT',
      severity: 'error',
      message: 'Số điện thoại quá ngắn (dưới 10 chữ số)',
    });
  } else {
    issues.push({
      code: 'PHONE_MISSING',
      severity: 'error',
      message: 'Số điện thoại không đúng định dạng Việt Nam',
    });
  }

  return { normalized: null, raw: rawStr, valid: false, issues, isLandline: false };
}
