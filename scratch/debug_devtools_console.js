/**
 * PASTE TOÀN BỘ ĐOẠN NÀY VÀO DEVTOOLS CONSOLE (Ctrl+Shift+I → Console)
 * 
 * Script sẽ tự lấy auth từ account đang active, test 2 API và in kết quả
 */
(async () => {
  const { ipc } = window.__deplaoGlobals__ || {};

  // Lấy auth từ account store
  const accountStore = window.__accountStore__ || (window.__stores__ && window.__stores__.account);
  
  // Try to get from React devtools or global state
  let auth = null;
  let activeId = null;
  
  // Method 1: via ipc electron
  try {
    const accounts = await window.electron?.ipcRenderer?.invoke('db:getAccounts') || [];
    if (accounts.length > 0) {
      const acc = accounts[0];
      activeId = acc.zalo_id;
      auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
      console.log('✅ Got auth via ipc, zaloId:', activeId);
    }
  } catch(e) {
    console.warn('method1 failed:', e.message);
  }

  if (!auth) {
    console.error('❌ Cannot get auth. Please check manually.');
    return;
  }

  const LINKS = [
    'https://zalo.me/g/uivfdquqxmu0bxiyuyro',
    'https://zalo.me/g/sftdih296',
  ];

  for (const link of LINKS) {
    console.group(`\n🔗 ${link}`);

    // Test getGroupLinkInfo
    console.log('📡 Testing getGroupLinkInfo...');
    try {
      const res1 = await window.electron?.ipcRenderer?.invoke('zalo:getGroupLinkInfo', { auth, link, memberPage: 1 });
      console.log('  success:', res1?.success);
      const data = res1?.response || res1?.data;
      console.log('  groupId:', data?.groupId);
      console.log('  lockViewMember:', data?.setting?.lockViewMember ?? data?.lockViewMember ?? 'N/A');
      console.log('  currentMems.length:', (data?.currentMems || []).length);
      console.log('  hasMoreMember:', data?.hasMoreMember);
      console.log('  adminIds:', data?.adminIds);

      const groupId = data?.groupId;

      // Test getGroupInfo
      if (groupId) {
        console.log(`\n📡 Testing getGroupInfo(${groupId})...`);
        try {
          const res2 = await window.electron?.ipcRenderer?.invoke('zalo:getGroupInfo', { auth, groupId });
          console.log('  success:', res2?.success);
          const raw = res2?.response || res2?.data;
          console.log('  response keys:', Object.keys(raw || {}));

          const gridInfoMap = raw?.gridInfoMap ?? raw?.data?.gridInfoMap;
          console.log('  gridInfoMap:', !!gridInfoMap ? `exists, keys: ${Object.keys(gridInfoMap)}` : 'NOT FOUND');

          if (gridInfoMap) {
            const gData = gridInfoMap[groupId] || Object.values(gridInfoMap)[0];
            if (gData) {
              console.log('  gData keys:', Object.keys(gData));
              const memVerList = gData.memVerList;
              const entries = Array.isArray(memVerList) ? memVerList : (memVerList ? Object.keys(memVerList) : []);
              console.log('  ✅ memVerList count:', entries.length);
              console.log('  memberIds count:', (gData.memberIds || []).length);
              console.log('  currentMems count:', (gData.currentMems || []).length);
            }
          }
          console.log('\n  📦 FULL RAW RESPONSE:');
          console.log(JSON.stringify(res2, null, 2));
        } catch(e2) {
          console.error('  ❌ getGroupInfo error:', e2.message);
        }
      }
    } catch(e1) {
      console.error('❌ getGroupLinkInfo error:', e1.message);
    }
    
    console.groupEnd();
  }
})();
