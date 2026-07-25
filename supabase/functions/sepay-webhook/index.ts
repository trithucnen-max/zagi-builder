import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://paxejunvgfhjdyulzutb.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_lBfBOFuvMYCFxWl2X-yA3g_deMkL9Yo";
const GAS_MAIL_URL = "https://script.google.com/macros/s/AKfycbwfAp3H9lUTrFLDakhpCmLZB6h9V9bViGSmCTMtp49MbujLK-vT6aPbSQhsJZNs0T4qVg/exec";

serve(async (req) => {
  // CORS Headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = await req.text();
    let payload: any = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("[SePay Webhook] Incoming payload:", JSON.stringify(payload));

    const content = String(payload?.content || payload?.description || "");
    const amount = Number(payload?.transferAmount || payload?.amount || 0);

    // Trích xuất mã Key từ cú pháp "ZAGI XXXX"
    const match = content.match(/ZAGI\s*([A-Z0-9-]+)/i);
    if (!match) {
      return new Response(JSON.stringify({
        success: false,
        message: "Nội dung chuyển khoản không chứa cú pháp ZAGI <KEY>",
        receivedContent: content
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const keyPart = match[1].trim().toUpperCase();
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Tìm kiếm License trong CSDL Supabase
    const { data: rows, error: searchErr } = await supabase
      .from("licenses")
      .select("*")
      .ilike("license_key", `%${keyPart}%`);

    if (searchErr || !rows || rows.length === 0) {
      console.error("[SePay Webhook] License not found for code:", keyPart, searchErr);
      return new Response(JSON.stringify({
        success: false,
        message: `Không tìm thấy License Key khớp với mã '${keyPart}'`
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const licenseRow = rows[0];
    const fullKey = licenseRow.license_key;
    const plan = licenseRow.plan || "solo_12m";
    const isLifetime = plan.includes("lifetime");

    // Tính ngày hết hạn theo gói
    let expiryDate = licenseRow.expiry_date;
    if (!isLifetime) {
      const exp = new Date();
      if (plan.includes("12m")) exp.setMonth(exp.getMonth() + 12);
      else if (plan.includes("6m")) exp.setMonth(exp.getMonth() + 6);
      else exp.setDate(exp.getDate() + 14); // 14 ngày dùng thử nếu có
      expiryDate = exp.toISOString();
    }

    // Cập nhật trạng thái status = 'active'
    const { error: updateErr } = await supabase
      .from("licenses")
      .update({
        status: "active",
        expiry_date: expiryDate,
        is_lifetime: isLifetime,
        last_verified_at: new Date().toISOString(),
      })
      .eq("license_key", fullKey);

    if (updateErr) {
      console.error("[SePay Webhook] Failed to update license:", updateErr);
      return new Response(JSON.stringify({
        success: false,
        message: "Lỗi cập nhật CSDL Supabase: " + updateErr.message
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[SePay Webhook] 🎉 Kích hoạt thành công License ${fullKey} cho email ${licenseRow.email}`);

    // Gửi Email thông báo ngầm qua Google Apps Script Mail (không làm chậm phản hồi)
    try {
      fetch(GAS_MAIL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: "YOUR_SECRET_KEY_HERE_hanoi@123a",
          action: "activation_notice",
          email: licenseRow.email,
          fullName: licenseRow.full_name || "",
          licenseKey: fullKey,
          plan: plan,
          amount: amount
        })
      }).catch(err => console.warn("[SePay Webhook] Mail fetch error:", err));
    } catch {}

    return new Response(JSON.stringify({
      success: true,
      message: `🎉 Tự động kích hoạt thành công License ${fullKey}`,
      licenseKey: fullKey,
      email: licenseRow.email,
      plan: plan
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[SePay Webhook] Server Exception:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
