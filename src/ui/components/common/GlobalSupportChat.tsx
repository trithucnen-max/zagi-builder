import React, { useState, useEffect, useRef } from 'react';
import ipc from '@/lib/ipc';
import MarkdownText from './MarkdownText';
import BrandLogo from './BrandLogo';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function GlobalSupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Xin chào! Em là Trợ lý AI hỗ trợ Zagi. Anh/chị cần em tư vấn hay hướng dẫn thao tác gì hôm nay ạ?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || sending) return;
    const newMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setSending(true);

    try {
      const res = await ipc.ai?.askZagiSupport(text, conversationId);
      if (res?.success && res.result) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.result }]);
        if (res.conversationId) {
          setConversationId(res.conversationId);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Xin lỗi, hệ thống AI không phản hồi.' }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Lỗi kết nối AI: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  const quickPrompts = [
    'Zagi là gì?',
    'Thêm tài khoản Zalo thế nào?',
    'Mẹo tránh khóa tài khoản Zalo?',
    'Cách bật Tunnel để kết nối từ xa?'
  ];

  return (
    <div className="fixed bottom-6 right-6 z-[99] flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="w-[380px] h-[520px] bg-gray-850/98 backdrop-blur border border-gray-700/80 rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-blue-600/30 to-indigo-600/20 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandLogo type="ai" className="w-5 h-5 text-white" />
              <div>
                <h3 className="text-xs font-semibold text-white">Hỗ trợ ZaGi (AI)</h3>
                <p className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                  Trực tuyến
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none whitespace-pre-wrap'
                      : 'bg-gray-800 text-gray-200 border border-gray-750 rounded-tl-none'
                  }`}
                >
                  {m.role === 'user' ? m.content : <MarkdownText content={m.content} />}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-800 text-gray-400 border border-gray-750 rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          {messages.length === 1 && !sending && (
            <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/30">
              <p className="text-[10px] text-gray-500 mb-1.5">💡 Câu hỏi gợi ý:</p>
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(p)}
                    className="text-[10px] text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/35 border border-blue-800/40 rounded-full px-2.5 py-1 text-left transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input box */}
          <form
            onSubmit={e => { e.preventDefault(); handleSend(inputText); }}
            className="p-3 border-t border-gray-700 bg-gray-900/40 flex gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Nhập câu hỏi của bạn về Zagi..."
              disabled={sending}
              className="flex-1 bg-gray-800 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 duration-150"
        title="Hỏi đáp về Zagi"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <div className="relative flex items-center justify-center">
            <BrandLogo type="ai" className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-400 border border-blue-600 animate-pulse"/>
          </div>
        )}
      </button>
    </div>
  );
}
