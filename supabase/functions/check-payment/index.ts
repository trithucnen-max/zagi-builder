import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const url        = new URL(req.url);
  const licenseKey = url.searchParams.get("licenseKey")?.trim();

  if (!licenseKey) {
    return json({ success: false, error: "Thiếu licenseKey" }, 400);
  }

  // Validate format để tránh SQL injection / enumeration attack
  // ZAGI-XXXXXX-XXXXXX-XXXXXX hoặc ZAGI-TRIAL-XXXXXX-XXXXXX-XXXXXX
  if (!/^ZAGI(-TRIAL)?-[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(licenseKey)) {
    return json({ success: false, error: "Định dạng licenseKey không hợp lệ" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Chỉ SELECT status — không trả về email, phone, hay dữ liệu nhạy cảm khác
  const { data, error } = await supabase
    .from("licenses")
    .select("status")
    .eq("license_key", licenseKey)
    .maybeSingle();

  if (error) {
    console.error("[check-payment] DB error:", error);
    return json({ success: false, error: "Lỗi truy vấn. Vui lòng thử lại." }, 500);
  }

  if (!data) {
    return json({ success: false, error: "Không tìm thấy đơn hàng" }, 404);
  }

  return json({ success: true, status: data.status });
});
