/**
 * phoneUtils.ts — Centralized Vietnamese Phone Number Normalization & Validation Utility
 *
 * Rules:
 * 1. Strips spaces, dashes, dots, parentheses: [\s.\-()]
 * 2. Converts +84 / 84 / +840 / 840 prefixes to leading 0 (e.g. +84912345678 → 0912345678, +840912345678 → 0912345678)
 * 3. Auto-prepends missing leading 0 for 9-digit numbers starting with 3, 5, 7, 8, 9 (e.g. 912345678 → 0912345678)
 * 4. Validates 10-digit VN mobile numbers (03, 05, 07, 08, 09) and 10-11 digit landlines (02)
 */

/**
 * Normalize a raw phone string into a standard Vietnamese phone number (0xxxxxxxxx)
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  let cleaned = String(phone).trim().replace(/[\s.\-()]/g, '');
  if (!cleaned) return '';

  // 1. Convert +84 prefix
  if (cleaned.startsWith('+84')) {
    const local = cleaned.slice(3).replace(/^0+/, '');
    return local ? `0${local}` : '';
  }

  // 2. Convert 84 prefix (only when total digits >= 10 to avoid converting short codes)
  if (cleaned.startsWith('84') && cleaned.length >= 10) {
    const local = cleaned.slice(2).replace(/^0+/, '');
    return local ? `0${local}` : '';
  }

  // 3. Auto-prepend missing leading 0 for 9-digit numbers starting with 3, 5, 7, 8, 9
  if (/^[35789]\d{8}$/.test(cleaned)) {
    return `0${cleaned}`;
  }

  return cleaned;
}

/**
 * Validate if a phone number is a valid Vietnamese phone number (mobile or landline)
 */
export function isValidVietnamPhone(phone?: string | null): boolean {
  const norm = normalizePhone(phone);
  if (!norm) return false;
  // Mobile: 10 digits (03x, 05x, 07x, 08x, 09x)
  if (/^0[35789]\d{8}$/.test(norm)) return true;
  // Landline: 10-11 digits (02x)
  if (/^02\d{8,9}$/.test(norm)) return true;
  return false;
}

/**
 * Format phone number for display.
 */
export function formatPhone(phone?: string | null): string {
  return normalizePhone(phone);
}
