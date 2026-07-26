# Plan: Ký số (Code Signing) và Kiểm duyệt (Notarization) ứng dụng Zagi cho macOS

Tài liệu này vạch ra kế hoạch chi tiết để cấu hình ký số chính thức (Option A) và kiểm duyệt với Apple cho ứng dụng Zagi chạy trên macOS, giúp người dùng cài đặt ứng dụng mà không gặp cảnh báo bảo mật từ Gatekeeper.

## Project Type
- **Type**: Desktop App (Electron)
- **OS Target**: macOS (Intel & Apple Silicon / Universal)

---

## User Review Required

> [!IMPORTANT]
> **Yêu cầu quan trọng về chứng chỉ (Private Key):**
> Bạn đã cung cấp Mật khẩu ứng dụng: `nbwb-itqw-jozo-skxb`. Để ký số thành công, bạn **bắt buộc** phải có **Private Key (Khóa riêng tư)** đi kèm với chứng chỉ `developerID_application.cer` đã cài đặt trong ứng dụng **Keychain Access (Móc khóa)** trên MacBook của bạn.
> Nếu chỉ có file `.cer` mà không có private key tương ứng trong Keychain, quá trình ký số sẽ thất bại.

---

## Open Questions

> [!WARNING]
> Vui lòng xác nhận và cung cấp các thông tin sau để điền vào cấu hình:
> 1. **Apple ID (Email tài khoản Developer)** của bạn là gì? (Ví dụ: `developer@zagi.com`)
> 2. **Apple Team ID** của bạn là gì? (Chuỗi 10 ký tự, ví dụ: `A1B2C3D4E5`, xem trên Apple Developer Console).
> 3. Chứng chỉ `developerID_application.cer` đã được import vào Keychain Access và có hiển thị biểu tượng khóa private key đi kèm không?

---

## Proposed Changes

### Build Configuration

#### [MODIFY] [package.json](file:///Users/kimtrungduong/Downloads/deplao/package.json)
- Bật `hardenedRuntime: true` để đáp ứng tiêu chuẩn notarize của Apple.
- Bật `gatekeeperAssess: true` để xác thực Gatekeeper.
- Thêm đường dẫn tới `entitlements` và `entitlementsInherit` từ thư mục `resources/`.
- Cấu hình phần `notarize` sử dụng `teamId`.

#### [MODIFY] [after-pack.js](file:///Users/kimtrungduong/Downloads/deplao/scripts/after-pack.js)
- Sửa logic kiểm tra: nếu phát hiện biến môi trường ký số chính thức (`APPLE_ID` hoặc `CSC_NAME` hoặc `CSC_LINK`), bỏ qua bước tự động ký ad-hoc (`codesign --sign -`) để tránh đè lên chữ ký chính thức của `electron-builder`.

### Helper Scripts

#### [NEW] [build-mac.js](file:///Users/kimtrungduong/Downloads/deplao/scripts/build-mac.js)
- Tạo một script build tối ưu dành riêng cho macOS (chỉ biên dịch Go E2EE Bridge cho darwin/amd64 và darwin/arm64, ghép lipo tạo universal binary, và chạy `electron-builder --mac`). Điều này giúp tiết kiệm thời gian so với việc compile chéo cho mọi OS trong `build-all-platforms.js`.

---

## Task Breakdown

### Phase 1: Môi trường & Chứng chỉ (Local Environment)
- **Task ID**: `env-setup`
- **Agent**: `devops-engineer`
- **Skills**: `bash-linux`, `deployment-procedures`
- **Priority**: P0
- **Dependencies**: None
- **INPUT**: Chứng chỉ `developerID_application.cer` và private key.
- **OUTPUT**: Chứng chỉ đã được import vào Keychain của macOS và có thể tìm thấy bởi lệnh `security find-identity -v -p codesigning`.
- **VERIFY**: Chạy lệnh `security find-identity -v -p codesigning` trong Terminal để kiểm tra danh sách chứng chỉ hợp lệ.

### Phase 2: Cấu hình mã nguồn (Configuration)
- **Task ID**: `config-signing`
- **Agent**: `devops-engineer`
- **Skills**: `clean-code`
- **Priority**: P1
- **Dependencies**: `env-setup`
- **INPUT**: File [package.json](file:///Users/kimtrungduong/Downloads/deplao/package.json) và [after-pack.js](file:///Users/kimtrungduong/Downloads/deplao/scripts/after-pack.js).
- **OUTPUT**: Cập nhật cấu hình macOS sign & notarize trong `package.json`, và sửa đổi `after-pack.js` để tránh ghi đè chữ ký.
- **VERIFY**: Kiểm tra cú pháp JSON của `package.json` và file `after-pack.js`.

### Phase 3: Script Build tối ưu (Helper Script)
- **Task ID**: `macos-build-script`
- **Agent**: `devops-engineer`
- **Skills**: `clean-code`, `bash-linux`
- **Priority**: P2
- **Dependencies**: `config-signing`
- **INPUT**: Yêu cầu build cục bộ dành riêng cho macOS.
- **OUTPUT**: File script [build-mac.js](file:///Users/kimtrungduong/Downloads/deplao/scripts/build-mac.js) chỉ build cho macOS darwin.
- **VERIFY**: Chạy thử biên dịch Go E2EE Bridge cục bộ cho macOS để đảm bảo không lỗi.

### Phase 4: Thực hiện Đóng gói & Ký số (Execution & Notarization)
- **Task ID**: `execute-build-sign`
- **Agent**: `devops-engineer`
- **Skills**: `deployment-procedures`
- **Priority**: P3
- **Dependencies**: `macos-build-script`
- **INPUT**: Biến môi trường: `APPLE_ID`, `APPLE_ID_PASSWORD` (nbwb-itqw-jozo-skxb), `APPLE_TEAM_ID`.
- **OUTPUT**: File cài đặt `.dmg` đã được đóng gói, ký số và gửi lên Apple kiểm duyệt (notarize) thành công.
- **VERIFY**: Quá trình đóng gói chạy không lỗi và thông báo notarize hoàn tất từ Apple.

---

## Verification Plan

### Automated Tests & Checks
- Kiểm tra chữ ký của app sau khi build:
  ```bash
  codesign -dvvv dist-electron-build/mac-universal/Zagi.app
  ```
- Kiểm tra tính hợp lệ của Gatekeeper đối với app:
  ```bash
  spctl --assess --verbose dist-electron-build/mac-universal/Zagi.app
  ```
- Kiểm tra trạng thái notarization:
  ```bash
  stapler validate dist-electron-build/mac-universal/Zagi.app
  ```

### Manual Verification
- Người dùng cài đặt thử bản `.dmg` được xuất ra trong thư mục `dist-electron-build/` lên một máy MacBook khác (hoặc gửi cho máy khác chạy thử) để xác nhận không còn cảnh báo "nhà phát triển không xác định".

---

## ✅ PHASE X: VERIFICATION CHECKLIST
- [ ] Danh sách chứng chỉ hợp lệ hiển thị trong Keychain: `[ ]`
- [ ] Cấu hình package.json đã cập nhật: `[ ]`
- [ ] Script after-pack.js đã sửa đổi: `[ ]`
- [ ] Chạy lệnh build macOS thành công: `[ ]`
- [ ] App được ký và notarize thành công (spctl pass): `[ ]`
- [ ] Bản build đầu ra nằm trong thư mục local, không push lên GitHub: `[ ]`
