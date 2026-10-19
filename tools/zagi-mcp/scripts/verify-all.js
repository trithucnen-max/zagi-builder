/**
 * Comprehensive Verification Script for Zagi Dynamic API Key & Agent MCP Integration
 * (Option C Bootstrap + Option A Settings UI)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const HOME = process.env.HOME || '';
const DB_PATH = path.join(HOME, 'Library', 'Application Support', 'zagi', 'zagi-tool.db');
const MCP_DIR = path.join(__dirname, '..');
const ZAGI_DIR = path.resolve(__dirname, '../../zagi');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${detail ? '- ' + detail : ''}`);
  }
}

async function runVerification() {
  console.log('====================================================');
  console.log('   BẮT ĐẦU QUY TRÌNH NGHIỆM THU TOÀN DIỆN (/verify)  ');
  console.log('   Zagi Dynamic API Key & Multi-Agent Architecture  ');
  console.log('====================================================\n');

  // ────────────────────────────────────────────────────────────────
  // 1. KIỂM TRA CSDL & SCHEMA
  // ────────────────────────────────────────────────────────────────
  console.log('📦 1. Kiểm tra CSDL SQLite & Bảng agent_api_keys');
  assert(fs.existsSync(DB_PATH), 'File database zagi-tool.db tồn tại', DB_PATH);

  const db = new Database(DB_PATH);
  const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='agent_api_keys'`).get();
  assert(!!tableCheck, 'Bảng agent_api_keys đã được tạo thành công trong CSDL');

  const columns = db.prepare(`PRAGMA table_info(agent_api_keys)`).all().map(c => c.name);
  const expectedCols = ['id', 'key_hash', 'key_prefix', 'name', 'scopes', 'created_at', 'expires_at', 'last_used_at', 'is_revoked'];
  const hasAllCols = expectedCols.every(c => columns.includes(c));
  assert(hasAllCols, 'Bảng có đầy đủ các trường: ' + expectedCols.join(', '));

  // ────────────────────────────────────────────────────────────────
  // 2. KIỂM TRA LOGIC XÁC THỰC BẢO MẬT (auth.js)
  // ────────────────────────────────────────────────────────────────
  console.log('\n🔐 2. Kiểm thử Module Xác Thực SHA-256 (auth.js)');
  const authModule = require(path.join(MCP_DIR, 'auth.js'));

  // 2.1 Sinh key test ngẫu nhiên
  const testRawKey = `zg_live_verify_${crypto.randomBytes(16).toString('hex')}`;
  const testHash = crypto.createHash('sha256').update(testRawKey).digest('hex');
  const testPrefix = testRawKey.slice(0, 15) + '...';

  db.prepare(`
    INSERT INTO agent_api_keys (key_hash, key_prefix, name, scopes, created_at, is_revoked)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(testHash, testPrefix, 'Test Verify Agent', 'read,send', new Date().toISOString());

  // 2.2 Test xác thực key đúng
  const authRes = authModule.validateKey(testRawKey, 'read');
  assert(authRes.valid === true, 'Xác thực thành công với raw key mới');
  assert(authRes.user === 'Test Verify Agent', 'Nhận diện đúng tên Agent');
  assert(authRes.scopes.includes('read') && authRes.scopes.includes('send'), 'Nhận diện đúng scopes');

  // 2.3 Test kiểm tra scope không có
  const forbiddenRes = authModule.validateKey(testRawKey, 'crm');
  assert(forbiddenRes.valid === false && forbiddenRes.error.includes('crm'), 'Từ chối đúng khi thiếu quyền scope (crm)');

  // 2.4 Test cập nhật last_used_at
  const updatedRow = db.prepare(`SELECT last_used_at FROM agent_api_keys WHERE key_hash = ?`).get(testHash);
  assert(!!updatedRow.last_used_at, 'Đã tự động cập nhật last_used_at khi truy cập');

  // 2.5 Test từ chối key sai
  const fakeRes = authModule.validateKey('zg_live_invalid_fake_key_123456');
  assert(fakeRes.valid === false, 'Từ chối chính xác khi key không tồn tại trong CSDL');

  // 2.6 Test thu hồi key (Revoke)
  db.prepare(`UPDATE agent_api_keys SET is_revoked = 1 WHERE key_hash = ?`).run(testHash);
  const revokedRes = authModule.validateKey(testRawKey);
  assert(revokedRes.valid === false && revokedRes.error.includes('thu hồi'), 'Từ chối chính xác khi key đã bị thu hồi (is_revoked = 1)');

  // Dọn dẹp bản ghi test
  db.prepare(`DELETE FROM agent_api_keys WHERE key_hash = ?`).run(testHash);
  console.log('  🧹 Đã dọn dẹp bản ghi kiểm thử trong CSDL.');

  // ────────────────────────────────────────────────────────────────
  // 3. KIỂM TRA BỘ CÀI ĐẶT 1-CHẠM (OPTION C)
  // ────────────────────────────────────────────────────────────────
  console.log('\n🚀 3. Kiểm tra Bộ Cài Đặt 1-Chạm (Option C)');
  const setupScript = path.join(MCP_DIR, 'scripts', 'setup-agent.js');
  const macCommand = path.join(HOME, 'Downloads', 'Cai-Dat-Zagi-Agent.command');
  const winBat = path.join(HOME, 'Downloads', 'Cai-Dat-Zagi-Agent.bat');

  assert(fs.existsSync(setupScript), 'Script CLI setup-agent.js tồn tại');
  assert(fs.existsSync(macCommand), 'File 1-chạm macOS Cai-Dat-Zagi-Agent.command tồn tại');
  assert(fs.existsSync(winBat), 'File 1-chạm Windows Cai-Dat-Zagi-Agent.bat tồn tại');

  // Kiểm tra quyền execute
  const macStat = fs.statSync(macCommand);
  const isExecutable = !!(macStat.mode & 0o111);
  assert(isExecutable, 'Cai-Dat-Zagi-Agent.command có quyền thực thi (chmod +x)');

  // Kiểm tra file config Hermes & Antigravity
  const hermesCfg = path.join(HOME, '.hermes', 'config.yaml');
  if (fs.existsSync(hermesCfg)) {
    const content = fs.readFileSync(hermesCfg, 'utf8');
    assert(content.includes('zagi:') && content.includes('ZAGI_API_KEY:'), 'Hermes config.yaml đã được cấu hình zagi MCP');
  }

  const agyCfg = path.join(HOME, '.gemini', 'config', 'mcp_config.json');
  if (fs.existsSync(agyCfg)) {
    const json = JSON.parse(fs.readFileSync(agyCfg, 'utf8'));
    assert(!!json.mcpServers && !!json.mcpServers.zagi && !!json.mcpServers.zagi.env.ZAGI_API_KEY, 'Antigravity mcp_config.json đã được cấu hình zagi MCP');
  }

  // ────────────────────────────────────────────────────────────────
  // 4. KIỂM TRA GIAO DIỆN CÀI ĐẶT NATIVE (OPTION A)
  // ────────────────────────────────────────────────────────────────
  console.log('\n🎨 4. Kiểm tra Giao Diện Cài Đặt Native (Option A)');
  const designMd = path.join(ZAGI_DIR, 'DESIGN.md');
  const agentSettingsFile = path.join(ZAGI_DIR, 'src', 'ui', 'components', 'settings', 'AgentSettings.tsx');
  const settingsFile = path.join(ZAGI_DIR, 'src', 'ui', 'components', 'settings', 'Settings.tsx');
  const agentIpcFile = path.join(ZAGI_DIR, 'electron', 'ipc', 'agentIpc.ts');
  const mainFile = path.join(ZAGI_DIR, 'electron', 'main.ts');
  const preloadFile = path.join(ZAGI_DIR, 'electron', 'preload.ts');
  const ipcLibFile = path.join(ZAGI_DIR, 'src', 'ui', 'lib', 'ipc.ts');

  assert(fs.existsSync(designMd), 'DESIGN.md tồn tại tại gốc dự án (Tuân thủ TIER 2)');
  assert(fs.existsSync(agentSettingsFile), 'Component AgentSettings.tsx tồn tại');
  assert(fs.existsSync(agentIpcFile), 'Module electron/ipc/agentIpc.ts tồn tại');

  const settingsContent = fs.readFileSync(settingsFile, 'utf8');
  assert(settingsContent.includes("import AgentSettings from './AgentSettings'") && settingsContent.includes("'agent'"), 'Settings.tsx đã tích hợp tab AgentSettings');

  const mainContent = fs.readFileSync(mainFile, 'utf8');
  assert(mainContent.includes('registerAgentIpc'), 'electron/main.ts đã đăng ký registerAgentIpc');

  const preloadContent = fs.readFileSync(preloadFile, 'utf8');
  assert(preloadContent.includes('agent:'), 'electron/preload.ts đã expose agent qua electronAPI');

  const ipcLibContent = fs.readFileSync(ipcLibFile, 'utf8');
  assert(ipcLibContent.includes('agent:'), 'src/ui/lib/ipc.ts đã export proxy agent');

  // ────────────────────────────────────────────────────────────────
  // 5. TỔNG KẾT NGHIỆM THU
  // ────────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`KẾT QUẢ NGHIỆM THU: ${passedTests}/${totalTests} KIỂM TRA ĐẠT (Passed)`);
  if (failedTests === 0) {
    console.log('🎉 TẤT CẢ CÁC HẠNG MỤC ĐÃ HOÀN TẤT VÀ HOẠT ĐỘNG HOÀN HẢO!');
  } else {
    console.log(`⚠️ Có ${failedTests} bài kiểm tra chưa đạt.`);
  }
  console.log('====================================================\n');

  db.close();
  process.exit(failedTests === 0 ? 0 : 1);
}

runVerification().catch(err => {
  console.error('Lỗi khi chạy nghiệm thu:', err);
  process.exit(1);
});
