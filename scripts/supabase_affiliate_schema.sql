-- ==============================================================================
-- ZAGI AFFILIATE & PARTNER SYSTEM SCHEMA (SUPABASE)
-- 
-- 1. Bảng partner_tiers: Cấp bậc đại lý & tỷ lệ % hoa hồng trực tiếp / đè
-- 2. Bảng partners: Danh sách Đại lý (Mã giới thiệu = Số điện thoại)
-- 3. Bảng commissions: Lịch sử hoa hồng trọn đời (trực tiếp & đè cấp trên)
-- 4. Bảng payout_cycles: Lịch sử đối soát & thanh toán vào ngày 10 hàng tháng
-- 5. Views: Thống kê doanh số & hoa hồng chờ thanh toán
-- ==============================================================================

-- 1. BẢNG CẤP BẬC VÀ TỶ LỆ HOA HỒNG (PARTNER_TIERS)
CREATE TABLE IF NOT EXISTS public.partner_tiers (
  tier_code TEXT PRIMARY KEY,
  tier_name TEXT NOT NULL,
  commission_rate_percent NUMERIC NOT NULL, -- Tỷ lệ % hoa hồng F1 trực tiếp
  override_rate_percent NUMERIC DEFAULT 0,  -- Tỷ lệ % hoa hồng đè cấp trên (F2/F3)
  min_revenue_required NUMERIC DEFAULT 0,  -- Doanh số tích lũy tối thiểu để tự động thăng cấp
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Khởi tạo 4 cấp bậc tiêu chuẩn (Tổng trần hoa hồng tối đa 60%)
INSERT INTO public.partner_tiers (tier_code, tier_name, commission_rate_percent, override_rate_percent, min_revenue_required, sort_order)
VALUES 
  ('ctv', 'Cộng Tác Viên',  15.0,  0.0,          0, 1),
  ('dl',  'Đại Lý',         25.0,  5.0,    5000000, 2),
  ('tdl', 'Tổng Đại Lý',    35.0, 10.0,   30000000, 3),
  ('npp', 'Nhà Phân Phối',  45.0, 15.0,  100000000, 4)
ON CONFLICT (tier_code) DO UPDATE SET 
  commission_rate_percent = EXCLUDED.commission_rate_percent,
  override_rate_percent   = EXCLUDED.override_rate_percent,
  min_revenue_required    = EXCLUDED.min_revenue_required;

-- 2. BẢNG DANH SÁCH ĐẠI LÝ / NGƯỜI GIỚI THIỆU (PARTNERS)
CREATE TABLE IF NOT EXISTS public.partners (
  phone TEXT PRIMARY KEY,                       -- Mã giới thiệu chính là Số điện thoại
  full_name TEXT NOT NULL,
  email TEXT,
  tier_code TEXT REFERENCES public.partner_tiers(tier_code) DEFAULT 'ctv',
  parent_phone TEXT REFERENCES public.partners(phone), -- SĐT Người giới thiệu cấp trên (Mạng lưới)
  is_manual_tier BOOLEAN DEFAULT FALSE,        -- TRUE: Admin chỉ định cấp thủ công (không tự nhảy cấp)
  bank_account TEXT,
  bank_name TEXT,
  bank_holder TEXT,
  total_revenue NUMERIC DEFAULT 0,             -- Tổng doanh số đã giới thiệu thành công
  total_commission_earned NUMERIC DEFAULT 0,   -- Tổng tiền hoa hồng đã sinh ra
  total_commission_paid NUMERIC DEFAULT 0,     -- Tổng tiền hoa hồng đã thanh toán vào ngày 10
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG LỊCH SỬ HOA HỒNG PHÁT SINH TRỌN ĐỜI (COMMISSIONS)
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_key TEXT REFERENCES public.licenses(license_key),
  partner_phone TEXT REFERENCES public.partners(phone) ON DELETE CASCADE,
  buyer_name TEXT,
  buyer_phone TEXT NOT NULL,
  order_amount NUMERIC NOT NULL,              -- Giá trị đơn hàng (VNĐ)
  commission_percent NUMERIC NOT NULL,        -- % hoa hồng áp dụng
  commission_amount NUMERIC NOT NULL,         -- Số tiền hoa hồng (VNĐ)
  tier_level TEXT DEFAULT 'f1_direct' CHECK (tier_level IN ('f1_direct', 'f2_override', 'f3_override')),
  status TEXT DEFAULT 'pending_payout' CHECK (status IN ('pending_payout', 'approved', 'paid_on_10th', 'cancelled')),
  payout_cycle_date DATE,                    -- Ngày 10 của tháng thanh toán (ví dụ: 2026-08-10)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG CHU KỲ THANH TOÁN ĐỐI SOÁT NGÀY 10 HÀNG THÁNG (PAYOUT_CYCLES)
CREATE TABLE IF NOT EXISTS public.payout_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_date DATE NOT NULL,                  -- Ngày đối soát (Ngày 10 hàng tháng)
  partner_phone TEXT REFERENCES public.partners(phone),
  total_amount NUMERIC NOT NULL,
  payment_proof_ref TEXT,                   -- Mã giao dịch ngân hàng
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BỔ SUNG TRƯỜNG REFERRAL VÀO BẢNG LICENSES
ALTER TABLE public.licenses 
ADD COLUMN IF NOT EXISTS referral_phone TEXT REFERENCES public.partners(phone);

-- 6. SQL VIEW THỐNG KÊ CHI TIẾT HOA HỒNG ĐẠI LÝ & ĐỐI SOÁT NGÀY 10
CREATE OR REPLACE VIEW view_partner_payout_summary AS
SELECT 
  p.phone AS partner_phone,
  p.full_name,
  p.email,
  p.tier_code,
  pt.tier_name,
  p.parent_phone,
  p.total_revenue,
  COALESCE(SUM(CASE WHEN c.status = 'pending_payout' THEN c.commission_amount ELSE 0 END), 0) AS pending_payout_amount,
  COALESCE(SUM(CASE WHEN c.status = 'paid_on_10th' THEN c.commission_amount ELSE 0 END), 0) AS total_paid_amount,
  p.bank_name,
  p.bank_account,
  p.bank_holder
FROM public.partners p
LEFT JOIN public.partner_tiers pt ON p.tier_code = pt.tier_code
LEFT JOIN public.commissions c ON p.phone = c.partner_phone
GROUP BY p.phone, p.full_name, p.email, p.tier_code, pt.tier_name, p.parent_phone, p.total_revenue, p.bank_name, p.bank_account, p.bank_holder;
