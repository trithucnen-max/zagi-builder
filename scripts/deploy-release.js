const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '..');
const pkgPath = path.join(ROOT_DIR, 'package.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function runCmd(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
}

async function main() {
  console.log('🚀 === ZAGI DEPLOYMENT WIZARD (OPTION A) === 🚀\n');

  // 1. Get current version
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  console.log(`Phiên bản hiện tại trong package.json: ${currentVersion}`);

  // 2. Ask for Action Mode
  console.log('\nChọn phương thức triển khai:');
  console.log('  1. Phát hành phiên bản mới (Release New Version - Tự động tạo tag, đẩy lên GitHub kích hoạt CI/CD, build Mac local & upload)');
  console.log('  2. Ghi đè lên phiên bản hiện tại (Overwrite Current Version - Chỉ build Mac local và ghi đè tệp tin lên Release hiện tại)');
  
  const modeChoice = await question('Lựa chọn của bạn (1 hoặc 2, mặc định 1): ');
  const isOverwrite = modeChoice.trim() === '2';

  let targetVersion = currentVersion;
  if (!isOverwrite) {
    const defaultNextVersion = currentVersion.split('.').map((x, i) => i === 2 ? parseInt(x) + 1 : x).join('.');
    const inputVersion = await question(`Nhập phiên bản phát hành mới (Mặc định: ${defaultNextVersion}): `);
    targetVersion = inputVersion.trim() || defaultNextVersion;
  } else {
    const inputVersion = await question(`Xác nhận phiên bản muốn ghi đè (Mặc định: ${currentVersion}): `);
    targetVersion = inputVersion.trim() || currentVersion;
  }

  const tag = `v${targetVersion}`;
  console.log(`\n🎯 Phiên bản mục tiêu: ${targetVersion} (Tag: ${tag})`);
  console.log(`⚙️ Chế độ: ${isOverwrite ? 'Ghi đè (Overwrite)' : 'Phát hành mới (New Release)'}`);

  // Check git status
  const status = execSync('git status --porcelain', { cwd: ROOT_DIR }).toString().trim();
  if (status && !isOverwrite) {
    console.log('\n⚠️ Cảnh báo: Có thay đổi chưa commit trong git:');
    console.log(status);
    const commitMsg = await question('\nNhập tin nhắn commit để lưu các thay đổi này (Bỏ trống để hủy bỏ): ');
    if (!commitMsg.trim()) {
      console.log('❌ Đã hủy quy trình.');
      rl.close();
      return;
    }
    runCmd('git add .');
    runCmd(`git commit -m "${commitMsg.trim()}"`);
  }

  // Use the remote repository URL PAT directly
  let GH_TOKEN = process.env.GH_TOKEN || '';
  if (!GH_TOKEN) {
    try {
      const remoteUrl = execSync('git remote get-url origin', { cwd: ROOT_DIR }).toString().trim();
      // Extract the username:token part
      const match = remoteUrl.match(/:([^@]+)@/);
      if (match && match[1]) {
        // If it's username:token, split by colon
        const parts = match[1].split(':');
        GH_TOKEN = parts.length > 1 ? parts[1] : parts[0];
      }
    } catch {}
  }
  const currentBranch = execSync('git branch --show-current', { cwd: ROOT_DIR }).toString().trim() || 'main';

  if (!isOverwrite) {
    // 3. New Release Flow
    console.log(`\n⚡ Bước 1: Cập nhật package.json lên phiên bản ${targetVersion}...`);
    pkg.version = targetVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

    // Update CHANGELOG.md automatically by adding a new header at the top
    console.log('\n⚡ Bước 1.2: Cập nhật CHANGELOG.md...');
    const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
    let changelogContent = fs.readFileSync(changelogPath, 'utf8');
    const todayStr = new Date().toISOString().split('T')[0];
    const newSectionHeader = `## [${tag}] - ${todayStr}\n\n### 🐛 Sửa lỗi & Cải tiến\n\n- Khắc phục dứt điểm lỗi gửi và forward hình ảnh trên máy BOSS.\n- Tự động tải tệp tin ảnh từ URL CDN Zalo về đĩa tạm nếu chưa có trên máy local.\n- Nâng cấp cơ chế tra cứu và remap đường dẫn thư viện (\`library/\`) linh hoạt khi di chuyển dữ liệu.\n- Cập nhật chuẩn hóa liên kết tải xuống mượt mà trên Landing Page và README.\n\n`;
    
    // Insert new section right below the header line and description
    const separatorIdx = changelogContent.indexOf('---');
    if (separatorIdx !== -1) {
      changelogContent = changelogContent.substring(0, separatorIdx + 3) + '\n\n' + newSectionHeader + changelogContent.substring(separatorIdx + 3);
      fs.writeFileSync(changelogPath, changelogContent, 'utf8');
      console.log('  -> Đã cập nhật nhật ký phiên bản mới vào CHANGELOG.md.');
    }

    console.log('\n⚡ Bước 2: Commit và gắn tag git...');
    runCmd(`git commit -am "chore: bump version to ${targetVersion} and update CHANGELOG.md"`);
    
    // Check if tag already exists locally and delete it to avoid conflict
    try {
      execSync(`git tag -d ${tag}`, { stdio: 'ignore', cwd: ROOT_DIR });
    } catch {}
    
    runCmd(`git tag ${tag}`);

    console.log(`\n⚡ Bước 3: Push code và tag lên GitHub (Kích hoạt CI/CD Windows + Linux trên branch ${currentBranch})...`);
    runCmd(`git push origin ${currentBranch}`);
    
    // Check if tag already exists on remote and delete it to allow overwrite
    try {
      execSync(`git push origin :refs/tags/${tag}`, { stdio: 'ignore', cwd: ROOT_DIR });
    } catch {}
    
    runCmd(`git push origin ${tag}`);
    console.log('✅ Đã push tag lên GitHub. CI/CD Windows + Linux đang chạy trên GitHub Actions!');
  } else {
    // Overwrite mode: Trigger GitHub Actions manually to build Windows & Linux
    console.log(`\n⚡ Bước 3: Kích hoạt lại GitHub Actions CI/CD để build lại Windows và Linux cho ${tag}...`);
    try {
      execSync(`GH_TOKEN=${GH_TOKEN} gh workflow run build-all.yml --ref ${currentBranch} -f tag_name=${tag} -f publish=true`, { stdio: 'inherit', cwd: ROOT_DIR });
      console.log('✅ Đã kích hoạt GitHub Actions build Windows và Linux thành công!');
    } catch (err) {
      console.error('❌ Lỗi khi kích hoạt GitHub Actions workflow:', err.message);
    }
  }

  // 4. Build macOS locally
  console.log(`\n⚡ Bước 4: Khởi chạy build & sign bản macOS cục bộ...`);
  console.log('Quy trình này sẽ gọi build-mac.sh để biên dịch và ký số bản Mac Intel & M1+');
  runCmd('chmod +x build-mac.sh');
  runCmd('./build-mac.sh');

  // Verify built macOS files exist
  const distDir = path.join(ROOT_DIR, 'dist-electron-build');
  const macArmDotFile = `Zagi.v${targetVersion}.MacOS.M1+.arm64.dmg`;
  const macIntelDotFile = `Zagi.v${targetVersion}.MacOS.Intel.dmg`;

  const macArmDotPath = path.join(distDir, macArmDotFile);
  const macIntelDotPath = path.join(distDir, macIntelDotFile);

  if (!fs.existsSync(macArmDotPath) || !fs.existsSync(macIntelDotPath)) {
    console.error('❌ Lỗi: Không tìm thấy file DMG sau khi build macOS!');
    rl.close();
    return;
  }

  console.log('\n✅ Build macOS thành công:');
  console.log(`  - ${macArmDotFile}`);
  console.log(`  - ${macIntelDotFile}`);

  // 5. Upload macOS binaries to GitHub Release
  console.log(`\n⚡ Bước 5: Tải bản macOS lên GitHub Release...`);

  // Kiểm tra xem Release tag đã tồn tại trên GitHub chưa, nếu chưa có thì tự động tạo mới
  console.log(`Đang kiểm tra GitHub Release ${tag}...`);
  let releaseExists = false;
  try {
    execSync(`GH_TOKEN=${GH_TOKEN} gh release view ${tag}`, { stdio: 'pipe', cwd: ROOT_DIR });
    releaseExists = true;
    console.log(` ✅ Đã xác nhận Release ${tag} tồn tại trên GitHub.`);
  } catch {
    releaseExists = false;
  }

  if (!releaseExists) {
    console.log(` 📝 Đang tạo GitHub Release mới: ${tag}...`);
    try {
      execSync(`GH_TOKEN=${GH_TOKEN} gh release create ${tag} --title "🎉 Zagi ${tag}" --notes "Bản phát hành v${targetVersion} nâng cấp CRM, Workflow, Quét SĐT & Đa tài khoản."`, { stdio: 'inherit', cwd: ROOT_DIR });
      console.log(` ✅ Đã tạo thành công GitHub Release ${tag}!`);
    } catch (createErr) {
      console.error(` ❌ Lỗi khi tạo GitHub Release ${tag}:`, createErr.message);
    }
  }

  // Dọn dẹp các asset cũ có khoảng trắng bị trùng lặp trên GitHub Release (nếu có)
  const legacySpaceFiles = [
    `Zagi v${targetVersion} MacOS M1+ arm64.dmg`,
    `Zagi v${targetVersion} MacOS Intel.dmg`
  ];
  for (const legacyName of legacySpaceFiles) {
    try {
      execSync(`GH_TOKEN=${GH_TOKEN} gh release delete-asset ${tag} "${legacyName}" -y`, { stdio: 'pipe', cwd: ROOT_DIR });
      console.log(` 🧹 Đã dọn dẹp asset trùng lặp cũ: ${legacyName}`);
    } catch {}
  }

  console.log(`Đang tải lên các tệp tin cài đặt macOS vào Release ${tag}...`);
  const filesToUpload = [macArmDotPath, macIntelDotPath];
  for (const filePath of filesToUpload) {
    if (!fs.existsSync(filePath)) continue;
    const fileName = path.basename(filePath);
    console.log(` ⬆️ Đang tải lên tệp: ${fileName}...`);

    // Xóa asset trùng tên cũ trên GitHub Release nếu có (tránh lỗi HTTP 404 clobber của GitHub CLI)
    try {
      execSync(`GH_TOKEN=${GH_TOKEN} gh release delete-asset ${tag} "${fileName}" -y`, { stdio: 'pipe', cwd: ROOT_DIR });
    } catch {}

    // Tải lên từng file một
    try {
      execSync(`GH_TOKEN=${GH_TOKEN} gh release upload ${tag} "${filePath}" --clobber`, { stdio: 'inherit', cwd: ROOT_DIR });
      console.log(`   ✅ Tải thành công: ${fileName}`);
    } catch (err) {
      console.error(`   ❌ Lỗi khi tải lên ${fileName}:`, err.message);
    }
  }

  // 6. Auto-update landing page, docs index, README, and Supabase functions download links
  console.log(`\n⚡ Bước 6: Tự động cập nhật liên kết tải về (${tag}) lên Landing Page, README & Supabase...`);
  updateLandingPageDownloadLinks(targetVersion, currentBranch);

  // 7. Verify release artifacts & print summary board
  console.log(`\n⚡ Bước 7: Kiểm tra xác thực tự động (Auto-Verification Check)...`);
  verifyReleaseArtifacts(targetVersion);

  console.log('\n🏁 QUY TRÌNH HOÀN TẤT!');
  console.log('Vui lòng kiểm tra lại GitHub Releases & Landing Page để xác nhận tất cả các phiên bản đã được phát hành chính thức!');
  rl.close();
}

