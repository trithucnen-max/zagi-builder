const { app, safeStorage } = require('electron');
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

app.setName('Zagi');
app.setPath('userData', '/Users/kimtrungduong/Library/Application Support/zagi');

app.whenReady().then(async () => {
  console.log('🤖 Electron ready');
  
  try {
    const dbPath = '/Users/kimtrungduong/Library/Application Support/zagi/zagi-tool.db';
    console.log(`📂 Opening DB: ${dbPath}`);
    const db = new BetterSqlite3(dbPath);
    
    const account = db.prepare('SELECT zalo_id, cookies, imei, user_agent FROM accounts WHERE is_active = 1 LIMIT 1;').get();
    if (!account) {
      console.error('❌ No active account found in DB');
      app.quit();
      return;
    }
    
    let cookiesStr = '';
    if (account.cookies.startsWith('{') || account.cookies.startsWith('[')) {
      cookiesStr = account.cookies;
    } else {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const decryptedBuf = safeStorage.decryptString(Buffer.from(account.cookies, 'base64'));
          cookiesStr = decryptedBuf;
        } catch (decErr) {
          console.error('❌ safeStorage.decryptString failed:', decErr.message);
          app.quit();
          return;
        }
      }
    }
    
    const cookieObj = JSON.parse(cookiesStr);
    
    console.log('📡 Importing zca-js...');
    const { Zalo } = await import('zca-js');
    
    const zalo = new Zalo({ checkUpdate: false, logging: false });
    const api = await zalo.login({
      cookie: cookieObj,
      imei: account.imei,
      userAgent: account.user_agent
    });
    console.log('✅ Logged in successfully');
    
    // Fetch all member UIDs from the database for this group
    const members = db.prepare("SELECT member_id FROM page_group_member WHERE group_id = '1027841549708015828'").all();
    const memberIds = members.map(m => m.member_id);
    console.log(`Total members in DB: ${memberIds.length}`);
    
    // Let's test calling getGroupMembersInfo with ALL 231 members at once
    console.log('\n--- Test: Calling with ALL 231 members at once ---');
    try {
      const uidsForApi = memberIds.map(id => `${id}_0`);
      const res = await api.getGroupMembersInfo(uidsForApi);
      const profilesCount = res?.profiles ? Object.keys(res.profiles).length : 0;
      console.log(`ALL members call success? ${!!res} | Profiles returned: ${profilesCount}`);
      if (profilesCount > 0) {
        console.log('Sample profiles:', Object.keys(res.profiles).slice(0, 5));
      }
    } catch (e) {
      console.error('ALL members call failed:', e.message);
    }
    
    // Let's test calling getGroupMembersInfo in batches of 50
    console.log('\n--- Test: Calling in BATCHES of 50 ---');
    const BATCH_SIZE = 50;
    let totalProfilesResolved = 0;
    
    for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
      const batch = memberIds.slice(i, i + BATCH_SIZE);
      const uidsForApi = batch.map(id => `${id}_0`);
      console.log(`Fetching batch ${i / BATCH_SIZE + 1} (${batch.length} members)...`);
      try {
        const res = await api.getGroupMembersInfo(uidsForApi);
        const profiles = res?.profiles ?? {};
        const count = Object.keys(profiles).length;
        totalProfilesResolved += count;
        console.log(`Batch ${i / BATCH_SIZE + 1} profiles returned: ${count}`);
        
        // Log a few names from this batch
        const names = Object.values(profiles).slice(0, 3).map(p => p.displayName);
        console.log(`  Names: ${names.join(', ')}`);
        
        // Add a small delay between batches
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, e.message);
      }
    }
    
    console.log(`\nTotal profiles resolved in batches: ${totalProfilesResolved}/${memberIds.length}`);
    
  } catch (err) {
    console.error('❌ Error occurred:', err);
  } finally {
    app.quit();
  }
});
