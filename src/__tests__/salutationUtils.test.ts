import {
  isStartOfSentence,
  capitalizeVietnamese,
  lowercaseVietnamese,
  getSelfRef,
  applySmartSalutation
} from '../utils/salutationUtils';

describe('salutationUtils - Vietnamese Smart Salutation & Self Reference', () => {

  describe('isStartOfSentence', () => {
    test('detects start of string', () => {
      expect(isStartOfSentence('{salutation} ơi', 0)).toBe(true);
    });

    test('detects after period', () => {
      const text = 'Chào bạn. {salutation} khỏe không?';
      const index = text.indexOf('{salutation}');
      expect(isStartOfSentence(text, index)).toBe(true);
    });

    test('detects after question mark', () => {
      const text = 'Làm gì vậy? {salutation} cần hỗ trợ gì?';
      const index = text.indexOf('{salutation}');
      expect(isStartOfSentence(text, index)).toBe(true);
    });

    test('detects after exclamation mark', () => {
      const text = 'Dạ tuyệt quá! {salutation} nhớ kiểm tra tin nhắn nhé.';
      const index = text.indexOf('{salutation}');
      expect(isStartOfSentence(text, index)).toBe(true);
    });

    test('detects after newline', () => {
      const text = 'Dạ em chào anh ạ,\n{salutation} cho em hỏi...';
      const index = text.indexOf('{salutation}');
      expect(isStartOfSentence(text, index)).toBe(true);
    });

    test('returns false when in middle of sentence', () => {
      const text = 'Dạ em xin chào {salutation} ạ';
      const index = text.indexOf('{salutation}');
      expect(isStartOfSentence(text, index)).toBe(false);
    });
  });

  describe('getSelfRef mapping', () => {
    test('maps Bố/Mẹ/Ba/Má to con', () => {
      expect(getSelfRef('Bố')).toBe('con');
      expect(getSelfRef('Mẹ')).toBe('con');
      expect(getSelfRef('Ba')).toBe('con');
      expect(getSelfRef('Má')).toBe('con');
    });

    test('maps Ông/Bà/Cụ to cháu', () => {
      expect(getSelfRef('Ông')).toBe('cháu');
      expect(getSelfRef('Bà')).toBe('cháu');
      expect(getSelfRef('Cụ')).toBe('cháu');
    });

    test('maps Chú/Cô/Dì/Thím/Bác/Mợ to con or cháu', () => {
      expect(getSelfRef('Chú')).toBe('con');
      expect(getSelfRef('Cô')).toBe('con');
      expect(getSelfRef('Bác')).toBe('cháu');
    });

    test('maps Anh/Chị to em', () => {
      expect(getSelfRef('Anh')).toBe('em');
      expect(getSelfRef('Chị')).toBe('em');
    });

    test('maps Bạn to mình', () => {
      expect(getSelfRef('Bạn')).toBe('mình');
    });

    test('maps Em to anh', () => {
      expect(getSelfRef('Em')).toBe('anh');
    });
  });

  describe('applySmartSalutation', () => {
    test('capitalizes salutation and selfRef at start of sentence', () => {
      const tpl = '{salutation} ơi! {tu_xung} xin gửi thông báo.';
      const res = applySmartSalutation(tpl, 'Chị');
      expect(res).toBe('Chị ơi! Em xin gửi thông báo.');
    });

    test('lowercases salutation and selfRef in middle of sentence', () => {
      const tpl = 'Dạ em chào {salutation}, {tu_xung} gửi {salutation} bảng giá ạ.';
      const res = applySmartSalutation(tpl, 'Chị');
      expect(res).toBe('Dạ em chào chị, em gửi chị bảng giá ạ.');
    });

    test('handles Bố - Con correctly', () => {
      const tpl = '{salutation} ơi, {tu_xung} mới về ạ.';
      const res = applySmartSalutation(tpl, 'Bố');
      expect(res).toBe('Bố ơi, con mới về ạ.');
    });

    test('handles Ông - Cháu in middle vs start', () => {
      const tpl = 'Kính chào {salutation}! {tu_xung} xin kính chúc {salutation} sức khỏe.';
      const res = applySmartSalutation(tpl, 'Ông');
      expect(res).toBe('Kính chào ông! Cháu xin kính chúc ông sức khỏe.');
    });

    test('handles Vợ - anh in middle of sentence correctly', () => {
      const tpl = 'Rất tiếc khi {salutation} mới bị gỡ nhãn, {tu_xung} sẽ đền bù cho {salutation}';
      const res = applySmartSalutation(tpl, 'Vợ');
      expect(res).toBe('Rất tiếc khi vợ mới bị gỡ nhãn, anh sẽ đền bù cho vợ');
    });

    test('supports forced case override variables', () => {
      const tpl = 'chào {salutation_cap}, {tu_xung_cap} chúc {salutation_lower} vui vẻ';
      const res = applySmartSalutation(tpl, 'chị');
      expect(res).toBe('chào Chị, Em chúc chị vui vẻ');
    });
  });

});
