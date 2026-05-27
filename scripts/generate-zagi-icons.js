const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const SOURCE_PNG = '/Users/kimtrungduong/.gemini/antigravity-ide/brain/d7c09809-e4b5-4924-8655-d004802c6cec/media__1779908852256.png';
const ICONS_DIR = path.resolve(__dirname, '../resources/icons');

function generate() {
  console.log(`[IconGen] Reading source PNG: ${SOURCE_PNG}`);
  if (!fs.existsSync(SOURCE_PNG)) {
    console.error(`[IconGen] Source file not found: ${SOURCE_PNG}`);
    process.exit(1);
  }

  const input = fs.readFileSync(SOURCE_PNG);

  // Ensure icons directory exists
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  // 1. Copy PNG source to resources/icons under various names
  const targets = [
    'icon.png',
    'icon_128.png',
    'icon_dot.png',
    'icon_dot_128.png'
  ];

  targets.forEach(t => {
    const dest = path.join(ICONS_DIR, t);
    fs.writeFileSync(dest, input);
    console.log(`[IconGen] Saved PNG target: ${dest}`);
  });

  // 2. Generate ICO and ICNS files
  console.log('[IconGen] Generating ICNS (macOS) file...');
  const icnsBuffer = png2icons.createICNS(input, png2icons.BILINEAR, 0);
  if (icnsBuffer) {
    fs.writeFileSync(path.join(ICONS_DIR, 'icon.icns'), icnsBuffer);
    console.log('[IconGen] Saved icon.icns');
  } else {
    console.error('[IconGen] Failed to create ICNS');
  }

  console.log('[IconGen] Generating ICO (Windows) files...');
  // forWinExe=true creates a mix of BMP and PNG inside the ICO, which is recommended for Electron
  const icoBuffer = png2icons.createICO(input, png2icons.BICUBIC2, 0, false, true);
  if (icoBuffer) {
    const icoTargets = [
      'icon.ico',
      'icon_128.ico',
      'icon_dot.ico',
      'icon_dot_128.ico'
    ];
    icoTargets.forEach(t => {
      fs.writeFileSync(path.join(ICONS_DIR, t), icoBuffer);
      console.log(`[IconGen] Saved ICO target: ${t}`);
    });
  } else {
    console.error('[IconGen] Failed to create ICO');
  }

  console.log('[IconGen] ✅ All icons successfully generated!');
}

generate();
