import { ImportIssue, GenderConvention } from './types';
import { removeVietnameseAccents } from './nameSplitter';

export interface GenderResult {
  gender: 0 | 1 | null;
  salutation: string;
  issues: ImportIssue[];
}

export function parseGender(
  rawInput: unknown,
  convention: GenderConvention = 'text'
): GenderResult {
  const issues: ImportIssue[] = [];
  if (rawInput === null || rawInput === undefined) {
    return { gender: null, salutation: 'Anh/Chị', issues };
  }

  const str = String(rawInput).trim();
  if (!str || str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') {
    return { gender: null, salutation: 'Anh/Chị', issues };
  }

  if (convention === 'ignore') {
    return { gender: null, salutation: 'Anh/Chị', issues };
  }

  // Handle numeric conventions
  if (convention === '1=M,2=F' || convention === '0=M,1=F') {
    const num = Number(str);
    if (!isNaN(num)) {
      if (convention === '1=M,2=F') {
        if (num === 1) return { gender: 0, salutation: 'Anh', issues };
        if (num === 2) return { gender: 1, salutation: 'Chị', issues };
      } else if (convention === '0=M,1=F') {
        if (num === 0) return { gender: 0, salutation: 'Anh', issues };
        if (num === 1) return { gender: 1, salutation: 'Chị', issues };
      }
    }
  }

  // Text normalization
  const clean = removeVietnameseAccents(str).trim();

  // Nam keywords
  if (['nam', 'male', 'm', 'trai', 'ong', 'anh', 'boy'].includes(clean)) {
    return { gender: 0, salutation: 'Anh', issues };
  }

  // Nữ keywords
  if (['nu', 'female', 'f', 'gai', 'ba', 'chi', 'girl'].includes(clean)) {
    return { gender: 1, salutation: 'Chị', issues };
  }

  // Direct number fallback if text convention but numbers passed
  if (clean === '0') return { gender: 0, salutation: 'Anh', issues };
  if (clean === '1') return { gender: 1, salutation: 'Chị', issues };

  issues.push({
    code: 'GENDER_UNRECOGNIZED',
    severity: 'warning',
    message: `Không nhận diện được giá trị giới tính "${str}"`,
  });

  return { gender: null, salutation: 'Anh/Chị', issues };
}

export function detectGenderColumnKind(
  values: unknown[]
): 'text' | 'numeric' | 'mixed' | 'empty' {
  let hasText = false;
  let hasNumeric = false;

  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s || s === '-' || s.toLowerCase() === 'n/a') continue;

    if (/^\d+$/.test(s)) {
      hasNumeric = true;
    } else {
      hasText = true;
    }
  }

  if (hasNumeric && hasText) return 'mixed';
  if (hasNumeric) return 'numeric';
  if (hasText) return 'text';
  return 'empty';
}
