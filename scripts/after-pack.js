/**
 * after-pack.js — runs after electron-builder packs the app.
 *
 * On Windows: uses rcedit to embed the correct icon and version metadata
 * into the main Electron executable, because electron-builder's built-in
 * icon injection requires signAndEditExecutable=true (which also triggers
 * code signing). This script provides the icon embedding without signing.
 *
 * On macOS/Linux: no action needed — icons are handled by the bundle format.
 */

'use strict';

const path  = require('path');
const fs    = require('fs');

module.exports = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName === 'darwin') {
    const { execSync } = require('child_process');
    const productName = packager.appInfo.productName;
    const appPath = path.join(appOutDir, `${productName}.app`);

    if (!fs.existsSync(appPath)) {
      console.warn(`[after-pack] Zagi.app not found at ${appPath}, skipping codesign`);
      return;
    }

    try {
      console.log(`[after-pack] Force applying deep ad-hoc signature to ${appPath}...`);
      execSync(`codesign --force --deep --sign - "${appPath}"`);
      console.log(`[after-pack] ✅ Deep ad-hoc signature applied successfully`);
    } catch (err) {
      console.error(`[after-pack] ❌ codesign failed:`, err.message);
    }
    return;
  }

  if (electronPlatformName !== 'win32') return;

  // Path to the unpacked .exe
  const productName = packager.appInfo.productName;
  const exePath = path.join(appOutDir, `${productName}.exe`);

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] exe not found at ${exePath}, skipping icon embed`);
    return;
  }

  const iconPath = path.resolve(__dirname, '../resources/icons/icon.ico');
  if (!fs.existsSync(iconPath)) {
    console.warn(`[after-pack] icon.ico not found at ${iconPath}, skipping`);
    return;
  }

  try {
    const { rcedit } = require('rcedit');
    const pkg    = require('../package.json');

    await rcedit(exePath, {
      icon: iconPath,
      'version-string': {
        ProductName:      pkg.build.productName || pkg.name,
        FileDescription:  pkg.description || pkg.name,
        CompanyName:      'Deplao',
        LegalCopyright:   `Copyright © ${new Date().getFullYear()} Deplao`,
        OriginalFilename: `${productName}.exe`,
      },
      'file-version':    pkg.version,
      'product-version': pkg.version,
    });

    console.log(`[after-pack] ✅ Icon & version metadata embedded into ${productName}.exe`);
  } catch (err) {
    console.error('[after-pack] ❌ rcedit failed:', err.message);
    // Non-fatal — build continues without icon embed
  }
};