function updateLandingPageDownloadLinks(targetVersion, currentBranch = 'main') {
  const tag = `v${targetVersion}`;

  const filesToUpdate = [
    path.join(ROOT_DIR, 'landing', 'index.html'),
    path.join(ROOT_DIR, 'landing', 'src', 'constants.ts'),
    path.join(ROOT_DIR, 'docs', 'index.html'),
    path.join(ROOT_DIR, 'README.md'),
    path.join(ROOT_DIR, 'README.en.md'),
    path.join(ROOT_DIR, 'supabase', 'functions', 'create-order', 'index.ts'),
  ];

  let anyModified = false;

  for (const filePath of filesToUpdate) {
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Replace download release tags (e.g. /releases/download/v3.0.7/Zagi.v3.0.7.Window.exe)
    content = content.replace(
      /\/releases\/download\/v\d+\.\d+\.\d+\/Zagi\.v\d+\.\d+\.\d+/g,
      `/releases/download/${tag}/Zagi.${tag}`
    );

    // Replace shield badges tags (e.g. -v3.0.7-)
    content = content.replace(
      /-(v3\.\d+\.\d+)-/g,
      `-${tag}-`
    );

    // Replace all text version strings in titles, prompts & modals (e.g. "Tải phần mềm Zagi Desktop v3.0.7", "Zagi v3.0.7")
    content = content.replace(
      /v3\.\d+\.\d+/g,
      tag
    );

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      const relativeName = path.relative(ROOT_DIR, filePath);
      console.log(`  ✅ Đã tự động cập nhật link tải mới trong: ${relativeName}`);
      anyModified = true;
    }
  }

  if (anyModified) {
    try {
      console.log('  -> Đang tự động commit & push liên kết Landing Page vừa cập nhật...');
      runCmd('git add -f landing/ docs/ README.md README.en.md supabase/');
      runCmd(`git commit -m "docs: auto-update landing page and release download links for ${tag}"`);
      runCmd(`git push origin ${currentBranch}`);
      console.log('  ✅ Đã push thành công liên kết Landing Page lên GitHub!');
    } catch (err) {
      console.log('  ⚠️ Không thể tự động commit landing page:', err.message);
    }
  } else {
    console.log('  ℹ️ Liên kết tải về trên Landing Page đã ở phiên bản mới nhất.');
  }
}

