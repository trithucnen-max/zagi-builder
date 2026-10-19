#!/usr/bin/env node
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const bridge = require('./bridge');
const { validateKey, ensureAuthConfig } = require('./auth');
const { applyJitter, checkAndIncrementStrangerQuota } = require('./antiban');

// Đảm bảo file cấu hình API Key luôn tồn tại
const authConfig = ensureAuthConfig();

const server = new McpServer({
  name: 'zagi-mcp',
  version: '1.0.0'
});

// ─── 1. Tool: Kiểm tra trạng thái Zagi ─────────────────────────
server.tool(
  'zagi_get_status',
  'Kiểm tra trạng thái hoạt động của Zagi Desktop App, cổng kết nối CDP và trạng thái mạng Relay.',
  {
    apiKey: z.string().optional().describe('Khóa xác thực Zagi API Key (tự động lấy từ biến môi trường ZAGI_API_KEY nếu bỏ trống)')
  },
  async ({ apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    try {
      const status = await bridge.getStatus();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            app: 'Zagi Desktop Automation Gateway',
            authOperator: auth.user,
            ...status
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi kết nối Zagi: ${err.message}` }]
      };
    }
  }
);

// ─── 2. Tool: Danh sách tài khoản Zalo ─────────────────────────
server.tool(
  'zagi_list_accounts',
  'Lấy danh sách các tài khoản Zalo/Facebook đã đăng nhập trên Zagi (tên, số điện thoại, zaloId, trạng thái listener).',
  {
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    try {
      const accounts = await bridge.listAccounts();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(accounts, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi lấy tài khoản: ${err.message}` }]
      };
    }
  }
);

// ─── 3. Tool: Danh sách tin nhắn chưa đọc ─────────────────────
server.tool(
  'zagi_get_unread_chats',
  'Lấy danh sách các hội thoại có tin nhắn mới/chưa đọc trên Zagi.',
  {
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    try {
      const unread = await bridge.getUnreadChats();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(unread, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi lấy tin nhắn chưa đọc: ${err.message}` }]
      };
    }
  }
);

// ─── 4. Tool: Lấy lịch sử tin nhắn của hội thoại ───────────────
server.tool(
  'zagi_get_thread_messages',
  'Lấy lịch sử tin nhắn gần đây của một cuộc trò chuyện (threadId).',
  {
    threadId: z.string().describe('Mã định danh cuộc trò chuyện (threadId hoặc số điện thoại)'),
    limit: z.number().optional().default(20).describe('Số lượng tin nhắn cần lấy (mặc định 20)'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ threadId, limit, apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    try {
      const messages = await bridge.getThreadMessages(threadId, limit);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(messages, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi lấy tin nhắn: ${err.message}` }]
      };
    }
  }
);

// ─── 5. Tool: Gửi tin nhắn Zalo kèm Anti-Ban Guardrails ─────────
server.tool(
  'zagi_send_message',
  'Gửi tin nhắn văn bản qua Zalo với cơ chế bảo vệ Anti-Ban tự động (Jitter delay + hạn ngạch người lạ).',
  {
    threadId: z.string().describe('Mã hội thoại Zalo nhận tin (UserId hoặc GroupId)'),
    message: z.string().describe('Nội dung tin nhắn cần gửi'),
    type: z.number().optional().default(0).describe('Loại hội thoại: 0 cho Chat cá nhân (Direct), 1 cho Nhóm (Group)'),
    accountZaloId: z.string().optional().describe('Zalo ID của tài khoản gửi (mặc định lấy tài khoản đang chọn)'),
    isStranger: z.boolean().optional().default(false).describe('Đặt true nếu gửi tới người lạ chưa kết bạn để kiểm soát hạn ngạch Anti-Ban'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({ threadId, message, type, accountZaloId, isStranger, apiKey }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    // 1. Kiểm tra hạn ngạch nếu gửi cho người lạ
    if (isStranger) {
      const quotaCheck = checkAndIncrementStrangerQuota(threadId);
      if (!quotaCheck.allowed) {
        return {
          isError: true,
          content: [{ type: 'text', text: quotaCheck.error }]
        };
      }
    }

    // 2. Kích hoạt Jitter Delay ngẫu nhiên để chống Zalo phát hiện tự động hóa
    const delayApplied = await applyJitter();

    try {
      const result = await bridge.sendMessage({ threadId, message, type, accountZaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            threadId,
            delayAppliedMs: delayApplied,
            operator: auth.user,
            result
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi khi gửi tin nhắn: ${err.message}` }]
      };
    }
  }
);

// ─── 6. Tool: Tra cứu danh bạ & CRM ────────────────────────────
server.tool(
  'zagi_search_contacts',
  'Tìm kiếm thông tin khách hàng trong danh bạ Zalo và CRM của Zagi theo tên hoặc số điện thoại.',
  {
    query: z.string().describe('Số điện thoại hoặc từ khóa tên khách hàng'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ query, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    try {
      const contacts = await bridge.searchContacts(query);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(contacts, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi tìm kiếm danh bạ: ${err.message}` }]
      };
    }
  }
);

// ─── 7. Tool: Quét số điện thoại tìm Zalo ─────────────────────
server.tool(
  'zagi_scan_phone',
  'Kiểm tra xem một số điện thoại có đăng ký tài khoản Zalo hay không qua Zagi.',
  {
    phone: z.string().describe('Số điện thoại cần kiểm tra (định dạng 09... hoặc 84...)'),
    accountZaloId: z.string().optional().describe('Zalo ID thực hiện quét'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ phone, accountZaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }]
      };
    }

    try {
      const res = await bridge.scanPhone(phone, accountZaloId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(res, null, 2)
        }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Lỗi quét số điện thoại: ${err.message}` }]
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[zagi-mcp] Server running on stdio');
}

main().catch((err) => {
  console.error('[zagi-mcp] Fatal error:', err);
  process.exit(1);
});
