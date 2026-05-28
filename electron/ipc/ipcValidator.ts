/**
 * IPC Input Validation — Zod-based schemas cho các IPC channel quan trọng.
 *
 * Chiến lược:
 * - Chỉ validate ở các channel nhận dữ liệu từ renderer (không tin tưởng hoàn toàn).
 * - Ưu tiên: auth channels, write operations, channels nhận user-controlled strings.
 * - Dùng .safeParse() để trả về lỗi rõ ràng thay vì crash.
 */
import { z } from 'zod';

// ─── Reusable primitive schemas ─────────────────────────────────────────────

/** Non-empty string, tối đa 2000 ký tự (chống ReDoS / memory bloat) */
const NonEmptyStr = z.string().min(1).max(2000);

/** Zalo ID: chuỗi số, 5–20 ký tự */
const ZaloId = z.string().regex(/^\d{5,20}$/, 'Invalid zaloId format');

/** Email: RFC-compliant basic check */
const EmailStr = z.string().email().max(254);

/** Vietnamese phone: 10 số bắt đầu 0, hoặc +84... */
const PhoneStr = z.string().regex(/^(0|\+84)\d{9,10}$/).optional().or(z.literal(''));

// ─── Auth / Login schemas ────────────────────────────────────────────────────

export const LoginQRSchema = z.object({
  tempId: NonEmptyStr.max(64),
});

export const LoginAuthSchema = z.object({
  authJson: z.string().min(10).max(10_000),
});

export const LoginCookiesSchema = z.object({
  imei: NonEmptyStr.max(64),
  cookies: NonEmptyStr.max(10_000),
  userAgent: NonEmptyStr.max(512),
});

export const LoginConnectSchema = z.object({
  auth: z.object({
    imei: NonEmptyStr.max(64),
    cookies: NonEmptyStr.max(10_000),
    userAgent: NonEmptyStr.max(512),
  }),
});

// ─── Employee schemas ────────────────────────────────────────────────────────

export const EmployeeCreateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, 'Username: chỉ dùng chữ, số, dấu _.-'),
  password: z.string().min(6).max(128),
  display_name: z.string().min(1).max(100),
  avatar_url: z.string().url().optional().or(z.literal('')),
  role: z.enum(['boss', 'employee']).optional(),
});

export const EmployeeLoginSchema = z.object({
  username: NonEmptyStr.max(50),
  password: NonEmptyStr.max(128),
});

export const EmployeeUpdateSchema = z.object({
  employeeId: NonEmptyStr.max(64),
  updates: z.object({
    display_name: z.string().min(1).max(100).optional(),
    avatar_url: z.string().optional(),
    password: z.string().min(6).max(128).optional(),
    is_active: z.number().int().min(0).max(1).optional(),
    role: z.string().optional(),
    group_id: z.string().nullable().optional(),
  }),
});

export const EmployeeAssignAccountsSchema = z.object({
  employeeId: NonEmptyStr.max(64),
  zaloIds: z.array(z.string().max(20)).max(200),
});

// ─── CRM schemas ─────────────────────────────────────────────────────────────

export const CRMCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  zaloId: NonEmptyStr,
  targetType: z.enum(['contacts', 'group', 'manual']).optional(),
  delayMs: z.number().int().min(500).max(300_000).optional(),
});

// ─── Zalo write operation schemas ────────────────────────────────────────────

export const SendMessageSchema = z.object({
  auth: z.object({
    imei: NonEmptyStr.max(64),
    cookies: NonEmptyStr.max(10_000),
    userAgent: NonEmptyStr.max(512),
  }),
  threadId: NonEmptyStr.max(20),
  message: z.string().max(10_000),
  threadType: z.number().int().min(0).max(1).optional(),
});

export const AcceptFriendRequestSchema = z.object({
  auth: z.object({
    imei: NonEmptyStr.max(64),
    cookies: NonEmptyStr.max(10_000),
    userAgent: NonEmptyStr.max(512),
  }),
  userId: NonEmptyStr.max(20),
});

// ─── License schemas ─────────────────────────────────────────────────────────

export const LicenseRegisterSchema = z.object({
  email: EmailStr,
  fullName: z.string().min(1).max(100).optional(),
  phone: PhoneStr,
  plan: z.string().max(50).optional(),
});

export const LicenseVerifySchema = z.object({
  email: EmailStr,
  licenseKey: z.string().max(200).nullable().optional(),
});

// ─── Validation helper ───────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Parse và validate dữ liệu đầu vào IPC.
 * Trả về { success: false, error } thay vì throw để IPC handler xử lý gracefully.
 *
 * @example
 * const validated = validateIpc(LoginQRSchema, args);
 * if (!validated.success) return validated; // trả về { success: false, error: '...' }
 * const { tempId } = validated.data;
 */
export function validateIpc<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  const field = firstError.path.join('.');
  const msg = `[IPC Validation] ${field ? `${field}: ` : ''}${firstError.message}`;
  return { success: false, error: msg };
}
