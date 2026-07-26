/**
 * build-mac.js
 * Script tự động đóng gói ứng dụng Zagi dành riêng cho macOS (Intel & Apple Silicon)
 * và tự động ký số (Code Sign) & kiểm duyệt (Notarization) với Apple.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BRIDGE_DIR = path.join(ROOT_DIR, 'src', 'bridge-e2ee');
const BUILD_DIR = path.join(BRIDGE_DIR, 'build');

function run(cmd, cwd = ROOT_DIR) {
  console.log(`[build-mac] $ ${cmd} (cwd: ${path.relative(ROOT_DIR, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

async function main() {
  console.log('=== BẮT ĐẦU QUY TRÌNH ĐÓNG GÓI DÀNH RIÊNG CHO MACOS ===');

  // Kiểm tra các biến môi trường bắt buộc cho ký số và Notarization
  if (!process.env.APPLE_ID) {
    console.error('❌ Lỗi: Thiếu biến môi trường APPLE_ID (Email tài khoản Apple Developer).');
    console.error('Vui lòng chạy: export APPLE_ID="your_email@gmail.com"');
    process.exit(1);
  }
  if (!process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.error('❌ Lỗi: Thiếu biến môi trường APPLE_APP_SPECIFIC_PASSWORD (Mật khẩu ứng dụng Apple).');
    console.error('Vui lòng chạy: export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"');
    process.exit(1);
  }

  // 1. Dọn dẹp & Chuẩn bị build bridge-e2ee
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  console.log('\n[1/4] Chuẩn bị dependency của Go E2EE Bridge...');
  const metaDir = path.join(BRIDGE_DIR, 'meta');
  if (!fs.existsSync(metaDir)) {
    console.log('[build-mac] Cloning mautrix/meta...');
    run('git clone --depth=1 https://github.com/mautrix/meta.git ./meta', BRIDGE_DIR);
  }
  run('go mod tidy', BRIDGE_DIR);

  // 2. Biên dịch Go bridge cho macOS (amd64 và arm64)
  console.log('\n[2/4] Biên dịch Go E2EE Bridge cho macOS...');
  console.log('  -> macOS amd64...');
  run('GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o build/bridge-mac-x64 .', BRIDGE_DIR);
  console.log('  -> macOS arm64...');
  run('GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o build/bridge-mac-arm64 .', BRIDGE_DIR);
  console.log('  -> Ghép macOS Universal binary...');
  run('lipo -create -output build/bridge-mac build/bridge-mac-x64 build/bridge-mac-arm64', BRIDGE_DIR);
  
  if (fs.existsSync(path.join(BUILD_DIR, 'bridge-mac-x64'))) {
    fs.unlinkSync(path.join(BUILD_DIR, 'bridge-mac-x64'));
  }
  if (fs.existsSync(path.join(BUILD_DIR, 'bridge-mac-arm64'))) {
    fs.unlinkSync(path.join(BUILD_DIR, 'bridge-mac-arm64'));
  }

  console.log('=== BIÊN DỊCH GO BRIDGE HOÀN TẤT ===');

  // 3. Chuẩn bị source code Electron
  console.log('\n[3/4] Biên dịch source code Electron & Strip console.log...');
  run('npx tsc -p tsconfig.electron.prod.json');
  run('node scripts/strip-console.js');
  run('npm run build:renderer');

  // Dọn dẹp tệp tạm trong build/ để tránh đóng gói nhầm
  const cleanBuildBinaries = () => {
    const files = ['fbchat-bridge-e2ee', 'fbchat-bridge-e2ee.exe'];
    for (const f of files) {
      const p = path.join(BUILD_DIR, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  };

  // 4. Tiến hành đóng gói macOS
  console.log('\n[4/4] Đóng gói macOS qua electron-builder...');
  cleanBuildBinaries();
  fs.copyFileSync(
    path.join(BUILD_DIR, 'bridge-mac'),
    path.join(BUILD_DIR, 'fbchat-bridge-e2ee')
  );

  // Chạy electron-builder build cho mac
  run('npx electron-builder --mac --publish never');

  // Dọn dẹp file trung gian
  console.log('\n[Cleanup] Dọn dẹp các binary trung gian...');
  cleanBuildBinaries();
  if (fs.existsSync(path.join(BUILD_DIR, 'bridge-mac'))) {
    fs.unlinkSync(path.join(BUILD_DIR, 'bridge-mac'));
  }

  // Đổi tên file cài đặt đầu ra cho thân thiện với người dùng
  console.log('\n[Rename] Đổi tên file cài đặt macOS...');
  const distDir = path.join(ROOT_DIR, 'dist-electron-build');
  const pkg = require(path.join(ROOT_DIR, 'package.json'));
  const version = pkg.version;

  const renameMappings = [
    { from: `Zagi-${version}-arm64.dmg`, to: `Zagi.v${version}.MacOS.M1+.arm64.dmg` },
    { from: `Zagi-${version}.dmg`, to: `Zagi.v${version}.MacOS.Intel.dmg` }
  ];

  for (const m of renameMappings) {
    const oldPath = path.join(distDir, m.from);
    const newPath = path.join(distDir, m.to);
    if (fs.existsSync(oldPath)) {
      console.log(`  -> Đổi tên: ${m.from} ===> ${m.to}`);
      fs.copyFileSync(oldPath, newPath);
    }
  }

  console.log('\n🏁 HOÀN TẤT BUILD & SIGN CHO MACOS: dist-electron-build/');
}

main().catch(err => {
  console.error('\n❌ Có lỗi xảy ra trong quá trình build:', err);
  process.exit(1);
});
