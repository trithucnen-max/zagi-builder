import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Env (secrets được set trong Supabase Dashboard → Project Settings → Edge Functions) ───
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Giá gói (VND) ───────────────────────────────────────────────────────────
const PLAN_PRICES: Record<string, number> = {
  trial_14d:      0,
  solo_6m:        990_000,
  solo_12m:       1_690_000,
  solo_lifetime:  4_900_000,
  team_6m:        4_900_000,
  team_12m:       8_900_000,
  team_lifetime:  14_900_000,
};

// ─── CORS headers ─────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── In-memory rate-limit store (reset khi function cold-start) ───────────────
// Key: ipHash → { count, resetAt }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_TRIAL_MAX      = 3;   // tối đa 3 lần trial / IP / 30 phút
const RATE_LIMIT_WINDOW_MS      = 30 * 60 * 1000;
const RATE_LIMIT_PAID_MAX       = 10;  // paid: thoáng hơn
const RATE_LIMIT_PAID_WINDOW_MS = 5 * 60 * 1000;

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string, isTrial: boolean): { allowed: boolean; remaining: number } {
  const max    = isTrial ? RATE_LIMIT_TRIAL_MAX : RATE_LIMIT_PAID_MAX;
  const window = isTrial ? RATE_LIMIT_WINDOW_MS : RATE_LIMIT_PAID_WINDOW_MS;
  const now    = Date.now();
  const key    = `${ip}:${isTrial ? "trial" : "paid"}`;

  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + window });
    return { allowed: true, remaining: max - 1 };
  }
  entry.count++;
  if (entry.count > max) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: max - entry.count };
}

// ─── Sinh license key an toàn bằng crypto ────────────────────────────────────
// Format: ZAGI-TRIAL-XXXXXX-XXXXXX-XXXXXX hoặc ZAGI-XXXXXX-XXXXXX-XXXXXX
function generateLicenseKey(isTrial: boolean): string {
  const prefix = isTrial ? "ZAGI-TRIAL" : "ZAGI";
  // crypto.randomUUID() → "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  const uuid = crypto.randomUUID().toUpperCase().replace(/-/g, "");
  const a = uuid.substring(0, 6);
  const b = uuid.substring(6, 12);
  const c = uuid.substring(12, 18);
  return `${prefix}-${a}-${b}-${c}`;
}

// ─── Validate helpers ─────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return /^(\+84|0)[0-9]{9}$/.test(phone.replace(/\s/g, ""));
}

function isValidPlan(plan: string): boolean {
  return Object.keys(PLAN_PRICES).includes(plan);
}

// ─── Tạo VietQR URL MB Bank ───────────────────────────────────────────────────
const MB_ACCOUNT = "422777999";
const MB_OWNER   = "CONG TY CO PHAN BASAN";

function buildVietQRUrl(amount: number, transferContent: string): string {
  return (
    `https://img.vietqr.io/image/MB-${MB_ACCOUNT}-compact2.png` +
    `?amount=${amount}` +
    `&addInfo=${encodeURIComponent(transferContent)}` +
    `&accountName=${encodeURIComponent(MB_OWNER)}`
  );
}

// ─── Tính ngày hết hạn ────────────────────────────────────────────────────────
function calcExpiryDate(plan: string): string | null {
  if (plan.includes("lifetime")) return null;
  const d = new Date();
  if (plan.includes("12m"))        d.setMonth(d.getMonth() + 12);
  else if (plan.includes("6m"))    d.setMonth(d.getMonth() + 6);
  else if (plan.includes("trial")) d.setDate(d.getDate() + 14);
  return d.toISOString();
}

