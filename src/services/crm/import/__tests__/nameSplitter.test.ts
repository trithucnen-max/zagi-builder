import { splitRealName } from '../nameSplitter';

describe('nameSplitter 74 Test Cases', () => {
  // 1. 9 Business Examples
  test('9 business examples', () => {
    expect(splitRealName('Nguyen Van Binh').realName).toBe('Binh');
    expect(splitRealName('Nguyễn Văn Bình').realName).toBe('Bình');
    expect(splitRealName('Nam Phong').realName).toBe('Phong');
    expect(splitRealName('Minh').realName).toBe('Minh');
    expect(splitRealName('Trần Thị Hồng Nhung').realName).toBe('Hồng Nhung');
    expect(splitRealName('Nguyễn Thị Mai Anh').realName).toBe('Mai Anh');
    expect(splitRealName('Nguyễn Thế Anh').realName).toBe('Thế Anh');
    expect(splitRealName('Lê Minh Quân').realName).toBe('Quân');
    expect(splitRealName('Phạm Ngọc Hà').realName).toBe('Hà');
  });

  // 2. 15 "Anh" tail cases
  test('15 "Anh" tail cases', () => {
    expect(splitRealName('Anh').realName).toBe('Anh');

    const resHoangAnh = splitRealName('Hoàng Anh');
    expect(resHoangAnh.realName).toBe('Hoàng Anh');
    expect(resHoangAnh.confidence).toBe(0.7);

    expect(splitRealName('Ngọc Anh').realName).toBe('Ngọc Anh');

    const resNguyenAnh = splitRealName('Nguyễn Anh');
    expect(resNguyenAnh.realName).toBe('Nguyễn Anh');
    expect(resNguyenAnh.confidence).toBe(0.7);

    expect(splitRealName('Trần Thị Anh').realName).toBe('Thị Anh');
    expect(splitRealName('Lê Văn Anh').realName).toBe('Văn Anh');
    expect(splitRealName('Nguyễn Thị Ngọc Anh').realName).toBe('Ngọc Anh');
    expect(splitRealName('Phạm Hoàng Việt Anh').realName).toBe('Việt Anh');
    expect(splitRealName('Nguyễn Văn Hoàng Tuấn Anh').realName).toBe('Tuấn Anh');
    expect(splitRealName('Nguyen The Anh').realName).toBe('The Anh');
    expect(splitRealName('NGUYỄN THẾ ANH').realName).toBe('Thế Anh');
    expect(splitRealName('Đỗ Quỳnh Anh').realName).toBe('Quỳnh Anh');
    expect(splitRealName('Vũ Tuấn Anh').realName).toBe('Tuấn Anh');
    expect(splitRealName('Bùi Lan Anh').realName).toBe('Lan Anh');
    expect(splitRealName('Mai Phương Anh').realName).toBe('Phương Anh');
  });

  // 3. 10 N<=3 cases
  test('10 N<=3 cases', () => {
    expect(splitRealName('Trần Thị Hoa').realName).toBe('Hoa');
    expect(splitRealName('Đỗ Đức Duy').realName).toBe('Duy');
    expect(splitRealName('Nguyễn Đình Tùng').realName).toBe('Tùng');
    expect(splitRealName('Lê Hữu Phước').realName).toBe('Phước');
    expect(splitRealName('Phan Xuân Mạnh').realName).toBe('Mạnh');
    expect(splitRealName('Tôn Thất Thuyết').realName).toBe('Thuyết');
    expect(splitRealName('Hồ Ngọc Hà').realName).toBe('Hà');
    expect(splitRealName('Vũ Thị Lan').realName).toBe('Lan');
    expect(splitRealName('Ngô Bảo Châu').realName).toBe('Châu');
    expect(splitRealName('Dương Tử Quỳnh').realName).toBe('Quỳnh');
  });

  // 4. 8 N>=4 cases
  test('8 N>=4 cases', () => {
    expect(splitRealName('Nguyễn Văn Hoàng Long').realName).toBe('Hoàng Long');
    expect(splitRealName('Nguyễn Phúc Ánh Tuyết').realName).toBe('Ánh Tuyết');
    expect(splitRealName('Trần Lê Minh Khôi').realName).toBe('Minh Khôi');
    expect(splitRealName('Nguyễn Thị Thanh Thảo').realName).toBe('Thanh Thảo');
    expect(splitRealName('Lê Hoàng Bảo Ngọc').realName).toBe('Bảo Ngọc');
    expect(splitRealName('Phạm Thị Kim Chi').realName).toBe('Kim Chi');
    expect(splitRealName('Nguyễn Văn Thành Đạt').realName).toBe('Thành Đạt');
    expect(splitRealName('Trần Nguyễn Thu Hằng').realName).toBe('Thu Hằng');
  });

  // 5. 5 Cleaning cases
  test('5 cleaning cases', () => {
    expect(splitRealName('nguyễn văn bình').realName).toBe('Bình');
    expect(splitRealName('NGUYỄN THỊ HỒNG NHUNG').realName).toBe('Hồng Nhung');
    expect(splitRealName('Nguyễn  Văn   Bình').realName).toBe('Bình');
    expect(splitRealName('  Nam Phong  ').realName).toBe('Phong');
    expect(splitRealName('nguyen thi hong nhung').realName).toBe('Hong Nhung');
  });

  // 6. 7 Leading titles cases
  test('7 leading titles cases', () => {
    expect(splitRealName('A Bình').realName).toBe('Bình');
    expect(splitRealName('C Nhung').realName).toBe('Nhung');
    expect(splitRealName('Chị Hồng Nhung').realName).toBe('Hồng Nhung');
    expect(splitRealName('Anh Nguyễn Văn Bình').realName).toBe('Bình');
    expect(splitRealName('Mr. Bình').realName).toBe('Bình');
    expect(splitRealName('Ms Nhung').realName).toBe('Nhung');
    expect(splitRealName('Cô Trần Thị Hoa').realName).toBe('Hoa');
  });

  // 7. 6 Parentheses / Separators / Embedded Phone cases
  test('6 parentheses / separators / embedded phone cases', () => {
    const res1 = splitRealName('Nguyễn Văn Bình (Anh Bình Bảo Hiểm)');
    expect(res1.realName).toBe('Bình');
    expect(res1.notesExtracted).toContain('Anh Bình Bảo Hiểm');

    const res2 = splitRealName('Bình - Kho Q7');
    expect(res2.realName).toBe('Bình');
    expect(res2.notesExtracted).toContain('Kho Q7');

    const res3 = splitRealName('Nhung | Sale');
    expect(res3.realName).toBe('Nhung');
    expect(res3.notesExtracted).toContain('Sale');

    const res4 = splitRealName('Hoa / Ketoan');
    expect(res4.realName).toBe('Hoa');

    const res5 = splitRealName('Nguyễn Văn Bình 0985999959');
    expect(res5.realName).toBe('Bình');

    const res6 = splitRealName('Trần Thị Hoa (Hoa Kế toán)');
    expect(res6.realName).toBe('Hoa');
  });

  // 8. 3 Emoji cases
  test('3 emoji cases', () => {
    expect(splitRealName('Bình ❤️🌸').realName).toBe('Bình');
    expect(splitRealName('Nguyễn Thế Anh ✨').realName).toBe('Thế Anh');
    expect(splitRealName('Hồng Nhung 🔥🔥').realName).toBe('Nhung');
  });

  // 9. 3 Organization cases
  test('3 organization cases', () => {
    const res1 = splitRealName('Cty TNHH Minh Phát');
    expect(res1.isOrg).toBe(true);

    const res2 = splitRealName('Shop Mỹ Phẩm Hà Anh');
    expect(res2.isOrg).toBe(true);

    const res3 = splitRealName('Kho Q7');
    expect(res3.isOrg).toBe(true);
  });

  // 10. 3 Western order cases
  test('3 western order cases', () => {
    const res1 = splitRealName('Bình Nguyễn');
    expect(res1.confidence).toBe(0.4);
    expect(res1.altSuggestion).toBe('Bình');

    const res2 = splitRealName('Trang Le');
    expect(res2.confidence).toBe(0.4);

    const res3 = splitRealName('Nhung Tran');
    expect(res3.confidence).toBe(0.4);
  });

  // 11. 5 Edge cases
  test('5 edge cases', () => {
    expect(splitRealName('').realName).toBeNull();
    expect(splitRealName('   ').realName).toBeNull();
    expect(splitRealName(null).realName).toBeNull();
    expect(splitRealName('Bình Bình').realName).toBe('Bình');
    expect(splitRealName('Nguyễn Văn Bình Bình').realName).toBe('Bình Bình');
  });
});
