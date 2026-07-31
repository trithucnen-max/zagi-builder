import { normalizePhone } from '../services/crm/import/phoneNormalizer';
import { parseBirthday } from '../services/crm/import/birthdayParser';
import { parseGender, detectGenderColumnKind } from '../services/crm/import/genderParser';
import { autoMapColumns, parsePasted } from '../services/crm/import/fileParser';

describe('CRM Import Normalizers Tests', () => {
  describe('phoneNormalizer', () => {
    test('handles valid standard 10-digit mobile numbers', () => {
      const res = normalizePhone('0985 999 959');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('0985999959');
      expect(res.issues).toHaveLength(0);
    });

    test('handles international prefixes +84 and 84', () => {
      const res1 = normalizePhone('+84985999959');
      expect(res1.valid).toBe(true);
      expect(res1.normalized).toBe('0985999959');
      expect(res1.issues.some(i => i.code === 'INTL_PREFIX_CONVERTED')).toBe(true);

      const res2 = normalizePhone('84985999959');
      expect(res2.valid).toBe(true);
      expect(res2.normalized).toBe('0985999959');
      expect(res2.issues.some(i => i.code === 'INTL_PREFIX_CONVERTED')).toBe(true);
    });

    test('handles Excel lost leading zero', () => {
      const res = normalizePhone('985999959');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('0985999959');
      expect(res.issues.some(i => i.code === 'EXCEL_LOST_LEADING_ZERO')).toBe(true);

      const resNum = normalizePhone(985999959);
      expect(resNum.valid).toBe(true);
      expect(resNum.normalized).toBe('0985999959');
      expect(resNum.issues.some(i => i.code === 'EXCEL_LOST_LEADING_ZERO')).toBe(true);
    });

    test('handles Excel float format and scientific notation', () => {
      const resFloat = normalizePhone('0985999959.0');
      expect(resFloat.valid).toBe(true);
      expect(resFloat.normalized).toBe('0985999959');
      expect(resFloat.issues.some(i => i.code === 'EXCEL_FLOAT_FORMAT')).toBe(true);

      const resSci = normalizePhone('9.85999959e8');
      expect(resSci.valid).toBe(true);
      expect(resSci.normalized).toBe('0985999959');
      expect(resSci.issues.some(i => i.code === 'EXCEL_SCIENTIFIC_NOTATION')).toBe(true);
    });

    test('handles landlines and invalid numbers', () => {
      const resLandline = normalizePhone('0287654321');
      expect(resLandline.valid).toBe(true);
      expect(resLandline.isLandline).toBe(true);
      expect(resLandline.issues.some(i => i.code === 'LANDLINE_NUMBER')).toBe(true);

      const resShort = normalizePhone('098599995');
      expect(resShort.valid).toBe(false);
      expect(resShort.issues.some(i => i.code === 'PHONE_TOO_SHORT')).toBe(true);

      const resLegacy = normalizePhone('01234567890');
      expect(resLegacy.valid).toBe(false);
      expect(resLegacy.issues.some(i => i.code === 'PHONE_LEGACY_PREFIX')).toBe(true);

      const resMissing = normalizePhone('');
      expect(resMissing.valid).toBe(false);
      expect(resMissing.issues.some(i => i.code === 'PHONE_MISSING')).toBe(true);
    });
  });

  describe('birthdayParser', () => {
    test('parses full date, day/month, and year only', () => {
      const resFull = parseBirthday('15/03/1990');
      expect(resFull.valid).toBe(true);
      expect(resFull.value).toBe('15/03/1990');
      expect(resFull.precision).toBe('full');

      const resDayMonth = parseBirthday('15/03');
      expect(resDayMonth.valid).toBe(true);
      expect(resDayMonth.value).toBe('15/03');
      expect(resDayMonth.precision).toBe('day_month');

      const resYear = parseBirthday('1990');
      expect(resYear.valid).toBe(true);
      expect(resYear.value).toBe('1990');
      expect(resYear.precision).toBe('year_only');
    });

    test('parses Excel serial date number', () => {
      const resSerial = parseBirthday(32947);
      expect(resSerial.valid).toBe(true);
      expect(resSerial.value).toBe('15/03/1990');
      expect(resSerial.issues.some(i => i.code === 'EXCEL_SERIAL_DATE')).toBe(true);
    });

    test('validates invalid month and future year', () => {
      const resInvalidMonth = parseBirthday('15/13/1990');
      expect(resInvalidMonth.valid).toBe(false);
      expect(resInvalidMonth.issues.some(i => i.code === 'BIRTHDAY_INVALID_MONTH')).toBe(true);

      const resFuture = parseBirthday('15/03/2030');
      expect(resFuture.valid).toBe(false);
      expect(resFuture.issues.some(i => i.code === 'BIRTHDAY_IN_FUTURE')).toBe(true);
    });
  });

  describe('genderParser', () => {
    test('parses text gender values', () => {
      expect(parseGender('Nam').gender).toBe(0);
      expect(parseGender('Nam').salutation).toBe('Anh');

      expect(parseGender('Nữ').gender).toBe(1);
      expect(parseGender('Nữ').salutation).toBe('Chị');

      expect(parseGender('Khác').gender).toBeNull();
      expect(parseGender('Khác').salutation).toBe('Anh/Chị');
    });

    test('detects numeric column kind', () => {
      expect(detectGenderColumnKind(['1', '2', '1', '2'])).toBe('numeric');
      expect(detectGenderColumnKind(['Nam', 'Nữ'])).toBe('text');
      expect(detectGenderColumnKind(['Nam', '1'])).toBe('mixed');
      expect(detectGenderColumnKind([])).toBe('empty');
    });
  });

  describe('fileParser & autoMapColumns', () => {
    test('auto maps headers correctly', () => {
      const header = ['Họ và tên', 'Số điện thoại', 'Ngày sinh', 'Giới tính', 'Ghi chú'];
      const mapping = autoMapColumns(header);
      expect(mapping.real_name).toBe('Họ và tên');
      expect(mapping.phone).toBe('Số điện thoại');
      expect(mapping.birthday).toBe('Ngày sinh');
      expect(mapping.gender).toBe('Giới tính');
      expect(mapping.notes).toBe('Ghi chú');
    });

    test('parses pasted text', () => {
      const text = `Tên\tSĐT\nBình\t0985999959`;
      const table = parsePasted(text);
      expect(table.header).toEqual(['Tên', 'SĐT']);
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0]['SĐT']).toBe('0985999959');
    });
  });
});