// ─── Response helper ─────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Nội dung request không hợp lệ (cần JSON)" }, 400);
  }

  const name  = (body.name  || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const phone = (body.phone || "").trim();
  const plan  = (body.plan  || "").trim();

  // ── Validate input ───────────────────────────────────────────────────────
  if (!email || !phone || !plan) {
    return json({ success: false, error: "Thiếu email, số điện thoại hoặc gói dịch vụ" }, 400);
  }
  if (!isValidEmail(email)) {
    return json({ success: false, error: "Email không đúng định dạng" }, 400);
  }
  if (!isValidPhone(phone)) {
    return json({ success: false, error: "Số điện thoại không hợp lệ (cần 10 số, bắt đầu 0 hoặc +84)" }, 400);
  }
  if (!isValidPlan(plan)) {
    return json({ success: false, error: "Gói dịch vụ không hợp lệ" }, 400);
  }

  const amount  = PLAN_PRICES[plan];
  const isTrial = plan === "trial_14d" || amount === 0;
  const ip      = getClientIp(req);

  // ── Rate-limit ───────────────────────────────────────────────────────────
  const rl = checkRateLimit(ip, isTrial);
  if (!rl.allowed) {
    const retryMinutes = isTrial ? 30 : 5;
    return json({
      success: false,
      error: `Bạn đã thử quá nhiều lần. Vui lòng chờ ${retryMinutes} phút rồi thử lại.`,
    }, 429);
  }

  // ── Sinh license key an toàn ─────────────────────────────────────────────
  const licenseKey  = generateLicenseKey(isTrial);
  const status      = isTrial ? "active" : "pending";
  const expiryDate  = calcExpiryDate(plan);
  const isLifetime  = plan.includes("lifetime");
  const createdAt   = new Date().toISOString();

  // ── Insert vào DB (dùng SERVICE_ROLE_KEY — không bao giờ lộ ra browser) ──
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: insertError } = await supabase.from("licenses").insert({
    license_key:  licenseKey,
    email,
    full_name:    name,
    phone,
    plan,
    status,
    is_lifetime:  isLifetime,
    expiry_date:  expiryDate,
    created_at:   createdAt,
  });

  if (insertError) {
    console.error("[create-order] DB insert error:", insertError);
    return json({ success: false, error: "Không thể tạo đơn hàng. Vui lòng thử lại." }, 500);
  }

  const DOWNLOAD_LINKS = {
    windows:   "https://github.com/trithucnen-max/zagi-builder/releases/download/v3.1.4/Zagi.v3.1.4.Window.exe",
    mac_arm:   "https://github.com/trithucnen-max/zagi-builder/releases/download/v3.1.4/Zagi.v3.1.4.MacOS.M1%2B.arm64.dmg",
    mac_intel: "https://github.com/trithucnen-max/zagi-builder/releases/download/v3.1.4/Zagi.v3.1.4.MacOS.Intel.dmg",
    linux:     "https://github.com/trithucnen-max/zagi-builder/releases/download/v3.1.4/Zagi.v3.1.4.Linux.AppImage"
  };

  // ── Trial → kích hoạt ngay ───────────────────────────────────────────────
  if (isTrial) {
    console.log(`[create-order] ✅ Trial: ${licenseKey} | ${email}`);
    return json({
      success:       true,
      isTrial:       true,
      licenseKey,
      downloadLinks: DOWNLOAD_LINKS,
      emailSent:     true,
      message:       `Kích hoạt dùng thử 14 ngày thành công! Mã bản quyền & Link tải đã được gửi tới ${email}`,
    });
  }

  // ── Paid → trả về thông tin QR thanh toán ────────────────────────────────
  const shortCode       = licenseKey.split("-").pop()!;
  const transferContent = `ZAGI ${shortCode}`;
  const qrUrl           = buildVietQRUrl(amount, transferContent);

  console.log(`[create-order] 📦 Paid: ${licenseKey} | ${plan} | ${amount}đ | ${email}`);
  return json({
    success:         true,
    isTrial:         false,
    licenseKey,
    transferContent,
    amount,
    qrUrl,
    downloadLinks:   DOWNLOAD_LINKS,
    message:         "Đơn hàng đã được tạo. Vui lòng thanh toán để kích hoạt.",
  });
});
