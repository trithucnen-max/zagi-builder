#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createApiKey, getDbPath } = require('../auth');

function updateHermesConfig(apiKey, scriptPath) {
  const configPath = path.join(process.env.HOME, '.hermes', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    console.log('[-] Không tìm thấy ~/.hermes/config.yaml — bỏ qua cập nhật Hermes.');
    return false;
  }

  let content = fs.readFileSync(configPath, 'utf8');
  const targetHeader = 'mcp_servers:\n';

  if (!content.includes(targetHeader)) {
    content += '\nmcp_servers:\n';
  }

  const zagiServerBlock = `  zagi:
    command: node
    args:
      - ${scriptPath}
    env:
      ZAGI_API_KEY: ${apiKey}
    connect_timeout: 30
    timeout: 60`;

  if (content.includes('  zagi:')) {
    // Thay thế block zagi hiện có
    content = content.replace(/  zagi:[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|\n[a-zA-Z0-9_-]+:|$)/, zagiServerBlock);
  } else {
    // Chèn mới dưới mcp_servers:
    content = content.replace(targetHeader, targetHeader + zagiServerBlock + '\n');
  }

  fs.writeFileSync(configPath, content, 'utf8');
  console.log('[+] Đã cập nhật tự động vào Hermes: ~/.hermes/config.yaml');
  return true;
}

function updateAntigravityConfig(apiKey, scriptPath) {
  const configPath = path.join(process.env.HOME, '.gemini', 'config', 'mcp_config.json');
  if (!fs.existsSync(configPath)) {
    console.log('[-] Không tìm thấy mcp_config.json của Antigravity — bỏ qua.');
    return false;
  }

  try {
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!json.mcpServers) json.mcpServers = {};

    json.mcpServers.zagi = {
      command: 'node',
      args: [scriptPath],
      env: {
        ZAGI_API_KEY: apiKey
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(json, null, 2), 'utf8');
    console.log('[+] Đã cập nhật tự động vào Antigravity: ~/.gemini/config/mcp_config.json');
    return true;
  } catch (err) {
    console.error('[-] Lỗi cập nhật Antigravity mcp_config.json:', err.message);
    return false;
  }
}

function updateClaudeDesktopConfig(apiKey, scriptPath) {
  const configPath = path.join(process.env.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (!fs.existsSync(configPath)) {
    return false;
  }

  try {
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!json.mcpServers) json.mcpServers = {};

    json.mcpServers.zagi = {
      command: 'node',
      args: [scriptPath],
      env: {
        ZAGI_API_KEY: apiKey
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(json, null, 2), 'utf8');
    console.log('[+] Đã cập nhật tự động vào Claude Desktop!');
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log('====================================================');
  console.log('  ZAGI AI AGENT & MCP GATEWAY - AUTO SETUP TOOL    ');
  console.log('====================================================\n');

  const dbPath = getDbPath();
  console.log(`[i] Định vị CSDL Zagi: ${dbPath}`);

  // 1. Sinh Key mới trong Database Zagi
  const agentName = process.argv[2] || 'Hermes & Antigravity Master Agent';
  console.log(`[i] Đang khởi tạo API Key mới cho: "${agentName}"...`);
  const keyInfo = createApiKey({
    name: agentName,
    scopes: ['read', 'send', 'crm', 'admin']
  });

  console.log('\n----------------------------------------------------');
  console.log(`[✓] KHỞI TẠO KEY THÀNH CÔNG!`);
  console.log(`    API Key:    ${keyInfo.rawKey}`);
  console.log(`    Key Prefix: ${keyInfo.keyPrefix}`);
  console.log(`    Mã băm:     Đã lưu mã SHA-256 an toàn trong SQLite`);
  console.log(`    Quyền hạn:  ${keyInfo.scopes.join(', ')}`);
  console.log('----------------------------------------------------\n');

  // 2. Định vị file index.js của zagi-mcp
  const serverPath = path.resolve(__dirname, '..', 'index.js');

  // 3. Tự động ghi vào các hệ thống AI Agent trên máy
  console.log('[i] Đang tự động ghép nối cấu hình AI Agents...');
  updateHermesConfig(keyInfo.rawKey, serverPath);
  updateAntigravityConfig(keyInfo.rawKey, serverPath);
  updateClaudeDesktopConfig(keyInfo.rawKey, serverPath);

  console.log('\n====================================================');
  console.log('  HOÀN TẤT THIẾT LẬP!                              ');
  console.log('  Hermes & Antigravity đã sẵn sàng điều khiển Zagi.');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('[!] Lỗi thiết lập:', err.message);
  process.exit(1);
});