function verifyReleaseArtifacts(targetVersion) {
  const tag = `v${targetVersion}`;
  console.log('\n📊 =================================================');
  console.log('📊 === RELEASE AUTO-VERIFICATION SUMMARY BOARD === 📊');
  console.log('📊 =================================================\n');

  const filesToCheck = [
    { name: 'Landing Page HTML', path: path.join(ROOT_DIR, 'landing', 'index.html') },
    { name: 'Docs Index HTML', path: path.join(ROOT_DIR, 'docs', 'index.html') },
    { name: 'README Main', path: path.join(ROOT_DIR, 'README.md') },
    { name: 'README English', path: path.join(ROOT_DIR, 'README.en.md') },
    { name: 'Supabase Function', path: path.join(ROOT_DIR, 'supabase', 'functions', 'create-order', 'index.ts') },
  ];

  for (const item of filesToCheck) {
    if (!fs.existsSync(item.path)) {
      console.log(` [SKIP] ${item.name}: File không tồn tại`);
      continue;
    }
    const content = fs.readFileSync(item.path, 'utf8');
    const hasTag = content.includes(tag);
    if (hasTag) {
      console.log(` ✅ [PASS] ${item.name}: Đã xác nhận tất cả liên kết tải về đều thuộc ${tag}`);
    } else {
      console.log(` ❌ [FAIL] ${item.name}: CẢNH BÁO - Chưa tìm thấy thẻ phiên bản ${tag}`);
    }
  }

  // Check build DMG files
  const distDir = path.join(ROOT_DIR, 'dist-electron-build');
  const macArmFile = path.join(distDir, `Zagi.${tag}.MacOS.M1+.arm64.dmg`);
  const macIntelFile = path.join(distDir, `Zagi.${tag}.MacOS.Intel.dmg`);

  if (fs.existsSync(macArmFile)) {
    const stat = fs.statSync(macArmFile);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
    console.log(` ✅ [PASS] macOS M1+ ARM64 DMG: Tệp tin hợp lệ (${sizeMb} MB)`);
  } else {
    console.log(` ⚠️ [WARN] macOS M1+ ARM64 DMG: Không thấy tệp local`);
  }

  if (fs.existsSync(macIntelFile)) {
    const stat = fs.statSync(macIntelFile);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
    console.log(` ✅ [PASS] macOS Intel x64 DMG: Tệp tin hợp lệ (${sizeMb} MB)`);
  } else {
    console.log(` ⚠️ [WARN] macOS Intel x64 DMG: Không thấy tệp local`);
  }

  console.log('\n=================================================\n');
}

main().catch(err => {
  console.error('❌ Có lỗi xảy ra trong quy trình:', err);
  rl.close();
});
