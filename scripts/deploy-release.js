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
    const newSectionHeader = `## [${tag}] - ${todayStr}\n\n### 🐛 Sửa lỗi\n\n- Sửa lỗi cơ chế lọc của node Truy vấn khách hàng CRM (\`crm.getContacts\`):\n  - Sửa lỗi phân giải nhãn Local & Zalo về ID số nguyên cục bộ trong bảng SQLite.\n  - Khắc phục lỗi lọc giới tính bị ngược và hiển thị sai trên giao diện xem trước (Nam = 0, Nữ = 1).\n  - Khắc phục lỗi lệch ngày sinh nhật do múi giờ hệ thống bằng cơ chế kiểm tra sinh nhật timezone-safe.\n  - Thêm bộ lọc \`owner_zalo_id\` đồng bộ SQL query của execution node và preview node.\n\n`;
    
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
  const macArmFile = `Zagi v${targetVersion} MacOS M1+ arm64.dmg`;
  const macIntelFile = `Zagi v${targetVersion} MacOS Intel.dmg`;
  const macArmPath = path.join(distDir, macArmFile);
  const macIntelPath = path.join(distDir, macIntelFile);

  if (!fs.existsSync(macArmPath) || !fs.existsSync(macIntelPath)) {
    console.error('❌ Lỗi: Không tìm thấy file DMG sau khi build macOS!');
    rl.close();
    return;
  }

  console.log('\n✅ Build macOS thành công:');
  console.log(`  - ${macArmFile}`);
  console.log(`  - ${macIntelFile}`);

  // 5. Upload macOS binaries to GitHub Release
  console.log(`\n⚡ Bước 5: Tải bản macOS lên GitHub Release...`);
  
  if (!isOverwrite) {
    console.log('Đang tạo/kiểm tra GitHub Release để tải tệp lên...');
    try {
      execSync(`GH_TOKEN=${GH_TOKEN} gh release create ${tag} --title "🎉 Zagi ${tag}" --notes "Bản phát hành v${targetVersion} sửa lỗi bộ lọc CRM." --draft`, { stdio: 'inherit', cwd: ROOT_DIR });
    } catch (e) {
      console.log('⚠️ Release đã tồn tại hoặc đang được tạo bởi CI/CD, tiếp tục tải lên...');
    }
  }

  console.log(`Đang tải lên các tệp tin cài đặt macOS vào Release ${tag}...`);
  try {
    execSync(`GH_TOKEN=${GH_TOKEN} gh release upload ${tag} "${macArmPath}" "${macIntelPath}" --clobber`, { stdio: 'inherit', cwd: ROOT_DIR });
    console.log('🎉 Tải lên các tệp macOS thành công!');
  } catch (err) {
    console.error('❌ Lỗi khi tải lên GitHub Release:', err.message);
  }

  console.log('\n🏁 QUY TRÌNH HOÀN TẤT!');
  console.log('Vui lòng kiểm tra lại GitHub Releases để xác nhận tất cả các phiên bản (Windows, Linux, macOS) đã hiển thị chính xác.');
  rl.close();
}

main().catch(err => {
  console.error('❌ Có lỗi xảy ra trong quy trình:', err);
  rl.close();
});
