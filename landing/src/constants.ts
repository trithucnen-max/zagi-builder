// ──────────────────────────────────────────────────────────────
//  Landing page — Cấu hình dùng chung
//
//  ⚠️  Khi nâng cấp phiên bản, CHỈ CẦN SỬA APP_VERSION ở đây.
//  Tất cả nút tải xuống sẽ tự cập nhật URL.
// ──────────────────────────────────────────────────────────────

/** Phiên bản hiện tại — đồng bộ với package.json root */
export const APP_VERSION = '3.1.1';

const GH_RELEASES = 'https://github.com/trithucnen-max/zagi-builder/releases';
const GH_TAG_DOWNLOAD = `${GH_RELEASES}/download/v${APP_VERSION}`;

/** Trang releases GitHub */
export const RELEASES_URL = GH_RELEASES;

/** Trang GitHub repo */
export const GITHUB_URL = 'https://github.com/trithucnen-max/zagi-builder';

/** Windows — NSIS installer */
export const DOWNLOAD_FILENAME      = `Zagi.v${APP_VERSION}.Window.exe`;
export const DOWNLOAD_URL           = `${GH_TAG_DOWNLOAD}/${DOWNLOAD_FILENAME}`;

export const DOWNLOAD_FILENAME_WIN_ARM = `Zagi.v${APP_VERSION}.Surface.exe`;
export const DOWNLOAD_URL_WIN_ARM      = `${GH_TAG_DOWNLOAD}/${DOWNLOAD_FILENAME_WIN_ARM}`;

/** macOS — Apple Silicon (M1/M2/M3) */
export const DOWNLOAD_FILENAME_MAC_ARM64 = `Zagi.v${APP_VERSION}.MacOS.M1+.arm64.dmg`;
export const DOWNLOAD_URL_MAC_ARM64      = `${GH_TAG_DOWNLOAD}/Zagi.v${APP_VERSION}.MacOS.M1%2B.arm64.dmg`;

/** macOS — Intel (x64) */
export const DOWNLOAD_FILENAME_MAC_X64 = `Zagi.v${APP_VERSION}.MacOS.Intel.dmg`;
export const DOWNLOAD_URL_MAC_X64      = `${GH_TAG_DOWNLOAD}/${DOWNLOAD_FILENAME_MAC_X64}`;

/** Linux — AppImage (x64, works on any distro) */
export const DOWNLOAD_FILENAME_LINUX   = `Zagi.v${APP_VERSION}.Linux.AppImage`;
export const DOWNLOAD_URL_LINUX         = `${GH_TAG_DOWNLOAD}/${DOWNLOAD_FILENAME_LINUX}`;

/** Linux — .deb (Ubuntu/Debian) */
export const DOWNLOAD_FILENAME_LINUX_DEB = `Zagi.v${APP_VERSION}.Linux.Debian.deb`;
export const DOWNLOAD_URL_LINUX_DEB      = `${GH_TAG_DOWNLOAD}/${DOWNLOAD_FILENAME_LINUX_DEB}`;
