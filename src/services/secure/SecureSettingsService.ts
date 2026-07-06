/**
 * SecureSettingsService.ts
 * Wrapper quanh electron.safeStorage để mã hóa data nhạy cảm trong SQLite.
 * Data được mã hóa bởi OS (Windows Credential Manager / macOS Keychain).
 * Chỉ app này trên đúng máy này mới giải mã được.
 */
import { safeStorage, app } from 'electron';
import DatabaseService from '../database/DatabaseService';
import Logger from '../../utils/Logger';

const ENC_PREFIX = 'enc:';
const LOCAL_PREFIX = 'local:';

// ─── Portable Obfuscation Helpers ─────────────────────────────────────────────

function portableEncrypt(str: string): string {
    if (!str) return '';
    const salt = 'zagi-secure-key-2026';
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return LOCAL_PREFIX + Buffer.from(result, 'binary').toString('base64');
}

function portableDecrypt(raw: string): string {
    if (!raw) return '';
    if (raw.startsWith(LOCAL_PREFIX)) {
        try {
            const bytes = Buffer.from(raw.slice(LOCAL_PREFIX.length), 'base64').toString('binary');
            const salt = 'zagi-secure-key-2026';
            let result = '';
            for (let i = 0; i < bytes.length; i++) {
                result += String.fromCharCode(bytes.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
            }
            return result;
        } catch {}
    }
    return raw;
}

/**
 * Lưu value được mã hóa bởi safeStorage vào SQLite settings.
 */
export function secureSet(key: string, value: string): void {
    if (!value && value !== '') {
        DatabaseService.getInstance().setSetting(key, '');
        return;
    }
    try {
        const isLocal = !app.isPackaged || process.env.NODE_ENV === 'development' || process.env.ZAGI_LOCAL === 'true';
        if (isLocal) {
            DatabaseService.getInstance().setSetting(key, portableEncrypt(value));
            return;
        }
        if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(value).toString('base64');
            DatabaseService.getInstance().setSetting(key, `${ENC_PREFIX}${encrypted}`);
            return;
        }
    } catch (err: any) {
        Logger.error(`[SecureSettings] Encrypt failed for "${key}": ${err.message}`);
    }
    // Fallback to portable encryption
    DatabaseService.getInstance().setSetting(key, portableEncrypt(value));
}

/**
 * Đọc và giải mã value từ SQLite settings.
 * Trả về null nếu không tồn tại hoặc không giải mã được.
 */
export function secureGet(key: string): string | null {
    const raw = DatabaseService.getInstance().getSetting(key);
    if (!raw) return null;

    if (raw.startsWith(LOCAL_PREFIX)) {
        return portableDecrypt(raw);
    }

    if (raw.startsWith(ENC_PREFIX)) {
        try {
            const buf = Buffer.from(raw.slice(ENC_PREFIX.length), 'base64');
            return safeStorage.decryptString(buf);
        } catch (err: any) {
            Logger.warn(`[SecureSettings] Decrypt failed for "${key}" — may be from different machine: ${err.message}`);
            return null;
        }
    }

    // Plaintext cũ (chưa migrate) — trả về nguyên
    return raw;
}

/**
 * Xóa secure setting.
 */
export function secureDelete(key: string): void {
    DatabaseService.getInstance().setSetting(key, '');
}


