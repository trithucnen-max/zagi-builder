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
    
    console.log(`👤 Active account: ${account.zalo_id}`);
    
    let cookiesStr = '';
    if (account.cookies.startsWith('{') || account.cookies.startsWith('[')) {
      cookiesStr = account.cookies;
    } else {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const decryptedBuf = safeStorage.decryptString(Buffer.from(account.cookies, 'base64'));
          cookiesStr = decryptedBuf;
          console.log('🔑 Cookies decrypted successfully!');
        } catch (decErr) {
          console.error('❌ safeStorage.decryptString failed:', decErr.message);
          app.quit();
          return;
        }
      } else {
        console.error('❌ Encryption not available');
        app.quit();
        return;
      }
    }
    
    // Parse cookies as JSON array
    let cookieObj;
    try {
      cookieObj = JSON.parse(cookiesStr);
      console.log('Parsed cookies count:', Array.isArray(cookieObj) ? cookieObj.length : typeof cookieObj);
    } catch (parseErr) {
      console.error('❌ JSON parse of cookies failed:', parseErr.message);
      console.log('Raw cookies string preview:', cookiesStr.substring(0, 100));
      app.quit();
      return;
    }
    
    console.log('📡 Importing zca-js...');
    const { Zalo } = await import('zca-js');
    
    console.log('⏳ Logging in to Zalo...');
    const zalo = new Zalo({ checkUpdate: false, logging: false });
    const api = await zalo.login({
      cookie: cookieObj,
      imei: account.imei,
      userAgent: account.user_agent
    });
    console.log('✅ Logged in successfully');
    
    // Test UIDs from the database that are NOT friends
    const testUids = ['2112235801589299399', '1694233472845930772', '6624481729733574777'];
    
    console.log('\n--- Test 1: getUserInfo (getprofiles/v2) ---');
    try {
      const res = await api.getUserInfo(testUids);
      console.log('getUserInfo Response:');
      console.log(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('getUserInfo failed:', e);
    }
    
    console.log('\n--- Test 2: getGroupMembersInfo (/api/social/group/members) ---');
    try {
      const uidsForApi = testUids.map(id => `${id}_0`);
      const res = await api.getGroupMembersInfo(uidsForApi);
      console.log('getGroupMembersInfo Response:');
      console.log(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('getGroupMembersInfo failed:', e);
    }
    
  } catch (err) {
    console.error('❌ Error occurred:', err);
  } finally {
    app.quit();
  }
});
