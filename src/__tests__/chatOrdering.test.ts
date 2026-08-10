(global as any).window = (global as any).window || {
  electronAPI: {},
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

import { compareMessagesAsc, normTs, useChatStore, MessageItem } from '../ui/store/chatStore';

describe('Chat Message Ordering & Monotonic Timestamp Tests', () => {
  beforeEach(() => {
    useChatStore.getState().resetForWorkspaceSwitch();
  });

  describe('normTs', () => {
    it('normalizes seconds to milliseconds', () => {
      expect(normTs(1723308000)).toBe(1723308000000);
      expect(normTs(1723308000000)).toBe(1723308000000);
      expect(normTs(0)).toBe(0);
      expect(normTs(undefined)).toBe(0);
    });
  });

  describe('compareMessagesAsc', () => {
    it('sorts messages chronologically by timestamp', () => {
      const msg1: MessageItem = {
        msg_id: '1',
        owner_zalo_id: 'z1',
        thread_id: 't1',
        thread_type: 0,
        sender_id: 'customer',
        content: 'Hello',
        msg_type: 'text',
        timestamp: 1000,
        is_sent: 0,
        status: 'received',
      };
      const msg2: MessageItem = {
        msg_id: '2',
        owner_zalo_id: 'z1',
        thread_id: 't1',
        thread_type: 0,
        sender_id: 'me',
        content: 'Hi',
        msg_type: 'text',
        timestamp: 2000,
        is_sent: 1,
        status: 'sent',
      };

      const sorted = [msg2, msg1].sort(compareMessagesAsc);
      expect(sorted[0].msg_id).toBe('1');
      expect(sorted[1].msg_id).toBe('2');
    });

    it('uses SQLite ID as tie breaker when timestamps are identical', () => {
      const msg1: MessageItem = {
        id: 100,
        msg_id: 'msg_100',
        owner_zalo_id: 'z1',
        thread_id: 't1',
        thread_type: 0,
        sender_id: 'customer',
        content: 'Question',
        msg_type: 'text',
        timestamp: 5000,
        is_sent: 0,
        status: 'received',
      };
      const msg2: MessageItem = {
        id: 101,
        msg_id: 'msg_101',
        owner_zalo_id: 'z1',
        thread_id: 't1',
        thread_type: 0,
        sender_id: 'me',
        content: 'Answer',
        msg_type: 'text',
        timestamp: 5000,
        is_sent: 1,
        status: 'sent',
      };

      const sorted = [msg2, msg1].sort(compareMessagesAsc);
      expect(sorted[0].id).toBe(100);
      expect(sorted[1].id).toBe(101);
    });

    it('places real incoming message before temp outgoing message when timestamps match', () => {
      const customerMsg: MessageItem = {
        msg_id: '8102709030917',
        owner_zalo_id: 'z1',
        thread_id: 't1',
        thread_type: 0,
        sender_id: 'customer',
        content: 'Can you help?',
        msg_type: 'text',
        timestamp: 1723308000000,
        is_sent: 0,
        status: 'received',
      };
      const tempReply: MessageItem = {
        msg_id: 'temp_1723308000000',
        owner_zalo_id: 'z1',
        thread_id: 't1',
        thread_type: 0,
        sender_id: 'me',
        content: 'Sure!',
        msg_type: 'text',
        timestamp: 1723308000000,
        is_sent: 1,
        status: 'sending',
      };

      const sorted = [tempReply, customerMsg].sort(compareMessagesAsc);
      expect(sorted[0].msg_id).toBe('8102709030917');
      expect(sorted[1].msg_id).toBe('temp_1723308000000');
    });
  });

  describe('Monotonic Timestamp Guard in addMessage', () => {
    it('automatically ensures outgoing reply has timestamp > customer message even with clock skew', () => {
      const store = useChatStore.getState();
      const zaloId = 'zalo_01';
      const threadId = 'thread_01';

      // Customer sends message with server timestamp 10:00:10 (1723308010000)
      const customerMsg: MessageItem = {
        msg_id: 'server_msg_999',
        owner_zalo_id: zaloId,
        thread_id: threadId,
        thread_type: 0,
        sender_id: 'customer_uid',
        content: 'Báo giá cho mình với',
        msg_type: 'text',
        timestamp: 1723308010000,
        is_sent: 0,
        status: 'received',
      };
      store.addMessage(zaloId, threadId, customerMsg);

      // Local PC has clock skew: Date.now() is 10:00:05 (1723308005000 - 5 seconds behind!)
      const replyWithClockSkew: MessageItem = {
        msg_id: 'temp_skewed_reply',
        owner_zalo_id: zaloId,
        thread_id: threadId,
        thread_type: 0,
        sender_id: zaloId,
        content: 'Dạ shop gửi báo giá ạ',
        msg_type: 'text',
        timestamp: 1723308005000, // In the past relative to customer msg!
        is_sent: 1,
        status: 'sending',
      };
      store.addMessage(zaloId, threadId, replyWithClockSkew);

      const messages = useChatStore.getState().messages[`${zaloId}_${threadId}`];
      expect(messages).toHaveLength(2);
      // Customer message MUST be first (at index 0)
      expect(messages[0].msg_id).toBe('server_msg_999');
      expect(messages[0].content).toBe('Báo giá cho mình với');
      // Our reply MUST be second (at index 1) and its timestamp adjusted to > customer message
      expect(messages[1].msg_id).toBe('temp_skewed_reply');
      expect(messages[1].content).toBe('Dạ shop gửi báo giá ạ');
      expect(messages[1].timestamp).toBeGreaterThan(messages[0].timestamp);
    });
  });
});
