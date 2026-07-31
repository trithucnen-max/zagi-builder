export type IssueCode =
  | 'EXCEL_LOST_LEADING_ZERO'
  | 'INTL_PREFIX_CONVERTED'
  | 'EXCEL_FLOAT_FORMAT'
  | 'EXCEL_SCIENTIFIC_NOTATION'
  | 'LANDLINE_NUMBER'
  | 'PHONE_TOO_SHORT'
  | 'PHONE_LEGACY_PREFIX'
  | 'PHONE_MISSING'
  | 'SURNAME_PLUS_SALUTATION'
  | 'WESTERN_ORDER'
  | 'ORGANIZATION'
  | 'TITLE_STRIPPED'
  | 'BIRTHDAY_NO_YEAR'
  | 'BIRTHDAY_YEAR_ONLY'
  | 'EXCEL_SERIAL_DATE'
  | 'BIRTHDAY_INVALID_MONTH'
  | 'BIRTHDAY_IN_FUTURE'
  | 'BIRTHDAY_TOO_OLD'
  | 'DATE_ORDER_AMBIGUOUS'
  | 'GENDER_UNRECOGNIZED'
  | 'GENDER_NUMERIC_AMBIGUOUS';

export type IssueSeverity = 'warning' | 'error';

export interface ImportIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  autofixed?: boolean;
}

export type GenderConvention = 'text' | '1=M,2=F' | '0=M,1=F' | 'ignore';
export type DateOrder = 'DMY' | 'MDY';
export type DupStrategy = 'fill_empty' | 'skip' | 'overwrite';
export type RowValidity = 'valid' | 'warning' | 'error';
export type DupType = 'none' | 'in_file' | 'in_crm' | 'in_scan';

export interface ColumnMapping {
  phone?: string;
  real_name?: string;
  birthday?: string;
  gender?: string;
  notes?: string;
}

export interface RawTable {
  header: string[];
  rows: Record<string, any>[];
  sheetNames?: string[];
  selectedSheet?: string;
}
