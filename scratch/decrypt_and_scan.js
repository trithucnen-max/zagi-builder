const { app, safeStorage } = require('electron');
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

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
        const decryptedBuf = safeStorage.decryptString(Buffer.from(account.cookies, 'base64'));
        cookiesStr = decryptedBuf;
        console.log('🔑 Cookies decrypted successfully');
      } else {
        console.error('❌ Encryption not available, cannot decrypt cookies');
        app.quit();
        return;
      }
    }
    
    // Parse cookies
    const cookieObj = {};
    cookiesStr.split(';').forEach(pair => {
      const [k, ...v] = pair.trim().split('=');
      if (k) cookieObj[k.trim()] = v.join('=').trim();
    });
    
    console.log('📡 Importing zca-js...');
    const { Zalo } = await import('zca-js');
    
    console.log('⏳ Logging in to Zalo...');
    const zalo = new Zalo(
      { cookie: cookieObj, imei: account.imei, userAgent: account.user_agent },
      { checkUpdate: false, logging: false }
    );
    const api = await zalo.login();
    console.log('✅ Logged in successfully');
    
    const testLinks = [
      'https://zalo.me/g/sftdih296',
      'https://zalo.me/g/uivfdquqxmu0bxiyuyro'
    ];
    
    for (const link of testLinks) {
      console.log('\n========================================');
      console.log(`🔗 Scanning link: ${link}`);
      console.log('----------------------------------------');
      
      const res = await api.getGroupLinkInfo({ link, memberPage: 1 });
      console.log('Full getGroupLinkInfo Response:');
      console.log(JSON.stringify(res, null, 2));
    }
    
  } catch (err) {
    console.error('❌ Error occurred:', err);
  } finally {
    app.quit();
  }
});
