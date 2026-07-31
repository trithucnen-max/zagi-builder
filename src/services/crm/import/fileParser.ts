import * as XLSX from 'xlsx';
import { RawTable, ColumnMapping } from './types';
import { removeVietnameseAccents } from './nameSplitter';

function findHeaderIndex(jsonData: any[][]): number {
  if (!jsonData || jsonData.length === 0) return 0;

  const headerKeywords = [
    'phone', 'sdt', 'sđt', 'điện thoại', 'dienthoai', 'mobile',
    'tên', 'ten', 'họ', 'ho', 'khách hàng', 'khach hang', 'chủ nhà', 'chu nha',
    'ngày sinh', 'ngay sinh', 'dob', 'birthday',
    'giới tính', 'gioi tinh', 'sex', 'gender',
    'ghi chú', 'ghi chu', 'note', 'stt'
  ];

  let bestIndex = 0;
  let maxScore = -1;

  const maxSearchRows = Math.min(15, jsonData.length);

  for (let i = 0; i < maxSearchRows; i++) {
    const row = jsonData[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let keywordScore = 0;
    let nonCount = 0;

    row.forEach(cell => {
      if (cell != null && String(cell).trim() !== '') {
        nonCount++;
        const normCell = removeVietnameseAccents(String(cell)).toLowerCase().trim();
        if (headerKeywords.some(kw => normCell.includes(kw))) {
          keywordScore += 2;
        }
      }
    });

    const totalScore = keywordScore + (nonCount > 1 ? 1 : 0);

    if (totalScore > maxScore && nonCount > 0) {
      maxScore = totalScore;
      bestIndex = i;
    }
  }

  return bestIndex;
}

export function parseSheet(buffer: Buffer, kind: 'xlsx' | 'csv', targetSheet?: string): RawTable {
  // Use XLSX library with raw: true so cell formats aren't silently modified
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    raw: true,
    codepage: 65001, // UTF-8
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return { header: [], rows: [], sheetNames: [] };
  }

  const parseSingleSheet = (name: string): { header: string[]; rows: Record<string, any>[] } => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return { header: [], rows: [] };

    const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (!jsonData || jsonData.length === 0) {
      return { header: [], rows: [] };
    }

    const headerIndex = findHeaderIndex(jsonData);

    const rawHeader = jsonData[headerIndex].map(h => String(h || '').trim());
    const dataRows = jsonData.slice(headerIndex + 1);

    const rows: Record<string, any>[] = dataRows.map(rowArray => {
      const rowObj: Record<string, any> = {};
      rawHeader.forEach((colName, colIdx) => {
        if (colName) {
          rowObj[colName] = rowArray[colIdx] !== undefined ? rowArray[colIdx] : '';
        }
      });
      return rowObj;
    });

    return { header: rawHeader, rows };
  };

  if (targetSheet && targetSheet !== '__ALL__' && sheetNames.includes(targetSheet)) {
    const res = parseSingleSheet(targetSheet);
    return { header: res.header, rows: res.rows, sheetNames, selectedSheet: targetSheet };
  }

  // Combine rows across all sheets with smart column header alignment
  let combinedHeader: string[] = [];
  let masterMapping: ColumnMapping = {};
  const combinedRows: Record<string, any>[] = [];

  for (const sName of sheetNames) {
    const parsed = parseSingleSheet(sName);
    if (parsed.header.length === 0 || parsed.rows.length === 0) continue;

    if (combinedHeader.length === 0) {
      combinedHeader = parsed.header;
      masterMapping = autoMapColumns(combinedHeader);
    }

    const sheetMapping = autoMapColumns(parsed.header);

    const alignedRows = parsed.rows.map(row => {
      const alignedObj: Record<string, any> = {};

      combinedHeader.forEach(col => {
        if (row[col] !== undefined) {
          alignedObj[col] = row[col];
        }
      });

      if (masterMapping.phone && sheetMapping.phone && alignedObj[masterMapping.phone] === undefined) {
        alignedObj[masterMapping.phone] = row[sheetMapping.phone] || '';
      }
      if (masterMapping.real_name && sheetMapping.real_name && alignedObj[masterMapping.real_name] === undefined) {
        alignedObj[masterMapping.real_name] = row[sheetMapping.real_name] || '';
      }
      if (masterMapping.birthday && sheetMapping.birthday && alignedObj[masterMapping.birthday] === undefined) {
        alignedObj[masterMapping.birthday] = row[sheetMapping.birthday] || '';
      }
      if (masterMapping.gender && sheetMapping.gender && alignedObj[masterMapping.gender] === undefined) {
        alignedObj[masterMapping.gender] = row[sheetMapping.gender] || '';
      }
      if (masterMapping.notes && sheetMapping.notes && alignedObj[masterMapping.notes] === undefined) {
        alignedObj[masterMapping.notes] = row[sheetMapping.notes] || '';
      }

      return alignedObj;
    });

    combinedRows.push(...alignedRows);
  }

  return {
    header: combinedHeader,
    rows: combinedRows,
    sheetNames,
    selectedSheet: targetSheet || (sheetNames.length > 1 ? '__ALL__' : sheetNames[0]),
  };
}

