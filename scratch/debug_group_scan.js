/**
 * DEBUG: Group scan diagnosis script
 * Chạy: node scratch/debug_group_scan.js
 * 
 * Script này test trực tiếp 2 API:
 *   1. getGroupLinkInfo  → xem currentMems có rỗng không
 *   2. getGroupInfo      → xem memVerList có UID không
 */

const path = require('path');

// ─── CẤU HÌNH: điền vào đây ──────────────────────────────────────────────────
const COOKIES = process.env.ZALO_COOKIES || '';   // paste cookie string vào đây
const IMEI    = process.env.ZALO_IMEI    || '';   // paste imei vào đây
const UA      = process.env.ZALO_UA      || 'Mozilla/5.0';

const LINKS = [
  'https://zalo.me/g/uivfdquqxmu0bxiyuyro',  // nhóm đã test
  'https://zalo.me/g/sftdih296',             // nhóm mới bạn thêm
];
// ─────────────────────────────────────────────────────────────────────────────

if (!COOKIES || !IMEI) {
  console.error('❌ Cần điền COOKIES và IMEI!');
  console.error('   Chạy: ZALO_COOKIES="..." ZALO_IMEI="..." node scratch/debug_group_scan.js');
  process.exit(1);
}

async function main() {
  // Import zca-js
  const { Zalo } = await import('../node_modules/zca-js/dist/index.js');

  const zalo = new Zalo(
    { cookie: parseCookies(COOKIES), imei: IMEI, userAgent: UA },
    { checkUpdate: false, logging: false }
  );

  console.log('⏳ Logging in...');
  const api = await zalo.login();
  console.log('✅ Logged in\n');

  for (const link of LINKS) {
    console.log('═'.repeat(70));
    console.log(`🔗 LINK: ${link}`);
    console.log('─'.repeat(70));

    // ── TEST 1: getGroupLinkInfo ──────────────────────────────────────────
    console.log('\n📡 [1] getGroupLinkInfo (page=1)...');
    try {
      const res = await api.getGroupLinkInfo({ link, memberPage: 1 });
      const data = res?.data ?? res;
      console.log('  groupId       :', data?.groupId);
      console.log('  name          :', data?.name);
      console.log('  lockViewMember:', data?.setting?.lockViewMember ?? data?.lockViewMember);
      console.log('  hasMoreMember :', data?.hasMoreMember);
      console.log('  currentMems   :', Array.isArray(data?.currentMems) ? `[${data.currentMems.length} items]` : data?.currentMems);
      console.log('  adminIds      :', data?.adminIds);
      console.log('  creatorId     :', data?.creatorId);

      const groupId = data?.groupId;

      // ── TEST 2: getGroupInfo ──────────────────────────────────────────
      if (groupId) {
        console.log(`\n📡 [2] getGroupInfo(${groupId})...`);
        try {
          const infoRes = await api.getGroupInfo(groupId);

          // Dump raw response structure
          const raw = infoRes?.data ?? infoRes;
          console.log('  Response keys:', Object.keys(raw || {}));

          // Try all possible paths
          const gridInfoMap =
            raw?.gridInfoMap ??
            raw?.data?.gridInfoMap ??
            null;

          console.log('  gridInfoMap exists?', !!gridInfoMap);
          console.log('  gridInfoMap keys  :', gridInfoMap ? Object.keys(gridInfoMap) : 'N/A');

          if (gridInfoMap && gridInfoMap[groupId]) {
            const gData = gridInfoMap[groupId];
            console.log('  gData keys        :', Object.keys(gData));
            console.log('  memberIds.length  :', (gData.memberIds || []).length);
            console.log('  currentMems.length:', (gData.currentMems || []).length);

            const memVerList = gData.memVerList;
            console.log('  memVerList type   :', typeof memVerList, Array.isArray(memVerList) ? '(array)' : '');
            if (memVerList && typeof memVerList === 'object') {
              const keys = Array.isArray(memVerList) ? memVerList : Object.keys(memVerList);
              console.log('  memVerList count  :', keys.length);
              console.log('  memVerList sample :', keys.slice(0, 5));
            } else {
              console.log('  memVerList        :', memVerList);
            }

            console.log('  adminIds          :', gData.adminIds);
            console.log('  creatorId         :', gData.creatorId);
          } else {
            console.log('  ⚠️ Không tìm thấy gData cho groupId:', groupId);
            console.log('  Full gridInfoMap  :', JSON.stringify(gridInfoMap, null, 2).substring(0, 500));
          }
        } catch (e2) {
          console.error('  ❌ getGroupInfo error:', e2.message);
        }
      }
    } catch (e1) {
      console.error('  ❌ getGroupLinkInfo error:', e1.message);
    }
    console.log();
  }
}

function parseCookies(cookieStr) {
  const cookies = {};
  cookieStr.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
