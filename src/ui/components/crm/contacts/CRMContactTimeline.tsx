import React, { useEffect, useState } from 'react';
import type { CRMContact, CRMNote, PipelineStage } from '@/store/crmStore';
import ipc from '@/lib/ipc';
import Logger from '../../../../utils/Logger';

interface CRMContactTimelineProps {
  contact: CRMContact;
  notes: CRMNote[];
  activeAccountId: string;
  stages: PipelineStage[];
  onRefreshNotes?: () => void;
}

interface TimelineItem {
  id: string;
  type: 'message' | 'call' | 'note' | 'stage' | 'reminder';
  title: string;
  content: string;
  timestamp: number;
  extra?: any;
}

export default function CRMContactTimeline({
  contact,
  notes,
  activeAccountId,
  stages,
  onRefreshNotes,
}: CRMContactTimelineProps) {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);

  // Form states for creating a new reminder
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderDesc, setReminderDesc] = useState('');
  const [creatingReminder, setCreatingReminder] = useState(false);
  const [showAddReminderForm, setShowAddReminderForm] = useState(false);

  const fetchTimelineData = async () => {
    if (!activeAccountId || !contact.contact_id) return;
    setLoading(true);
    try {
      // 1. Fetch recent messages
      const msgsRes = await ipc.db?.getMessages({
        zaloId: activeAccountId,
        threadId: contact.contact_id,
        limit: 30,
      });
      const messages = msgsRes?.success ? msgsRes.messages : [];

      // 2. Fetch linked calendar events
      const eventsRes = await ipc.db?.getCalendarEventsByContact({
        contactId: contact.contact_id,
      });
      const events = eventsRes?.success ? eventsRes.events : [];
      setReminders(events);

      // 3. Construct timeline items
      const items: TimelineItem[] = [];

      // Add messages & calls
      messages.forEach((msg: any) => {
        const isCall =
          String(msg.msg_type).toLowerCase().includes('call') ||
          (msg.content && String(msg.content).includes('recommened.calltime')) ||
          (msg.content && String(msg.content).includes('recommened.misscall'));

        const isVoice = String(msg.msg_type).toLowerCase().includes('voice');

        const senderName = msg.is_sent ? 'Bạn' : contact.display_name;
        let contentText = msg.content || '';
        try {
          if (contentText.startsWith('{')) {
            const parsed = JSON.parse(contentText);
            contentText = parsed.content || parsed.message || parsed.msg || '[Đính kèm]';
          }
        } catch {}

        if (isCall) {
          const isMissed = contentText.includes('misscall') || contentText.includes('nhỡ');
          items.push({
            id: `call-${msg.msg_id}`,
            type: 'call',
            title: isMissed ? '📵 Cuộc gọi nhỡ' : '📞 Cuộc gọi thoại Zalo',
            content: isMissed ? `Có cuộc gọi nhỡ từ ${contact.display_name}` : `Hội thoại cuộc gọi với ${contact.display_name}`,
            timestamp: msg.timestamp,
          });
        } else if (isVoice) {
          items.push({
            id: `voice-${msg.msg_id}`,
            type: 'call',
            title: '🎙️ Tin nhắn thoại',
            content: `${senderName} đã gửi tin nhắn thoại`,
            timestamp: msg.timestamp,
          });
        } else {
          items.push({
            id: `msg-${msg.msg_id}`,
            type: 'message',
            title: msg.is_sent ? '📤 Tin nhắn đã gửi' : '📥 Tin nhắn đã nhận',
            content: contentText,
            timestamp: msg.timestamp,
          });
        }
      });

      // Add notes
      notes.forEach((note) => {
        items.push({
          id: `note-${note.id}`,
          type: 'note',
          title: '📝 Ghi chú CRM',
          content: note.content,
          timestamp: note.created_at,
        });
      });

      // Add reminders (calendar events)
      events.forEach((ev: any) => {
        items.push({
          id: `rem-${ev.id}`,
          type: 'reminder',
          title: `⏰ Lịch nhắc hẹn: ${ev.title}`,
          content: ev.description || 'Không có mô tả chi tiết.',
          timestamp: ev.start_at,
          extra: ev,
        });
      });

      // Add current pipeline stage
      if (contact.pipeline_stage_id) {
        const stage = stages.find((s) => s.id === contact.pipeline_stage_id);
        if (stage) {
          items.push({
            id: `stage-${contact.pipeline_stage_id}`,
            type: 'stage',
            title: '🏁 Trạng thái Pipeline hiện tại',
            content: `Khách hàng hiện ở cột: ${stage.name}`,
            timestamp: contact.last_message_time || Date.now(),
            extra: stage,
          });
        }
      }

      // Sort timeline descending by timestamp
      items.sort((a, b) => b.timestamp - a.timestamp);
      setTimelineItems(items);
    } catch (e) {
      Logger.error('[CRMContactTimeline] Failed to construct timeline:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimelineData();
  }, [contact.contact_id, notes, activeAccountId]);

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim() || !reminderDate) return;
    setCreatingReminder(true);
    try {
      const startTime = new Date(reminderDate).getTime();
      const res = await ipc.erp?.calendarCreate({
        input: {
          title: reminderTitle,
          description: reminderDesc,
          type: 'meeting',
          start_at: startTime,
          end_at: startTime + 30 * 60 * 1000, // 30 mins
          linked_contact_id: contact.contact_id,
        },
      });

      if (res?.success) {
        setReminderTitle('');
        setReminderDate('');
        setReminderDesc('');
        setShowAddReminderForm(false);
        fetchTimelineData();
      }
    } catch (err) {
      Logger.error('[CRMContactTimeline] Failed to create reminder event:', err);
    } finally {
      setCreatingReminder(false);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xoá lịch nhắc hẹn này?')) return;
    try {
      await ipc.erp?.calendarDelete({ id });
      fetchTimelineData();
    } catch (err) {
      Logger.error('[CRMContactTimeline] Failed to delete reminder event:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Reminder manager header */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <span>⏰</span> Nhắc hẹn thông minh
          </span>
          <button
            onClick={() => setShowAddReminderForm((prev) => !prev)}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            {showAddReminderForm ? 'Huỷ' : '+ Tạo nhắc hẹn'}
          </button>
        </div>

        {showAddReminderForm && (
          <form onSubmit={handleCreateReminder} className="mt-3 space-y-2.5">
            <div>
              <input
                type="text"
                required
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="Tiêu đề việc cần nhắc..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="datetime-local"
                  required
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={creatingReminder}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors py-1.5 disabled:opacity-50"
              >
                {creatingReminder ? 'Đang tạo...' : 'Tạo'}
              </button>
            </div>
            <div>
              <textarea
                value={reminderDesc}
                onChange={(e) => setReminderDesc(e.target.value)}
                placeholder="Ghi chú thêm..."
                rows={2}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </form>
        )}

        {/* Reminders List */}
        {!showAddReminderForm && reminders.length > 0 && (
          <div className="mt-2.5 space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {reminders.map((rem) => (
              <div
                key={rem.id}
                className="flex items-start justify-between bg-gray-900/40 hover:bg-gray-900/70 border border-gray-700/60 rounded-lg p-2 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-200 truncate">{rem.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    ⏰ {new Date(rem.start_at).toLocaleString('vi-VN')}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteReminder(rem.id)}
                  className="text-gray-500 hover:text-red-400 p-0.5 transition-colors"
                  title="Xoá nhắc hẹn"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Timeline list */}
      <div className="relative border-l border-gray-700/80 ml-2.5 pl-4 space-y-5">
        {loading && timelineItems.length === 0 ? (
          <div className="flex justify-center py-6">
            <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        ) : timelineItems.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4 italic">Không có hoạt động tương tác nào được ghi nhận.</p>
        ) : (
          timelineItems.map((item) => {
            let iconBg = 'bg-gray-700';
            let iconText = '💬';

            if (item.type === 'call') {
              iconBg = item.title.includes('nhỡ') ? 'bg-red-950/60 text-red-400 border border-red-800/40' : 'bg-green-950/60 text-green-400 border border-green-800/40';
              iconText = item.title.includes('nhỡ') ? '📵' : '📞';
            } else if (item.type === 'note') {
              iconBg = 'bg-yellow-950/60 text-yellow-400 border border-yellow-800/40';
              iconText = '📝';
            } else if (item.type === 'reminder') {
              iconBg = 'bg-blue-950/60 text-blue-400 border border-blue-800/40';
              iconText = '⏰';
            } else if (item.type === 'stage') {
              iconBg = 'bg-purple-950/60 text-purple-400 border border-purple-800/40';
              iconText = '🏁';
            }

            return (
              <div key={item.id} className="relative group">
                {/* Timeline node dot */}
                <div
                  className={`absolute -left-[27px] top-0.5 w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] ${iconBg}`}
                >
                  {iconText}
                </div>

                {/* Timeline item body */}
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold text-gray-200">{item.title}</span>
                    <span className="text-[9px] text-gray-500 flex-shrink-0">
                      {new Date(item.timestamp).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap leading-relaxed">
                    {item.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
