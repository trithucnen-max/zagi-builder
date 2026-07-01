/**
 * build-all-platforms.js
 * Script tự động đóng gói ứng dụng Zagi cho mọi nền tảng:
 *   - macOS (universal dmg)
 *   - Windows (x64 setup.exe)
 *   - Windows ARM64 / Surface (arm64 setup.exe)
 *   - Linux (AppImage & deb)
 *
 * Thực hiện:
 *   1. Biên dịch chéo (Cross-compile) E2EE Bridge Go cho 5 mục tiêu kiến trúc
 *   2. Copy bridge tương thích vào src/bridge-e2ee/build/ trước khi chạy electron-builder cho từng OS
 *   3. Đóng gói ra thư mục dist-electron-build/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BRIDGE_DIR = path.join(ROOT_DIR, 'src', 'bridge-e2ee');
const BUILD_DIR = path.join(BRIDGE_DIR, 'build');

function run(cmd, cwd = ROOT_DIR) {
  console.log(`[build-all] $ ${cmd} (cwd: ${path.relative(ROOT_DIR, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

async function main() {
  console.log('=== BẮT ĐẦU QUY TRÌNH ĐÓNG GÓI ĐA NỀN TẢNG ===');

  // 1. Dọn dẹp & Chuẩn bị build bridge-e2ee
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  // Chạy go mod tidy trước
  console.log('\n[1/4] Chuẩn bị dependency của Go E2EE Bridge...');
  const metaDir = path.join(BRIDGE_DIR, 'meta');
  if (!fs.existsSync(metaDir)) {
    console.log('[build-all] Cloning mautrix/meta...');
    run('git clone --depth=1 https://github.com/mautrix/meta.git ./meta', BRIDGE_DIR);
  }
  run('go mod tidy', BRIDGE_DIR);

  // 2. Biên dịch chéo bridge Go
  console.log('\n[2/4] Đang biên dịch chéo Go E2EE Bridge cho các OS/CPU...');
  
  // macOS AMD64 & ARM64
  console.log('  -> macOS amd64...');
  run('GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o build/bridge-mac-x64 .', BRIDGE_DIR);
  console.log('  -> macOS arm64...');
  run('GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o build/bridge-mac-arm64 .', BRIDGE_DIR);
  console.log('  -> Ghép macOS Universal binary...');
  run('lipo -create -output build/bridge-mac build/bridge-mac-x64 build/bridge-mac-arm64', BRIDGE_DIR);
  fs.unlinkSync(path.join(BUILD_DIR, 'bridge-mac-x64'));
  fs.unlinkSync(path.join(BUILD_DIR, 'bridge-mac-arm64'));

  // Windows x64 & ARM64 (Surface)
  console.log('  -> Windows x64...');
  run('GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o build/bridge-win-x64.exe .', BRIDGE_DIR);
  console.log('  -> Windows arm64 (Surface)...');
  run('GOOS=windows GOARCH=arm64 go build -ldflags="-s -w" -o build/bridge-win-arm64.exe .', BRIDGE_DIR);

  // Linux x64
  console.log('  -> Linux amd64...');
  run('GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o build/bridge-linux-x64 .', BRIDGE_DIR);

  console.log('=== BIÊN DỊCH CHÉO GO BRIDGE HOÀN TẤT ===');

  // 3. Chuẩn bị source code Electron
  console.log('\n[3/4] Biên dịch source code Electron & Strip console.log...');
  run('npx tsc -p tsconfig.electron.prod.json');
  run('node scripts/strip-console.js');
  run('npm run build:renderer');

  // Helper dọn dẹp các tệp tạm trong build/ để tránh đóng gói nhầm
  const cleanBuildBinaries = () => {
    const files = ['fbchat-bridge-e2ee', 'fbchat-bridge-e2ee.exe'];
    for (const f of files) {
      const p = path.join(BUILD_DIR, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  };

  // 4. Tiến hành đóng gói từng platform
  console.log('\n[4/4] Đóng gói các bộ cài đặt thông qua electron-builder...');

  // === ĐÓNG GÓI MAC ===
  console.log('\n--- Đóng gói macOS (Intel & Apple Silicon) ---');
  cleanBuildBinaries();
  fs.copyFileSync(
    path.join(BUILD_DIR, 'bridge-mac'),
    path.join(BUILD_DIR, 'fbchat-bridge-e2ee')
  );
  run('npx electron-builder --mac --publish never');

  // === ĐÓNG GÓI WINDOWS X64 ===
  console.log('\n--- Đóng gói Windows x64 ---');
  cleanBuildBinaries();
  fs.copyFileSync(
    path.join(BUILD_DIR, 'bridge-win-x64.exe'),
    path.join(BUILD_DIR, 'fbchat-bridge-e2ee.exe')
  );
  run('npx electron-builder --win --x64 --publish never');

  // === ĐÓNG GÓI WINDOWS ARM64 (Surface) ===
  console.log('\n--- Đóng gói Windows ARM64 (Surface) ---');
  cleanBuildBinaries();
  fs.copyFileSync(
    path.join(BUILD_DIR, 'bridge-win-arm64.exe'),
    path.join(BUILD_DIR, 'fbchat-bridge-e2ee.exe')
  );
  run('npx electron-builder --win --arm64 --publish never');

  // === ĐÓNG GÓI LINUX ===
  console.log('\n--- Đóng gói Linux ---');
  cleanBuildBinaries();
  fs.copyFileSync(
    path.join(BUILD_DIR, 'bridge-linux-x64'),
    path.join(BUILD_DIR, 'fbchat-bridge-e2ee')
  );
  run('npx electron-builder --linux --publish never');

  // Dọn dẹp các file trung gian
  console.log('\n[Cleanup] Dọn dẹp các binary trung gian...');
  cleanBuildBinaries();
  const intermediateFiles = ['bridge-mac', 'bridge-win-x64.exe', 'bridge-win-arm64.exe', 'bridge-linux-x64'];
  for (const f of intermediateFiles) {
    const p = path.join(BUILD_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log('\n🏁 TẤT CẢ CÁC BỘ CÀI ĐÃ ĐƯỢC XUẤT THÀNH CÔNG TẠI: dist-electron-build/');
}

main().catch(err => {
  console.error('\n❌ Có lỗi xảy ra trong quá trình đóng gói:', err);
  process.exit(1);
});
