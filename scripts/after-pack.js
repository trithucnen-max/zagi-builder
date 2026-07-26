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
    if (process.env.APPLE_ID || process.env.CSC_LINK || process.env.CSC_NAME) {
      console.log(`[after-pack] Official macOS signing detected, skipping ad-hoc signature.`);
      return;
    }

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
    const resedit = require('resedit');
    const { NtExecutable, NtExecutableResource, Resource, Data } = resedit;
    const pkg = require('../package.json');

    console.log(`[after-pack] Embedding icon & version metadata into ${productName}.exe using resedit-js...`);
    const exeBuffer = fs.readFileSync(exePath);
    const exe = NtExecutable.from(exeBuffer);
    const res = NtExecutableResource.from(exe);

    // Ghi đè Icon
    const iconBuffer = fs.readFileSync(iconPath);
    const iconFile = Data.IconFile.from(iconBuffer);
    Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      1033,
      iconFile.icons.map((item) => item.data)
    );

    // Ghi đè VersionInfo
    const versionStr = pkg.version || '1.0.0';
    const parts = versionStr.split('.').map(x => parseInt(x, 10));
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    const build = parts[3] || 0;

    const viList = Resource.VersionInfo.fromEntries(res.entries);
    let vi;
    if (viList.length > 0) {
      vi = viList[0];
    } else {
      vi = new Resource.VersionInfo();
    }

    vi.fixedInfo.fileVersionMS = (major << 16) | minor;
    vi.fixedInfo.fileVersionLS = (patch << 16) | build;
    vi.fixedInfo.productVersionMS = (major << 16) | minor;
    vi.fixedInfo.productVersionLS = (patch << 16) | build;

    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        FileVersion: versionStr,
        ProductVersion: versionStr,
        ProductName: productName,
        FileDescription: pkg.description || productName,
        CompanyName: 'Deplao',
        LegalCopyright: `Copyright © ${new Date().getFullYear()} Deplao`,
        OriginalFilename: `${productName}.exe`,
      }
    );

    vi.outputToResourceEntries(res.entries);

    // Xuất bản và ghi lại file exe
    res.outputResource(exe);
    const newBinary = exe.generate();
    fs.writeFileSync(exePath, Buffer.from(newBinary));

    console.log(`[after-pack] ✅ Icon & version metadata embedded into ${productName}.exe successfully`);
  } catch (err) {
    console.error('[after-pack] ❌ resedit failed:', err.message);
    // Non-fatal — build continues without icon embed
  }
};


