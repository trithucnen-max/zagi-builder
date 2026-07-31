import { ImportIssue } from './types';

export interface NameResult {
  realName: string | null;
  confidence: number; // 0..1
  branch: 'N1' | 'GIVEN_NAME_ONLY' | 'SALUTATION_TAIL' | 'N<=3' | 'N>=4' | 'EMPTY';
  altSuggestion?: string;
  isOrg: boolean;
  notesExtracted: string;
  issues: ImportIssue[];
  wordCount: number;
}

const SURNAMES = new Set([
  'nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'vu', 'vo',
  'phan', 'truong', 'bui', 'dang', 'do', 'ngo', 'duong', 'ly',
  'trieu', 'dinh', 'la', 'lam', 'phung', 'mai', 'cao', 'tiet', 'ton'
]);

const LEADING_TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'anh', 'chi', 'chị', 'em', 'cô', 'chú', 'bác', 'ông', 'bà'
]);

const SINGLE_LETTER_TITLES = new Set(['a', 'c', 'mr', 'mrs', 'ms', 'miss']);

const ORG_TOKENS = new Set([
  'cty', 'congty', 'tnhh', 'cp', 'shop', 'store', 'kho', 'ltd', 'jsc'
]);

const ORG_PHRASES = [
  'cong ty', 'công ty', 'cua hang', 'cửa hàng', 'chi nhanh', 'chi nhánh',
  'doanh nghiep', 'doanh nghiệp', 'tap doan', 'tập đoàn'
];

