import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';
import qrCodeImg from '../../../assets/donate/qr.png';
import AppIcon, { IconType } from '@/components/common/AppIcon';
import { useAppStore } from '@/store/appStore';

type FeatureId =
  | 'overview'
  | 'userguide'
  | 'safeguide'
  | 'dashboard'
  | 'multiAccount'
  | 'messaging'
  | 'crm'
  | 'workflow'
  | 'integration-pos'
  | 'integration-payment'
  | 'integration-shipping'
  | 'ai-assistant'
  | 'analytics'
  | 'erp'
  | 'employees'
  | 'security'
  | 'policy'
  | 'bugreport'
  | 'contact';

interface Feature {
  id: FeatureId;
  icon: IconType;
  label: string;
}

const FEATURES: Feature[] = [
  { id: 'overview',     icon: 'home', label: 'Tổng quan' },
  { id: 'userguide',    icon: 'book', label: 'Hướng dẫn sử dụng' },
  { id: 'safeguide',    icon: 'shield_check', label: 'Cẩm nang an toàn' },
  { id: 'dashboard',    icon: 'dashboard', label: 'Dashboard' },
  { id: 'multiAccount', icon: 'accounts', label: 'Đa tài khoản' },
  { id: 'messaging',    icon: 'chat', label: 'Quản lý tin nhắn' },
  { id: 'crm',          icon: 'crm', label: 'CRM & Khách hàng' },
  { id: 'workflow',     icon: 'tools', label: 'Workflow tự động' },
  { id: 'integration-pos', icon: 'integration', label: 'Tích hợp POS' },
  { id: 'integration-payment', icon: 'credit_card', label: 'Tích hợp thanh toán' },
  { id: 'integration-shipping', icon: 'truck', label: 'Tích hợp vận chuyển' },
  { id: 'ai-assistant', icon: 'ai', label: 'Trợ lý AI' },
  { id: 'analytics',    icon: 'analytics', label: 'Báo cáo & Phân tích' },
  { id: 'erp',          icon: 'erp', label: 'ERP quản trị nội bộ' },
  { id: 'employees',    icon: 'employees', label: 'Cài đặt nhân viên & workspace' },
  { id: 'security',     icon: 'shield_check', label: 'Bảo mật & Dữ liệu' },
  { id: 'policy',       icon: 'document_check', label: 'Chính sách pháp lý' },
  { id: 'bugreport',    icon: 'bug', label: 'Hướng dẫn báo lỗi' },
  { id: 'contact',      icon: 'phone', label: 'Liên hệ' },
];

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`}>{text}</span>
  );
}

const EMOJI_MAP: Record<string, IconType> = {
  '🏠': 'home',
  '📖': 'book',
  '📊': 'analytics',
  '👤': 'accounts',
  '💬': 'chat',
  '👥': 'users',
  '⚙️': 'tools',
  '⚙': 'tools',
  '🛒': 'integration',
  '💳': 'credit_card',
  '📦': 'truck',
  '🤖': 'ai',
  '📈': 'analytics',
  '🗂️': 'erp',
  '🧑‍💼': 'employees',
  '🔒': 'security',
  '🔑': 'security',
  '📜': 'document_check',
  '🐛': 'bug',
  '📞': 'phone',
  '💡': 'sparkles',
  '🔗': 'integration',
  '🔄': 'shuffle',
  '🔀': 'shuffle',
  '⚠️': 'bug',
  '✏️': 'edit',
  '⚡': 'zap',
  '📌': 'layers',
  '⏰': 'clock',
  '📁': 'storage',
  '✅': 'check',
  '🗓️': 'calendar',
  '📅': 'calendar',
  '📝': 'file_text',
  '🚀': 'sparkles',
  '🛡️': 'shield_check',
  '🟣': 'sparkles',
  '🔵': 'zap',
  '🟡': 'tools',
  '🟢': 'check',
  '🟠': 'layers',
  '📋': 'file_text',
  '🔧': 'tools',
  '🔁': 'shuffle',
  '🌐': 'proxy',
  '🍰': 'sparkles',
  '🎂': 'sparkles',
  '☕': 'coffee',
  '🍜': 'coffee',
  '🥞': 'coffee',
  '💰': 'credit_card',
  '👋': 'user_plus',
  '🔍': 'search',
  '🏢': 'workspace',
  '📣': 'sparkles',
  '🎓': 'book',
  '🏥': 'shield_check',
  '🤝': 'users',
  '💼': 'layers',
  '📱': 'chat',
  '🏪': 'integration',
  '🏫': 'book',
  '📤': 'download',
  '📄': 'document_check',
  'ℹ️': 'introduction',
  'ℹ': 'introduction',
  '❓': 'introduction',
  '🧠': 'ai',
  '⌨️': 'chat',
  '⌨': 'chat',
  '💎': 'sparkles',
  '🎲': 'shuffle',
  '✨': 'sparkles',
};

function cleanEmojiPrefix(str: string): { icon: IconType | null; cleanText: string } {
  for (const [emoji, iconKey] of Object.entries(EMOJI_MAP)) {
    if (str.startsWith(emoji)) {
      return { icon: iconKey, cleanText: str.substring(emoji.length).trim() };
    }
  }
  return { icon: null, cleanText: str };
}

function SectionTitle({ icon, children }: { icon?: IconType; children: React.ReactNode }) {
  let resolvedIcon: IconType | undefined = icon;
  let displayContent: React.ReactNode = children;

  if (!resolvedIcon && typeof children === 'string') {
    const cleaned = cleanEmojiPrefix(children);
    if (cleaned.icon) {
      resolvedIcon = cleaned.icon;
      displayContent = cleaned.cleanText;
    }
  }

  return (
    <p className="text-white font-semibold text-sm mb-3 flex items-center gap-1.5">
      {resolvedIcon && <AppIcon name={resolvedIcon} className="text-blue-500 flex-shrink-0" size={14} />}
      <span>{displayContent}</span>
    </p>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-400 text-xs leading-relaxed">{children}</p>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const { icon, cleanText } = cleanEmojiPrefix(item);
        return (
          <li key={i} className="flex items-start gap-2 text-gray-400 text-xs">
            {icon ? (
              <AppIcon name={icon} className="text-blue-400 mt-0.5 flex-shrink-0" size={12} />
            ) : (
              <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>
            )}
            <span dangerouslySetInnerHTML={{ __html: cleanText }} />
          </li>
        );
      })}
    </ul>
  );
}

function StepList({ steps }: { steps: { title: string; desc: string }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
            {i + 1}
          </span>
          <div>
            <p className="text-gray-300 text-xs font-semibold">{s.title}</p>
            <p className="text-gray-500 text-xs mt-0.5" dangerouslySetInnerHTML={{ __html: s.desc }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 space-y-3">
      {children}
    </div>
  );
}

// ─── Feature content panels ───────────────────────────────────────────────────

function OverviewPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AppIcon name="ai" className="text-blue-500 flex-shrink-0" size={40} />
        <div>
          <h3 className="text-white font-bold text-base">Zagi</h3>
          <p className="text-gray-400 text-xs mt-0.5">Phần mềm desktop quản lý Zalo & Facebook cá nhân Đa tài khoản tích hợp CRM, ERP, POS, Workflow và AI Assistant giúp đội nhóm bán hàng, chăm sóc khách hàng và marketing trên Zalo và Facebook vận hành tập trung trong một ứng dụng duy nhất.</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Badge text="Desktop App" color="bg-blue-600/30 text-blue-300" />
          </div>
        </div>
      </div>

      <Card>
        <SectionTitle icon="users">Ứng dụng được xây dựng cho ai?</SectionTitle>
        <div className="space-y-2">
          {([
            ['workspace', 'Doanh nghiệp vừa và nhỏ (SME)', 'Quản lý nhiều tài khoản Zalo/Facebook cùng lúc, phân công nhân viên chăm sóc từng kênh, theo dõi hiệu suất qua báo cáo tập trung.'],
            ['sparkles', 'Marketing Agency / Freelancer Marketing', 'Chạy chiến dịch gửi tin hàng loạt, quản lý danh sách khách hàng của nhiều client, tự động hóa nuture lead qua Zalo & Facebook.'],
            ['integration', 'Shop online / Kinh doanh thương mại điện tử', 'Nhận đơn, CSKH, gửi thông báo đơn hàng và tương tác với khách qua Zalo & Facebook — kết nối trực tiếp với POS, GHN, VNPay.'],
            ['phone', 'Sales & Telesales', 'Quản lý pipeline khách hàng trên Zalo & Facebook, tự động gửi follow-up, lọc khách theo trạng thái chiến dịch và tương tác gần nhất.'],
            ['book', 'Trung tâm đào tạo / Giáo dục', 'Gửi thông báo lịch học, nhắc học viên, chăm sóc phụ huynh hàng loạt, phân nhóm theo lớp/khóa học.'],
            ['shield_check', 'Phòng khám / Spa / Làm đẹp', 'Nhắc lịch hẹn tự động, gửi chăm sóc sau dịch vụ, chúc mừng sinh nhật khách hàng đúng ngày để tạo thiện cảm và kéo khách quay lại.'],
            ['coffee', 'F&B / Nhà hàng / Quán ăn', 'Gửi ưu đãi theo ngày đặc biệt, xây dựng nhóm khách hàng thân thiết, kết nối POS để tự động hóa thông báo đơn hàng.'],
            ['users', 'Team/Đội nhóm bán hàng nhiều người', 'Boss cấp tài khoản nhân viên, phân quyền từng người được xem/làm gì, theo dõi hiệu suất làm việc qua báo cáo nhân viên.'],
            ['layers', 'Đại lý / Nhà phân phối', 'Quản lý mạng lưới đại lý qua Zalo, tự động cập nhật giá/sản phẩm mới, phân nhóm đại lý theo khu vực bằng nhãn và workflow.'],
            ['chat', 'Content Creator / KOC / KOL', 'Quản lý tin nhắn từ follower, tự động trả lời câu hỏi thường gặp bằng AI, nuture audience thành khách hàng mua hàng.'],
          ] as [IconType,string,string][]).map(([icon, title, desc], i) => (
            <div key={i} className="flex gap-2.5 bg-gray-700/30 rounded-lg p-2.5">
              <AppIcon name={icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-semibold">{title}</p>
                <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle icon="sparkles">Tính năng nổi bật</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: 'accounts', text: 'Đa tài khoản Zalo & FB' },
            { icon: 'chat', text: 'Quản lý hội thoại tập trung' },
            { icon: 'crm', text: 'CRM khách hàng' },
            { icon: 'tools', text: 'Workflow tự động hoá' },
            { icon: 'ai', text: 'Trợ lý AI' },
            { icon: 'integration', text: 'Kết nối POS, thanh toán, vận chuyển' },
            { icon: 'erp', text: 'ERP quản trị nội bộ' },
            { icon: 'employees', text: 'Cài đặt nhân viên & workspace' },
            { icon: 'analytics', text: 'Báo cáo thống kê' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-700/40 rounded-lg px-3 py-2">
              <AppIcon name={f.icon as IconType} className="text-blue-500 flex-shrink-0" size={14} />
              <span className="text-gray-300 text-xs">{f.text}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle icon="document_check">Yêu cầu hệ thống</SectionTitle>
        <BulletList items={[
          'Windows 10/11 (64-bit) hoặc MacOS — đề xuất chạy trên PC/máy chủ ổn định',
          'RAM tối thiểu: <strong class="text-gray-200">4 GB</strong> (đề xuất 8 GB trở lên)',
          'Kết nối Internet ổn định để đồng bộ tin nhắn Zalo theo thời gian thực',
          'Chạy <strong class="text-gray-200">24/7</strong> để nhận tin nhắn, workflow và Tự động hoá hoạt động liên tục',
        ]} />
      </Card>
    </div>
  );
}

function MultiAccountPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>👤 Đăng nhập nhiều tài khoản Zalo & Facebook</SectionTitle>
        <Paragraph>
          Zagi cho phép bạn đăng nhập và quản lý <strong className="text-white font-semibold">không giới hạn tài khoản Zalo và Facebook</strong> trong một giao diện duy nhất.
          Mỗi tài khoản hoạt động độc lập, an toàn và không ảnh hưởng lẫn nhau.
        </Paragraph>
        <StepList steps={[
          { title: 'Thêm tài khoản Zalo', desc: 'Nhấn nút "Thêm tài khoản" ở sidebar → quét QR Code bằng ứng dụng Zalo trên điện thoại.' },
          { title: 'Thêm tài khoản Facebook', desc: 'Nhấn nút "Thêm tài khoản" → chọn Facebook → dán cookie Facebook (hướng dẫn trong app).' },
          { title: 'Phiên đăng nhập được duy trì', desc: 'Sau khi đăng nhập, phiên được lưu bảo mật trên máy cục bộ, không cần xác thực lại lần sau.' },
          { title: 'Chuyển đổi tức thì', desc: 'Nhấp vào avatar tài khoản ở sidebar để chuyển đổi giữa các tài khoản không cần đăng xuất.' },
          { title: 'Giám sát trạng thái', desc: 'Dashboard hiển thị trạng thái Online/Offline, listener sống/chết của từng tài khoản theo thời gian thực.' },
          { title: 'Kết nối lại tự động', desc: 'Khi listener bị ngắt (mất mạng, restart...), app tự động thử kết nối lại tối đa 5 lần với backoff tăng dần.' },
        ]} />
      </Card>

      <Card>
        <SectionTitle>🔒 Proxy — Chọn proxy trước khi đăng nhập</SectionTitle>
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 mb-2">
          <AppIcon name="sparkles" className="text-blue-400 flex-shrink-0" size={14} />
          <p className="text-blue-300 text-xs font-medium">Mỗi tài khoản Zalo có thể dùng proxy riêng — không ảnh hưởng lẫn nhau</p>
        </div>
        <Paragraph>
          Zagi hỗ trợ cấu hình proxy trước khi đăng nhập tài khoản Zalo. Hữu ích khi cần tách biệt IP cho từng tài khoản,
          sử dụng proxy doanh nghiệp, hoặc đăng nhập tài khoản từ vùng địa lý khác.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Hỗ trợ giao thức:</strong> HTTP · HTTPS · SOCKS5',
          '<strong class="text-gray-200">Cấu hình:</strong> Nhấn nút Proxy trên màn hình đăng nhập QR → nhập địa chỉ proxy (host:port) và thông tin xác thực nếu có',
          '<strong class="text-gray-200">Gán theo tài khoản:</strong> Mỗi tài khoản Zalo lưu proxy riêng — đổi tài khoản là đổi proxy tự động',
          '<strong class="text-gray-200">Kiểm tra proxy:</strong> Nhấn "Test" để xác nhận proxy hoạt động trước khi quét QR đăng nhập',
          '<strong class="text-gray-200">Bỏ proxy:</strong> Để trống địa chỉ proxy và lưu lại — tài khoản đó sẽ kết nối trực tiếp không qua proxy',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🔀 Chế độ Gộp trang</SectionTitle>
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 mb-2">
          <AppIcon name="sparkles" className="text-blue-400 flex-shrink-0" size={14} />
          <p className="text-blue-300 text-xs font-medium">Tính năng độc quyền — quản lý nhiều Zalo chỉ trong một hộp thư duy nhất</p>
        </div>
        <Paragraph>
          Chế độ Gộp trang cho phép bạn xem và trả lời hội thoại từ <strong className="text-green-500">tất cả tài khoản Zalo</strong> trong một danh sách
          hội thoại hợp nhất, sắp xếp theo thời gian thực — không cần chuyển tab qua lại từng tài khoản.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Kích hoạt:</strong> Vào Dashboard → nhấn nút <em>"Gộp tài khoản"</em> → chọn các tài khoản muốn gộp → Xác nhận',
          '<strong class="text-gray-200">Sidebar hiển thị bộ lọc nhanh:</strong> Icon "tất cả tài khoản" + avatar từng tài khoản → nhấn để lọc chỉ xem hội thoại của tài khoản đó',
          '<strong class="text-gray-200">Badge tài khoản:</strong> Mỗi hội thoại trong danh sách hiển thị avatar nhỏ của tài khoản sở hữu để dễ nhận biết',
          '<strong class="text-gray-200">Tự động chuyển tài khoản:</strong> Khi click vào hội thoại, app tự động chuyển sang đúng tài khoản chủ sở hữu trước khi hiển thị chat',
          '<strong class="text-gray-200">Bộ lọc đầy đủ:</strong> Tất cả · Chưa đọc · Phân loại nhãn · Khác — tất cả hoạt động xuyên suốt mọi tài khoản được gộp',
          '<strong class="text-gray-200">Nhãn gộp thông minh:</strong> Nhãn cùng tên từ nhiều tài khoản được hợp nhất thành một nhãn duy nhất trong bộ lọc',
          '<strong class="text-gray-200">Tìm kiếm tên:</strong> Tìm kiếm theo tên/biệt danh hoạt động trực tiếp trên toàn bộ hội thoại đã gộp',
          '<strong class="text-gray-200">Tìm kiếm số điện thoại:</strong> Khi nhập SĐT, app yêu cầu chọn tài khoản để tra cứu (vì mỗi tài khoản Zalo tra cứu độc lập)',
          '<strong class="text-gray-200">Thoát chế độ gộp:</strong> Nhấn nút "Đang Gộp tài khoản" trên Dashboard hoặc nhấn X trên sidebar',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚠️ Lưu ý quan trọng</SectionTitle>
        <BulletList items={[
          'Tài khoản Zalo phải là tài khoản <strong class="text-gray-200">cá nhân hoặc tài khoản doanh nghiệp</strong> hợp lệ',
          'App không hỗ trợ tài khoản đã bị Zalo khóa hoặc giới hạn tính năng',
          'Đăng nhập thông qua QR Code — ứng dụng không lưu mật khẩu Zalo',
          'Tài khoản đã bị ngắt kết nối (cookie hết hạn) sẽ không tự động gọi lên Zalo — cần kết nối lại thủ công hoặc quét QR mới',
          'Với chế độ Gộp trang: chỉ gộp các tài khoản <strong class="text-gray-200">đang online</strong> để đảm bảo nhận tin nhắn đầy đủ',
        ]} />
      </Card>
    </div>
  );
}

function MessagingPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>💬 Hộp thư tập trung — Danh sách hội thoại</SectionTitle>
        <Paragraph>
          Toàn bộ hội thoại từ tất cả tài khoản Zalo cá nhân & Facebook cá nhân (beta) hiển thị trong một màn hình duy nhất.
          Hệ thống bộ lọc giúp bạn tập trung vào đúng hội thoại cần xử lý ngay lập tức.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Bộ lọc hội thoại:</strong> Tất cả · Chưa đọc · Chưa trả lời · Khác · Theo nhãn',
          '<strong class="text-gray-200">Tìm kiếm thông minh:</strong> Tìm theo tên, biệt danh, hoặc nhập số điện thoại để tra cứu và tìm người dùng Zalo',
          '<strong class="text-gray-200">Ghim hội thoại:</strong> Ghim các hội thoại quan trọng lên đầu danh sách',
          '<strong class="text-gray-200">Tắt thông báo (Mute):</strong> Tắt trong 1 giờ · 4 giờ · Đến 8:00 AM · Cho đến khi mở lại',
          '<strong class="text-gray-200">Menu chuột phải:</strong> Gán nhãn nhanh, ghim, mute, mời vào nhóm, xóa hội thoại',
          '<strong class="text-gray-200">Tạo nhóm mới:</strong> Tạo nhóm Zalo trực tiếp từ thanh hộp thư',
          '<strong class="text-gray-200">Đồng bộ nhãn:</strong> Nhấn sync để đồng bộ nhãn mới nhất từ Zalo về app',
        ]} />
      </Card>

      <Card>
        <SectionTitle>✏️ Soạn tin nhắn — Đầy đủ tính năng Zalo</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: 'file_text' as IconType, feat: 'Định dạng văn bản', desc: 'In đậm, in nghiêng, gạch chân, gạch ngang' },
            { icon: 'smile' as IconType, feat: 'Emoji & Sticker', desc: 'Bộ emoji đầy đủ + sticker Zalo' },
            { icon: 'image' as IconType, feat: 'Gửi ảnh & video', desc: 'Từ file hoặc dán từ clipboard' },
            { icon: 'paperclip' as IconType, feat: 'Gửi file đính kèm', desc: 'Mọi định dạng file' },
            { icon: 'reply' as IconType, feat: 'Trả lời (Reply)', desc: 'Reply trực tiếp vào tin nhắn cụ thể' },
            { icon: 'at_sign' as IconType, feat: 'Tag thành viên', desc: 'Gõ @ để tag trong nhóm (gợi ý tự động)' },
            { icon: 'chart' as IconType, feat: 'Tạo bình chọn', desc: 'Tạo poll trong nhóm Zalo' },
            { icon: 'edit' as IconType, feat: 'Ghi chú nhóm', desc: 'Tạo & xem note được ghim trong nhóm' },
            { icon: 'clock' as IconType, feat: 'Nhắc nhở', desc: 'Đặt reminder ngay trong hội thoại' },
            { icon: 'credit_card' as IconType, feat: 'Gửi danh thiếp', desc: 'Share thông tin liên hệ qua card' },
          ].map((f, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg px-2.5 py-2 flex items-start gap-2">
              <AppIcon name={f.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{f.feat}</p>
                <p className="text-gray-500 text-[11px] mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>⚡ Tin nhắn nhanh (Quick Messages)</SectionTitle>
        <Paragraph>
          Lưu sẵn các mẫu tin nhắn thường dùng, gõ <code style={{color:'#86efac',background:'#1f2937',padding:'0.0625rem 0.3125rem',borderRadius:'0.1875rem'}}>/từ_khóa</code> để gợi ý và gửi ngay — tiết kiệm thời gian soạn tin lặp lại mỗi ngày.
        </Paragraph>
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 mb-1">
          <AppIcon name="sparkles" className="text-amber-500 flex-shrink-0" size={14} />
          <p className="text-gray-300 text-xs"><strong>Không giới hạn</strong> số lượng mẫu tin — Zalo gốc chỉ cho lưu <strong>1 tin nhắn nhanh</strong></p>
        </div>
        <BulletList items={[
          '<strong class="text-gray-200">2 chế độ:</strong> Tin nhắn nhanh đồng bộ từ Zalo (dùng được trên điện thoại) và Tin nhắn nhanh cục bộ chỉ trong app',
          'Mỗi mẫu có từ khóa gợi nhớ, tiêu đề và có thể đính kèm ảnh/media',
          'Gõ <code style="color:#86efac;background:#1f2937;padding:1px 5px;border-radius:3px">/</code> trong ô soạn tin → dropdown gợi ý xuất hiện ngay, lọc theo từ khóa',
          'Quản lý (thêm/sửa/xóa) tất cả mẫu tin trong phần Quick Message Manager',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📌 Tin nhắn ghim & Ghi chú nhóm</SectionTitle>
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 mb-1">
          <AppIcon name="sparkles" className="text-amber-500 flex-shrink-0" size={14} />
          <p className="text-gray-300 text-xs"><strong>Ghim không giới hạn</strong> số tin nhắn — Zalo gốc chỉ cho ghim tối đa <strong>3 tin</strong> mỗi hội thoại</p>
        </div>
        <BulletList items={[
          'Ghim bất kỳ tin nhắn nào lên thanh ghim ở đầu cửa sổ chat',
          'Click vào thanh ghim để nhảy đến tin nhắn gốc trong lịch sử',
          'Nhóm hỗ trợ ghim nhiều tin nhắn cùng lúc (xem tất cả trong danh sách)',
          '<strong class="text-gray-200">Bảng nhóm (Group Board):</strong> Tổng hợp tất cả ghim · ghi chú · bình chọn trong nhóm, lọc theo tab',
          'Ghi chú nhóm đồng bộ với tất cả thành viên nhóm trên Zalo',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⏰ Nhắc nhở trong hội thoại (Reminders)</SectionTitle>
        <BulletList items={[
          'Đặt nhắc nhở trực tiếp trong bất kỳ hội thoại nào (cá nhân hoặc nhóm)',
          'Chọn thời gian cụ thể, emoji và màu sắc cho nhắc nhở',
          '<strong class="text-gray-200">Chế độ lặp:</strong> Không lặp · Hàng ngày · Hàng tuần · Hàng tháng',
          'Nhắc nhở hiển thị popup thông báo đúng giờ ngay trong app',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📁 Kho media & File đính kèm</SectionTitle>
        <BulletList items={[
          'Panel thông tin hội thoại (bên phải) tổng hợp toàn bộ ảnh, video, file đã chia sẻ',
          'Lọc theo loại media: Ảnh · Video · File',
          'Xem trước ảnh/video trực tiếp trong app không cần mở ứng dụng ngoài',
          'Tải về file từ lịch sử chat bất kỳ lúc nào',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚙️ Menu tin nhắn & Hành động nhanh</SectionTitle>
        <Paragraph>
          Chuột phải (hoặc hover) vào bất kỳ tin nhắn nào để mở menu hành động:
        </Paragraph>
        <BulletList items={[
          '😀 React bằng emoji (36 emoji nhanh có sẵn)',
          '↩️ Trả lời tin nhắn cụ thể (Reply)',
          '↪️ Chuyển tiếp (Forward) sang hội thoại khác',
          '📌 Ghim / Bỏ ghim tin nhắn',
          '📋 Sao chép nội dung tin nhắn',
          '🗑️ Thu hồi (Recall) hoặc xóa tin nhắn',
        ]} />
      </Card>

      <Card>
        <SectionTitle>👤 Panel thông tin liên hệ & Nhóm</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Biệt danh:</strong> Đặt biệt danh riêng cho từng liên hệ (chỉ hiển thị trong app)',
          '<strong class="text-gray-200">Nhóm chung:</strong> Xem danh sách nhóm mà bạn và liên hệ đều là thành viên',
          '<strong class="text-gray-200">Chặn / Bỏ chặn:</strong> Chặn tin nhắn và cuộc gọi từ người dùng',
          '<strong class="text-gray-200">Báo xấu:</strong> Report người dùng hoặc nhóm vi phạm',
          '<strong class="text-gray-200">Xóa lịch sử:</strong> Xóa toàn bộ tin nhắn cục bộ của hội thoại',
          '<strong class="text-gray-200">Quản lý nhóm:</strong> Xem/quản lý thành viên, phân quyền admin, đổi tên nhóm, rời nhóm',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚠️ Hạn chế cần lưu ý</SectionTitle>
        <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2.5">
          <AppIcon name="alert_triangle" className="text-yellow-400 flex-shrink-0 mt-0.5" size={14} />
          <div className="space-y-1">
            <p className="text-yellow-300 text-xs font-semibold">Không hỗ trợ nghe & gọi (thoại / video call)</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Zagi tập trung vào nhắn tin và Tự động hoá. Các cuộc gọi thoại và video call qua Zalo
              không được hỗ trợ trong phiên bản hiện tại. Để thực hiện cuộc gọi, bạn cần dùng
              ứng dụng Zalo trên điện thoại hoặc Zalo PC chính thức.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ErpPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <AppIcon name="erp" className="text-blue-500 flex-shrink-0" size={40} />
          <div className="flex-1">
            <SectionTitle>ERP quản trị nội bộ — giao việc, lịch, note, nhân sự</SectionTitle>
            <Paragraph>
              Module ERP giúp đội nhóm quản lý công việc nội bộ ngay trong Zagi: từ giao task, theo dõi deadline,
              quản lý lịch, ghi chú nghiệp vụ đến phân quyền nhân sự giữa boss và nhân viên.
            </Paragraph>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Badge text="Task" color="bg-blue-600/20 text-blue-300" />
          <Badge text="Calendar" color="bg-violet-600/20 text-violet-300" />
          <Badge text="Notes" color="bg-emerald-600/20 text-emerald-300" />
          <Badge text="HRM" color="bg-amber-600/20 text-amber-300" />
        </div>
      </Card>

      <Card>
        <SectionTitle>✅ Task & giao việc nội bộ</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Kanban / Danh sách / Của tôi:</strong> theo dõi công việc theo trạng thái, deadline và người phụ trách',
          '<strong class="text-gray-200">Task detail đầy đủ:</strong> mô tả rich text, checklist, bình luận, người thực hiện, người theo dõi, file đính kèm',
          '<strong class="text-gray-200">Inbox cá nhân:</strong> gom các việc cần làm hôm nay, tuần này, quá hạn và việc sắp tới',
          '<strong class="text-gray-200">Boss ↔ nhân viên:</strong> giao việc và cập nhật tiến độ theo thời gian thực trong cùng workspace',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🗓️ Lịch làm việc & nhắc việc</SectionTitle>
        <BulletList items={[
          'Tạo lịch cá nhân hoặc sự kiện làm việc nội bộ ngay trong app',
          'Mở nhanh chi tiết sự kiện để xem, sửa hoặc xóa giống trải nghiệm lịch chính',
          'Nhắc việc và cập nhật thay đổi theo thời gian thực giữa boss và nhân viên được cấp quyền',
          'Phù hợp để quản lý lịch hẹn khách, lịch họp nội bộ và deadline công việc',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📝 Notes nghiệp vụ & tài liệu nội bộ</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Ghi chú theo thư mục:</strong> lưu SOP, mẫu câu, quy trình và tài liệu vận hành',
          '<strong class="text-gray-200">Riêng tư theo workspace:</strong> note mặc định là dữ liệu riêng, chỉ chia sẻ khi người tạo chủ động chia sẻ',
          '<strong class="text-gray-200">Lịch sử phiên bản:</strong> hỗ trợ xem phiên bản và khôi phục khi cần',
          '<strong class="text-gray-200">Tìm lại nhanh:</strong> lọc theo thư mục, tag và nội dung đang làm việc',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🧑‍💼 Quản lý nhân sự & quyền truy cập ERP</SectionTitle>
        <BulletList items={[
          'Quản lý vai trò ERP giữa owner / admin / manager / member / guest',
          'Phân quyền để nhân viên chỉ thấy đúng module và dữ liệu được cấp phép',
          'Hỗ trợ hồ sơ nhân sự mở rộng, dữ liệu đồng bộ theo boss ↔ employee workspace',
          'Làm nền tảng cho attendance, leave request và các báo cáo vận hành nội bộ',
        ]} />
      </Card>

      <Card>
        <SectionTitle>💡 Khi nào nên dùng ERP trong Zagi?</SectionTitle>
        <BulletList items={[
          'Khi bạn muốn <strong class="text-gray-200">giao việc từ ngay sau hội thoại khách hàng</strong> mà không cần chuyển sang app khác',
          'Khi boss cần nhìn được <strong class="text-gray-200">ai đang làm gì, ai theo dõi việc gì, việc nào sắp quá hạn</strong>',
          'Khi team cần dùng chung một nơi để quản lý task, lịch, note và phối hợp nội bộ',
          'Khi muốn vận hành gọn trên một desktop app duy nhất: chat + CRM + workflow + ERP',
        ]} />
      </Card>
    </div>
  );
}

function CrmPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>👥 Danh sách liên hệ & Tìm kiếm nâng cao</SectionTitle>
        <Paragraph>
          Toàn bộ <strong className="text-gray-200">bạn bè cá nhân</strong> và <strong className="text-gray-200">thành viên các nhóm Zalo</strong> bạn đang tham gia
          đều được đồng bộ tự động vào CRM. Mỗi liên hệ có thể lưu đầy đủ hồ sơ bao gồm ảnh đại diện, tên, số điện thoại,
          <strong className="text-gray-200"> giới tính</strong> và <strong className="text-gray-200">ngày sinh</strong> — đồng bộ từ profile Zalo thực tế.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Nguồn dữ liệu:</strong> Bạn bè Zalo + thành viên tất cả các nhóm bạn đang tham gia — không bỏ sót ai',
          '<strong class="text-gray-200">Phân loại liên hệ:</strong> Bạn bè cá nhân · Nhóm Zalo · Người lạ chưa kết bạn',
          '<strong class="text-gray-200">Thông tin hồ sơ:</strong> Tên · SĐT · Giới tính (Nam/Nữ) · Ngày sinh (ngày/tháng/năm)',
          '<strong class="text-gray-200">Tìm kiếm:</strong> Theo tên, số điện thoại, Zalo ID, nội dung ghi chú',
          '<strong class="text-gray-200">Sắp xếp:</strong> Theo tên A–Z, ngày thêm, lần nhắn cuối, số tin nhắn',
          '<strong class="text-gray-200">Bộ lọc kết hợp:</strong> Loại liên hệ + nhãn Zalo + giới tính + ngày sinh + trạng thái chiến dịch',
          '<strong class="text-gray-200">Chọn hàng loạt:</strong> Tick chọn nhiều liên hệ để thêm vào chiến dịch, gán nhãn, hoặc xuất danh sách',
        ]} />
      </Card>

      <Card>
        <SectionTitle>👥 Quản lý nhóm & Rời nhóm hàng loạt (Smart Group Management)</SectionTitle>
        <Paragraph>
          Hỗ trợ quản lý thành viên nhóm Zalo và thực hiện rời nhiều nhóm cùng lúc với cơ chế thông minh tránh rủi ro cho tài khoản và tránh mất quyền kiểm soát nhóm.
        </Paragraph>
        <BulletList items={[
          '<strong>Xem & Tìm kiếm thành viên:</strong> Xem danh sách toàn bộ thành viên trong từng nhóm Zalo, tìm kiếm theo tên, và thêm nhanh vào chiến dịch CRM.',
          '<strong>Rời nhóm hàng loạt (Bulk Leave Group):</strong> Chọn nhiều nhóm cùng lúc từ giao diện Liên hệ CRM hoặc Quản lý nhóm và thực hiện rời nhóm tự động.',
          '<strong>Tự động chuyển quyền trưởng nhóm:</strong> Nếu tài khoản của bạn đang làm Trưởng nhóm (Owner), hệ thống sẽ tự động chuyển quyền Trưởng nhóm sang Phó nhóm hoặc thành viên khác trước khi rời đi để tránh nhóm bị giải tán hoặc mất kiểm soát.',
          '<strong>AI tạm biệt lịch sự (AI Farewell Message):</strong> Tự động soạn tin nhắn tạm biệt tinh tế bằng AI (hoặc tin mẫu tùy chỉnh) và gửi vào nhóm trước khi rời đi.',
        ]} />
        <div className="mt-3 space-y-2">
          <p className="text-white font-semibold text-xs flex items-center gap-1.5">
            <AppIcon name="search" size={12} className="text-blue-500" />
            Quét thành viên nhóm nâng cao
          </p>
          <BulletList items={[
            '<strong class="text-gray-200">Quét thành viên nhóm ẩn:</strong> Với các nhóm lớn, Zalo chỉ trả về một phần thành viên trong danh sách thông thường. Tính năng quét nâng cao gửi thêm request để lấy toàn bộ thành viên thực tế — bao gồm cả những thành viên bị ẩn do giới hạn API.',
            '<strong class="text-gray-200">Quét nhóm chưa tham gia:</strong> Nhập Link nhóm Zalo (link mời) để quét danh sách thành viên của nhóm mà tài khoản <em>chưa là thành viên</em> — không cần tham gia nhóm vẫn lấy được danh sách.',
          ]} />
          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2 mt-1">
            <p className="text-yellow-300 text-[11px] font-semibold mb-1 flex items-center gap-1.5">
              <AppIcon name="alert_triangle" className="text-yellow-300" size={12} />
              Lưu ý khi rời nhóm & quét thành viên
            </p>
            <BulletList items={[
              'Quét nhóm lớn (hàng nghìn thành viên) mất nhiều thời gian — không đóng cửa sổ trong khi quét.',
              'Khi rời nhóm, đảm bảo đã cấu hình đúng người nhận quyền Trưởng nhóm nếu bạn là Trưởng nhóm hiện tại.',
              'Tin nhắn tạm biệt gửi vào nhóm sẽ tuân theo thứ tự gửi và delay thích hợp để không bị đánh dấu Spam.',
            ]} />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>🏷️ Nhãn Zalo (Label) — Phân nhóm thông minh</SectionTitle>
        <Paragraph>
          Nhãn được đồng bộ trực tiếp từ tính năng nhãn chính thức của Zalo.
          Khi bạn gán nhãn trong app, nhãn sẽ hiển thị luôn trên ứng dụng Zalo điện thoại.
        </Paragraph>
        <BulletList items={[
          'Tạo, đổi tên, xóa nhãn ngay trong app',
          'Gán/gỡ nhãn cho từng liên hệ hoặc hàng loạt',
          'Lọc danh sách liên hệ theo một hoặc nhiều nhãn',
          'Nhãn hiển thị đồng bộ trên app Zalo điện thoại thời gian thực',
          'Dùng nhãn làm điều kiện Trigger hoặc Action trong Workflow',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📝 Ghi chú nội bộ (Notes)</SectionTitle>
        <BulletList items={[
          'Thêm ghi chú riêng cho từng liên hệ (khách hàng không thấy)',
          'Chỉnh sửa hoặc xóa ghi chú bất kỳ lúc nào',
          'Xem lại toàn bộ ghi chú theo dòng thời gian trong panel chi tiết liên hệ',
          'Dùng để lưu: nhu cầu, lịch hẹn, lịch sử deal, thông tin hợp đồng',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🎂 Chăm sóc khách hàng theo Giới tính & Ngày sinh & Tương tác cuối</SectionTitle>
        <Paragraph>
          Dữ liệu giới tính và ngày sinh trong hồ sơ liên hệ mở ra khả năng <strong className="text-gray-200">cá nhân hoá chiến dịch</strong> —
          gửi đúng người, đúng thời điểm để tăng tỷ lệ phản hồi và giữ chân khách hàng cũ.
        </Paragraph>
        <div className="space-y-2">
          <p className="text-xs text-gray-300 font-semibold flex items-center gap-1.5">
            <AppIcon name="sparkles" size={12} className="text-amber-400" />
            Gợi ý chiến dịch chăm sóc:
          </p>
          <div className="space-y-1.5">
            {([
              ['sparkles' as IconType, 'Chúc mừng sinh nhật theo ngày', 'Lọc liên hệ có ngày sinh = hôm nay (hoặc trong tuần) → tạo campaign gửi lời chúc + ưu đãi cá nhân hoá. Tỷ lệ mở và phản hồi sinh nhật thường cao nhất trong năm.'],
              ['calendar' as IconType, 'Chiến dịch theo tháng sinh', 'Mỗi đầu tháng, lọc toàn bộ khách sinh trong tháng → gửi ưu đãi tháng sinh. Ví dụ: "Tháng 5 — Tặng quà khách sinh nhật tháng 5"'],
              ['users' as IconType, 'Ưu đãi theo giới tính', 'Ngày 8/3 → chiến dịch riêng cho khách nữ. Ngày 20/10 tương tự. Ngày 14/2, 22/12 → khách nam. Lọc theo giới tính và bắn chiến dịch chỉ định.'],
              ['sync' as IconType, 'Kéo lại khách cũ đúng dịp', 'Kết hợp: khách cũ chưa nhắn tin lại > 30 ngày + sinh nhật trong tháng này → ưu tiên liên hệ lại nhóm này trước.'],
            ] as [IconType,string,string][]).map(([icon, title, desc], i) => (
                <div key={i} className="flex gap-2.5 bg-gray-700/30 rounded-lg p-2.5">
                  <AppIcon name={icon} className="text-blue-500 flex-shrink-0 mt-0.5" size={14} />
                  <div>
                    <p className="text-gray-200 text-[11px] font-semibold">{title}</p>
                    <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
            ))}
          </div>
        </div>
        <div className="mt-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AppIcon name="layers" className="text-blue-400 mt-0.5 flex-shrink-0" size={12} />
          <p className="text-gray-300 text-[11px] leading-relaxed">
            <strong>Cách dùng:</strong> CRM → Danh sách liên hệ → Bộ lọc → chọn <em>"Sinh nhật hôm nay / tuần này / tháng này"</em> hoặc <em>"Giới tính"</em>
            → Chọn hết → Thêm vào chiến dịch → Soạn nội dung cá nhân hoá → Gửi.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle>🚀 Chiến dịch gửi tin (Campaign)</SectionTitle>
        <Paragraph>
          Campaign là công cụ gửi tin / thực hiện hành động Zalo hàng loạt có kiểm soát,
          với delay cấu hình được để tránh bị Zalo giới hạn.
        </Paragraph>
        <div className="grid grid-cols-2 gap-2 my-1">
          {[
            { icon: 'conversation' as IconType, type: 'Gửi tin nhắn', desc: 'Text, ảnh, file tới danh sách liên hệ' },
            { icon: 'user_plus' as IconType, type: 'Kết bạn', desc: 'Gửi lời mời kết bạn hàng loạt' },
            { icon: 'users' as IconType, type: 'Mời vào nhóm', desc: 'Thêm danh sách liên hệ vào nhóm Zalo' },
            { icon: 'shuffle' as IconType, type: 'Hỗn hợp', desc: 'Kết hợp nhiều loại hành động' },
          ].map((c, i) => (
            <div key={i} className="bg-gray-700/40 rounded-lg p-2.5 flex items-start gap-2">
              <AppIcon name={c.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-xs text-gray-200 font-semibold">{c.type}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <BulletList items={[
          'Cài delay giữa các lần gửi (giây) để tránh spam detection',
          'Theo dõi tiến độ realtime: đã gửi / thất bại / đang chờ / đã phản hồi',
          'Tạm dừng / tiếp tục / nhân bản chiến dịch bất kỳ lúc nào',
          'Lọc chiến dịch theo trạng thái: Nháp · Đang chạy · Tạm dừng · Hoàn thành',
          'Log lịch sử gửi chi tiết cho từng liên hệ trong chiến dịch',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🛡️ Cẩm nang an toàn Zalo & Cảnh báo chiến dịch</SectionTitle>
        <Paragraph>
          Để đảm bảo quá trình chăm sóc khách hàng qua Zalo diễn ra an toàn, chuyên nghiệp và tránh bị hệ thống Zalo đánh dấu spam hoặc khóa tài khoản, bạn cần tuân thủ các nguyên tắc sau:
        </Paragraph>
        
        <div className="space-y-3">
          <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
            <p className="text-white font-semibold text-xs flex items-center gap-1.5">
              <AppIcon name="accounts" size={12} className="text-blue-500" />
              Đối với khách hàng CHƯA kết bạn (Người lạ)
            </p>
            <BulletList items={[
              '<strong>Hạn mức:</strong> Zalo cá nhân miễn phí chỉ gửi tin nhắn cho tối đa 40 người lạ/tháng.',
              '<strong>Tần suất:</strong> Chỉ nên gửi tối đa 10 - 20 người/ngày, không gửi liên tục và ồ ạt.',
            ]} />
          </div>

          <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
            <p className="text-white font-semibold text-xs flex items-center gap-1.5">
              <AppIcon name="users" size={12} className="text-blue-500" />
              Đối với khách hàng ĐẠT kết bạn (Bạn bè)
            </p>
            <BulletList items={[
              '<strong>Hạn mức:</strong> Gửi tối đa 50 - 100 người/ngày để giữ tài khoản an toàn.',
              '<strong>Tần suất:</strong> Delay tối thiểu 10 - 20 giây giữa mỗi tin nhắn.',
            ]} />
          </div>

          <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
            <p className="text-white font-semibold text-xs flex items-center gap-1.5">
              <AppIcon name="file_text" size={12} className="text-blue-500" />
              Nội dung tin nhắn & Link liên kết
            </p>
            <BulletList items={[
              '<strong>Trộn nội dung (Spintax):</strong> Sử dụng cú pháp {A|B|C} hoặc AI trợ lý để đa dạng hóa nội dung, tránh gửi trùng lặp 100%.',
              '<strong>Link liên kết:</strong> Tránh chèn trực tiếp các link rác, link lạ, link chưa được kiểm duyệt để tránh bị hệ thống Zalo quét spam.',
            ]} />
          </div>

          <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg px-3 py-2">
            <p className="text-blue-300 text-[11px] leading-relaxed flex items-start gap-1">
              <AppIcon name="sparkles" size={12} className="text-blue-300 flex-shrink-0 mt-0.5" />
              <span><strong>Hệ thống cảnh báo thông minh:</strong> Khi tạo chiến dịch CRM mới, hệ thống sẽ tự động phân tích tần suất gửi, số lượng gửi và nội dung tin nhắn để đưa ra các cảnh báo bằng màu sắc (<strong>Đỏ / Vàng</strong>) trực quan nếu vi phạm các quy tắc an toàn trên. Hãy chú ý các cảnh báo này để điều chỉnh tham số chiến dịch cho phù hợp.</span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function WorkflowPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>⚙️ Workflow Engine — Tự động hoá không cần code</SectionTitle>
        <Paragraph>
          Workflow là hệ thống Tự động hoá dạng kéo-thả theo mô hình <strong className="text-white font-semibold">Trigger → Node → Action</strong>.
          Mỗi workflow chạy nền liên tục 24/7, xử lý sự kiện và thực hiện hành động theo logic bạn thiết lập.
        </Paragraph>
        <StepList steps={[
          { title: 'Tạo Workflow mới', desc: 'Vào menu Workflow → Tạo mới → Đặt tên → Chọn Trigger để bắt đầu.' },
          { title: 'Kéo thêm các Node', desc: 'Từ bảng Node bên trái, kéo thả vào canvas: Zalo Action, Logic, AI, Google Sheets...' },
          { title: 'Kết nối & cấu hình', desc: 'Nối các node bằng đường dây → Click vào node để điền tham số cụ thể.' },
          { title: 'Bật và giám sát', desc: 'Nhấn Bật → Workflow tự chạy nền. Xem kết quả trong tab Lịch sử chạy.' },
        ]} />
      </Card>

      <Card>
        <SectionTitle>🟣 Triggers — Sự kiện kích hoạt</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Tin nhắn mới</strong> — kích hoạt khi nhận tin, lọc theo từ khóa, loại hội thoại (cá nhân/nhóm)',
          '<strong class="text-gray-200">Lời mời kết bạn</strong> — khi có người gửi friend request đến tài khoản',
          '<strong class="text-gray-200">Sự kiện nhóm</strong> — khi ai đó tham gia, rời nhóm, hoặc thay đổi quyền admin',
          '<strong class="text-gray-200">Cảm xúc (React)</strong> — khi ai đó react vào tin nhắn bất kỳ',
          '<strong class="text-gray-200">Gán / Gỡ nhãn</strong> — khi một hội thoại được gán hoặc gỡ nhãn Zalo',
          '<strong class="text-gray-200">Lịch trình (Cron)</strong> — chạy theo lịch cố định: mỗi X phút, mỗi ngày lúc HH:MM, hàng tuần...',
          '<strong class="text-gray-200">Chạy thủ công</strong> — nhấn nút Test trong UI để chạy ngay một lần',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🔵 Zalo Actions — Hành động trực tiếp trên Zalo</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: 'conversation' as IconType, feat: 'Gửi tin nhắn', desc: 'Text với biến động, template' },
            { icon: 'edit' as IconType, feat: 'Gửi đang gõ + delay', desc: 'Giả lập typing trước khi gửi' },
            { icon: 'image' as IconType, feat: 'Gửi ảnh', desc: 'Từ file cục bộ hoặc URL' },
            { icon: 'paperclip' as IconType, feat: 'Gửi file', desc: 'File đính kèm bất kỳ định dạng' },
            { icon: 'search' as IconType, feat: 'Tìm user theo SĐT', desc: 'Tra cứu Zalo UID từ số điện thoại' },
            { icon: 'accounts' as IconType, feat: 'Lấy thông tin user', desc: 'Profile, tên, avatar của bất kỳ UID' },
            { icon: 'user_check' as IconType, feat: 'Chấp nhận kết bạn', desc: 'Auto-accept friend request' },
            { icon: 'x' as IconType, feat: 'Từ chối kết bạn', desc: 'Auto-reject friend request' },
            { icon: 'user_plus' as IconType, feat: 'Gửi lời mời kết bạn', desc: 'Gửi FR đến UID hoặc SĐT' },
            { icon: 'users' as IconType, feat: 'Thêm vào nhóm', desc: 'Thêm UID vào nhóm Zalo' },
            { icon: 'trash' as IconType, feat: 'Xóa khỏi nhóm', desc: 'Kick thành viên ra khỏi nhóm' },
            { icon: 'bell_off' as IconType, feat: 'Tắt thông báo', desc: 'Mute/unmute một hội thoại' },
            { icon: 'reply' as IconType, feat: 'Chuyển tiếp tin', desc: 'Forward tin nhắn sang hội thoại khác' },
            { icon: 'trash' as IconType, feat: 'Thu hồi tin nhắn', desc: 'Undo/unsend tin vừa gửi' },
            { icon: 'chart' as IconType, feat: 'Tạo bình chọn', desc: 'Tạo poll trong nhóm Zalo' },
            { icon: 'history' as IconType, feat: 'Lấy lịch sử chat', desc: 'Đọc N tin nhắn gần nhất' },
            { icon: 'smile' as IconType, feat: 'Thêm cảm xúc', desc: 'React emoji vào tin nhắn' },
          ].map((f, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg px-2.5 py-1.5 flex items-start gap-2">
              <AppIcon name={f.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{f.feat}</p>
                <p className="text-gray-500 text-[11px]">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🟡 Logic — Điều kiện & Điều khiển luồng</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">IF điều kiện</strong> — rẽ nhánh True/False dựa trên giá trị biến, nội dung tin nhắn',
          '<strong class="text-gray-200">Switch nhiều nhánh</strong> — xử lý nhiều case khác nhau trong một node',
          '<strong class="text-gray-200">Chờ N giây (Delay)</strong> — dừng workflow trong khoảng thời gian cấu hình',
          '<strong class="text-gray-200">Lưu biến</strong> — lưu dữ liệu vào biến để dùng ở các bước sau',
          '<strong class="text-gray-200">Dừng nếu (Stop If)</strong> — kết thúc workflow khi thỏa điều kiện nhất định',
          '<strong class="text-gray-200">Vòng lặp forEach</strong> — lặp qua danh sách và xử lý từng phần tử',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🟢 Tích hợp Google Sheets</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Ghi thêm dòng</strong> — Append dữ liệu mới vào cuối sheet (lưu lead, đơn hàng...)',
          '<strong class="text-gray-200">Đọc dữ liệu</strong> — Đọc giá trị các ô để dùng làm điều kiện hoặc nội dung tin',
          '<strong class="text-gray-200">Cập nhật ô</strong> — Ghi đè giá trị vào ô cụ thể trong sheet',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🟣 AI</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Tạo nội dung AI</strong> — Sinh câu trả lời, tóm tắt, viết lại nội dung bằng GPT với prompt tùy chỉnh',
          '<strong class="text-gray-200">Phân loại văn bản</strong> — Phân tích ý định hoặc cảm xúc của tin nhắn (mua hàng / hỏi giá / khiếu nại...)',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🟠 Thông báo & Tích hợp ngoài</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Gửi Telegram Bot</strong> — Nhận cảnh báo hoặc báo cáo ngay trên Telegram',
          '<strong class="text-gray-200">Gửi Discord</strong> — Đẩy thông báo vào kênh Discord của nhóm',
          '<strong class="text-gray-200">Gửi Email (SMTP)</strong> — Gửi email tự động qua tài khoản SMTP cấu hình sẵn',
          '<strong class="text-gray-200">Ghi vào Notion DB</strong> — Tạo record mới trong Notion Database',
          '<strong class="text-gray-200">HTTP Request</strong> — Gọi bất kỳ API ngoài (webhook, REST API, n8n...)',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚠️ Lưu ý khi dùng Workflow</SectionTitle>
        <BulletList items={[
          'Workflow chạy hoàn toàn cục bộ — app phải đang chạy thì workflow mới hoạt động',
          'Dùng node <strong class="text-gray-200">Chờ N giây</strong> giữa các tin nhắn để tránh Zalo rate-limit',
          'Tab <strong class="text-gray-200">Lịch sử chạy</strong> ghi lại toàn bộ log thực thi để debug dễ dàng',
          'Có thể test workflow bằng Trigger thủ công trước khi bật chính thức',
        ]} />
      </Card>
    </div>
  );
}

function IntegrationPOSPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>🛒 Tích hợp POS / Bán hàng</SectionTitle>
        <Paragraph>
          Kết nối Zagi với phần mềm quản lý bán hàng (POS) cho phép tra cứu đơn hàng, khách hàng, sản phẩm
          ngay trong khung chat Zalo — không cần chuyển qua lại giữa các ứng dụng.
          Bạn cũng có thể tạo đơn hàng trực tiếp từ hội thoại hoặc tự động hoá qua Workflow.
        </Paragraph>
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
          <AppIcon name="sparkles" className="text-amber-500 flex-shrink-0" size={14} />
          <p className="text-gray-300 text-xs font-medium">Sau khi kết nối, các nút tra cứu nhanh sẽ xuất hiện trong Quick Panel bên phải khung chat.</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>📋 Các nền tảng POS hỗ trợ</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: 'integration' as IconType, name: 'KiotViet', desc: 'Tra cứu đơn hàng, khách hàng, sản phẩm. Tạo đơn hàng từ chat hoặc workflow.', setup: 'Cần Client ID, Client Secret, Retailer Name từ KiotViet Admin.' },
            { icon: 'workspace' as IconType, name: 'Haravan', desc: 'Quản lý đơn hàng, kho, khách hàng TMĐT. Tra cứu theo SĐT ngay trong chat.', setup: 'Dùng API Token từ Haravan Custom App hoặc API Key legacy.' },
            { icon: 'check' as IconType, name: 'Sapo', desc: 'Bán hàng đa kênh. Tra cứu đơn, khách hàng, sản phẩm Sapo.', setup: 'Cần API Key + Secret Key + Store Domain từ Sapo.' },
            { icon: 'zap' as IconType, name: 'Nhanh.vn', desc: 'Quản lý đơn hàng, kho, khách hàng đa kênh.', setup: 'Cần App ID, Business ID, Access Token v3.' },
            { icon: 'coffee' as IconType, name: 'Pancake POS', desc: 'Quản lý đơn hàng, tra cứu và tạo đơn trong chat.', setup: 'Cần API Key và Shop ID từ Pancake.' },
          ].map((p, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-2.5 flex items-start gap-2">
              <AppIcon name={p.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{p.name}</p>
                <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🔧 Hướng dẫn kết nối POS</SectionTitle>
        <StepList steps={[
          { title: 'Mở Công cụ → Tích hợp', desc: 'Vào sidebar chọn <strong class="text-gray-200">Công cụ → Tích hợp</strong>, chọn tab <strong class="text-gray-200">POS / Bán hàng</strong>.' },
          { title: 'Chọn nền tảng POS', desc: 'Nhấn vào nền tảng bạn đang dùng (KiotViet, Haravan, Sapo...).' },
          { title: 'Nhập thông tin xác thực', desc: 'Điền API Key, Token hoặc các thông tin được yêu cầu. Có thể lấy từ trang quản trị của nền tảng đó.' },
          { title: 'Test kết nối', desc: 'Nhấn <strong class="text-gray-200">"Test kết nối"</strong> để kiểm tra thông tin có hợp lệ không.' },
          { title: 'Bật tích hợp', desc: 'Bật trạng thái tích hợp. Ngay lập tức có thể dùng trong chat hoặc Workflow.' },
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚡ Tính năng sau khi kết nối POS</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: 'search' as IconType, name: 'Tra cứu đơn hàng', desc: 'Nhập mã đơn hoặc SĐT khách → thông tin đơn hàng hiện ra ngay trong chat.' },
            { icon: 'accounts' as IconType, name: 'Tra cứu khách hàng', desc: 'Xem lịch sử mua hàng, tổng chi tiêu, công nợ của khách.' },
            { icon: 'storage' as IconType, name: 'Tra cứu sản phẩm', desc: 'Tìm sản phẩm theo tên/mã — hiển thị giá, tồn kho, hình ảnh.' },
            { icon: 'plus' as IconType, name: 'Tạo đơn hàng', desc: 'Tạo đơn hàng mới cho khách ngay trong hội thoại Zalo.' },
            { icon: 'tools' as IconType, name: 'Tích hợp Workflow', desc: 'Workflow tự động tra cứu thông tin khi nhận tin nhắn từ khách.' },
            { icon: 'sync' as IconType, name: 'Đồng bộ dữ liệu', desc: 'Dữ liệu đơn hàng, khách hàng đồng bộ realtime từ POS.' },
          ].map((f, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-2.5 flex items-start gap-2">
              <AppIcon name={f.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{f.name}</p>
                <p className="text-gray-500 text-[11px] mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🔁 Ví dụ: Workflow với POS</SectionTitle>
        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-1.5">
          <p className="text-gray-200 text-[11px] font-semibold flex items-center gap-1">
            <AppIcon name="layers" size={10} className="text-blue-400" />
            Khi khách nhắn "Kiểm tra đơn hàng"
          </p>
          <BulletList items={[
            '<strong class="text-gray-200">Trigger:</strong> Tin nhắn mới chứa từ khóa "đơn hàng"',
            '<strong class="text-gray-200">Action 1:</strong> Tra cứu đơn hàng POS theo SĐT khách',
            '<strong class="text-gray-200">Action 2:</strong> Gửi tin nhắn kết quả (mã đơn, trạng thái, ngày giao)',
            '<strong class="text-gray-200">Action 3 (tuỳ chọn):</strong> Ghi log vào Google Sheets',
          ]} />
        </div>
      </Card>

      <Card>
        <SectionTitle>⚠️ Lưu ý</SectionTitle>
        <BulletList items={[
          'API Key và credential cần lấy từ trang quản trị của nền tảng POS tương ứng',
          'Mỗi nền tảng có giới hạn rate-limit riêng — không gọi API quá nhiều lần trong thời gian ngắn',
          'Nếu kết nối thất bại, kiểm tra lại credential và thử "Test kết nối" trước khi bật',
        ]} />
      </Card>
    </div>
  );
}

function IntegrationPaymentPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>💳 Tích hợp Thanh toán — Tự động xác nhận chuyển khoản</SectionTitle>
        <Paragraph>
          Kết nối Zagi với các cổng thanh toán để nhận thông báo ngay khi có giao dịch chuyển khoản vào tài khoản ngân hàng.
          Kết hợp Workflow để tự động xác nhận đơn hàng, gửi tin cảm ơn và kích hoạt các bước chăm sóc tiếp theo —
          không cần ngồi kiểm tra sao kê thủ công.
        </Paragraph>
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
          <AppIcon name="sparkles" className="text-amber-500 flex-shrink-0" size={14} />
          <p className="text-gray-300 text-xs font-medium">Kết hợp Tunnel công khai để nhận webhook thanh toán từ bên ngoài mà không cần VPS.</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>📋 Các nền tảng thanh toán hỗ trợ</SectionTitle>
        <div className="space-y-2">
          {[
            { icon: 'credit_card' as IconType, name: 'Casso', desc: 'Nền tảng tổng hợp giao dịch VietQR hàng đầu. Nhận webhook realtime khi có chuyển khoản vào bất kỳ ngân hàng nào.', setup: 'Casso API Key (lấy từ Casso Dashboard). Webhook Secret (tuỳ chọn).' },
            { icon: 'payment' as IconType, name: 'SePay', desc: 'Giải pháp webhook thanh toán. Tự động phát hiện giao dịch chuyển khoản và gửi thông báo.', setup: 'SePay API Key + Webhook Secret Key.' },
          ].map((p, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <AppIcon name={p.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
                <div>
                  <p className="text-gray-200 text-[11px] font-medium">{p.name}</p>
                  <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed">{p.desc}</p>
                  <div className="bg-gray-800/60 rounded px-2 py-1 mt-1.5">
                    <p className="text-gray-400 text-[10px]">
                      <strong className="text-gray-300">Cấu hình:</strong> {p.setup}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🔧 Hướng dẫn kết nối thanh toán</SectionTitle>
        <StepList steps={[
          { title: 'Lấy API Key từ nền tảng', desc: 'Vào Casso Dashboard hoặc SePay Dashboard → Tạo API Key mới. Copy key vào clipboard.' },
          { title: 'Mở Công cụ → Tích hợp', desc: 'Chọn tab <strong class="text-gray-200">Thanh toán</strong> → Nhấn vào Casso hoặc SePay.' },
          { title: 'Dán API Key', desc: 'Dán API Key vào trường tương ứng. Nhấn <strong class="text-gray-200">"Lưu"</strong>.' },
          { title: '(Quan trọng) Bật Tunnel', desc: 'Webhook cần URL công khai. Trong màn hình tích hợp, nhấn <strong class="text-gray-200">"Mở Tunnel"</strong> để tạo URL dạng https://xxx.trycloudflare.com.' },
          { title: 'Cấu hình Webhook', desc: 'Copy URL tunnel + path webhook (VD: https://xxx.trycloudflare.com/webhook/casso) → dán vào Casso/SePay Webhook URL.' },
          { title: 'Test thử', desc: 'Chuyển khoản 1.000đ vào tài khoản để kiểm tra. Nếu thấy thông báo trong app → thành công.' },
        ]} />
      </Card>

      <Card>
        <SectionTitle>🔁 Ví dụ: Workflow với thanh toán</SectionTitle>
        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-1.5">
          <p className="text-gray-200 text-[11px] font-semibold flex items-center gap-1">
            <AppIcon name="layers" size={10} className="text-blue-400" />
            Khi nhận được chuyển khoản
          </p>
          <BulletList items={[
            '<strong class="text-gray-200">Trigger:</strong> Webhook thanh toán (Casso/SePay)',
            '<strong class="text-gray-200">Action 1:</strong> Tra cứu đơn hàng POS theo nội dung chuyển khoản',
            '<strong class="text-gray-200">Action 2:</strong> Cập nhật trạng thái đơn → "Đã thanh toán"',
            '<strong class="text-gray-200">Action 3:</strong> Gửi tin nhắn xác nhận + cảm ơn khách hàng',
            '<strong class="text-gray-200">Action 4:</strong> Tạo đơn vận chuyển (GHN/GHTK) nếu khách yêu cầu giao hàng',
          ]} />
        </div>
      </Card>

      <Card>
        <SectionTitle>🌐 Tunnel là gì và tại sao cần?</SectionTitle>
        <Paragraph>
          Zagi chạy webhook server trên máy tính cá nhân (cục bộ). Để Casso/SePay có thể gửi webhook đến máy bạn,
          máy cần có một địa chỉ công khai trên Internet. Tunnel (Cloudflare Quick Tunnel) tạo một URL công khai
          tạm thời trỏ về máy bạn — <strong className="text-white font-semibold">không cần VPS, không cần cấu hình router</strong>.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">URL mẫu:</strong> https://random-name.trycloudflare.com',
          '<strong class="text-gray-200">Lưu ý:</strong> URL thay đổi mỗi lần bật lại Tunnel — cần cập nhật trong Casso/SePay',
          '<strong class="text-gray-200">Bảo mật:</strong> Chỉ dùng cho webhook, không ảnh hưởng đến dữ liệu khác',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚠️ Lưu ý</SectionTitle>
        <BulletList items={[
          'App phải đang chạy thì webhook mới hoạt động — tắt app là webhook không nhận được',
          'Mỗi lần khởi động lại app, cần bật lại Tunnel (nếu đã tắt trước đó)',
          'Nếu không nhận được webhook, kiểm tra: Tunnel đã bật chưa, URL đã cấu hình đúng chưa',
          'Dùng riêng mỗi nền tảng một webhook path riêng (VD: /webhook/casso, /webhook/sepay)',
        ]} />
      </Card>
    </div>
  );
}

function IntegrationShippingPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>📦 Tích hợp Vận chuyển — Tạo & Tra cứu vận đơn tự động</SectionTitle>
        <Paragraph>
          Kết nối Zagi với các đơn vị vận chuyển để tạo đơn giao hàng, tra cứu trạng thái vận đơn
          ngay trong hội thoại Zalo. Khi khách hỏi "đơn hàng tới đâu rồi?", Workflow tự động tra cứu và trả lời —
          không cần copy tracking ID qua các tab trình duyệt.
        </Paragraph>
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
          <AppIcon name="sparkles" className="text-amber-500 flex-shrink-0" size={14} />
          <p className="text-gray-300 text-xs font-medium">Tích hợp vận chuyển hoạt động tốt nhất khi kết hợp với POS để tự động tạo đơn giao sau khi xác nhận thanh toán.</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>📋 Các đơn vị vận chuyển hỗ trợ</SectionTitle>
        <div className="space-y-2">
          {[
            { icon: 'storage' as IconType, name: 'GHN Express', desc: 'Giao Hàng Nhanh — tạo đơn, tra cứu vận đơn, tính phí giao hàng.', token: 'Token GHN + Shop ID', note: 'Hỗ trợ Sandbox để test thử trước khi dùng thật.' },
            { icon: 'truck' as IconType, name: 'GHTK', desc: 'Giao Hàng Tiết Kiệm — tạo đơn, tra cứu trạng thái giao hàng.', token: 'GHTK API Token', note: 'Phù hợp đơn hàng giá trị thấp, giao hàng tiết kiệm.' },
          ].map((p, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <AppIcon name={p.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
                <div>
                  <p className="text-gray-200 text-[11px] font-medium">{p.name}</p>
                  <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed">{p.desc}</p>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className="bg-gray-800/60 text-gray-400 text-[10px] px-2 py-0.5 rounded">{p.token}</span>
                    <span className="bg-gray-800/60 border border-gray-750 text-gray-300 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"><AppIcon name="sparkles" className="text-amber-500" size={10} /> {p.note}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🔧 Hướng dẫn kết nối vận chuyển</SectionTitle>
        <StepList steps={[
          { title: 'Lấy Token từ đơn vị vận chuyển', desc: 'Đăng nhập GHN/GHTK → Quản lý API → Tạo Token mới. Copy Token + Shop ID.' },
          { title: 'Mở Công cụ → Tích hợp', desc: 'Chọn tab <strong class="text-gray-200">Vận chuyển</strong> → Nhấn GHN hoặc GHTK.' },
          { title: 'Nhập Token và cấu hình', desc: 'Dán Token và Shop ID vào các trường. Với GHN, chọn môi trường Production hoặc Sandbox.' },
          { title: 'Test kết nối', desc: 'Nhấn "Test" — nếu thành công, hệ thống sẽ trả về thông tin shop của bạn.' },
          { title: 'Bật tích hợp', desc: 'Bật trạng thái → đã sẵn sàng tạo đơn và tra cứu từ chat và Workflow.' },
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚡ Tính năng sau khi kết nối</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: 'file_text' as const, name: 'Tạo vận đơn', desc: 'Nhập thông tin giao hàng → tạo đơn ngay trong chat.' },
            { icon: 'search' as const, name: 'Tra cứu vận đơn', desc: 'Nhập mã vận đơn → xem trạng thái, lịch trình giao hàng.' },
            { icon: 'credit_card' as const, name: 'Tính phí giao hàng', desc: 'Tính trước phí vận chuyển dựa trên địa chỉ, trọng lượng.' },
            { icon: 'shuffle' as const, name: 'Workflow tự động', desc: 'Tự động tạo đơn vận chuyển sau khi xác nhận thanh toán.' },
          ].map((f, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-2.5">
              <p className="text-gray-200 text-[11px] font-medium flex items-center gap-1.5">
                <AppIcon name={f.icon} className="text-blue-500" size={12} />
                {f.name}
              </p>
              <p className="text-gray-500 text-[11px] mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🔁 Ví dụ: Workflow vận chuyển</SectionTitle>
        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-1.5">
          <p className="text-gray-200 text-[11px] font-semibold flex items-center gap-1">
            <AppIcon name="layers" size={10} className="text-blue-400" />
            Khi khách hỏi "Đơn hàng tới đâu rồi?"
          </p>
          <BulletList items={[
            '<strong class="text-gray-200">Trigger:</strong> Tin nhắn chứa "đơn hàng", "shipping", "giao hàng"',
            '<strong class="text-gray-200">Action 1:</strong> Tra cứu đơn hàng POS theo SĐT khách → lấy mã vận đơn',
            '<strong class="text-gray-200">Action 2:</strong> Tra cứu vận đơn GHN/GHTK theo mã vận đơn',
            '<strong class="text-gray-200">Action 3:</strong> Gửi kết quả: "Đơn hàng đang ở [trạng thái] — dự kiến giao [ngày]"',
          ]} />
        </div>
      </Card>

      <Card>
        <SectionTitle>⚠️ Lưu ý</SectionTitle>
        <BulletList items={[
          'Nên dùng môi trường Sandbox của GHN để test trước khi chuyển sang Production',
          'Token GHN/GHTK có thể hết hạn — cần refresh định kỳ nếu gặp lỗi xác thực',
          'Phí giao hàng là ước tính — phí thực tế có thể thay đổi dựa trên cân nặng/kích thước thực tế',
        ]} />
      </Card>
    </div>
  );
}

function AIAssistantPanel() {
  const setBugReportOpen = useAppStore(s => s.setBugReportOpen);
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>🤖 Trợ lý AI — Tăng tốc chăm sóc khách hàng</SectionTitle>
        <Paragraph>
          Trợ lý AI trong Zagi cho phép bạn tạo nhiều chatbot AI với tính cách, prompt và mục đích khác nhau.
          Mỗi trợ lý có thể được gán cho một hội thoại cụ thể hoặc dùng trong Workflow để tự động trả lời tin nhắn.
        </Paragraph>
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2">
          <span className="text-blue-400 text-sm flex-shrink-0">✨</span>
          <p className="text-blue-300 text-xs font-medium">Hỗ trợ đa dạng model: GPT, Gemini, Claude, Deepseek,... tuỳ chọn theo nhu cầu và ngân sách.</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>📋 Tính năng Trợ lý AI</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: 'accounts' as IconType, name: 'Đa trợ lý', desc: 'Tạo nhiều trợ lý với prompt riêng — mỗi trợ lý phục vụ mục đích khác nhau.' },
            { icon: 'conversation' as IconType, name: 'Chat trong hội thoại', desc: 'Gán trợ lý vào hội thoại — AI tự động hỗ trợ khi có tin nhắn mới.' },
            { icon: 'tools' as IconType, name: 'Workflow node AI', desc: 'Node AI trong Workflow: tạo nội dung, phân loại tin nhắn, tóm tắt hội thoại.' },
            { icon: 'chart' as IconType, name: 'Báo cáo sử dụng', desc: 'Theo dõi token, request, chi phí ước tính theo từng trợ lý.' },
            { icon: 'zap' as IconType, name: 'Nhiều model', desc: 'GPT, Gemini, Claude, Deepseek, Claude — chọn model phù hợp.' },
            { icon: 'edit' as IconType, name: 'Custom Prompt', desc: 'Viết prompt tùy chỉnh cho từng trợ lý — định hình phong cách trả lời.' },
          ].map((f, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-2.5 flex items-start gap-2">
              <AppIcon name={f.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{f.name}</p>
                <p className="text-gray-500 text-[11px] mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🔧 Hướng dẫn sử dụng Trợ lý AI</SectionTitle>
        <StepList steps={[
          { title: 'Cấu hình API Key', desc: 'Vào <strong class="text-gray-200">Cài đặt → AI Assistant</strong> — nhập API Key của OpenAI hoặc Gemini.' },
          { title: 'Tạo trợ lý', desc: 'Nhấn <strong class="text-gray-200">"Tạo trợ lý mới"</strong> → đặt tên, viết prompt mô tả tính cách và nhiệm vụ.' },
          { title: 'Chọn model', desc: 'Chọn model AI phù hợp (GPT-4o nhanh & rẻ, GPT-4o-chính xác cho nghiệp vụ phức tạp).' },
          { title: 'Gán vào hội thoại', desc: 'Mở hội thoại Zalo → nhấn icon AI → chọn trợ lý muốn dùng. AI sẽ đề xuất câu trả lời.' },
          { title: 'Dùng trong Workflow', desc: 'Tạo Workflow → thêm node AI → chọn trợ lý + prompt → kết nối với các node khác.' },
        ]} />
      </Card>

      <div className="border-t border-gray-700/50 pt-4">
        <div className="flex items-start gap-3 mb-4">
          <AppIcon name="ai" className="text-blue-500 flex-shrink-0" size={40} />
          <div>
            <h3 className="text-white font-bold text-base">Tích hợp 9Router — Proxy AI giá rẻ & miễn phí</h3>
            <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
              9Router là dịch vụ proxy API AI cho phép bạn gọi các model GPT, Claude, Gemini với giá rẻ hơn so với gọi trực tiếp
              từ nhà cung cấp - Một số model miễn phí phù hợp với nhu cầu cơ bản. Chạy trên máy local, quản lý API key tập trung, tự động luân chuyển key và giảm chi phí.
            </p>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <Badge text="Tiết kiệm chi phí" color="bg-green-600/30 text-green-300" />
              <Badge text="Local Proxy" color="bg-blue-600/30 text-blue-300" />
              <Badge text="Đa provider" color="bg-purple-600/30 text-purple-300" />
            </div>
          </div>
        </div>

        <Card>
          <SectionTitle>🎯 Tại sao dùng 9Router với Zagi?</SectionTitle>
          <BulletList items={[
            '<strong class="text-gray-200">Giảm 30-50% chi phí AI</strong> — 9Router tự động chọn provider rẻ nhất cho mỗi request',
            '<strong class="text-gray-200">Quản lý tập trung</strong> — Một API key duy nhất cho tất cả model, quên chuyện key hết hạn hay leak key',
            '<strong class="text-gray-200">Tự động fallback</strong> — Provider A lỗi → tự động chuyển sang provider B, không gián đoạn',
            '<strong class="text-gray-200">Hỗ trợ đa model</strong> — GPT, Claude, Gemini, DeepSeek, Qwen... — tất cả qua một endpoint',
          ]} />
        </Card>

        <Card>
          <SectionTitle>📦 Cài đặt 9Router</SectionTitle>
          <div className="space-y-2 mb-3">
            <div className="bg-gray-900/60 border border-blue-700/40 rounded-lg p-3 space-y-2">
              <p className="text-gray-200 text-xs font-semibold">⚡ Hướng dẫn nhanh — 2 lệnh trong Terminal:</p>
              <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-2.5 font-mono text-xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-900/40 text-green-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                  <code className="text-green-400">npm install -g 9router</code>
                  <span className="text-gray-500 text-[10px]">← Cài đặt 9Router</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-900/40 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                  <code className="text-blue-400">9router</code>
                  <span className="text-gray-500 text-[10px]">← Chạy 9Router (giữ cửa sổ Terminal mở)</span>
                </div>
              </div>
              <p className="text-gray-500 text-[10px]">
                Sau khi chạy, Dashboard mở tại <strong className="text-gray-400">http://localhost:20128</strong>
              </p>
            </div>
          </div>
          <StepList steps={[
            { title: 'Cài Node.js (nếu chưa có)', desc: 'Tải và cài Node.js phiên bản 18+ từ <strong class="text-gray-200">https://nodejs.org</strong>. Kiểm tra: <code style={{color:"#86efac",background:"#1f2937",padding:"1px 5px",borderRadius:"3px"}}>node -v</code>' },
            { title: 'Cài đặt 9Router', desc: 'Mở Terminal (CMD/PowerShell) và chạy: <code style={{color:"#86efac",background:"#1f2937",padding:"1px 5px",borderRadius:"3px"}}>npm install -g 9router</code>' },
            { title: 'Chạy 9Router', desc: 'Sau khi cài xong, gõ lệnh: <code style={{color:"#86efac",background:"#1f2937",padding:"1px 5px",borderRadius:"3px"}}>9router</code> — giữ Terminal chạy nền.' },
            { title: 'Kết nối Provider', desc: 'Mở Dashboard tại <strong class="text-gray-200">http://localhost:20128</strong> → Settings → Add Provider → nhập API Key (OpenAI, Claude, Gemini...).' },
            { title: 'Dùng trong Zagi', desc: 'Vào <strong class="text-gray-200">Cài đặt → Giới thiệu → Trợ lý AI</strong> hoặc <strong class="text-gray-200">Tích hợp → Trợ lý AI</strong>, chọn nền tảng <strong class="text-gray-200">9Router</strong> và chọn model miễn phí.' },
          ]} />
        </Card>

        <Card>
          <SectionTitle>🖼️ Hướng dẫn chi tiết các bước setup 9Router FREE</SectionTitle>
          <div className="space-y-3">
            {/* Step 1 */}
            <div className="bg-gray-900/40 border border-gray-700/60 rounded-xl p-3.5 flex items-start gap-3.5 hover:border-blue-700/50 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-blue-900/50 border border-blue-700/40 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0 group-hover:bg-blue-800/50 group-hover:border-blue-600/50 transition-colors">1</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-200 text-xs font-semibold">Mở Terminal</span>
                  <span className="text-[10px] text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded-full">CMD / PowerShell</span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  Nhấn <strong className="text-gray-300">Win + R</strong> → gõ <strong className="text-gray-300">cmd</strong> → Enter.
                  Hoặc chuột phải Start → <strong className="text-gray-300">Terminal</strong>.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-gray-900/40 border border-gray-700/60 rounded-xl p-3.5 flex items-start gap-3.5 hover:border-blue-700/50 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-blue-900/50 border border-blue-700/40 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0 group-hover:bg-blue-800/50 group-hover:border-blue-600/50 transition-colors">2</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-200 text-xs font-semibold">Cài đặt 9Router</span>
                  <span className="text-[10px] text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded-full">npm</span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed mb-1.5">
                  Copy và paste dòng sau vào Terminal, nhấn <strong className="text-gray-300">Enter</strong>:
                </p>
                <div className="bg-gray-900/80 rounded-lg px-3 py-2 border border-gray-700/60">
                  <code className="text-green-400 text-xs font-mono select-all">npm install -g 9router</code>
                </div>
                <p className="text-gray-500 text-[10px] mt-1">Đợi ~10-30s cho đến khi thấy dòng <code className="text-gray-400">added X packages</code></p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-gray-900/40 border border-gray-700/60 rounded-xl p-3.5 flex items-start gap-3.5 hover:border-blue-700/50 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-blue-900/50 border border-blue-700/40 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0 group-hover:bg-blue-800/50 group-hover:border-blue-600/50 transition-colors">3</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-200 text-xs font-semibold">Chạy 9Router</span>
                  <span className="text-[10px] text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded-full">startup</span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed mb-1.5">
                  Gõ lệnh sau và nhấn <strong className="text-gray-300">Enter</strong>:
                </p>
                <div className="bg-gray-900/80 rounded-lg px-3 py-2 border border-gray-700/60">
                  <code className="text-blue-400 text-xs font-mono select-all">9router</code>
                </div>
                <p className="text-gray-500 text-[10px] mt-1">
                  ⏳ Lần đầu chạy có thể hơi lâu — đợi đến khi thấy <strong className="text-gray-400">Dashboard ready at http://localhost:20128</strong>
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-gray-900/40 border border-gray-700/60 rounded-xl p-3.5 flex items-start gap-3.5 hover:border-blue-700/50 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-blue-900/50 border border-blue-700/40 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0 group-hover:bg-blue-800/50 group-hover:border-blue-600/50 transition-colors">4</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-200 text-xs font-semibold">Cấu hình trong Zagi</span>
                  <span className="text-[10px] text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full">done ✅</span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  Vào <strong className="text-gray-300">Cài đặt → Giới thiệu → Trợ lý AI</strong> (hoặc <strong className="text-gray-300">Tích hợp → Trợ lý AI</strong>), tạo trợ lý mới,
                  chọn nền tảng <strong className="text-blue-400">9Router</strong>, chọn model FREE như <strong className="text-gray-300">kr/claude-sonnet-4.5</strong> hoặc <strong className="text-gray-300">oc/deepseek-v4-flash-free</strong>,
                  API Key nhập bất kỳ → Lưu → Test. 🎉
                </p>
              </div>
            </div>
          </div>

          {/* Issue #31 reference */}
          <div className="mt-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <AppIcon name="sparkles" className="text-blue-400 flex-shrink-0 mt-0.5" size={14} />
              <div>
                <p className="text-blue-300 text-[11px] font-semibold">Model tự động đồng bộ từ 9Router</p>
                <p className="text-gray-400 text-[10px] leading-relaxed mt-0.5">
                  Sau khi kết nối thành công, danh sách model trong Zagi sẽ tự động cập nhật theo các provider bạn đã thêm vào 9Router.
                  Nếu có model mới xuất hiện trong Dashboard 9Router, bạn chỉ cần reload trang Zagi để thấy — không cần cấu hình thêm.{' '}
                  <button
                    onClick={() => setBugReportOpen(true)}
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 inline-flex items-center gap-0.5"
                  >
                    Theo dõi issue #31 →
                  </button>
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>🔧 Cấu hình trong Zagi</SectionTitle>
          <Paragraph>
            Sau khi đã cài đặt và chạy 9Router, cấu hình Zagi để sử dụng 9Router làm proxy AI:
          </Paragraph>
          <div className="mt-2 space-y-2">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3">
              <p className="text-gray-200 text-[11px] font-semibold mb-1.5">Cách 1: Dùng Platform 9Router</p>
              <BulletList items={[
                'Vào <strong class="text-gray-200">Cài đặt → AI Assistant</strong>',
                'Mục <strong class="text-gray-200">"Nền tảng AI"</strong> → chọn <strong class="text-gray-200">9Router</strong>',
                'API Base URL tự động điền: <strong class="text-gray-200">http://localhost:20128/v1</strong>',
                'API Key: nhập bất kỳ giá trị gì (9Router không yêu cầu key xác thực cục bộ)',
              ]} />
            </div>
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3">
              <p className="text-gray-200 text-[11px] font-semibold mb-1.5">Cách 2: Dùng Custom Base URL</p>
              <BulletList items={[
                'Vào <strong class="text-gray-200">Cài đặt → AI Assistant</strong>',
                'Chọn <strong class="text-gray-200">"OpenAI Compatible"</strong>',
                'Nhập Base URL: <strong class="text-gray-200">http://localhost:20128/v1</strong>',
                'API Key: nhập bất kỳ (VD: "9router-key")',
                'Model: nhập tên model bạn muốn dùng (VD: gpt-4o-mini, claude-3-haiku)',
              ]} />
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>📋 Danh sách model 9Router thường dùng</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {[
              { color: 'bg-green-500', name: 'gpt-4o-mini', cost: 'Rẻ nhất', note: 'Chat cơ bản, CSKH' },
              { color: 'bg-yellow-500', name: 'gpt-4o', cost: 'Trung bình', note: 'Tư vấn bán hàng' },
              { color: 'bg-indigo-500', name: 'gpt-4o-chatgptselect', cost: 'Rẻ', note: 'Từ ChatGPT Plus' },
              { color: 'bg-red-500', name: 'claude-3-haiku', cost: 'Rẻ', note: 'Phân tích nhanh' },
              { color: 'bg-blue-500', name: 'claude-3.5-sonnet', cost: 'Cao', note: 'Nghiệp vụ phức tạp' },
              { color: 'bg-amber-600', name: 'gemini-2.0-flash', cost: 'Rất rẻ', note: 'Đa phương tiện' },
              { color: 'bg-gray-350', name: 'deepseek-chat', cost: 'Rất rẻ', note: 'Code, logic' },
              { color: 'bg-orange-500', name: 'qwen2.5-72b', cost: 'Rẻ', note: 'Tiếng Trung, đa năng' },
            ].map((m, i) => (
              <div key={i} className="bg-gray-700/30 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-gray-200 text-[11px] font-medium font-mono flex items-center">
                    <span className={`w-2 h-2 rounded-full inline-block mr-1.5 ${m.color}`} />
                    {m.name}
                  </p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    m.cost === 'Rất rẻ' || m.cost === 'Rẻ nhất' ? 'bg-green-900/40 text-green-400' :
                    m.cost === 'Cao' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'
                  }`}>{m.cost}</span>
                </div>
                <p className="text-gray-500 text-[10px] mt-0.5">{m.note}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>💡 Mẹo & Lưu ý</SectionTitle>
          <BulletList items={[
            '<strong class="text-gray-200">9Router phải chạy cùng lúc với Zagi</strong> — nếu tắt 9Router, AI request qua 9Router sẽ thất bại',
            '<strong class="text-gray-200">Dashboard 9Router</strong> mở tại <strong class="text-gray-200">http://localhost:20128</strong> — theo dõi request, chi phí, provider health',
            '<strong class="text-gray-200">Tự động chạy cùng Windows:</strong> Thêm 9Router vào startup (Task Scheduler) để không phải chạy thủ công mỗi lần',
            '<strong class="text-gray-200">Nạp key nhiều provider:</strong> Càng nhiều provider, 9Router càng tối ưu được giá và fallback khi có lỗi',
            '<strong class="text-gray-200">Kiểm tra kết nối:</strong> Sau khi cấu hình, dùng thử AI Assistant trong Zagi để xác nhận hoạt động',
          ]} />
        </Card>

        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('nav:settings', { detail: { tab: 'introduction', subtab: 'ai-assistant' } }));
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Cấu hình AI Assistant →
          </button>
          <button
            onClick={() => ipc.shell?.openExternal('http://localhost:20128')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors"
          >
            Mở Dashboard 9Router
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>📈 Báo cáo & Phân tích — Nắm bắt toàn diện hoạt động</SectionTitle>
        <Paragraph>
          Trang Báo cáo tổng hợp mọi dữ liệu hoạt động trên Zalo thành biểu đồ trực quan,
          giúp bạn đánh giá hiệu quả kinh doanh, chăm sóc khách hàng và Tự động hoá.
        </Paragraph>
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2">
          <AppIcon name="analytics" className="text-blue-400 flex-shrink-0" size={14} />
          <p className="text-blue-300 text-xs font-medium">Truy cập: Sidebar → Báo cáo — hoặc nhấn icon biểu đồ trên thanh điều hướng.</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>🎛️ Bộ lọc dữ liệu linh hoạt</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Chọn tài khoản:</strong> Xem báo cáo cho từng tài khoản Zalo riêng lẻ hoặc tất cả cùng lúc',
          '<strong class="text-gray-200">Khoảng thời gian:</strong> Hôm nay · Hôm qua · 7 ngày · 30 ngày · 90 ngày · Tuỳ chọn ngày bắt đầu — kết thúc',
          '<strong class="text-gray-200">Loại liên hệ:</strong> Tất cả · Cá nhân · Nhóm — lọc riêng để phân tích từng nhóm đối tượng',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📊 Tab Tổng quan</SectionTitle>
        <Paragraph>
          Bảng KPI tổng hợp — nhìn nhanh mọi chỉ số quan trọng trong một màn hình.
        </Paragraph>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {[
            { icon: 'conversation' as IconType, kpi: 'Tin nhắn hôm nay', desc: 'Gửi & nhận, so sánh hôm qua' },
            { icon: 'reply' as IconType, kpi: 'Tổng tin nhắn', desc: 'Toàn kỳ, chia gửi/nhận' },
            { icon: 'users' as IconType, kpi: 'Liên hệ & Nhóm', desc: 'Tổng bạn bè, nhóm Zalo' },
            { icon: 'sparkles' as IconType, kpi: 'Chiến dịch', desc: 'Tổng & đang chạy' },
            { icon: 'users' as IconType, kpi: 'Lời mời kết bạn', desc: 'Gửi & nhận trong kỳ' },
            { icon: 'zap' as IconType, kpi: 'Workflow', desc: 'Số lần chạy & tỉ lệ thành công' },
            { icon: 'ai' as IconType, kpi: 'AI request', desc: 'Số request & token tiêu thụ' },
          ].map((k, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg px-2.5 py-2 flex items-start gap-2">
              <AppIcon name={k.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{k.kpi}</p>
                <p className="text-gray-500 text-[11px] mt-0.5">{k.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>💬 Tab Tin nhắn</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Biểu đồ lượng tin nhắn:</strong> Area chart gửi/nhận theo ngày — nhận diện xu hướng tăng/giảm',
          '<strong class="text-gray-200">Heatmap giờ cao điểm:</strong> Ma trận Thứ × Giờ — tìm khung giờ khách hàng tương tác nhiều nhất',
          '<strong class="text-gray-200">Thời gian phản hồi:</strong> Trung bình, trung vị, min/max — đánh giá tốc độ chăm sóc khách hàng',
          '<strong class="text-gray-200">Phân bố thời gian phản hồi:</strong> Biểu đồ cột theo khoảng (< 1 phút, 1–5 phút, 5–15 phút...)',
        ]} />
      </Card>

      <Card>
        <SectionTitle>👥 Tab Liên hệ</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Phân khúc liên hệ:</strong> Biểu đồ tròn phân loại theo bạn bè / nhóm / người lạ',
          '<strong class="text-gray-200">Phân bố nhãn:</strong> Pie chart phân bổ liên hệ theo từng nhãn Zalo',
          '<strong class="text-gray-200">Tăng trưởng liên hệ:</strong> Biểu đồ cột liên hệ mới & bạn bè mới theo thời gian',
          '<strong class="text-gray-200">Lời mời kết bạn:</strong> Timeline gửi/nhận friend request qua các ngày',
          '<strong class="text-gray-200">Tỉ lệ gán nhãn:</strong> Có nhãn vs. chưa gán nhãn, có ghi chú vs. chưa có',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🏷️ Tab Nhãn</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Timeline gán nhãn:</strong> Biểu đồ số lần gán nhãn theo ngày — theo dõi hoạt động phân loại',
          '<strong class="text-gray-200">Top nhãn được dùng:</strong> Bảng xếp hạng nhãn theo số lần sử dụng kèm emoji & màu sắc',
          '<strong class="text-gray-200">Gán nhãn gần đây:</strong> Danh sách nhãn vừa gán kèm hội thoại và thời gian',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📢 Tab Chiến dịch</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Danh sách chiến dịch:</strong> Tên, loại, trạng thái (Chạy / Dừng / Xong / Nháp), tiến độ',
          '<strong class="text-gray-200">Chỉ số hiệu quả:</strong> Tổng gửi · Thành công · Thất bại · Đã phản hồi — tỷ lệ delivery & reply',
          '<strong class="text-gray-200">So sánh chiến dịch:</strong> Biểu đồ cột so sánh hiệu quả giữa các chiến dịch',
        ]} />
      </Card>

      <Card>
        <SectionTitle>⚡ Tab Workflow</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Tổng số lần chạy:</strong> Thành công / Lỗi / Tỷ lệ thành công — đánh giá độ ổn định',
          '<strong class="text-gray-200">Thời gian trung bình:</strong> Thời gian thực thi trung bình mỗi lần chạy',
          '<strong class="text-gray-200">Top Workflow:</strong> Bảng xếp hạng workflow chạy nhiều nhất kèm tỷ lệ thành công',
          '<strong class="text-gray-200">Timeline:</strong> Biểu đồ thành công/lỗi theo ngày — phát hiện sự cố nhanh',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🤖 Tab AI</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Tổng request & token:</strong> Prompt tokens, completion tokens — ước tính chi phí sử dụng',
          '<strong class="text-gray-200">Phân bổ theo model:</strong> Pie chart — GPT, Gemini, Claude, Deepseek... đang dùng bao nhiêu',
          '<strong class="text-gray-200">Phân bổ theo trợ lý:</strong> Xem trợ lý nào tiêu thụ nhiều token nhất',
          '<strong class="text-gray-200">Timeline:</strong> Biểu đồ request & token theo ngày — theo dõi xu hướng sử dụng AI',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🧑‍💼 Tab Nhân viên</SectionTitle>
        <Paragraph>
          Tab dành riêng cho Boss — theo dõi hiệu suất và hoạt động của từng nhân viên theo khoảng thời gian tùy chọn.
          Yêu cầu đã có ít nhất 1 nhân viên đã kết nối Relay Server.
        </Paragraph>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {[
            { icon: 'chat' as const, kpi: 'Tổng tin nhắn gửi', desc: 'Số tin nhắn thực tế mỗi nhân viên đã gửi' },
            { icon: 'clock' as const, kpi: 'Giờ online', desc: 'Tổng thời gian kết nối relay trong kỳ' },
            { icon: 'zap' as const, kpi: 'Thời gian phản hồi', desc: 'Trung bình từ lúc nhận đến khi trả lời' },
            { icon: 'users' as const, kpi: 'Hội thoại xử lý', desc: 'Số thread khác nhau đã nhắn tin' },
          ].map((k, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg px-2.5 py-2">
              <p className="text-gray-200 text-[11px] font-medium flex items-center gap-1.5">
                <AppIcon name={k.icon} className="text-blue-500" size={12} />
                {k.kpi}
              </p>
              <p className="text-gray-500 text-[11px] mt-0.5">{k.desc}</p>
            </div>
          ))}
        </div>
        <BulletList items={[
          '<strong class="text-gray-200">Bộ lọc đa nhân viên:</strong> Chọn 1 hoặc nhiều nhân viên để so sánh song song — hiển thị ảnh đại diện + tên + vai trò trong dropdown.',
          '<strong class="text-gray-200">Timeline tin nhắn:</strong> Biểu đồ area theo ngày, mỗi nhân viên một màu riêng để dễ phân biệt.',
          '<strong class="text-gray-200">Timeline giờ online:</strong> Biểu đồ thời gian kết nối relay theo ngày — phát hiện ai đăng nhập không đủ giờ.',
          '<strong class="text-gray-200">Phân bổ giờ hoạt động:</strong> Biểu đồ cột theo khung giờ trong ngày — nhân viên tập trung làm việc giờ nào.',
          '<strong class="text-gray-200">Phân bổ thời gian phản hồi:</strong> Histogram theo nhóm (&lt; 1 phút, 1–5 phút, 5–15 phút...) cho từng nhân viên.',
          '<strong class="text-gray-200">Biểu đồ radar:</strong> So sánh đa chiều (tin nhắn, giờ online, hội thoại, tốc độ phản hồi) giữa các nhân viên trong cùng kỳ.',
          '<strong class="text-gray-200">Bảng xếp hạng:</strong> Danh sách nhân viên sắp xếp theo tin nhắn hoặc giờ online — kèm badge màu sắc và avatar.',
        ]} />
        <div className="mt-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
          <p className="text-blue-300 text-[11px] flex items-start gap-1">
            <AppIcon name="sparkles" size={12} className="text-blue-300 flex-shrink-0 mt-0.5" />
            <span>Dữ liệu được tính theo phiên kết nối relay thực tế — kể cả phiên kéo dài qua nhiều ngày đều được tính chính xác.</span>
          </p>
        </div>
      </Card>
    </div>
  );
}

function DashboardPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>📊 Dashboard — Quản lý tài khoản</SectionTitle>
        <Paragraph>
          Dashboard là trang chủ khi mở app, hiển thị trạng thái tất cả tài khoản Zalo
          và các thao tác quản lý nhanh: kết nối, ngắt kết nối, gộp trang và quản trị tài khoản.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Thẻ tài khoản:</strong> Mỗi tài khoản hiển thị avatar, tên, trạng thái Online/Offline, listener sống/chết',
          '<strong class="text-gray-200">Kết nối lại:</strong> Nhấn nút kết nối trên thẻ để reconnect khi listener bị ngắt',
          '<strong class="text-gray-200">Gộp trang:</strong> Nhấn "Gộp tài khoản" để xem hội thoại từ nhiều Zalo trong một inbox duy nhất',
          '<strong class="text-gray-200">Trạng thái tài khoản:</strong> Theo dõi nhanh kết nối, listener và khả năng thao tác của từng tài khoản',
          '<strong class="text-gray-200">Kéo thả sắp xếp:</strong> Kéo thả thẻ tài khoản để thay đổi thứ tự hiển thị',
          '<strong class="text-gray-200">Tìm kiếm:</strong> Tìm tài khoản theo tên, Zalo ID, hoặc số điện thoại',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📤 Xuất dữ liệu</SectionTitle>
        <BulletList items={[
          'Xuất danh sách liên hệ CRM ra file CSV / Excel',
          'Lọc theo tài khoản Zalo, nhãn khách hàng',
          'Hỗ trợ chia sẻ danh sách cho team qua file',
        ]} />
      </Card>
    </div>
  );
}

function SecurityPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>🔒 Bảo mật tài khoản & Dữ liệu</SectionTitle>
        <Paragraph>
          Zagi được xây dựng theo kiến trúc toàn bộ dữ liệu được xử lý và lưu trữ ngay trên máy tính của bạn.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Dữ liệu lưu cục bộ 100%:</strong> Tin nhắn, danh bạ, CRM, cài đặt — tất cả được lưu trong cơ sở dữ liệu ngay trên máy bạn',
          '<strong class="text-gray-200">Không có server trung gian:</strong> App kết nối trực tiếp Zalo ↔ máy bạn, không đi qua proxy của chúng tôi',
          '<strong class="text-gray-200">Phiên đăng nhập Zalo được mã hóa:</strong> Cookie phiên được lưu bảo mật trong vùng dữ liệu riêng của ứng dụng',
          '<strong class="text-gray-200">Không lưu mật khẩu:</strong> App đăng nhập qua QR Code, không bao giờ yêu cầu hoặc lưu mật khẩu Zalo',
        ]} />
      </Card>

      <Card>
        <SectionTitle>💾 Lưu ý quan trọng về dung lượng lưu trữ</SectionTitle>
        <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-3 mb-2">
          <span className="text-yellow-400 text-lg flex-shrink-0">⚠️</span>
          <div className="space-y-1.5">
            <p className="text-yellow-300 text-xs font-semibold">Mặc định dữ liệu lưu tại ổ C — có thể đầy nhanh!</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Theo mặc định, toàn bộ tin nhắn, ảnh, video, file đính kèm được lưu tại
              <code style={{color:'#86efac',background:'#1f2937',padding:'0.0625rem 0.375rem',borderRadius:'0.25rem',margin:'0 0.1875rem'}}>C:\Users\...\AppData\Roaming\Zagi</code>.
              Với nhiều tài khoản Zalo hoạt động, <strong style={{color:'#fbbf24'}}>thư mục media có thể chiếm vài GB đến hàng chục GB</strong> sau vài tháng sử dụng,
              đặc biệt khi nhận nhiều ảnh và video từ nhóm Zalo.
            </p>
          </div>
        </div>
        <BulletList items={[
          '<strong class="text-gray-200">Khuyến nghị mạnh:</strong> Chuyển thư mục lưu trữ sang ổ D, E hoặc ổ đĩa ngoài có nhiều dung lượng trống (tối thiểu 20–50 GB để thoải mái)',
          '<strong class="text-gray-200">Cách thay đổi:</strong> Vào <em>Cài đặt → Lưu trữ → Thay đổi thư mục</em> → chọn thư mục mới. App sẽ tự động sao chép dữ liệu hiện có sang thư mục mới.',
          '<strong class="text-gray-200">Dữ liệu được sao chép tự động:</strong> Không cần làm thủ công — app xử lý toàn bộ quá trình migrate khi bạn đổi thư mục.',
          '<strong class="text-gray-200">Sao lưu định kỳ:</strong> Sau khi chuyển sang ổ D/E, đặt lịch backup thư mục này hàng tuần để phòng mất dữ liệu khi hỏng ổ cứng.',
          '<strong class="text-gray-200">Kiểm tra dung lượng:</strong> Xem đường dẫn thực tế và dung lượng đang dùng trong <em>Cài đặt → Lưu trữ</em>.',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🛡️ Khuyến nghị bảo mật</SectionTitle>
        <BulletList items={[
          'Đặt thư mục lưu trữ dữ liệu ở ổ đĩa riêng (D, E...) và sao lưu định kỳ',
          'Không chia sẻ file dữ liệu app (.db) cho người khác',
          'Folder media là thư mục lưu trữ tất cả ảnh, file, video bạn gửi/nhận qua Zalo — hãy quản lý và sao lưu nếu cần',
          'Cài đặt antivirus và tường lửa (Windows Defender là đủ)',
          'Khi không dùng nữa, dùng nút "Xóa tài khoản" trong Dashboard hoặc Cài đặt để xoá hoàn toàn dữ liệu.',
        ]} />
      </Card>

      <Card>
        <SectionTitle>📦 Nơi lưu trữ dữ liệu</SectionTitle>
        <Paragraph>
          Mặc định, dữ liệu được lưu tại thư mục <code style={{color:'#86efac',background:'#1f2937',padding:'0.0625rem 0.375rem',borderRadius:'0.25rem'}}>%AppData%\Zagi</code> trên Windows (ổ C).
          Bạn có thể thay đổi sang bất kỳ thư mục nào trong <strong className="text-white font-semibold">Cài đặt → Lưu trữ</strong>.
        </Paragraph>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { label: 'Database (tin nhắn, danh bạ)', size: '~50–500 MB', icon: 'storage' as const },
            { label: 'Media (ảnh, video, file)', size: '1 GB – 50+ GB', icon: 'image' as const },
            { label: 'Cài đặt & phiên đăng nhập', size: '< 1 MB', icon: 'tools' as const },
            { label: 'Log ứng dụng', size: '~10–50 MB', icon: 'file_text' as const },
          ].map((item, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg px-2.5 py-2">
              <p className="text-gray-200 text-[11px] font-medium flex items-center gap-1.5">
                <AppIcon name={item.icon} className="text-blue-500" size={12} />
                {item.label}
              </p>
              <p className="text-gray-500 text-[11px] mt-0.5">Ước tính: {item.size}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EmployeesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AppIcon name="employees" className="text-blue-500 flex-shrink-0" size={40} />
        <div>
          <h3 className="text-white font-bold text-base">Cài đặt nhân viên & Workspace</h3>
          <p className="text-gray-400 text-xs mt-0.5">Cho phép nhiều nhân viên truy cập và xử lý tin nhắn từ máy riêng — có phân quyền chi tiết</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Badge text="Boss Mode" color="bg-purple-600/30 text-purple-300" />
            <Badge text="Employee Mode" color="bg-green-600/30 text-green-300" />
            <Badge text="Relay Server" color="bg-blue-600/30 text-blue-300" />
          </div>
        </div>
      </div>

      <Card>
        <SectionTitle>🏢 Mô hình hoạt động</SectionTitle>
        <Paragraph>
          Zagi hỗ trợ mô hình <strong>1 Boss — nhiều nhân viên</strong>: Boss chạy app trên máy chủ, bật Relay Server,
          nhân viên kết nối từ máy riêng qua <strong>mạng nội bộ (LAN)</strong> hoặc <strong>từ xa qua WAN / Cloudflare Tunnel</strong>.
          Dữ liệu workspace (DB, media) vẫn lưu trữ trên máy nhân viên. Do Zalo chỉ cho phép 1 kết nối cùng lúc, toàn bộ request Zalo sẽ được chuyển tiếp về máy Boss để xử lý.
        </Paragraph>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { icon: '👑', label: 'Boss', desc: 'Toàn quyền, cài đặt nhân viên & tài khoản Zalo, bật Relay + Tunnel' },
            { icon: '👷', label: 'Nhân viên', desc: 'Truy cập theo phân quyền, kết nối qua LAN hoặc WAN từ bất kỳ đâu' },
          ].map((r, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-3 space-y-1">
              <p className="text-gray-200 text-xs font-semibold">{r.icon} {r.label}</p>
              <p className="text-gray-500 text-[11px]">{r.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🖧 Relay Server — Cầu nối Boss ↔ Nhân viên</SectionTitle>
        <Paragraph>
          Boss bật <strong>Relay Server</strong> trong <em>Cài đặt → Nhân viên → Relay Server</em>.
          Server lắng nghe trên một cổng (mặc định 9900). Nhân viên có thể kết nối qua <strong>LAN</strong> (cùng mạng nội bộ)
          hoặc qua <strong>WAN / Cloudflare Tunnel</strong> (từ xa, bất kỳ đâu có Internet).
        </Paragraph>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
          {[
            { icon: '🏠', mode: 'Chế độ LAN', desc: 'Nhân viên và boss cùng mạng Wi-Fi / văn phòng. Nhân viên nhập IP nội bộ (VD: 192.168.1.10:9900).' },
            { icon: '🌍', mode: 'Chế độ WAN', desc: 'Boss bật Cloudflare Tunnel → nhận URL công khai (*.trycloudflare.com). Nhân viên nhập URL đó để kết nối từ xa.' },
          ].map((m, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-3 space-y-1">
              <p className="text-gray-200 text-[11px] font-semibold">{m.icon} {m.mode}</p>
              <p className="text-gray-500 text-[11px] leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
        <StepList steps={[
          { title: 'Boss bật Relay Server', desc: 'Cài đặt → Nhân viên → Relay Server → nhập cổng → "Bật server". Bật "Tự động bật khi khởi động" để không phải làm thủ công mỗi lần.' },
          { title: '(Tuỳ chọn) Bật Tunnel WAN', desc: 'Nhấn "Bật Tunnel WAN" — app tự cài cloudflared và tạo URL công khai dạng https://xxx.trycloudflare.com. Copy URL này gửi cho nhân viên remote.' },
          { title: 'Nhân viên cài app', desc: 'Nhân viên cài Zagi trên máy của họ, nhập địa chỉ LAN (IP:cổng) hoặc URL WAN từ boss.' },
          { title: 'Nhân viên đăng nhập', desc: 'Nhập tài khoản/mật khẩu được boss tạo sẵn. App kết nối relay và nhận dữ liệu từ boss.' },
          { title: 'Làm việc bình thường', desc: 'Nhân viên xem hội thoại, gửi tin nhắn được phân công — mọi thao tác đều đi qua relay về máy boss.' },
        ]} />
        <div className="mt-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-blue-300 text-[11px] font-semibold">🌐 Cloudflare Tunnel — không cần cấu hình router hay VPS</p>
          <BulletList items={[
            'Tunnel dùng Cloudflare Quick Tunnel miễn phí — không cần tài khoản, không giới hạn băng thông.',
            'URL tunnel thay đổi mỗi lần bật — hãy copy URL mới và gửi lại cho nhân viên sau mỗi lần restart.',
            'Không cần mở port router, không cần IP tĩnh, không cần VPS — phù hợp cho team làm việc từ xa.',
          ]} />
        </div>
        <div className="mt-2 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-yellow-300 text-[11px] font-semibold">⚠️ Lưu ý khi restart app boss</p>
          <BulletList items={[
            '<strong class="text-gray-300">Server tự dừng</strong> khi đóng app — nhân viên bị ngắt kết nối, cần đăng nhập lại.',
            '<strong class="text-gray-300">IP LAN có thể thay đổi</strong> nếu DHCP cấp IP mới — khuyến nghị đặt IP tĩnh cho máy boss.',
            '<strong class="text-gray-300">URL WAN thay đổi</strong> mỗi lần tắt/bật tunnel — copy URL mới và gửi lại cho nhân viên remote.',
          ]} />
        </div>
      </Card>

      <Card>
        <SectionTitle>👤 Tạo & Quản lý tài khoản nhân viên</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Tạo nhân viên:</strong> Cài đặt → Nhân viên → Danh sách → "Thêm nhân viên" → nhập tên đăng nhập, mật khẩu, tên hiển thị.',
          '<strong class="text-gray-200">Phân tài khoản Zalo:</strong> Mỗi nhân viên chỉ thấy các tài khoản Zalo được boss gán — bảo mật và rõ ràng trách nhiệm.',
          '<strong class="text-gray-200">Nhóm nhân viên:</strong> Tạo nhóm (VD: Nhóm Hà Nội, Nhóm CSKH) để phân loại và quản lý dễ hơn.',
          '<strong class="text-gray-200">Vô hiệu hóa / Xóa:</strong> Boss có thể tạm khóa hoặc xóa tài khoản nhân viên bất kỳ lúc nào.',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🔐 Phân quyền chi tiết</SectionTitle>
        <Paragraph>
          Boss có thể bật/tắt từng module riêng lẻ cho mỗi nhân viên. Nhân viên chỉ thấy và truy cập được những gì được phép.
        </Paragraph>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {[
            { icon: 'conversation' as IconType, mod: 'Chat', desc: 'Xem và gửi tin nhắn' },
            { icon: 'users' as IconType, mod: 'CRM', desc: 'Quản lý khách hàng, nhãn' },
            { icon: 'tools' as IconType, mod: 'Workflow', desc: 'Xem và kích hoạt workflow' },
            { icon: 'integration' as IconType, mod: 'Tích hợp', desc: 'Dùng panel tích hợp' },
            { icon: 'chart' as IconType, mod: 'Báo cáo', desc: 'Xem analytics, thống kê' },
            { icon: 'accounts' as IconType, mod: 'Bạn bè', desc: 'Xem danh sách liên hệ' },
          ].map((p, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-700/30 rounded-lg px-2.5 py-2">
              <AppIcon name={p.icon} className="text-blue-500 mt-0.5 flex-shrink-0" size={14} />
              <div>
                <p className="text-gray-200 text-[11px] font-medium">{p.mod}</p>
                <p className="text-gray-500 text-[10px]">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AppIcon name="sparkles" className="text-amber-500 mt-0.5 flex-shrink-0" size={12} />
          <p className="text-gray-300 text-[11px]">
            Khi nhân viên không có quyền vào một trang, app tự động chuyển về <strong>Dashboard</strong> — không xảy ra lỗi hay lộ dữ liệu.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle>📊 Báo cáo nhân viên</SectionTitle>
        <Paragraph>
          Module <strong>Báo cáo → Nhân viên</strong> cho phép boss theo dõi hiệu suất từng nhân viên theo khoảng thời gian tùy chọn.
        </Paragraph>
        <BulletList items={[
          '<strong class="text-gray-200">Tổng tin nhắn gửi</strong> — số tin nhắn thực tế nhân viên đã gửi (không đếm trùng với log phản hồi).',
          '<strong class="text-gray-200">Giờ online</strong> — tổng thời gian nhân viên đã kết nối relay trong kỳ báo cáo, tính chính xác kể cả phiên kéo dài qua nhiều ngày.',
          '<strong class="text-gray-200">Thời gian phản hồi trung bình</strong> — tính từ lúc nhận tin khách đến khi nhân viên trả lời.',
          '<strong class="text-gray-200">Bộ lọc đa nhân viên</strong> — chọn 1 hoặc nhiều nhân viên để so sánh song song trên cùng biểu đồ, hiển thị ảnh + tên.',
          '<strong class="text-gray-200">Biểu đồ timeline, radar, phân bổ giờ</strong> — trực quan hóa hoạt động theo ngày và theo khung giờ trong ngày.',
        ]} />
      </Card>

      <Card>
        <SectionTitle>🔄 Đồng bộ dữ liệu Boss ↔ Nhân viên</SectionTitle>
        <BulletList items={[
          'Tin nhắn boss nhận/gửi được relay đến nhân viên theo thời gian thực.',
          'Chuyển giữa workspace boss ↔ nhân viên: app tự kiểm tra quyền và chuyển hướng về Dashboard nếu trang hiện tại không được phép.',
        ]} />
      </Card>
    </div>
  );
}

function PolicyPanel() {
  const setBugReportOpen = useAppStore(s => s.setBugReportOpen);
  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4">
        <p className="text-blue-300 text-xs font-semibold mb-1">📜 Chính sách sử dụng & Tuyên bố miễn trách nhiệm pháp lý</p>
        <p className="text-gray-400 text-[11px]">Phiên bản 1.0 — có hiệu lực từ ngày 01/01/2025</p>
      </div>

      <Card>
        <SectionTitle>1. Mục đích sử dụng hợp pháp</SectionTitle>
        <Paragraph>
          Zagi là phần mềm hỗ trợ quản lý giao tiếp trên nền tảng Zalo dành cho mục đích
          <strong className="text-white font-semibold"> kinh doanh hợp pháp</strong>, chăm sóc khách hàng và Tự động hoá quy trình làm việc.
          Phần mềm <strong style={{color:'#fbbf24'}}>không được thiết kế</strong> và <strong style={{color:'#fbbf24'}}>không khuyến khích sử dụng</strong> cho các hành vi:
        </Paragraph>
        <BulletList items={[
          'Gửi tin nhắn spam, quảng cáo hàng loạt không có sự đồng ý của người nhận',
          'Thu thập thông tin cá nhân trái phép',
          'Phát tán nội dung vi phạm pháp luật, nội dung khiêu dâm, bạo lực',
          'Lừa đảo, gian lận, hoặc bất kỳ hành vi vi phạm pháp luật Việt Nam nào',
          'Vi phạm Điều khoản dịch vụ của Zalo',
        ]} />
      </Card>

      <Card>
        <SectionTitle>2. Dữ liệu người dùng & Quyền riêng tư</SectionTitle>
        <BulletList items={[
          '<strong class="text-gray-200">Dữ liệu lưu hoàn toàn cục bộ</strong> trên máy tính của người dùng. Chúng tôi <em>không</em> thu thập, lưu trữ hoặc xử lý nội dung tin nhắn, danh bạ hay thông tin khách hàng của bạn trên bất kỳ server nào của chúng tôi.',
          '<strong class="text-gray-200">Không chia sẻ với bên thứ 3</strong>: Zagi không tích hợp bất kỳ SDK thu thập dữ liệu, analytics hay quảng cáo của bên thứ 3.',
          '<strong class="text-gray-200">Phiên Zalo</strong>: Cookie phiên Zalo được mã hóa AES và lưu cục bộ, chỉ dùng để duy trì kết nối Zalo từ máy bạn.',
        ]} />
      </Card>

      <Card>
        <SectionTitle>3. Yêu cầu vận hành 24/7</SectionTitle>
        <Paragraph>
          Để các tính năng Tự động hoá (Workflow, nhắn tin theo lịch, nhận tin nhắn thời gian thực) hoạt động liên tục,
          ứng dụng cần được <strong className="text-white font-semibold">để chạy nền 24/7</strong> trên máy tính.
          Người dùng chịu trách nhiệm đảm bảo máy tính có nguồn điện ổn định và kết nối Internet.
          Việc tắt máy hoặc ngắt kết nối Internet sẽ làm gián đoạn các automation đang chạy.
        </Paragraph>
      </Card>

      <Card>
        <SectionTitle>4. Tuyên bố miễn trách nhiệm</SectionTitle>
        <BulletList items={[
          'Zagi là công cụ hỗ trợ. Người dùng <strong class="text-gray-200">hoàn toàn chịu trách nhiệm</strong> về cách sử dụng phần mềm và tuân thủ pháp luật hiện hành.',
          'Chúng tôi không chịu trách nhiệm nếu tài khoản Zalo của bạn bị Zalo hạn chế do sử dụng không đúng cách hoặc vi phạm điều khoản Zalo.',
          'Dữ liệu lưu trên máy bạn là trách nhiệm của bạn. Hãy sao lưu định kỳ để tránh mất mát.',
          'Phần mềm được cung cấp "nguyên trạng" (as-is). Chúng tôi không đảm bảo phần mềm hoạt động hoàn toàn không có lỗi trong mọi môi trường.',
        ]} />
      </Card>

      <Card>
        <SectionTitle>5. Sở hữu trí tuệ</SectionTitle>
        <Paragraph>
          Zagi và tất cả tài liệu liên quan là tài sản trí tuệ của <strong className="text-white font-semibold">Basan Corp</strong>.
          Nghiêm cấm sao chép, phân phối lại, reverse-engineer hoặc bán lại phần mềm dưới bất kỳ hình thức nào
          khi chưa có sự đồng ý bằng văn bản.
        </Paragraph>
      </Card>

      <Card>
        <SectionTitle>6. Liên hệ & Hỗ trợ</SectionTitle>
        <p className="text-gray-400 text-xs mt-1 leading-relaxed">
          Gặp lỗi hoặc có góp ý? Bạn có thể gửi báo cáo trực tiếp trong ứng dụng:{' '}
          <button
            onClick={() => setBugReportOpen(true)}
            className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2"
          >
            Mở biểu mẫu báo lỗi →
          </button>
        </p>
      </Card>
    </div>
  );
}

function BugReportPanel() {
  const setBugReportOpen = useAppStore(s => s.setBugReportOpen);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AppIcon name="bug" className="text-blue-500 flex-shrink-0" size={40} />
        <div>
          <h3 className="text-white font-bold text-base">Báo lỗi & Hướng dẫn</h3>
          <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
            Tìm thấy lỗi? Báo cáo chi tiết giúp nhóm phát triển xác định và sửa lỗi nhanh hơn.
            <strong className="text-amber-400"> Báo cáo có chứng minh rõ ràng sẽ được team ưu tiên xử lý trước.</strong>
          </p>
        </div>
      </div>

      <div className="flex justify-center gap-2">
        <button
          onClick={() => setBugReportOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Gửi báo cáo lỗi trực tiếp trong ứng dụng →
        </button>
      </div>

      <Card>
        <SectionTitle>📝 Quy trình báo lỗi — 5 bước</SectionTitle>
        <StepList steps={[
          {
            title: '1. Tái hiện lỗi',
            desc: 'Lặp lại thao tác khi gặp lỗi. Ghi nhận từng bước cụ thể (VD: "Mở CRM → Nhấn Chiến dịch → Nhấn Tạo mới → Lỗi"). Xác nhận lỗi xảy ra mỗi lần hay chỉ thỉnh thoảng. Thử trên phiên bản Zagi mới nhất.',
          },
          {
            title: '2. Chụp ảnh / quay video minh hoạ',
            desc: 'Screenshot khi lỗi xuất hiện (PrtScn / Snipping Tool). Quay video ngắn 10-30s nếu lỗi liên quan nhiều bước (Win+G). Chụp Developer Tools (Ctrl+Shift+I → tab Console) để ghi lại lỗi đỏ. Dùng mũi tên/viền đỏ chỉ rõ vị trí lỗi.',
          },
          {
            title: '3. Thu thập thông tin kỹ thuật',
            desc: 'Phiên bản Zagi (thanh trên cùng bên trái). Hệ điều hành (Windows 10/11, macOS Intel/Apple Silicon). Tài khoản nào gặp lỗi (Zalo cá nhân, Business, Facebook). Tính năng liên quan. Nếu có lỗi Console (Ctrl+Shift+I → Console) — copy-paste nội dung.',
          },
          {
            title: '4. Viết mô tả lỗi',
            desc: 'Tiêu đề mô tả ngắn gọn lỗi. Phần "Mô tả lỗi": 1-2 câu. "Bước tái hiện": danh sách rõ ràng. "Kết quả mong đợi" vs "Kết quả thực tế". Đính kèm ảnh/video. "Thông tin môi trường": phiên bản Zagi, OS, tài khoản Zalo.',
          },
          {
            title: '5. Gửi báo cáo và theo dõi',
            desc: 'Nhấn Submit trên Form. Theo dõi email/thông báo khi có phản hồi từ team. Phản hồi sớm khi nhóm yêu cầu thêm thông tin. Khi lỗi đã sửa, cập nhật Zagi và xác nhận lại.',
          },
        ]} />
      </Card>

      <Card>
        <SectionTitle>📖 Ví dụ: Báo cáo lỗi chất lượng cao</SectionTitle>
        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-red-900/40 text-red-300 text-[10px] px-2 py-0.5 rounded-full font-medium">bug</span>
            <span className="text-white font-semibold">Chiến dịch CRM: Không gửi được tin khi chọn hơn 100 liên hệ</span>
          </div>
          <p className="text-gray-400 leading-relaxed">
            <strong className="text-gray-200">Mô tả:</strong> Khi tạo chiến dịch gửi tin hàng loạt với hơn 100 người nhận,
            nút "Bắt đầu gửi" không phản hồi. Console hiện lỗi timeout.
          </p>
          <div className="text-gray-400 leading-relaxed space-y-1">
            <p><strong className="text-gray-200">Bước tái hiện:</strong></p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Mở CRM → Chiến dịch → Tạo chiến dịch mới</li>
              <li>Chọn đối tượng: tất cả liên hệ có nhãn "Khách hàng" (~150 người)</li>
              <li>Nhập nội dung tin nhắn → Nhấn "Bắt đầu gửi"</li>
              <li>→ Không có phản hồi, nút chuyển disabled nhưng không gửi</li>
            </ol>
          </div>
          <p className="text-gray-400 leading-relaxed">
            <strong className="text-gray-200">Môi trường:</strong> Zagi v27.1.0, Windows 11, Zalo cá nhân.
            Đã test 50 người (bình thường), 100 người (bình thường), 150 người (lỗi).
          </p>
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-2.5 mt-2 flex items-start gap-1.5">
            <AppIcon name="check" className="text-green-400 mt-0.5 flex-shrink-0" size={12} />
            <p className="text-[11px] text-gray-300">
              Báo cáo này có: bước tái hiện chính xác, so sánh kết quả, thông tin môi trường đủ để xác định lỗi.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>🔍 Các loại lỗi thường gặp</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { dotColor: 'bg-red-500', type: 'Lỗi crash / treo app', tips: 'Mô tả thao tác cuối trước khi crash. Chụp screenshot lỗi. Kiểm tra Console (Ctrl+Shift+I).' },
            { dotColor: 'bg-amber-500', type: 'Lỗi giao diện / hiển thị', tips: 'Screenshot so sánh hiện tại vs mong đợi. Ghi OS, độ phân giải màn hình.' },
            { dotColor: 'bg-blue-500', type: 'Lỗi kết nối / đồng bộ', tips: 'Ghi thời điểm lỗi. Kiểm tra mạng. Thử đăng nhập lại. Gửi screenshot trạng thái.' },
            { dotColor: 'bg-indigo-500', type: 'Lỗi tích hợp bên thứ 3', tips: 'Ghi rõ tích hợp nào. Kiểm tra API key. Mô tả expected vs actual response.' },
            { dotColor: 'bg-orange-500', type: 'Lỗi Workflow không chạy', tips: 'Screenshot flow designer. Ghi trigger + action. Kiểm tra log "Chạy gần đây".' },
            { dotColor: 'bg-gray-400', type: 'Hiệu năng chậm / lag', tips: 'Ghi quy mô dữ liệu. Mô tả thao tác bị chậm. So sánh với phiên bản trước.' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg p-2.5 border border-gray-600/30">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${item.dotColor} flex-shrink-0`} />
                <p className="text-[11px] font-semibold text-white">{item.type}</p>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">{item.tips}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>🚫 Những điều KHÔNG nên làm</SectionTitle>
        <BulletList items={[
          'Gửi issue chỉ ghi "app bị lỗi" mà không có mô tả chi tiết',
          'Gửi nhiều issue trùng lặp — hãy kiểm tra issue đã tồn tại trước',
          'Đính kèm ảnh chụp thông tin nhạy cảm (mã OTP, mật khẩu, SĐT KH...)',
          'Dùng issue để hỏi cách sử dụng — đọc trang Hướng dẫn trước',
          'Gửi yêu cầu tính năng qua mục báo lỗi — tạo issue riêng nhãn "enhancement"',
        ]} />
      </Card>
    </div>
  );
}

function ContactPanel() {
  const setBugReportOpen = useAppStore(s => s.setBugReportOpen);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AppIcon name="phone" className="text-blue-500 mt-1 flex-shrink-0" size={30} />
        <div>
          <h3 className="text-white font-bold text-base">Liên hệ Zagi (Basan Corp)</h3>
          <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
            Dự án phát triển bởi <strong className="text-gray-200">Basan Corp</strong> với mục tiêu mang công cụ all-in-one tất cả mọi thứ người dùng cần để quản lý và marketing
            trên Zalo, Facebook đến mọi cá nhân và doanh nghiệp nhỏ hoàn toàn <strong className="text-green-400">miễn phí</strong>.
          </p>
        </div>
      </div>

      <Card>
        <SectionTitle>🏢 Thông tin công ty</SectionTitle>
        <div className="space-y-2 mt-2">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-20">Công ty:</span>
            <span className="text-white font-medium">Basan Corp.</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-20">Email:</span>
            <a href="mailto:info@itngon.com" className="text-blue-400 hover:text-blue-300 transition-colors">info@itngon.com</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-20">Báo lỗi:</span>
            <button
              onClick={() => setBugReportOpen(true)}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Gửi trực tiếp trong ứng dụng
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Enriched User Guide ──────────────────────────────────────────────────────

const ENRICHED_TOOLS_GUIDE = [
  {
    id: 'crm' as const,
    icon: 'crm' as IconType, iconColor: 'text-blue-400', title: 'CRM — Quản lý khách hàng',
    color: 'border-gray-700 bg-gray-800/30 hover:border-blue-500/40',
    badgeColor: 'bg-gray-800/60 text-gray-300 border border-gray-700/60',
    purpose: 'Quản lý toàn bộ danh sách liên hệ Zalo, phân loại khách hàng bằng nhãn, ghi chú nội bộ, và chạy chiến dịch nhắn tin hàng loạt — biến Zalo thành CRM chuyên nghiệp.',
    sections: [
      {
        title: '👥 Quản lý liên hệ & Nhóm',
        items: [
          'Xem tất cả liên hệ theo tài khoản Zalo: bạn bè, nhóm, stranger (người lạ)',
          'Đồng bộ thông tin nhóm Zalo: Tự động cập nhật tên thật và composite avatar nhóm khi quét bằng link hoặc đồng bộ thủ công vào danh sách CRM và Chiến dịch.',
          'Bộ lọc nâng cao: theo nhãn, trạng thái (đã nhắn / chưa nhắn), loại liên hệ, thời gian',
          'Xem thông tin chi tiết: avatar, tên, SĐT, nhãn, ghi chú, lịch sử tương tác',
          'Dashboard tổng quan: thống kê số lượng liên hệ, tương tác, nhãn phân bố',
        ],
      },
      {
        title: '🔒 Quét thành viên Nhóm khóa (lockViewMember)',
        items: [
          'Hỗ trợ quét thành viên thông minh: Đối với các nhóm lớn bật tính năng khóa xem thành viên, Zalo chỉ trả về 8 quản trị viên. Zagi tự động kích hoạt Trình quét Tương tác để quét lịch sử tin nhắn, người thả cảm xúc, người gửi bình chọn nhằm khôi phục danh sách thành viên thực tế.',
          'Bảo mật và an toàn cho tài khoản: Quá trình quét được tối ưu hóa tốc độ và phân chia luồng gửi request thông minh để tránh bị Zalo chặn hoặc khóa tài khoản.',
        ],
      },
      {
        title: '🏷️ Hệ thống nhãn kép',
        items: [
          'Nhãn Zalo (Zalo Label): đồng bộ 2 chiều với app Zalo trên điện thoại — gán từ Zagi, thấy trên Zalo và ngược lại',
          'Nhãn Local: nhãn riêng của Zagi, tùy biến màu sắc + emoji, không giới hạn số lượng',
          'Dùng nhãn làm điều kiện lọc trong chiến dịch (chỉ gửi cho khách có nhãn "VIP")',
          'Dùng nhãn làm Trigger trong Workflow: khi gắn nhãn → tự động chạy luồng xử lý',
        ],
      },
      {
        title: '📝 Ghi chú nội bộ (Notes) & Chiến dịch',
        items: [
          'Thêm ghi chú riêng cho từng liên hệ — khách hàng không thấy được',
          'Tạo chiến dịch nhắn tin hàng loạt: chọn đối tượng theo nhãn / bộ lọc → soạn mẫu tin → gửi',
          'Hỗ trợ chèn biến động cá nhân hóa (tên khách, SĐT, nhãn...) vào nội dung tin nhắn',
          'Giới hạn tốc độ gửi tự động: tối đa 60 tin/giờ, delay giữa mỗi tin (tránh spam)',
          'Theo dõi realtime: đã gửi / thất bại / phản hồi — dừng/tiếp tục chiến dịch mọi lúc',
        ],
      },
    ],
  },
  {
    id: 'workflow' as const,
    icon: 'tools' as IconType, iconColor: 'text-indigo-400', title: 'Workflow — Tự động hoá',
    color: 'border-gray-700 bg-gray-800/30 hover:border-indigo-500/40',
    badgeColor: 'bg-gray-800/60 text-gray-300 border border-gray-700/60',
    purpose: 'Tạo các luồng xử lý tự động bằng giao diện kéo-thả trực quan: nhận sự kiện → xử lý logic → thực hiện hành động. Không cần viết code, có sẵn 20+ mẫu workflow.',
    sections: [
      {
        title: '⚡ Trigger — 8 loại sự kiện kích hoạt',
        items: [
          'Khi nhận tin nhắn: lọc theo từ khóa, loại hội thoại (cá nhân/nhóm), regex',
          'Khi có lời mời kết bạn → tự động chấp nhận + gửi lời chào',
          'Khi có sự kiện nhóm: thành viên vào/rời, đổi admin, đổi avatar nhóm',
          'Khi có người react tin nhắn (like, heart, haha...)',
          'Khi gắn/gỡ nhãn: liên kết CRM → Workflow liền mạch',
          'Chạy theo lịch hẹn (cron): hàng ngày, hàng giờ, ngày cụ thể',
          'Khi nhận thanh toán (webhook từ Casso/SePay)',
          'Chạy thủ công: nút bấm test từ giao diện',
        ],
      },
      {
        title: '💬 Action — 15+ thao tác trên Zalo & Tối ưu Gửi ảnh/file',
        items: [
          'Gửi tin nhắn văn bản (hỗ trợ biến động {{ tên }}, {{ sdt }}...)',
          'Hiệu ứng "đang gõ..." + delay → tạo cảm giác tự nhiên như người thật',
          'Gửi nhiều ảnh cùng lúc: Hỗ trợ chọn nhiều tệp ảnh cùng lúc từ máy tính hoặc nhập link trực tiếp, sắp xếp và quản lý trực quan bằng lưới preview có nút xóa.',
          '🎲 Gửi ngẫu nhiên 1 ảnh: Bật checkbox "Gửi ngẫu nhiên 1 ảnh trong danh sách" để hệ thống tự động chọn ngẫu nhiên 1 ảnh để gửi, hữu ích khi cần xoay tua ảnh quảng cáo.',
          'Gửi nhiều file đính kèm cùng lúc (PDF, Excel, Word...) thay vì gửi từng file riêng lẻ.',
          'Quản lý nhóm: thêm/xóa thành viên, tạo bình chọn (poll)',
          'Gắn/gỡ nhãn, thu hồi tin nhắn, chuyển tiếp tin nhắn, thả cảm xúc',
        ],
      },
      {
        title: '🧠 Logic & Dữ liệu',
        items: [
          'Rẽ nhánh IF/ELSE: kiểm tra điều kiện → chạy nhánh tương ứng',
          'Switch: phân nhiều nhánh theo giá trị (VD: phân loại câu hỏi)',
          'Lặp forEach: lặp qua danh sách rồi xử lý từng item',
          'Lưu biến, dừng workflow nếu điều kiện đúng, chờ N giây',
          'Ghép nội dung văn bản, chọn ngẫu nhiên, định dạng ngày giờ, đọc JSON',
        ],
      },
      {
        title: '🤖 AI & Tích hợp ngoài',
        items: [
          'AI tạo nội dung: ChatGPT, Gemini, Deepseek, Grok — chatbot thông minh',
          'AI phân loại tin nhắn: tự nhận diện hỏi giá / khiếu nại / hỗ trợ kỹ thuật...',
          'Google Sheets: ghi dữ liệu, đọc dữ liệu, cập nhật ô — biến Sheets thành database',
          'Gửi thông báo Telegram, Discord, Email, ghi vào Notion Database',
          'Gọi API/Webhook HTTP bên ngoài: kết nối bất kỳ hệ thống nào',
        ],
      },
    ],
  },
  {
    id: 'integration' as const,
    icon: 'integration' as IconType, iconColor: 'text-green-400', title: 'Tích hợp — Kết nối bên thứ 3',
    color: 'border-gray-700 bg-gray-800/30 hover:border-green-500/40',
    badgeColor: 'bg-gray-800/60 text-gray-300 border border-gray-700/60',
    purpose: 'Kết nối Zagi với hệ sinh thái bán hàng, thanh toán, vận chuyển Việt Nam. Tra cứu dữ liệu ngay trong khung chat, nhận webhook tự động, kết hợp Workflow để xử lý end-to-end.',
    sections: [
      {
        title: '🛒 POS / Bán hàng (4 nền tảng) & Logo thương hiệu cao cấp',
        items: [
          'KiotViet: tra cứu khách hàng, đơn hàng, sản phẩm, tạo đơn — phổ biến nhất VN',
          'Haravan: nền tảng TMĐT, tra cứu đơn hàng online, khách hàng',
          'Sapo: quản lý bán hàng đa kênh, tra cứu đơn/khách theo SĐT',
          'Pancake POS: tra cứu khách hàng, đơn hàng, sản phẩm và tạo đơn nhanh',
          '💎 Logo thương hiệu trực quan: Toàn bộ logo của các đối tác tích hợp (KiotViet, Haravan, Sapo, Pancake POS, Nhanh.vn, v.v.) được thiết kế tối giản dạng SVG và hiển thị trên nền màu trắng sang trọng, giúp phân biệt nhanh chóng các kênh.',
        ],
      },
      {
        title: '💳 Thanh toán & Vận chuyển',
        items: [
          'Casso: kết nối ngân hàng, nhận webhook khi có chuyển khoản mới — tự động đối soát thanh toán bằng VietQR.',
          'SePay (VietQR): hỗ trợ tích hợp webhook nhận tiền ngân hàng thời gian thực.',
          'GHN Express & GHTK: tạo đơn vận chuyển trực tiếp từ chat hoặc workflow, tra cứu trạng thái vận đơn và COD.',
        ],
      },
      {
        title: '🌐 Tunnel — Mở kết nối ra internet',
        items: [
          'Bật tunnel Cloudflare trực tiếp trên Zagi để tạo URL công khai (https://xxx.trycloudflare.com) trỏ về máy.',
          'Nhận webhook từ các cổng thanh toán (Casso/SePay) hoặc công cụ cloud mà không cần mở cổng modem mạng (NAT port).',
        ],
      },
    ],
  },
];

const ENRICHED_COMBO_SCENARIOS = [
  {
    icon: 'credit_card' as IconType,
    title: 'Xác nhận thanh toán tự động',
    tags: ['Tích hợp', 'Workflow'],
    color: 'border-gray-700 bg-gray-800/30 hover:border-emerald-500/40',
    flow: ['🔗 SePay/Casso nhận CK', '⚙️ Trigger payment', '📝 Ghép tin "Cảm ơn {tên}, đơn #{mã} đã nhận {số tiền}"', '💬 Gửi tin Zalo', '🏷️ Gắn nhãn "Đã TT"'],
    desc: 'Khách chuyển khoản → Zagi nhận webhook từ ngân hàng → Workflow tự động gửi tin xác nhận + gắn nhãn CRM.',
  },
  {
    icon: 'ai' as IconType,
    title: 'Chatbot AI tư vấn bán hàng',
    tags: ['Workflow', 'AI'],
    color: 'border-gray-700 bg-gray-800/30 hover:border-violet-500/40',
    flow: ['💬 Khách nhắn hỏi', '🧠 AI phân loại (hỏi giá / CSKH / khiếu nại)', '🤖 ChatGPT trả lời theo ngữ cảnh', '⌨️ Typing + delay', '💬 Gửi phản hồi'],
    desc: 'Khách nhắn tin → AI tự phân loại câu hỏi → ChatGPT sinh nội dung trả lời phù hợp → gửi tự động với hiệu ứng đang gõ.',
  },
  {
    icon: 'user_plus' as IconType,
    title: 'Chào mừng + phân loại khách mới',
    tags: ['Workflow', 'CRM'],
    color: 'border-gray-700 bg-gray-800/30 hover:border-blue-500/40',
    flow: ['👤 Nhận lời mời KB', '✅ Auto chấp nhận', '💬 Gửi tin chào', '🏷️ Gắn nhãn "Khách mới"', '📊 Ghi Google Sheets'],
    desc: 'Khi có người gửi kết bạn → auto accept → gửi lời chào + menu dịch vụ → gắn nhãn CRM → ghi thông tin vào Sheets.',
  },
  {
    icon: 'integration' as IconType,
    title: 'Tra cứu đơn hàng ngay trong chat',
    tags: ['Tích hợp', 'Workflow'],
    color: 'border-gray-700 bg-gray-800/30 hover:border-orange-500/40',
    flow: ['💬 Khách nhắn "đơn hàng"', '🔍 KiotViet tra SĐT', '📝 Ghép kết quả', '💬 Gửi thông tin đơn'],
    desc: 'Khách hỏi về đơn hàng → Workflow tự tra cứu KiotViet/Haravan theo SĐT → gửi lại thông tin đơn chi tiết.',
  },
];

function UserGuidePanel() {
  const [activeTab, setActiveTab] = useState<'overview' | 'crm' | 'workflow' | 'integration' | 'combo'>('overview');

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-gray-700/60 pb-1 flex-shrink-0 overflow-x-auto gap-0.5">
        {([
          { id: 'overview', icon: 'sparkles' as const, label: 'Tổng quan' },
          { id: 'crm', icon: 'crm' as const, label: 'CRM & Nhóm' },
          { id: 'workflow', icon: 'tools' as const, label: 'Workflow' },
          { id: 'integration', icon: 'integration' as const, label: 'Tích hợp' },
          { id: 'combo', icon: 'sync' as const, label: 'Kết hợp' },
        ] as const).map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-[11px] font-semibold whitespace-nowrap rounded-lg transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
              }`}
            >
              <AppIcon name={tab.icon} className={isActive ? 'text-blue-400' : 'text-gray-500'} size={12} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="space-y-4 pt-1">

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <>
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 flex items-start gap-3">
              <AppIcon name="sparkles" className="text-amber-400 mt-0.5 flex-shrink-0" size={18} />
              <div className="space-y-2">
                <p className="text-gray-300 text-xs leading-relaxed">
                  Ba công cụ <strong className="text-white">CRM</strong>, <strong className="text-white">Workflow</strong> và <strong className="text-white">Tích hợp</strong> phối
                  hợp với nhau tạo thành hệ thống tự động hoá hoàn chỉnh:
                </p>
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className="bg-gray-800/60 border border-gray-700 text-gray-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5"><AppIcon name="integration" className="text-green-400" size={12} /> Tích hợp nhận dữ liệu</span>
                  <span className="text-gray-600">→</span>
                  <span className="bg-gray-800/60 border border-gray-700 text-gray-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5"><AppIcon name="tools" className="text-indigo-400" size={12} /> Workflow xử lý logic</span>
                  <span className="text-gray-600">→</span>
                  <span className="bg-gray-800/60 border border-gray-700 text-gray-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5"><AppIcon name="crm" className="text-blue-400" size={12} /> CRM quản lý KH</span>
                </div>
              </div>
            </div>

            {/* Summary cards */}
            {ENRICHED_TOOLS_GUIDE.map((tool, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveTab(tool.id)}
                className={`w-full border rounded-xl p-4 text-left transition-colors hover:bg-gray-800/40 ${tool.color}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AppIcon name={tool.icon} className={(tool as any).iconColor || 'text-blue-400'} size={16} />
                  <h3 className="text-sm font-bold text-white">{tool.title}</h3>
                  <span className="text-gray-500 ml-auto text-[10px]">Xem chi tiết →</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{tool.purpose}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tool.sections.map((s, j) => (
                    <span key={j} className={`text-[10px] px-2 py-0.5 rounded-full ${tool.badgeColor}`}>
                      {s.title.split(' ').slice(1).join(' ')}
                    </span>
                  ))}
                </div>
              </button>
            ))}

            {/* Combo preview */}
            <button
              type="button"
              onClick={() => setActiveTab('combo')}
              className="w-full border border-amber-500/30 bg-amber-900/10 rounded-xl p-4 text-left hover:bg-amber-900/20 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <AppIcon name="shuffle" className="text-amber-500" size={16} />
                <h3 className="text-sm font-bold text-white">{ENRICHED_COMBO_SCENARIOS.length} kịch bản kết hợp thực tế</h3>
                <span className="text-gray-500 ml-auto text-[10px]">Xem kịch bản →</span>
              </div>
              <p className="text-xs text-gray-400">Xem các ví dụ phối hợp CRM + Workflow + Tích hợp trong thực tế kinh doanh.</p>
            </button>
          </>
        )}

        {/* ── Tool Detail Tabs (CRM / Workflow / Integration) ── */}
        {(activeTab === 'crm' || activeTab === 'workflow' || activeTab === 'integration') && (() => {
          const tool = ENRICHED_TOOLS_GUIDE.find(t => t.id === activeTab)!;
          return (
            <>
              <div className={`border rounded-xl p-4 ${tool.color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AppIcon name={tool.icon} className={(tool as any).iconColor || 'text-blue-400'} size={16} />
                  <h3 className="text-sm font-bold text-white">{tool.title}</h3>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{tool.purpose}</p>
              </div>

              {tool.sections.map((section, i) => {
                const { icon, cleanText } = cleanEmojiPrefix(section.title);
                return (
                  <div key={i} className="space-y-2 bg-gray-800/20 border border-gray-700/30 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                      {icon && <AppIcon name={icon} className="text-blue-500 flex-shrink-0" size={12} />}
                      <span>{cleanText}</span>
                    </h4>
                    <ul className="space-y-2 pl-1">
                      {section.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {/* Related combos */}
              <div className="border-t border-gray-700/60 pt-4 mt-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AppIcon name="shuffle" className="text-gray-500" size={10} />
                  Kịch bản kết hợp liên quan
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ENRICHED_COMBO_SCENARIOS.filter(c =>
                    (activeTab === 'crm' && c.tags.includes('CRM')) ||
                    (activeTab === 'workflow' && c.tags.includes('Workflow')) ||
                    (activeTab === 'integration' && c.tags.includes('Tích hợp'))
                  ).map((combo, i) => (
                    <div key={i} className={`border rounded-xl p-3 bg-gray-800/40 ${combo.color}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <AppIcon name={combo.icon} className="text-blue-500" size={14} />
                        <span className="text-xs font-semibold text-white">{combo.title}</span>
                        <div className="flex gap-1 ml-auto">
                          {combo.tags.map(t => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{t}</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed">{combo.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}

        {/* ── Combo Tab ── */}
        {activeTab === 'combo' && (
          <>
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-300 leading-relaxed">
                Sức mạnh thực sự nằm ở việc <strong className="text-white">kết hợp</strong> các công cụ. Dưới đây là các kịch bản thực tế
                giúp bạn hình dung cách ứng dụng Zagi vào kinh doanh tự động hóa.
              </p>
            </div>

            {ENRICHED_COMBO_SCENARIOS.map((combo, i) => (
              <div key={i} className={`border rounded-xl p-4 space-y-2.5 bg-gray-800/40 ${combo.color}`}>
                <div className="flex items-center gap-2">
                  <AppIcon name={combo.icon} className="text-blue-500" size={16} />
                  <h3 className="text-xs font-bold text-white">{combo.title}</h3>
                  <div className="flex gap-1 ml-auto">
                    {combo.tags.map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-750 text-gray-400">{t}</span>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">{combo.desc}</p>
                {/* Flow diagram */}
                <div className="flex items-center gap-1.5 text-[10px] flex-wrap pt-1">
                  {combo.flow.map((step, j) => {
                    const { icon: stepIcon, cleanText: stepText } = cleanEmojiPrefix(step);
                    return (
                      <React.Fragment key={j}>
                        {j > 0 && <span className="text-gray-600">→</span>}
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md border border-gray-700/60 whitespace-nowrap flex items-center gap-1">
                          {stepIcon && <AppIcon name={stepIcon} className="text-blue-400" size={10} />}
                          <span>{stepText}</span>
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

      </div>
    </div>
  );
}

function SafeGuidePanel() {
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle icon="shield_check">🛡️ Cẩm nang quy tắc gửi tin nhắn Zalo an toàn</SectionTitle>
        <Paragraph>
          Để đảm bảo quá trình chăm sóc khách hàng qua Zalo diễn ra an toàn, chuyên nghiệp và tránh bị hệ thống Zalo đánh dấu spam hoặc khóa tài khoản, bạn cần tuyệt đối tuân thủ các nguyên tắc vàng sau đây:
        </Paragraph>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-2 text-red-500 font-bold">
            <AppIcon name="alert_circle" className="text-red-500" size={16} />
            <span>1. Gửi tin cho người chưa kết bạn (Người lạ)</span>
          </div>
          <BulletList items={[
            '<strong>Hạn mức tối đa:</strong> Tài khoản cá nhân miễn phí chỉ được gửi tối đa <strong>40 người lạ/tháng</strong>.',
            '<strong>Tần suất an toàn:</strong> Chỉ nên gửi từ <strong>10 - 20 người/ngày</strong>. Tránh gửi dồn dập.',
            '<strong>Giãn cách (Delay):</strong> Bắt buộc cài đặt trì hoãn từ <strong>3 - 5 phút (180 - 300 giây)</strong> giữa mỗi lần gửi để không bị quét spam.',
            '<strong>Trạng thái hiển thị:</strong> Tin nhắn gửi đi sẽ nằm trong phần "Tin nhắn chờ người lạ". Nếu khách hàng tắt tính năng nhận tin nhắn từ người lạ, tin nhắn sẽ báo lỗi gửi thất bại.',
          ]} />
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2 text-green-500 font-bold">
            <AppIcon name="users" className="text-green-500" size={16} />
            <span>2. Gửi tin cho khách hàng đã kết bạn</span>
          </div>
          <BulletList items={[
            '<strong>Hạn mức cá nhân (1-1):</strong> Zalo không giới hạn số lượng tin nhắn gửi hàng ngày cho bạn bè.',
            '<strong>Khuyên dùng:</strong> Nên duy trì gửi từ <strong>50 - 100 người/ngày</strong> đối với tài khoản cá nhân để giữ tài khoản ở mức độ an toàn tối đa.',
            '<strong>Chuyển tiếp (Forward) hàng loạt:</strong> Giới hạn tối đa <strong>50 người hoặc nhóm</strong> trong mỗi lần chuyển tiếp.',
            '<strong>Báo cáo xấu (Report):</strong> Không spam tin nhắn rác hoặc quảng cáo phiền nhiễu. Nếu bị nhiều người dùng nhấn nút báo cáo xấu, tài khoản của bạn sẽ bị tạm khóa ngay lập tức.',
          ]} />
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-2 text-amber-500 font-bold">
          <AppIcon name="sparkles" className="text-amber-500" size={16} />
          <span>3. Nguyên tắc vàng bắt buộc khi chạy chiến dịch</span>
        </div>
        <BulletList items={[
          '<strong>Cá nhân hóa nội dung (Spintax):</strong> Sử dụng cú pháp trộn nội dung <code>{Chào anh/chị|Hi|Xin chào}</code> kết hợp chèn các biến động như <code>{name}</code>, <code>{gender_greeting}</code> để nội dung mỗi tin nhắn gửi đi là khác nhau, tránh bộ lọc nhận diện spam của Zalo.',
          '<strong>Kiểm soát liên kết (Link):</strong> Tuyệt đối hạn chế chèn link lạ, link rút gọn ở tin nhắn đầu tiên khi gửi cho người lạ. Chỉ nên gửi link sau khi đối phương đã phản hồi hoặc đồng ý kết bạn.',
          '<strong>Nâng cấp Zalo Business:</strong> Nếu nhu cầu gửi tin cho người lạ lớn, bạn nên nâng cấp tài khoản lên gói <strong>Zalo Business</strong> để mở rộng hạn mức và gỡ bỏ giới hạn 40 người lạ/tháng.',
        ]} />
      </Card>
    </div>
  );
}

const PANEL_MAP = {
  overview:     OverviewPanel,
  userguide:    UserGuidePanel,
  safeguide:    SafeGuidePanel,
  dashboard:    DashboardPanel,
  multiAccount: MultiAccountPanel,
  messaging:    MessagingPanel,
  crm:          CrmPanel,
  workflow:     WorkflowPanel,
  'integration-pos': IntegrationPOSPanel,
  'integration-payment': IntegrationPaymentPanel,
  'integration-shipping': IntegrationShippingPanel,
  'ai-assistant': AIAssistantPanel,
  analytics:    AnalyticsPanel,
  erp:          ErpPanel,
  employees:    EmployeesPanel,
  security:     SecurityPanel,
  policy:       PolicyPanel,
  bugreport:    BugReportPanel,
  contact:      ContactPanel,
} satisfies Record<FeatureId, React.FC>;

// ─── Main component ───────────────────────────────────────────────────────────

interface IntroductionSettingsProps {
  initialSubtab?: FeatureId;
}

export default function IntroductionSettings({ initialSubtab }: IntroductionSettingsProps = {}) {
  const [activeFeature, setActiveFeature] = useState<FeatureId>(initialSubtab || 'overview');
  const Panel = PANEL_MAP[activeFeature];

  // Listen for external subtab navigation events
  useEffect(() => {
    const handler = (e: Event) => {
      const { subtab } = (e as CustomEvent).detail || {};
      if (subtab && subtab in PANEL_MAP) {
        setActiveFeature(subtab as FeatureId);
      }
    };
    window.addEventListener('nav:intro-subtab', handler);
    return () => window.removeEventListener('nav:intro-subtab', handler);
  }, []);

  // Reset to initialSubtab when prop changes (e.g. parent re-renders with new event)
  useEffect(() => {
    if (initialSubtab && initialSubtab in PANEL_MAP) {
      setActiveFeature(initialSubtab);
    }
  }, [initialSubtab]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-white flex items-center gap-2">
        <AppIcon name="book" className="text-blue-500" size={16} />
        Giới thiệu & Hướng dẫn sử dụng
      </h2>

      <div className="flex gap-0 border border-gray-700 rounded-xl overflow-hidden" style={{ minHeight: '30rem' }}>
        {/* Left: Feature tabs */}
        <div className="w-44 flex-shrink-0 border-r border-gray-700 bg-gray-850 flex flex-col py-2 gap-0.5 overflow-y-auto">
          {FEATURES.map(f => {
            const isActive = activeFeature === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFeature(f.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors border-r-2 ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500'
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200 border-transparent'
                }`}
              >
                <AppIcon name={f.icon} className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} size={14} />
                <span className="font-medium leading-tight">{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Panel />
        </div>
      </div>
    </div>
  );
}

