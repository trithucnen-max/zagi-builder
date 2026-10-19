import { ipcMain } from 'electron';
import DatabaseService from '../../src/services/database/DatabaseService';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import Logger from '../../src/utils/Logger';

function hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

export function registerAgentIpc(): void {
    const db = DatabaseService.getInstance();

    // ─── 1. Liệt kê các API Key ──────────────────────────────────────────
    ipcMain.handle('agent:listKeys', async () => {
        try {
            const rows = db.query<any>(`
                SELECT id, key_prefix, name, scopes, created_at, expires_at, last_used_at, is_revoked
                FROM agent_api_keys
                ORDER BY id DESC
            `);
            const keys = (rows || []).map((k: any) => ({
                ...k,
                scopes: (k.scopes || '').split(','),
                isActive: k.is_revoked === 0 && (!k.expires_at || new Date(k.expires_at) > new Date())
            }));
            return { success: true, keys };
        } catch (err: any) {
            Logger.error('[agentIpc] listKeys error:', err);
            return { success: false, error: err.message, keys: [] };
        }
    });

    // ─── 2. Tạo API Key mới ──────────────────────────────────────────────
    ipcMain.handle('agent:createKey', async (_e, params: { name?: string; scopes?: string[]; expiresDays?: number }) => {
        try {
            const rawKey = `zg_live_${crypto.randomBytes(24).toString('hex')}`;
            const keyHash = hashKey(rawKey);
            const keyPrefix = rawKey.slice(0, 15) + '...';
            const name = params?.name?.trim() || 'AI Agent';
            const scopes = params?.scopes && params.scopes.length > 0 ? params.scopes : ['read', 'send', 'crm'];
            const scopeStr = scopes.join(',');
            const createdAt = new Date().toISOString();
            let expiresAt: string | null = null;
            if (params?.expiresDays && params.expiresDays > 0) {
                expiresAt = new Date(Date.now() + params.expiresDays * 86400000).toISOString();
            }

            db.run(`
                INSERT INTO agent_api_keys (key_hash, key_prefix, name, scopes, created_at, expires_at, is_revoked)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            `, [keyHash, keyPrefix, name, scopeStr, createdAt, expiresAt]);

            return {
                success: true,
                key: {
                    rawKey,
                    keyPrefix,
                    name,
                    scopes,
                    createdAt,
                    expiresAt
                }
            };
        } catch (err: any) {
            Logger.error('[agentIpc] createKey error:', err);
            return { success: false, error: err.message };
        }
    });

    // ─── 3. Thu hồi API Key ─────────────────────────────────────────────
    ipcMain.handle('agent:revokeKey', async (_e, { id }: { id: number }) => {
        try {
            db.run(`UPDATE agent_api_keys SET is_revoked = 1 WHERE id = ?`, [id]);
            return { success: true };
        } catch (err: any) {
            Logger.error('[agentIpc] revokeKey error:', err);
            return { success: false, error: err.message };
        }
    });

    // ─── 4. Tự động đồng bộ cấu hình vào Hermes / Antigravity ───────────
    ipcMain.handle('agent:autoConfigureMCP', async (_e, { rawKey }: { rawKey: string }) => {
        try {
            const home = process.env.HOME || '';
            const mcpScriptPath = path.join(home, '.hermes', 'tools', 'zagi-mcp', 'index.js');
            const results: { hermes?: boolean; antigravity?: boolean } = {};

            // Hermes
            const hermesCfg = path.join(home, '.hermes', 'config.yaml');
            if (fs.existsSync(hermesCfg)) {
                let content = fs.readFileSync(hermesCfg, 'utf8');
                const targetHeader = 'mcp_servers:\n';
                const zagiBlock = `  zagi:
    command: node
    args:
      - ${mcpScriptPath}
    env:
      ZAGI_API_KEY: ${rawKey}
    connect_timeout: 30
    timeout: 60`;

                if (content.includes('  zagi:')) {
                    content = content.replace(/  zagi:[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|\n[a-zA-Z0-9_-]+:|$)/, zagiBlock);
                } else if (content.includes(targetHeader)) {
                    content = content.replace(targetHeader, targetHeader + zagiBlock + '\n');
                }
                fs.writeFileSync(hermesCfg, content, 'utf8');
                results.hermes = true;
            }

            // Antigravity
            const agyCfg = path.join(home, '.gemini', 'config', 'mcp_config.json');
            if (fs.existsSync(agyCfg)) {
                const json = JSON.parse(fs.readFileSync(agyCfg, 'utf8'));
                if (!json.mcpServers) json.mcpServers = {};
                json.mcpServers.zagi = {
                    command: 'node',
                    args: [mcpScriptPath],
                    env: { ZAGI_API_KEY: rawKey }
                };
                fs.writeFileSync(agyCfg, JSON.stringify(json, null, 2), 'utf8');
                results.antigravity = true;
            }

            return { success: true, results };
        } catch (err: any) {
            Logger.error('[agentIpc] autoConfigureMCP error:', err);
            return { success: false, error: err.message };
        }
    });
}
