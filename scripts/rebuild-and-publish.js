const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

const TOKEN = process.env.GH_TOKEN || '';
const OWNER = 'trithucnen-max';
const REPO = 'zagi-builder';
const pkg = require('../package.json');
const version = pkg.version;
const TAG = `v${version}`;

const headers = {
  Authorization: `token ${TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

const distDir = path.resolve(__dirname, '..', 'dist-electron-build');

const filesToUpload = [
  `Zagi v${version} Window.exe`,
  `Zagi v${version} Surface.exe`,
  `Zagi v${version} MacOS M1+ arm64.dmg`,
  `Zagi v${version} MacOS Intel.dmg`,
  `Zagi v${version} Linux.AppImage`,
  `Zagi v${version} Linux Debian.deb`
];

async function main() {
  console.log('⚡ BƯỚC 1: BẮT ĐẦU ĐÓNG GÓI CHO TẤT CẢ CÁC NỀN TẢNG (npm run build:all)...');
  try {
    execSync('npm run build:all', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    console.log('✅ Đóng gói tất cả nền tảng thành công!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình đóng gói:', err.message);
    process.exit(1);
  }

  console.log(`\n⚡ BƯỚC 2: DỌN DẸP FILE CŨ TRÊN GITHUB RELEASE ${TAG}...`);
  let releaseId = null;
  let uploadUrl = '';
  let existingAssets = [];

  try {
    const res = await axios.get(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, { headers });
    releaseId = res.data.id;
    uploadUrl = res.data.upload_url;
    existingAssets = res.data.assets || [];
    console.log(`  -> Tìm thấy Release ${TAG} (ID: ${releaseId}) với ${existingAssets.length} file cũ.`);
  } catch (err) {
    console.error('❌ Lỗi khi lấy thông tin release:', err.message);
    process.exit(1);
  }

  for (const asset of existingAssets) {
    console.log(`  🗑️ Đang xóa file cũ: ${asset.name} (ID: ${asset.id})...`);
    try {
      await axios.delete(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`, { headers });
      console.log(`    ✅ Đã xóa.`);
    } catch (err) {
      console.warn(`    ⚠️ Lỗi khi xóa file cũ:`, err.message);
    }
  }

  console.log('\n⚡ BƯỚC 3: TẢI LÊN CÁC BỘ CÀI ĐẶT MỚI...');
  const cleanUploadUrl = uploadUrl.split('{')[0];

  for (const filename of filesToUpload) {
    const filePath = path.join(distDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`  [Bỏ qua] Không tìm thấy file cục bộ: ${filename}`);
      continue;
    }

    console.log(`📤 Đang tải lên: ${filename}...`);
    const fileStats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    try {
      let contentType = 'application/octet-stream';
      if (filename.endsWith('.exe')) contentType = 'application/x-msdownload';
      if (filename.endsWith('.dmg')) contentType = 'application/x-apple-diskimage';
      if (filename.endsWith('.deb')) contentType = 'application/vnd.debian.binary-package';

      await axios.post(`${cleanUploadUrl}?name=${encodeURIComponent(filename)}`, fileStream, {
        headers: {
          ...headers,
          'Content-Type': contentType,
          'Content-Length': fileStats.size,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      console.log(`  ✅ Thành công: ${filename}`);
    } catch (err) {
      console.error(`  ❌ Lỗi khi tải lên ${filename}:`, err.response ? err.response.data : err.message);
    }
  }

  console.log(`\n🎉 HOÀN TẤT! TẤT CẢ FILE CÀI ĐẶT MỚI ĐÃ ĐƯỢC CẬP NHẬT LÊN GITHUB RELEASES!`);
}

main().catch(err => {
  console.error('Có lỗi xảy ra:', err);
});
