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
        const decryptedBuf = safeStorage.decryptString(Buffer.from(account.cookies, 'base64'));
        cookiesStr = decryptedBuf;
        console.log('🔑 Cookies decrypted successfully');
      } else {
        console.error('❌ Encryption not available, cannot decrypt cookies');
        app.quit();
        return;
      }
    }
    
    const cookieObj = JSON.parse(cookiesStr);
    
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
    
    const link = 'https://zalo.me/g/uivfdquqxmu0bxiyuyro';
    console.log('\n========================================');
    console.log(`🔗 Scanning link: ${link}`);
    console.log('----------------------------------------');
    
    const res = await api.getGroupLinkInfo({ link, memberPage: 1 });
    const data = res?.response || res?.data || res;
    const groupId = data?.groupId;
    
    console.log('groupId:', groupId);
    console.log('lockViewMember:', data?.setting?.lockViewMember);
    console.log('currentMems length:', (data?.currentMems || []).length);
    
    if (groupId) {
      console.log(`\n📡 Calling getGroupInfo(${groupId})...`);
      const infoRes = await api.getGroupInfo(groupId);
      const raw = infoRes?.response || infoRes?.data || infoRes;
      const gridMap = raw?.gridInfoMap ?? raw?.data?.gridInfoMap ?? {};
      const gData = gridMap[groupId] ?? Object.values(gridMap)[0];
      
      if (gData) {
        console.log('gData keys:', Object.keys(gData));
        console.log('memberIds length:', (gData.memberIds || []).length);
        console.log('currentMems length in getGroupInfo:', (gData.currentMems || []).length);
        
        const memVerList = gData.memVerList;
        if (memVerList) {
          const keys = Array.isArray(memVerList) ? memVerList : Object.keys(memVerList);
          console.log('memVerList type:', typeof memVerList, 'isArray:', Array.isArray(memVerList));
          console.log('memVerList UIDs count:', keys.length);
          console.log('Sample UIDs from memVerList:', keys.slice(0, 10));
        } else {
          console.log('memVerList is missing or empty');
        }
      } else {
        console.log('No gData found for groupId in gridMap');
      }
    }
    
  } catch (err) {
    console.error('❌ Error occurred:', err);
  } finally {
    app.quit();
  }
});