export function parsePasted(text: string): RawTable {
  if (!text || !text.trim()) {
    return { header: [], rows: [] };
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  // Detect separator (tab or comma)
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const matrix = lines.map(line =>
    line.split(sep).map(cell => cell.trim().replace(/^"|"$/g, ''))
  );

  // Check if first line contains header keywords
  const firstLineNorm = lines[0].toLowerCase();
  const hasHeaderKeywords = ['phone', 'sdt', 'sđt', 'tên', 'ten', 'ngày sinh', 'giới tính', 'họ'].some(
    kw => firstLineNorm.includes(kw)
  );

  let header: string[] = [];
  let dataLines = matrix;

  if (hasHeaderKeywords) {
    header = matrix[0];
    dataLines = matrix.slice(1);
  } else {
    // Generate col1, col2...
    const colCount = Math.max(...matrix.map(r => r.length));
    header = Array.from({ length: colCount }, (_, i) => `Cột ${i + 1}`);
  }

  const rows: Record<string, any>[] = dataLines.map(rowArray => {
    const rowObj: Record<string, any> = {};
    header.forEach((colName, colIdx) => {
      rowObj[colName] = rowArray[colIdx] !== undefined ? rowArray[colIdx] : '';
    });
    return rowObj;
  });

  return { header, rows };
}

export function autoMapColumns(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  for (const col of header) {
    const norm = removeVietnameseAccents(col).trim().toLowerCase();

    // Phone matching
    if (!mapping.phone && [
      'so dien thoai', 'sdt', 'phone', 'mobile', 'dienthoai', 'dien thoai',
      'so dt', 'so dien thoai chinh', 'phone number', 'contact',
      'dien thoai chinh', 'telephone', 'cell', 'sdt chinh',
    ].some(k => norm.includes(k))) {
      mapping.phone = col;
      continue;
    }

    // Name matching — broad to cover many Vietnamese Excel formats
    if (!mapping.real_name && [
      'ho va ten', 'ho ten', 'full name', 'fullname', 'ten khach hang',
      'ten kh', 'customer name', 'khach hang', 'ten', 'ho va ten khach',
      'ten day du', 'name', 'ten chu', 'ten nguoi', 'nguoi mua',
      'nguoi dung', 'ten thanh vien',
    ].some(k => norm.includes(k))) {
      mapping.real_name = col;
      continue;
    }

    // Birthday matching
    if (!mapping.birthday && ['ngay sinh', 'ns', 'birthday', 'dob', 'sinh nhat'].some(k => norm === k || norm.includes(k))) {
      mapping.birthday = col;
      continue;
    }

    // Gender matching
    if (!mapping.gender && ['gioi tinh', 'gt', 'gender', 'sex'].some(k => norm === k || norm.includes(k))) {
      mapping.gender = col;
      continue;
    }

    // Notes matching
    if (!mapping.notes && ['ghi chu', 'note', 'notes', 'mo ta', 'nhan xet', 'comment'].some(k => norm.includes(k))) {
      mapping.notes = col;
      continue;
    }
  }

  return mapping;
}

export function generateSampleExcelBuffer(): Buffer {
  const sampleData = [
    {
      'Họ và tên': 'Nguyễn Văn Bình',
      'Số điện thoại': '0985999959',
      'Ngày sinh': '15/03/1990',
      'Giới tính': 'Nam',
      'Ghi chú': 'Khách POS cửa hàng Q7',
    },
    {
      'Họ và tên': 'Trần Thị Hồng Nhung',
      'Số điện thoại': '0906111222',
      'Ngày sinh': '20/11',
      'Giới tính': 'Nữ',
      'Ghi chú': 'Khách vip đăng ký sự kiện',
    },
    {
      'Họ và tên': 'A Minh',
      'Số điện thoại': '84912345678',
      'Ngày sinh': '1988',
      'Giới tính': 'Nam',
      'Ghi chú': 'Đơn hàng tháng 7',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'KhachHang_Mau');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
