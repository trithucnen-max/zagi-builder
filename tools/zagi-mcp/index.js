#!/usr/bin/env node
/**
 * Zagi AI Agent MCP Gateway Server (v3.2.0)
 * Cung cấp bộ công cụ MCP kết nối các AI Agent (Hermes, Claude, Antigravity)
 * với nền tảng Zagi qua kiến trúc Hybrid: Fast Read SQLite (<2ms) + Action Bridge (CDP WebSocket)
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const directDb = require('./directDb');
const bridge = require('./bridge');
const { validateKey, ensureAuthConfig } = require('./auth');
const { applyJitter, checkAndIncrementStrangerQuota } = require('./antiban');

// Đảm bảo môi trường CSDL và cấu hình sẵn sàng
ensureAuthConfig();

const server = new McpServer({
  name: 'zagi-mcp',
  version: '3.2.0'
});

// ─── 1. Tool: Kiểm tra trạng thái hệ thống ──────────────────────
server.tool(
  'zagi_get_status',
  'Kiểm tra trạng thái hoạt động của Zagi Desktop App, cổng kết nối CDP, trạng thái mạng Relay và thống kê CSDL SQLite.',
  {
    apiKey: z.string().optional().describe('Khóa xác thực Zagi API Key (tự động lấy từ biến môi trường ZAGI_API_KEY nếu bỏ trống)')
  },
  async ({ apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const bridgeStatus = await bridge.getStatus();
      const dbStats = directDb.getDbStats();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            gateway: 'Zagi Dynamic MCP Gateway v3.2.0',
            authOperator: auth.user,
            scopes: auth.scopes,
            runtime: bridgeStatus,
            database: dbStats
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi kiểm tra trạng thái: ${err.message}` }] };
    }
  }
);

// ─── 2. Tool: Danh sách tài khoản đăng nhập ───────────────────
server.tool(
  'zagi_list_accounts',
  'Lấy danh sách các tài khoản Zalo / Facebook đã đăng nhập trên Zagi (tên, SĐT, zaloId, avatar, trạng thái listener).',
  {
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const accounts = directDb.listAccounts();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(accounts, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy danh sách tài khoản: ${err.message}` }] };
    }
  }
);

// ─── 3. Tool: Danh sách hội thoại (Conversations) ──────────────
server.tool(
  'zagi_get_conversations',
  'Lấy danh sách các cuộc hội thoại gần đây với tính năng phân trang, lọc theo tài khoản và tìm kiếm từ khóa.',
  {
    zaloId: z.string().optional().describe('Lọc theo Zalo ID của tài khoản đang đăng nhập'),
    search: z.string().optional().describe('Từ khóa tìm kiếm theo tên, SĐT hoặc mã khách hàng'),
    limit: z.number().optional().default(50).describe('Số lượng hội thoại cần lấy (mặc định 50)'),
    offset: z.number().optional().default(0).describe('Vị trí bắt đầu lấy (mặc định 0)'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ zaloId, search, limit, offset, apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const result = directDb.getConversations({ zaloId, search, limit, offset });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy danh sách hội thoại: ${err.message}` }] };
    }
  }
);

// ─── 4. Tool: Hội thoại có tin nhắn chưa đọc ──────────────────
server.tool(
  'zagi_get_unread_chats',
  'Lấy danh sách các cuộc hội thoại đang có tin nhắn chưa đọc (unread_count > 0).',
  {
    zaloId: z.string().optional().describe('Lọc theo Zalo ID tài khoản sở hữu'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ zaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const unreadList = directDb.getUnreadChats({ zaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: unreadList.length,
            chats: unreadList
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy tin nhắn chưa đọc: ${err.message}` }] };
    }
  }
);

// ─── 5. Tool: Lấy lịch sử tin nhắn của hội thoại ───────────────
server.tool(
  'zagi_get_thread_messages',
  'Lấy lịch sử tin nhắn của một cuộc trò chuyện (threadId) từ CSDL với tốc độ tức thì.',
  {
    threadId: z.string().describe('Mã định danh cuộc trò chuyện (UserId hoặc GroupId)'),
    zaloId: z.string().optional().describe('Lọc theo Zalo ID tài khoản sở hữu'),
    limit: z.number().optional().default(50).describe('Số lượng tin nhắn cần lấy (mặc định 50)'),
    offset: z.number().optional().default(0).describe('Vị trí bắt đầu (mặc định 0)'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ threadId, zaloId, limit, offset, apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const messages = directDb.getThreadMessages({ threadId, zaloId, limit, offset });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            threadId,
            count: messages.length,
            messages
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy lịch sử tin nhắn: ${err.message}` }] };
    }
  }
);

// ─── 6. Tool: Gửi tin nhắn văn bản (Anti-Ban Guardrails) ───────
server.tool(
  'zagi_send_message',
  'Gửi tin nhắn văn bản qua Zalo kèm cơ chế chống ban (Random Jitter Delay 1.5s-4s và giới hạn hạn ngạch người lạ 30 tin/ngày).',
  {
    threadId: z.string().describe('Mã hội thoại nhận tin (UserId hoặc GroupId)'),
    message: z.string().describe('Nội dung tin nhắn văn bản cần gửi'),
    type: z.number().optional().default(0).describe('Loại hội thoại: 0 cho Chat cá nhân (Direct), 1 cho Nhóm (Group)'),
    accountZaloId: z.string().optional().describe('Zalo ID của tài khoản gửi (mặc định lấy tài khoản đang chọn)'),
    isStranger: z.boolean().optional().default(false).describe('Đặt true nếu gửi tới người lạ chưa kết bạn để kiểm soát hạn ngạch Anti-Ban'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({ threadId, message, type, accountZaloId, isStranger, apiKey }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    if (isStranger) {
      const quotaCheck = checkAndIncrementStrangerQuota(threadId);
      if (!quotaCheck.allowed) {
        return { isError: true, content: [{ type: 'text', text: quotaCheck.error }] };
      }
    }

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
      return { isError: true, content: [{ type: 'text', text: `Lỗi khi gửi tin nhắn: ${err.message}` }] };
    }
  }
);

// ─── 7. Tool: Gửi hình ảnh ─────────────────────────────────────
server.tool(
  'zagi_send_image',
  'Gửi hình ảnh tới cuộc trò chuyện Zalo kèm chú thích (caption) tùy chọn.',
  {
    threadId: z.string().describe('Mã hội thoại nhận tin (UserId hoặc GroupId)'),
    filePath: z.string().describe('Đường dẫn tuyệt đối tới tệp hình ảnh trên máy tính'),
    message: z.string().optional().default('').describe('Nội dung chú thích ảnh (caption)'),
    type: z.number().optional().default(0).describe('Loại hội thoại: 0 cho Chat cá nhân, 1 cho Nhóm'),
    accountZaloId: z.string().optional().describe('Zalo ID tài khoản gửi'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({ threadId, filePath, message, type, accountZaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    const delayApplied = await applyJitter();

    try {
      const result = await bridge.sendImage({ threadId, filePath, message, type, accountZaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            threadId,
            filePath,
            delayAppliedMs: delayApplied,
            result
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi gửi hình ảnh: ${err.message}` }] };
    }
  }
);

// ─── 8. Tool: Gửi tập tin đính kèm ─────────────────────────────
server.tool(
  'zagi_send_file',
  'Gửi tài liệu hoặc tập tin đính kèm (PDF, DOCX, XLSX, ZIP,...) qua Zalo.',
  {
    threadId: z.string().describe('Mã hội thoại nhận file (UserId hoặc GroupId)'),
    filePath: z.string().describe('Đường dẫn tuyệt đối tới tập tin trên máy tính'),
    type: z.number().optional().default(0).describe('Loại hội thoại: 0 cho Chat cá nhân, 1 cho Nhóm'),
    accountZaloId: z.string().optional().describe('Zalo ID tài khoản gửi'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({ threadId, filePath, type, accountZaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    const delayApplied = await applyJitter();

    try {
      const result = await bridge.sendFile({ threadId, filePath, type, accountZaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            threadId,
            filePath,
            delayAppliedMs: delayApplied,
            result
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi gửi tập tin: ${err.message}` }] };
    }
  }
);

// ─── 9. Tool: Thả biểu cảm cảm xúc (Reaction) ─────────────────
server.tool(
  'zagi_add_reaction',
  'Thả biểu cảm cảm xúc lên một tin nhắn cụ thể (LIKE, HEART, HAHA, WOW, SAD, ANGRY).',
  {
    threadId: z.string().describe('Mã hội thoại chứa tin nhắn'),
    messageId: z.string().describe('Mã định danh tin nhắn cần thả reaction (msgId)'),
    reactionType: z.enum(['LIKE', 'HEART', 'HAHA', 'WOW', 'SAD', 'ANGRY']).optional().default('HEART').describe('Loại biểu cảm'),
    accountZaloId: z.string().optional().describe('Zalo ID tài khoản thả reaction'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({ threadId, messageId, reactionType, accountZaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const result = await bridge.addReaction({ messageId, reactionType, threadId, accountZaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            threadId,
            messageId,
            reactionType,
            result
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi thả biểu cảm: ${err.message}` }] };
    }
  }
);

// ─── 10. Tool: Trích dẫn & Trả lời tin nhắn (Quote Reply) ─────
server.tool(
  'zagi_reply_message',
  'Trích dẫn một tin nhắn cụ thể và phản hồi (Quote message reply).',
  {
    threadId: z.string().describe('Mã hội thoại nhận tin (UserId hoặc GroupId)'),
    message: z.string().describe('Nội dung phản hồi'),
    quoteMsgId: z.string().describe('Mã định danh tin nhắn được trích dẫn (msgId)'),
    quoteMsgText: z.string().optional().default('').describe('Nội dung văn bản của tin nhắn được trích dẫn'),
    quoteSenderId: z.string().optional().default('').describe('Người gửi của tin nhắn được trích dẫn'),
    type: z.number().optional().default(0).describe('Loại hội thoại: 0 cho Chat cá nhân, 1 cho Nhóm'),
    accountZaloId: z.string().optional().describe('Zalo ID tài khoản gửi'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({ threadId, message, quoteMsgId, quoteMsgText, quoteSenderId, type, accountZaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    const delayApplied = await applyJitter();

    try {
      const result = await bridge.replyMessage({
        threadId,
        message,
        quoteMsgId,
        quoteMsgText,
        quoteSenderId,
        type,
        accountZaloId
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            threadId,
            quoteMsgId,
            delayAppliedMs: delayApplied,
            result
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi trả lời tin nhắn: ${err.message}` }] };
    }
  }
);

// ─── 11. Tool: Tìm kiếm danh bạ & CRM ─────────────────────────
server.tool(
  'zagi_search_contacts',
  'Tìm kiếm khách hàng trong danh bạ Zalo và CRM của Zagi theo tên, số điện thoại hoặc mã định danh.',
  {
    query: z.string().describe('Từ khóa tìm kiếm (SĐT 09..., tên, hoặc mã định danh)'),
    zaloId: z.string().optional().describe('Lọc theo Zalo ID tài khoản sở hữu'),
    limit: z.number().optional().default(20).describe('Số lượng kết quả tối đa (mặc định 20)'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ query, zaloId, limit, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const contacts = directDb.searchContacts({ query, zaloId, limit });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            totalFound: contacts.length,
            contacts
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi tìm kiếm danh bạ: ${err.message}` }] };
    }
  }
);

// ─── 12. Tool: Xem hồ sơ chi tiết khách hàng ──────────────────
server.tool(
  'zagi_get_contact_detail',
  'Lấy hồ sơ toàn diện của một khách hàng: thông tin cơ bản, nhãn dán, CRM tags, các ghi chú gần đây và giai đoạn pipeline.',
  {
    contactId: z.string().describe('Mã định danh khách hàng (UserId hoặc số điện thoại)'),
    zaloId: z.string().optional().describe('Zalo ID tài khoản sở hữu'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ contactId, zaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const detail = directDb.getContactDetail({ contactId, zaloId });
      if (!detail) {
        return { isError: true, content: [{ type: 'text', text: `Không tìm thấy khách hàng với mã: ${contactId}` }] };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(detail, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy chi tiết khách hàng: ${err.message}` }] };
    }
  }
);

// ─── 13. Tool: Cập nhật thông tin khách hàng (CRM) ────────────
server.tool(
  'zagi_update_contact',
  'Cập nhật xưng hô (salutation), biệt danh (alias), hoặc giai đoạn bán hàng (pipelineStageId) của khách hàng.',
  {
    contactId: z.string().describe('Mã định danh khách hàng cần cập nhật'),
    salutation: z.string().optional().describe('Đại từ xưng hô phù hợp (ví dụ: Anh, Chị, Em, Bác, Bạn) - tự động bật salutation_manual=1'),
    pipelineStageId: z.number().optional().describe('Mã ID giai đoạn bán hàng trong CRM pipeline'),
    alias: z.string().optional().describe('Biệt danh hoặc ghi chú tên ngắn gọn của khách hàng'),
    zaloId: z.string().optional().describe('Zalo ID tài khoản sở hữu'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ contactId, salutation, pipelineStageId, alias, zaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const res = directDb.updateContact({ contactId, salutation, pipelineStageId, alias, zaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            contactId,
            ...res
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi cập nhật khách hàng: ${err.message}` }] };
    }
  }
);

// ─── 14. Tool: Thêm ghi chú CRM ───────────────────────────────
server.tool(
  'zagi_add_crm_note',
  'Thêm một ghi chú CRM mới cho khách hàng để lưu lại nhu cầu, lịch hẹn hoặc diễn biến cuộc trao đổi.',
  {
    contactId: z.string().describe('Mã định danh khách hàng'),
    content: z.string().describe('Nội dung ghi chú chi tiết'),
    zaloId: z.string().optional().describe('Zalo ID tài khoản sở hữu'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ contactId, content, zaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const res = directDb.addCrmNote({ contactId, content, zaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            note: res
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi thêm ghi chú CRM: ${err.message}` }] };
    }
  }
);

// ─── 15. Tool: Danh sách nhãn dán phân loại ────────────────────
server.tool(
  'zagi_list_labels',
  'Lấy toàn bộ danh sách nhãn dán phân loại (local_labels) và thẻ CRM (crm_tags) có trong hệ thống.',
  {
    zaloId: z.string().optional().describe('Lọc theo Zalo ID tài khoản sở hữu'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ zaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const labels = directDb.listLabels({ zaloId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(labels, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy danh sách nhãn: ${err.message}` }] };
    }
  }
);

// ─── 16. Tool: Quét số điện thoại tìm Zalo ─────────────────────
server.tool(
  'zagi_scan_phone',
  'Kiểm tra xem một số điện thoại có đăng ký tài khoản Zalo hay không qua Zagi desktop client.',
  {
    phone: z.string().describe('Số điện thoại cần kiểm tra (định dạng 09... hoặc 84...)'),
    accountZaloId: z.string().optional().describe('Zalo ID thực hiện quét'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: read)')
  },
  async ({ phone, accountZaloId, apiKey }) => {
    const auth = validateKey(apiKey, 'read');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    const delayApplied = await applyJitter();

    try {
      const res = await bridge.scanPhone(phone, accountZaloId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            phone,
            delayAppliedMs: delayApplied,
            result: res
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi quét số điện thoại: ${err.message}` }] };
    }
  }
);

// ─── 17. Tool: Tạo cuộc bình chọn (Poll) ──────────────────────
server.tool(
  'zagi_create_poll',
  'Tạo một cuộc bình chọn (Poll) trong nhóm Zalo hoặc hội thoại 1:1 (tính năng mới v3.2.0).',
  {
    groupId: z.string().describe('Mã nhóm Zalo hoặc threadId cần tạo bình chọn'),
    question: z.string().describe('Câu hỏi hoặc chủ đề bình chọn'),
    options: z.array(z.string()).describe('Danh sách các phương án bình chọn (tối thiểu 2 lựa chọn)'),
    expiredTime: z.number().optional().default(0).describe('Thời gian kết thúc (timestamp ms, đặt 0 nếu không giới hạn)'),
    pinAct: z.boolean().optional().default(false).describe('Ghim bình chọn lên đầu nhóm trò chuyện'),
    allowMultiChoices: z.boolean().optional().default(false).describe('Cho phép chọn nhiều phương án'),
    allowAddNewOption: z.boolean().optional().default(true).describe('Cho phép thành viên thêm phương án mới'),
    hideVotePreview: z.boolean().optional().default(false).describe('Ẩn kết quả bình chọn khi chưa tham gia'),
    isAnonymous: z.boolean().optional().default(false).describe('Bình chọn ẩn danh'),
    accountZaloId: z.string().optional().describe('Zalo ID tài khoản tạo bình chọn'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: send)')
  },
  async ({
    groupId, question, options, expiredTime, pinAct,
    allowMultiChoices, allowAddNewOption, hideVotePreview, isAnonymous,
    accountZaloId, apiKey
  }) => {
    const auth = validateKey(apiKey, 'send');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    if (!Array.isArray(options) || options.length < 2) {
      return { isError: true, content: [{ type: 'text', text: 'Cần cung cấp ít nhất 2 phương án bình chọn trong mảng options.' }] };
    }

    try {
      const result = await bridge.createPoll({
        groupId,
        question,
        options,
        expiredTime,
        pinAct,
        allowMultiChoices,
        allowAddNewOption,
        hideVotePreview,
        isAnonymous,
        accountZaloId
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId,
            question,
            result
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi tạo bình chọn: ${err.message}` }] };
    }
  }
);

// ─── 18. Tool: Danh sách chiến dịch CRM ───────────────────────
server.tool(
  'zagi_list_campaigns',
  'Lấy danh sách các chiến dịch tin nhắn và marketing trong hệ thống CRM Zagi.',
  {
    zaloId: z.string().optional().describe('Lọc theo Zalo ID tài khoản sở hữu'),
    limit: z.number().optional().default(20).describe('Số lượng chiến dịch cần lấy (mặc định 20)'),
    apiKey: z.string().optional().describe('API Key xác thực (scope: crm)')
  },
  async ({ zaloId, limit, apiKey }) => {
    const auth = validateKey(apiKey, 'crm');
    if (!auth.valid) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi xác thực: ${auth.error}` }] };
    }

    try {
      const campaigns = directDb.listCampaigns({ zaloId, limit });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: campaigns.length,
            campaigns
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Lỗi lấy danh sách chiến dịch: ${err.message}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[zagi-mcp] Server v3.2.0 running on stdio with 18 tools');
}

main().catch((err) => {
  console.error('[zagi-mcp] Fatal error:', err);
  process.exit(1);
});