/** Remove Vietnamese diacritics and convert to lowercase */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** Title case helper for Vietnamese words */
function toTitleCase(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function splitRealName(
  rawInput: unknown,
  cfg?: { salutationWords?: string[] }
): NameResult {
  const salutationWords = new Set(
    (cfg?.salutationWords && cfg.salutationWords.length > 0
      ? cfg.salutationWords
      : ['anh']
    ).map(w => removeVietnameseAccents(w))
  );

  const rawStr = rawInput === null || rawInput === undefined ? '' : String(rawInput);
  const issues: ImportIssue[] = [];
  const extractedNotes: string[] = [];

  if (!rawStr.trim()) {
    return {
      realName: null,
      confidence: 1.0,
      branch: 'EMPTY',
      isOrg: false,
      notesExtracted: '',
      issues: [],
      wordCount: 0,
    };
  }

  // STEP 0: CLEANING
  // 0.1 Remove invisible chars (zero-width space, NBSP)
  let s = rawStr.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ');

  // 0.2 Extract content in ( ) and [ ]
  s = s.replace(/[(\[](.*?)[)\]]/g, (_, inner) => {
    if (inner && inner.trim()) extractedNotes.push(inner.trim());
    return ' ';
  });

  // 0.3 Remove emojis & symbols (keep letters, digits, spaces, and separators)
  // Standard Vietnamese diacritics + basic punctuation
  s = s.replace(/[^\p{L}\p{N}\s\-|\/_,]/gu, ' ');

  // 0.4 Split at separators - | / _ ,
  const sepMatch = s.search(/[-|\/_,]/);
  if (sepMatch !== -1) {
    const after = s.slice(sepMatch + 1).trim();
    if (after) extractedNotes.push(after);
    s = s.slice(0, sepMatch);
  }

  // 0.5 Remove phone numbers (digits >= 8) embedded in name
  s = s.replace(/\b\d{8,}\b/g, ' ');

  // 0.6 Clean spaces
  s = s.trim().replace(/\s+/g, ' ');

  if (!s) {
    return {
      realName: null,
      confidence: 1.0,
      branch: 'EMPTY',
      isOrg: false,
      notesExtracted: extractedNotes.join(' | '),
      issues: [],
      wordCount: 0,
    };
  }

  let words = s.split(' ');
  let titleStripped = false;

  // 0.7 Remove leading titles at START
  if (words.length >= 2) {
    const firstLower = words[0].toLowerCase();
    const firstClean = removeVietnameseAccents(firstLower);

    if (words.length >= 3 && LEADING_TITLES.has(firstLower)) {
      titleStripped = true;
      words.shift();
      issues.push({
        code: 'TITLE_STRIPPED',
        severity: 'warning',
        message: `Đã loại bỏ xưng hô "${words[0]}" ở đầu tên`,
        autofixed: true,
      });
    } else if (words.length >= 2 && (SINGLE_LETTER_TITLES.has(firstLower) || SINGLE_LETTER_TITLES.has(firstClean))) {
      titleStripped = true;
      words.shift();
      issues.push({
        code: 'TITLE_STRIPPED',
        severity: 'warning',
        message: `Đã loại bỏ xưng hô ở đầu tên`,
        autofixed: true,
      });
    }
  }

  const cleanWords = words.map(toTitleCase);
  const N = cleanWords.length;
  const normalizedWords = cleanWords.map(removeVietnameseAccents);

  if (N === 0) {
    return {
      realName: null,
      confidence: 1.0,
      branch: 'EMPTY',
      isOrg: false,
      notesExtracted: extractedNotes.join(' | '),
      issues,
      wordCount: 0,
    };
  }

  // 0.8 Detect Organization
  let isOrg = false;
  const fullCleanText = normalizedWords.join(' ');
  for (const phrase of ORG_PHRASES) {
    if (fullCleanText.includes(phrase)) {
      isOrg = true;
      break;
    }
  }
  if (!isOrg) {
    for (const w of normalizedWords) {
      if (ORG_TOKENS.has(w)) {
        isOrg = true;
        break;
      }
    }
  }

  if (isOrg) {
    issues.push({
      code: 'ORGANIZATION',
      severity: 'warning',
      message: 'Tên có thể là tên tổ chức/công ty',
    });
    return {
      realName: cleanWords.join(' '),
      confidence: 0.5,
      branch: N === 1 ? 'N1' : N >= 4 ? 'N>=4' : 'N<=3',
      isOrg: true,
      notesExtracted: extractedNotes.join(' | '),
      issues,
      wordCount: N,
    };
  }

  // STEP 1: RULES FOR NAME EXTRACTION
  let realName = '';
  let branch: NameResult['branch'] = 'N<=3';
  let confidence = 1.0;
  const lastCleanWord = normalizedWords[N - 1];

  // 1a. N == 1
  if (N === 1) {
    realName = cleanWords[0];
    branch = 'N1';
  }
  // 1b. titleStripped && N == 2 && first word NOT in SURNAMES -> GIVEN_NAME_ONLY
  else if (titleStripped && N === 2 && !SURNAMES.has(normalizedWords[0])) {
    realName = cleanWords.join(' ');
    branch = 'GIVEN_NAME_ONLY';
  }
  // 1c. Last word in SALUTATION_WORDS -> SALUTATION_TAIL (take last 2 words)
  else if (salutationWords.has(lastCleanWord)) {
    branch = 'SALUTATION_TAIL';
    if (N === 1) {
      realName = cleanWords[0];
    } else {
      realName = cleanWords.slice(-2).join(' ');
      if (N === 2 && SURNAMES.has(normalizedWords[0])) {
        confidence = 0.7;
        issues.push({
          code: 'SURNAME_PLUS_SALUTATION',
          severity: 'warning',
          message: 'Tên dạng Họ + Xưng hô (vd: Nguyễn Anh)',
        });
      }
    }
  }
  // 1d. N <= 3 -> take last 1 word
  else if (N <= 3) {
    realName = cleanWords[N - 1];
    branch = 'N<=3';
  }
  // 1e. N >= 4 -> take last 2 words
  else {
    realName = cleanWords.slice(-2).join(' ');
    branch = 'N>=4';
  }

  // STEP 2: WESTERN ORDER DETECTION
  let altSuggestion: string | undefined = undefined;
  if (
    N >= 2 &&
    branch !== 'SALUTATION_TAIL' &&
    SURNAMES.has(lastCleanWord) &&
    !SURNAMES.has(normalizedWords[0])
  ) {
    confidence = 0.4;
    altSuggestion = cleanWords[0];
    issues.push({
      code: 'WESTERN_ORDER',
      severity: 'warning',
      message: 'Tên có thể bị đảo theo thứ tự Tây (Tên + Họ)',
    });
  }

  return {
    realName,
    confidence,
    branch,
    altSuggestion,
    isOrg,
    notesExtracted: extractedNotes.join(' | '),
    issues,
    wordCount: N,
  };
}
