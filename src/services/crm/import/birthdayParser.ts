import { ImportIssue, DateOrder } from './types';

export interface BirthdayResult {
  value: string | null;
  precision: 'full' | 'day_month' | 'year_only' | 'none';
  valid: boolean;
  issues: ImportIssue[];
}

/** Convert Excel serial date number (e.g. 32891) to Date object */
function excelSerialToDate(serial: number): Date | null {
  if (typeof serial !== 'number' || isNaN(serial) || serial <= 0) return null;
  // Excel epoch: 1900-01-01 (serial = 1). Excel incorrectly considers 1900 a leap year.
  // Standard formula for JS (which uses UTC 1970-01-01):
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  if (isNaN(date.getTime())) return null;
  return date;
}

export function parseBirthday(
  rawInput: unknown,
  dateOrder: DateOrder = 'DMY'
): BirthdayResult {
  const issues: ImportIssue[] = [];

  if (rawInput === null || rawInput === undefined) {
    return { value: null, precision: 'none', valid: true, issues };
  }

  // 1. Handle Excel serial date (number input)
  if (typeof rawInput === 'number') {
    const d = excelSerialToDate(rawInput);
    if (d) {
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      issues.push({
        code: 'EXCEL_SERIAL_DATE',
        severity: 'warning',
        message: 'Chuyển đổi từ định dạng ngày serial của Excel',
        autofixed: true,
      });
      const value = `${day}/${month}/${year}`;
      return validateBirthdayValue(value, 'full', issues);
    }
  }

  const rawStr = String(rawInput).trim();
  if (!rawStr || rawStr === '-' || rawStr.toLowerCase() === 'n/a' || rawStr.toLowerCase() === 'null') {
    return { value: null, precision: 'none', valid: true, issues };
  }

  // 2. ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawStr)) {
    const [y, m, d] = rawStr.split('-');
    const value = `${d}/${m}/${y}`;
    return validateBirthdayValue(value, 'full', issues);
  }

  // 3. Serial date string (e.g. "32891")
  if (/^\d{5}$/.test(rawStr)) {
    const d = excelSerialToDate(Number(rawStr));
    if (d) {
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      issues.push({
        code: 'EXCEL_SERIAL_DATE',
        severity: 'warning',
        message: 'Chuyển đổi từ định dạng ngày serial của Excel',
        autofixed: true,
      });
      const value = `${day}/${month}/${year}`;
      return validateBirthdayValue(value, 'full', issues);
    }
  }

  // 4. Year only (e.g. "1990")
  if (/^\d{4}$/.test(rawStr)) {
    const yearNum = Number(rawStr);
    const currentYear = new Date().getFullYear();
    if (yearNum > currentYear) {
      issues.push({
        code: 'BIRTHDAY_IN_FUTURE',
        severity: 'error',
        message: 'Năm sinh ở tương lai',
      });
      return { value: null, precision: 'none', valid: false, issues };
    }
    issues.push({
      code: 'BIRTHDAY_YEAR_ONLY',
      severity: 'warning',
      message: 'Chỉ có năm sinh',
    });
    return { value: rawStr, precision: 'year_only', valid: true, issues };
  }

  // 5. Month/Year (e.g. "03/1990")
  if (/^\d{1,2}[\/.-]\d{4}$/.test(rawStr)) {
    const parts = rawStr.split(/[\/.-]/);
    const year = parts[1];
    issues.push({
      code: 'BIRTHDAY_YEAR_ONLY',
      severity: 'warning',
      message: 'Chỉ có năm sinh',
    });
    return { value: year, precision: 'year_only', valid: true, issues };
  }

  // 6. Day/Month (e.g. "15/03" or "15/3")
  if (/^\d{1,2}[\/.-]\d{1,2}$/.test(rawStr)) {
    const parts = rawStr.split(/[\/.-]/).map(p => Number(p));
    let day = parts[0];
    let month = parts[1];

    if (dateOrder === 'MDY' && parts[0] <= 12 && parts[1] > 12) {
      month = parts[0];
      day = parts[1];
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      issues.push({
        code: 'BIRTHDAY_INVALID_MONTH',
        severity: 'error',
        message: 'Tháng hoặc ngày sinh không hợp lệ',
      });
      return { value: null, precision: 'none', valid: false, issues };
    }

    const value = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
    issues.push({
      code: 'BIRTHDAY_NO_YEAR',
      severity: 'warning',
      message: 'Chỉ có ngày và tháng sinh (thiếu năm)',
    });
    return { value, precision: 'day_month', valid: true, issues };
  }

  // 7. Full Date DD/MM/YYYY or MM/DD/YYYY
  if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(rawStr)) {
    const parts = rawStr.split(/[\/.-]/).map(p => Number(p));
    let day = parts[0];
    let month = parts[1];
    const year = parts[2];

    if (dateOrder === 'MDY') {
      month = parts[0];
      day = parts[1];
    }

    if (parts[0] <= 12 && parts[1] <= 12 && parts[0] !== parts[1]) {
      issues.push({
        code: 'DATE_ORDER_AMBIGUOUS',
        severity: 'warning',
        message: `Thứ tự Ngày/Tháng có thể không rõ ràng (đang đọc theo ${dateOrder})`,
      });
    }

    const value = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    return validateBirthdayValue(value, 'full', issues);
  }

  issues.push({
    code: 'BIRTHDAY_INVALID_MONTH',
    severity: 'error',
    message: 'Định dạng ngày sinh không hợp lệ',
  });
  return { value: null, precision: 'none', valid: false, issues };
}

function validateBirthdayValue(
  value: string,
  precision: 'full' | 'day_month',
  issues: ImportIssue[]
): BirthdayResult {
  const parts = value.split('/').map(p => Number(p));
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    issues.push({
      code: 'BIRTHDAY_INVALID_MONTH',
      severity: 'error',
      message: 'Tháng hoặc ngày sinh không hợp lệ',
    });
    return { value: null, precision: 'none', valid: false, issues };
  }

  if (year) {
    const currentYear = new Date().getFullYear();
    if (year > currentYear) {
      issues.push({
        code: 'BIRTHDAY_IN_FUTURE',
        severity: 'error',
        message: 'Năm sinh ở tương lai',
      });
      return { value: null, precision: 'none', valid: false, issues };
    }
    if (currentYear - year > 120) {
      issues.push({
        code: 'BIRTHDAY_TOO_OLD',
        severity: 'warning',
        message: 'Tuổi lớn hơn 120',
      });
    }
  }

  return { value, precision, valid: true, issues };
}
