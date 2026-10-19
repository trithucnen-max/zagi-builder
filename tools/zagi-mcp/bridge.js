const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const DEVTOOLS_PORT_FILE = path.join(process.env.HOME, 'Library/Application Support/zagi/DevToolsActivePort');
const DB_FILE = path.join(process.env.HOME, 'Library/Application Support/zagi/zagi-tool.db');

class ZagiBridge {
  constructor() {
    this.ws = null;
    this.cdpPort = null;
    this.connected = false;
    this.pendingRequests = new Map();
    this.reqId = 1;
  }

  getDevToolsPort() {
    if (!fs.existsSync(DEVTOOLS_PORT_FILE)) {
      throw new Error(`Zagi chưa khởi động hoặc không tìm thấy file DevToolsActivePort tại: ${DEVTOOLS_PORT_FILE}`);
    }
    const content = fs.readFileSync(DEVTOOLS_PORT_FILE, 'utf8').trim();
    const port = parseInt(content.split('\n')[0], 10);
    if (!port || isNaN(port)) {
      throw new Error(`Không đọc được port từ DevToolsActivePort: ${content}`);
    }
    return port;
  }

  async getPageTarget(port) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const list = JSON.parse(raw);
            const page = list.find(t => t.type === 'page');
            if (!page) {
              return reject(new Error('Không tìm thấy mục page đang mở trong Zagi Electron'));
            }
            resolve(page);
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
    });
  }

  async connect() {
    const port = this.getDevToolsPort();
    this.cdpPort = port;
    const page = await this.getPageTarget(port);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(page.webSocketDebuggerUrl);

      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve: reqResolve, reject: reqReject } = this.pendingRequests.get(msg.id);
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              reqReject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              reqResolve(msg.result);
            }
          }
        } catch (err) {
          console.error('[ZagiBridge] Message parsing error:', err.message);
        }
      });

      this.ws.on('error', (err) => {
        this.connected = false;
        reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.ws = null;
      });
    });
  }

  async eval(code) {
    await this.connect();
    const id = ++this.reqId;
    const payload = {
      id,
      method: 'Runtime.evaluate',
      params: {
        expression: `(async () => { return ${code}; })()`,
        awaitPromise: true,
        returnByValue: true
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout 15s chờ kết quả từ Zagi`));
      }, 15000);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          if (result.exceptionDetails) {
            return reject(new Error(result.exceptionDetails.exception?.description || 'Exception in Zagi evaluation'));
          }
          resolve(result.result?.value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.ws.send(JSON.stringify(payload));
    });
  }

  async getStatus() {
    const isAppRunning = fs.existsSync(DEVTOOLS_PORT_FILE);
    if (!isAppRunning) {
      return { status: 'offline', message: 'Zagi chưa được bật trên máy tính' };
    }

    try {
      const info = await this.eval(`(() => {
        const title = document.title;
        const hasApi = typeof window.electronAPI !== 'undefined';
        return {
          title,
          hasApi,
          url: window.location.href,
          timestamp: new Date().toISOString()
        };
      })()`);

      // Kiểm tra relay port 9900
      let relayListening = false;
      try {
        const statusRes = await this.eval(`window.electronAPI.relay ? await window.electronAPI.relay.getServerStatus() : null`);
        relayListening = statusRes?.isRunning || false;
      } catch (e) {}

      return {
        status: 'online',
        cdpPort: this.cdpPort,
        relayRunning: relayListening,
        ...info
      };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  async listAccounts() {
    return await this.eval(`(async () => {
      if (!window.electronAPI?.db?.getContacts) return [];
      // Lấy từ SQLite qua electronAPI
      const list = await window.electronAPI.login.getAccounts ? await window.electronAPI.login.getAccounts() : null;
      return list || [];
    })()`);
  }

  async getUnreadChats() {
    return await this.eval(`(async () => {
      if (!window.electronAPI?.db) return [];
      // Lấy danh sách hội thoại có tin nhắn chưa đọc
      const unreadCount = await window.electronAPI.db.getUnreadCount();
      return unreadCount || [];
    })()`);
  }

  async getThreadMessages(threadId, limit = 20) {
    return await this.eval(`(async () => {
      if (!window.electronAPI?.db?.getMessages) return [];
      const msgs = await window.electronAPI.db.getMessages({ threadId: "${threadId}", limit: ${limit} });
      return msgs || [];
    })()`);
  }

  async sendMessage({ threadId, message, type = 0, accountZaloId }) {
    // Escape string an toàn
    const cleanMsg = typeof message === 'string' ? JSON.stringify(message) : JSON.stringify(message);
    const code = `(async () => {
      if (!window.electronAPI?.zalo?.sendMessage) {
        throw new Error("window.electronAPI.zalo.sendMessage không sẵn sàng");
      }
      return await window.electronAPI.zalo.sendMessage({
        zaloId: ${accountZaloId ? `"${accountZaloId}"` : 'undefined'},
        auth: {},
        message: ${cleanMsg},
        threadId: "${threadId}",
        type: ${type},
        typeMessage: 'text'
      });
    })()`;
    return await this.eval(code);
  }

  async searchContacts(query) {
    const cleanQ = JSON.stringify(query);
    return await this.eval(`(async () => {
      if (!window.electronAPI?.db) return [];
      // Tìm danh bạ theo số điện thoại hoặc tên
      const res = await window.electronAPI.db.searchContactByPhone ? await window.electronAPI.db.searchContactByPhone(${cleanQ}) : null;
      return res || [];
    })()`);
  }

  async scanPhone(phone, accountZaloId) {
    const cleanPhone = JSON.stringify(phone);
    return await this.eval(`(async () => {
      if (!window.electronAPI?.zalo?.findUser) {
        throw new Error("zalo.findUser không sẵn sàng");
      }
      return await window.electronAPI.zalo.findUser({
        zaloId: ${accountZaloId ? `"${accountZaloId}"` : 'undefined'},
        auth: {},
        phone: ${cleanPhone}
      });
    })()`);
  }
}

const bridgeInstance = new ZagiBridge();
module.exports = bridgeInstance;
