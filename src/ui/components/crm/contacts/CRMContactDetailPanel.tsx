import React, { useEffect, useState, useCallback } from 'react';
import { useCRMStore, type CRMContact, type CRMNote } from '@/store/crmStore';
import type { LabelData } from '@/store/appStore';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import ZaloLabelSelector from '../tags/ZaloLabelSelector';
import ZaloLabelBadge from '../tags/ZaloLabelBadge';
import LocalLabelSelector from '@/components/common/LocalLabelSelector';
import type { LocalLabelItem } from '@/components/common/LocalLabelSelector';
import PhoneDisplay from '@/components/common/PhoneDisplay';
import type { PinnedNote } from '@/components/chat/PinnedMessages';

function renderMarkdownText(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, index) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('*') || trimmed.startsWith('-');
    const cleanLine = isBullet ? trimmed.replace(/^[-*]\s*/, '') : line;

    const parts = cleanLine.split('**');
    const renderedParts = parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="font-bold text-gray-900">{part}</strong>;
      }
      return part;
    });

    if (isBullet) {
      return (
        <li key={index} className="ml-4 list-disc pl-1 text-[11px] leading-relaxed text-gray-700">
          {renderedParts}
        </li>
      );
    }

    return (
      <p key={index} className="text-[11px] leading-relaxed text-gray-700 min-h-[1em]">
        {renderedParts}
      </p>
    );
  });
}

interface AIProfileSection {
  key: string;
  title: string;
  content: string;
  icon: React.ReactNode;
  badgeColor: string;
  textColor: string;
  borderColor: string;
  hasInfo: boolean;
}

function parseAIProfile(text: string): { title: string; sections: AIProfileSection[] } {
  const defaultResult = {
    title: 'Hồ sơ phân tích khách hàng',
    sections: [] as AIProfileSection[]
  };
  if (!text) return defaultResult;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let title = 'Hồ sơ phân tích khách hàng';
  
  if (lines[0] && (lines[0].toLowerCase().includes('hồ sơ') || lines[0].toLowerCase().includes('phân tích') || lines[0].startsWith('*HỒ SƠ'))) {
    title = lines[0].replace(/^[*#-\s]*/, '').trim();
  }

  const sectionDefs = [
    {
      key: 'nhu_cau',
      matchers: ['nhu cầu', '1. nhu cầu'],
      title: 'Nhu cầu',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
      badgeColor: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      textColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/30',
    },
    {
      key: 'mong_muon',
      matchers: ['mong muốn', '2. mong muốn'],
      title: 'Mong muốn',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      badgeColor: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
      textColor: 'text-sky-400',
      borderColor: 'border-sky-500/30',
    },
    {
      key: 'tinh_trang',
      matchers: ['tình trạng', '3. tình trạng'],
      title: 'Tình trạng hiện tại',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      badgeColor: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      textColor: 'text-amber-400',
      borderColor: 'border-amber-500/30',
    },
    {
      key: 'tai_chinh',
      matchers: ['tài chính', '4. khả năng tài chính'],
      title: 'Khả năng tài chính',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      ),
      badgeColor: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
      textColor: 'text-orange-400',
      borderColor: 'border-orange-500/30',
    },
    {
      key: 'dia_chi',
      matchers: ['địa chỉ', '5. địa chỉ', 'khu vực sinh sống'],
      title: 'Địa chỉ / Khu vực',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
      badgeColor: 'bg-teal-500/10 border-teal-500/20 text-teal-400',
      textColor: 'text-teal-400',
      borderColor: 'border-teal-500/30',
    },
    {
      key: 'khac',
      matchers: ['khác', '6. khác'],
      title: 'Thông tin khác',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      ),
      badgeColor: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
      textColor: 'text-slate-400',
      borderColor: 'border-slate-500/30',
    },
  ];

  const sections: AIProfileSection[] = sectionDefs.map(def => ({
    key: def.key,
    title: def.title,
    content: '',
    icon: def.icon,
    badgeColor: def.badgeColor,
    textColor: def.textColor,
    borderColor: def.borderColor,
    hasInfo: false,
  }));

  let currentSection: AIProfileSection | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    const lowerLine = trimmedLine.toLowerCase();

    const matchedDef = sectionDefs.find(def =>
      def.matchers.some(matcher => lowerLine.includes(matcher))
    );

    if (matchedDef) {
      currentSection = sections.find(s => s.key === matchedDef.key) || null;
      const separatorIdx = trimmedLine.indexOf(':');
      if (separatorIdx !== -1) {
        const textAfter = trimmedLine.substring(separatorIdx + 1).trim();
        if (textAfter) {
          currentSection!.content = textAfter;
        }
      } else {
        const headerWord = matchedDef.title.toLowerCase();
        const startIdx = lowerLine.indexOf(headerWord);
        if (startIdx !== -1) {
          const rawTextAfter = trimmedLine.substring(startIdx + headerWord.length).trim();
          if (rawTextAfter) {
            if (rawTextAfter.startsWith('.') || rawTextAfter.startsWith(':')) {
              currentSection!.content = rawTextAfter.substring(1).trim();
            } else {
              currentSection!.content = rawTextAfter;
            }
          }
        }
      }
    } else if (currentSection) {
      if (!line.toLowerCase().includes('hồ sơ phân tích')) {
        if (currentSection.content) {
          currentSection.content += '\n' + line;
        } else {
          currentSection.content = line;
        }
      }
    }
  }

  sections.forEach(s => {
    s.content = s.content.trim().replace(/^[-*•\s]*/, '');
    const isNoInfo = !s.content ||
                     s.content.toLowerCase() === 'chưa có thông tin' ||
                     s.content.toLowerCase() === 'chưa có thông tin.' ||
                     s.content.toLowerCase().includes('chưa có thông tin');
    s.hasInfo = !isNoInfo;
    if (isNoInfo) {
      s.content = 'Chưa có thông tin';
    }
  });

  return { title, sections };
}

function renderContentText(text: string) {
  if (!text) return null;
  const parts = text.split('**');
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-semibold text-gray-900">{part}</strong>;
    }
    return part;
  });
}

interface AIProfileCardProps {
  aiProfile: string;
  onGenerate: () => void;
  generating: boolean;
  hasNotes: boolean;
}

function AIProfileCard({ aiProfile, onGenerate, generating, hasNotes }: AIProfileCardProps) {
  const [copied, setCopied] = useState(false);
  const { sections } = parseAIProfile(aiProfile);

  const handleCopy = () => {
    if (!aiProfile) return;
    navigator.clipboard.writeText(aiProfile);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasAnyInfo = sections.some(s => s.hasInfo);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col transition-all duration-300">
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-700 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="9"/>
            <line x1="9" y1="13" x2="15" y2="13"/>
            <line x1="9" y1="17" x2="13" y2="17"/>
          </svg>
          HỒ SƠ KHÁCH HÀNG (AI)
        </span>
        
        <div className="flex items-center gap-1.5">
          {aiProfile && (
            <button
              onClick={handleCopy}
              title="Sao chép hồ sơ"
              className="p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded transition-colors cursor-pointer"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
          
          <button
            onClick={onGenerate}
            disabled={generating || !hasNotes}
            className="px-2 py-0.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-[9px] uppercase font-bold tracking-wider transition-all duration-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
          >
            {generating ? (
              <>
                <span className="animate-spin inline-block w-2.5 h-2.5 border border-gray-500 border-t-transparent rounded-full" />
                ĐANG TẠO...
              </>
            ) : (
              'CẬP NHẬT'
            )}
          </button>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-3 divide-y divide-gray-100 max-h-[350px] overflow-y-auto custom-scrollbar">
        {hasAnyInfo ? (
          sections.map((section) => (
            <div key={section.key} className="py-2 first:pt-0 last:pb-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={section.hasInfo ? 'text-green-600' : 'text-red-500'}>
                  {section.icon}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  section.hasInfo ? 'text-green-600' : 'text-red-500'
                }`}>
                  {section.title}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed break-words pl-5 ${
                section.hasInfo ? 'text-gray-800 font-normal' : 'text-gray-400 italic font-light'
              }`}>
                {renderContentText(section.content)}
              </p>
            </div>
          ))
        ) : (
          <div className="text-[11px] text-gray-700 leading-relaxed space-y-1 p-2 bg-gray-50 rounded border border-gray-200 max-h-56 overflow-y-auto">
            {renderMarkdownText(aiProfile)}
          </div>
        )}
      </div>
    </div>
  );
}

interface CRMContactDetailPanelProps {
  contact: CRMContact;
  allLabels: LabelData[];
  localLabels?: LocalLabelItem[];
  localLabelThreadMap?: Record<string, number[]>;
  onClose: () => void;
  onMessage: (contact: CRMContact) => void;
}

export default function CRMContactDetailPanel({ contact, allLabels, localLabels, localLabelThreadMap, onClose, onMessage }: CRMContactDetailPanelProps) {
  const { activeAccountId } = useAccountStore();
  const { showNotification, setLabels } = useAppStore();
  const [notes, setNotes] = useState<CRMNote[]>([]);
  const [zaloNotes, setZaloNotes] = useState<PinnedNote[]>([]);
  const [noteTab, setNoteTab] = useState<'local' | 'zalo'>('local');

  const pipelineStages = useCRMStore(s => s.pipelineStages);

  // New state variables for notes & AI
  const [generatingAI, setGeneratingAI] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [editNoteId, setEditNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const isGroup = contact.contact_type === 'group';

  // Derive current Zalo labels for this contact
  const getLabelThreadId = (cId: string, isGroup: boolean) => isGroup ? `g${cId}` : cId;
  const getContactLabelIds = () => {
    const prefixed = getLabelThreadId(contact.contact_id, isGroup);
    return allLabels.filter(l =>
      l.conversations?.includes(contact.contact_id) || l.conversations?.includes(prefixed)
    ).map(l => l.id);
  };

  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(getContactLabelIds);
  const [labelsDirty, setLabelsDirty] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);

  // Local labels for this contact
  const threadLocalLabelIds = localLabelThreadMap?.[contact.contact_id] || [];
  const [localLabelToggling, setLocalLabelToggling] = useState<number | null>(null);

  const handleToggleLocalLabel = useCallback(async (labelId: number) => {
    if (!activeAccountId || localLabelToggling !== null) return;
    const label = localLabels?.find(l => l.id === labelId);
    if (!label) return;
    const exists = threadLocalLabelIds.includes(labelId);
    setLocalLabelToggling(labelId);
    try {
      const threadType = contact.contact_type === 'group' ? 1 : 0;
      if (exists) {
        await ipc.db?.removeLocalLabelFromThread({ zaloId: activeAccountId, labelId, threadId: contact.contact_id, threadType, labelText: label.name || '', labelColor: label.color || '', labelEmoji: label.emoji || '' });
      } else {
        await ipc.db?.assignLocalLabelToThread({ zaloId: activeAccountId, labelId, threadId: contact.contact_id, threadType, labelText: label.name || '', labelColor: label.color || '', labelEmoji: label.emoji || '' });
      }
      showNotification(exists ? `Đã gỡ nhãn "${label.name}"` : `Đã gắn nhãn "${label.name}"`, 'success');
      window.dispatchEvent(new CustomEvent('local-labels-changed', { detail: { zaloId: activeAccountId } }));
    } catch {
      showNotification('Không thể cập nhật nhãn', 'error');
    } finally {
      setLocalLabelToggling(null);
    }
  }, [activeAccountId, contact.contact_id, contact.contact_type, localLabelToggling, threadLocalLabelIds, localLabels, showNotification]);

  const handleLocalLabelChange = useCallback((newIds: number[]) => {
    const added = newIds.find(id => !threadLocalLabelIds.includes(id));
    const removed = threadLocalLabelIds.find(id => !newIds.includes(id));
    const toggleId = added ?? removed;
    if (toggleId != null) handleToggleLocalLabel(toggleId);
  }, [threadLocalLabelIds, handleToggleLocalLabel]);

  // Re-sync when contact or allLabels change
  useEffect(() => {
    setSelectedLabelIds(getContactLabelIds());
    setLabelsDirty(false);
  }, [contact.contact_id, allLabels]);

  // Load notes
  useEffect(() => {
    if (activeAccountId) {
      loadNotes();
      if (isGroup) loadZaloNotes();
    }
  }, [contact.contact_id, activeAccountId]);

  // Re-fetch notes when remote CRM note changes arrive
  useEffect(() => {
    const handleNoteChange = () => {
      if (activeAccountId) {
        loadNotes();
      }
    };
    window.addEventListener('ui:noteChanged', handleNoteChange);
    return () => window.removeEventListener('ui:noteChanged', handleNoteChange);
  }, [activeAccountId, contact.contact_id]);

  const loadNotes = async () => {
    if (!activeAccountId) return;
    const res = await ipc.crm?.getNotes({ zaloId: activeAccountId, contactId: contact.contact_id });
    if (res?.success) setNotes(res.notes);
  };

  const loadZaloNotes = async () => {
    if (!activeAccountId) return;
    try {
      const res = await ipc.db?.getPinnedMessages({ zaloId: activeAccountId, threadId: contact.contact_id });
      const notePins: PinnedNote[] = (res?.pins ?? [])
        .filter((p: any) => p.msg_type === 'note')
        .map((p: any) => {
          try {
            const c = JSON.parse(p.content ?? '{}');
            return {
              topicId: c.topicId ?? p.msg_id.replace('note_', ''),
              title: c.title ?? p.preview_text ?? p.msg_id,
              creatorId: c.creatorId ?? p.sender_id ?? '',
              creatorName: p.sender_name ?? '',
              createTime: c.createTime ?? p.timestamp ?? 0,
              editTime: c.editTime ?? p.pinned_at ?? 0,
            } as PinnedNote;
          } catch { return null; }
        })
        .filter(Boolean) as PinnedNote[];
      setZaloNotes(notePins);
    } catch { setZaloNotes([]); }
  };

  const handleSaveLabels = async () => {
    if (!activeAccountId) return;
    setSavingLabels(true);
    try {
      const acc = useAccountStore.getState().getActiveAccount();
      if (!acc) throw new Error('No account');
      const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

      const freshRes = await ipc.zalo?.getLabels({ auth });
      const freshLabels: LabelData[] = freshRes?.response?.labelData || allLabels;
      const version: number = freshRes?.response?.version || 0;

      const contactId = contact.contact_id;
      const labelThreadId = getLabelThreadId(contactId, isGroup);

      const updated = freshLabels.map(label => {
        const shouldHave = selectedLabelIds.includes(label.id);
        const has = label.conversations?.includes(labelThreadId) || label.conversations?.includes(contactId);
        if (shouldHave && !has) {
          return { ...label, conversations: [...(label.conversations || []), labelThreadId] };
        } else if (!shouldHave && has) {
          return { ...label, conversations: label.conversations.filter((id: string) => id !== labelThreadId && id !== contactId) };
        }
        return label;
      });

      const res = await ipc.zalo?.updateLabels({ auth, labelData: updated, version });
      if (res?.success) {
        const finalLabels: LabelData[] = res.response?.labelData || updated;
        setLabels(activeAccountId, finalLabels);
        setLabelsDirty(false);
        showNotification('Đã cập nhật nhãn', 'success');
      } else {
        throw new Error(res?.error || 'Không thể cập nhật nhãn');
      }
    } catch (err: any) {
      showNotification('Lỗi: ' + (err?.message || 'Không rõ'), 'error');
    }
    setSavingLabels(false);
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !activeAccountId) return;
    setSavingNote(true);
    try {
      await ipc.crm?.saveNote({ zaloId: activeAccountId, note: { contact_id: contact.contact_id, content: newNoteText.trim() } });
      setNewNoteText('');
      await loadNotes();
      showNotification('Đã thêm ghi chú mới', 'success');
    } catch {
      showNotification('Không thể thêm ghi chú', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditNote = async (id: number) => {
    if (!editNoteText.trim() || !activeAccountId) return;
    setSavingNote(true);
    try {
      await ipc.crm?.saveNote({ zaloId: activeAccountId, note: { id, contact_id: contact.contact_id, content: editNoteText.trim() } });
      setEditNoteId(null);
      await loadNotes();
      showNotification('Đã cập nhật ghi chú', 'success');
    } catch {
      showNotification('Không thể cập nhật ghi chú', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!activeAccountId) return;
    try {
      await ipc.crm?.deleteNote({ zaloId: activeAccountId, noteId });
      setNotes(prev => prev.filter(n => n.id !== noteId));
      showNotification('Đã xóa ghi chú', 'success');
    } catch {
      showNotification('Không thể xóa ghi chú', 'error');
    }
  };

  const handleUpdatePipelineStage = async (stageId: number | null) => {
    if (!activeAccountId) return;
    try {
      const res = await ipc.db?.updateContactPipelineStage({
        ownerZaloId: activeAccountId,
        contactId: contact.contact_id,
        stageId,
      });
      if (res?.success) {
        const currentState = useCRMStore.getState();
        currentState.setContacts(
          currentState.contacts.map(c =>
            c.contact_id === contact.contact_id ? { ...c, pipeline_stage_id: stageId } : c
          ),
          currentState.totalContacts
        );
        showNotification('Đã cập nhật giai đoạn Pipeline', 'success');
      } else {
        showNotification('Lỗi: Không thể cập nhật giai đoạn Pipeline', 'error');
      }
    } catch (err: any) {
      showNotification('Lỗi: ' + err.message, 'error');
    }
  };

  const handleGenerateAIProfile = async () => {
    if (!activeAccountId || notes.length === 0) return;
    setGeneratingAI(true);
    try {
      const defaultRes = await ipc.ai?.getDefault();
      const assistant = defaultRes?.assistant;
      if (!assistant) {
        showNotification('Vui lòng cấu hình Trợ lý AI mặc định trong cài đặt.', 'error');
        setGeneratingAI(false);
        return;
      }
      const notesText = notes
        .map((n) => `[Ngày ${new Date(n.created_at).toLocaleString('vi-VN')}]: ${n.content}`)
        .join('\n');
      
      const prompt = `Dưới đây là các ghi chú về khách hàng tên "${name}". Hãy phân tích và tổng hợp thông tin từ các ghi chú này thành một bản hồ sơ phân tích khách hàng.
YÊU CẦU:
- Phân tích ngắn gọn, đi thẳng vào các ý chính.
- Trình bày rõ ràng theo các đề mục:
  * Nhu cầu
  * Mong muốn
  * Tình trạng hiện tại
  * Khả năng tài chính
  * Địa chỉ/Khu vực sinh sống
  * Khác (nếu có)
- Nếu đề mục nào không có thông tin trong ghi chú, ghi rõ "Chưa có thông tin".
- Sử dụng tiếng Việt, phong cách chuyên nghiệp.

Dữ liệu ghi chú khách hàng:
${notesText}`;

      const chatRes = await ipc.ai?.chat(assistant.id, [{ role: 'user', content: prompt }]);
      if (chatRes?.success && chatRes?.result) {
        const aiSummaryText = chatRes.result.trim();
        const saveRes = await ipc.db?.updateContactAIProfile({
          ownerZaloId: activeAccountId,
          contactId: contact.contact_id,
          aiProfile: aiSummaryText,
        });

        if (saveRes?.success) {
          const currentState = useCRMStore.getState();
          currentState.setContacts(
            currentState.contacts.map(c =>
              c.contact_id === contact.contact_id ? { ...c, ai_profile: aiSummaryText } : c
            ),
            currentState.totalContacts
          );
          showNotification('Tổng hợp hồ sơ khách hàng bằng AI thành công!', 'success');
        } else {
          showNotification('Lỗi khi lưu phân tích AI vào cơ sở dữ liệu', 'error');
        }
      } else {
        showNotification('Lỗi: ' + (chatRes?.error || 'Trợ lý AI không phản hồi'), 'error');
      }
    } catch (err: any) {
      showNotification('Lỗi phân tích AI: ' + err.message, 'error');
    } finally {
      setGeneratingAI(false);
    }
  };

  const name = contact.alias || contact.display_name || contact.contact_id;
  const fmt = (ts: number) => ts ? new Date(ts).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-';

  const currentContactLabels = allLabels.filter(l => {
    const prefixed = getLabelThreadId(contact.contact_id, isGroup);
    return l.conversations?.includes(contact.contact_id) || l.conversations?.includes(prefixed);
  });

  // Calculate priority based on pipeline stage position
  let priorityText = 'Thấp';
  let priorityColor = 'text-gray-500';
  if (contact.pipeline_stage_id) {
    const currentStage = pipelineStages.find(s => s.id === contact.pipeline_stage_id);
    if (currentStage) {
      const allSortedStages = [...pipelineStages].sort((a, b) => a.position - b.position);
      const index = allSortedStages.findIndex(s => s.id === currentStage.id);
      if (index >= 0) {
        const ratio = (index + 1) / allSortedStages.length;
        if (ratio <= 0.35) {
          priorityText = 'Thấp';
          priorityColor = 'text-blue-600';
        } else if (ratio <= 0.7) {
          priorityText = 'T.Bình';
          priorityColor = 'text-amber-600';
        } else {
          priorityText = 'Cao';
          priorityColor = 'text-red-600';
        }
      }
    }
  }

  const sortedNotes = [...notes].sort((a, b) => a.created_at - b.created_at);

  return (
    <div className="w-80 flex-shrink-0 flex flex-col bg-white border-l border-gray-200 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{name}</span>
        <button onClick={() => onMessage(contact)}
          title="Nhắn tin"
          className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-1 px-3 py-2.5 bg-white border-b border-gray-200 text-center text-xs">
        <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg shadow-sm border ${
          notes.length >= 5 ? 'bg-red-500 border-red-500' : notes.length >= 1 ? 'bg-orange-500 border-orange-500' : 'bg-blue-500 border-blue-500'
        }`}>
          <span className="text-[9px] uppercase tracking-wider font-bold text-white-important opacity-90">LEAD</span>
          <span className="mt-0.5 font-bold text-[11px] text-white-important">
            {Math.min(100, notes.length * 20)} ({notes.length >= 5 ? 'Nóng' : notes.length >= 1 ? 'Ấm' : 'Lạnh'})
          </span>
        </div>
        <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg shadow-sm border ${
          priorityText === 'Cao' ? 'bg-red-500 border-red-500' : priorityText === 'T.Bình' ? 'bg-orange-500 border-orange-500' : 'bg-blue-500 border-blue-500'
        }`}>
          <span className="text-[9px] uppercase tracking-wider font-bold text-white-important opacity-90">ƯU TIÊN</span>
          <span className="mt-0.5 font-bold text-[11px] text-white-important">
            {priorityText}
          </span>
        </div>
        <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg shadow-sm border ${
          contact.is_friend === 1 ? 'bg-green-600 border-green-600' : 'bg-blue-500 border-blue-500'
        }`}>
          <span className="text-[9px] uppercase tracking-wider font-bold text-white-important opacity-90">TƯƠNG TÁC</span>
          <span className="mt-0.5 font-bold text-[11px] text-white-important">
            {contact.is_friend === 1 ? 'Thân thiết' : 'Lạnh'}
          </span>
        </div>
      </div>

      {/* Unified Profile Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
        {/* Avatar + Basic Info */}
        <div className="flex flex-col items-center gap-2 pb-4 border-b border-gray-200">
          {contact.avatar
            ? <img src={contact.avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
            : <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white text-2xl font-bold">
                {(name || 'U').charAt(0).toUpperCase()}
              </div>}
          <div className="text-center">
            <p className="text-gray-900 font-semibold text-sm">{name}</p>
            {contact.alias && contact.alias !== contact.display_name &&
              <p className="text-xs text-gray-500">({contact.display_name})</p>}
            {contact.phone && <p className="text-xs text-gray-500 mt-0.5"><PhoneDisplay phone={contact.phone} className="text-xs text-gray-500" /></p>}
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${contact.is_friend ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-800 border border-gray-200'}`}>
              {contact.is_friend ? '✓ Bạn bè' : 'Chưa kết bạn'}
            </span>
            {/* Gender & Birthday */}
            <div className="flex items-center justify-center gap-2 mt-1.5">
              {contact.gender === 0 && <span className="text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">♂ Nam</span>}
              {contact.gender === 1 && <span className="text-[11px] font-bold text-pink-800 bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded">♀ Nữ</span>}
              {contact.birthday && <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">🎂 {contact.birthday}</span>}
            </div>
          </div>
          <p className="text-[10px] text-gray-500">ID: {contact.contact_id}</p>
        </div>

        {/* Pipeline Stage Selector */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-700 font-semibold block">Trạng thái Pipeline</label>
          <select
            value={contact.pipeline_stage_id || ''}
            onChange={(e) => {
              const val = e.target.value;
              handleUpdatePipelineStage(val ? Number(val) : null);
            }}
            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">Chưa phân loại</option>
            {pipelineStages.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Local Labels */}
        {localLabels && localLabels.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-700 font-semibold">Nhãn Local</p>
            <LocalLabelSelector
              labels={localLabels}
              selectedIds={threadLocalLabelIds}
              onChange={handleLocalLabelChange}
              togglingId={localLabelToggling}
              placeholder="Chọn Nhãn Local..."
              emptyText="Chưa có Nhãn Local nào"
            />
          </div>
        )}

        {/* Zalo Labels */}
        <div className="space-y-1.5">
          <p className="text-xs text-gray-700 font-semibold">Nhãn Zalo</p>
          {allLabels.length === 0 ? (
            <p className="text-xs text-gray-500">Chưa tải nhãn. Hãy đồng bộ nhãn từ header.</p>
          ) : (
            <ZaloLabelSelector
              allLabels={allLabels}
              selectedIds={selectedLabelIds}
              singleSelect
              onChange={(ids) => { setSelectedLabelIds(ids); setLabelsDirty(true); }}
            />
          )}
          {labelsDirty && (
            <button onClick={handleSaveLabels} disabled={savingLabels}
              className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:opacity-50 transition-colors">
              {savingLabels ? 'Đang lưu...' : 'Lưu nhãn'}
            </button>
          )}
        </div>

        {/* AI Analysis Section */}
        <div className="space-y-2.5">
          {contact.ai_profile ? (
            <AIProfileCard
              aiProfile={contact.ai_profile}
              onGenerate={handleGenerateAIProfile}
              generating={generatingAI}
              hasNotes={notes.length > 0}
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-700 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="9" y1="9" x2="15" y2="9"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="13" y2="17"/>
                  </svg>
                  HỒ SƠ KHÁCH HÀNG (AI)
                </span>
                <button
                  onClick={handleGenerateAIProfile}
                  disabled={generatingAI || notes.length === 0}
                  className="px-2 py-0.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-[9px] uppercase font-bold tracking-wider transition-all duration-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  {generatingAI ? (
                    <>
                      <span className="animate-spin inline-block w-2.5 h-2.5 border border-gray-500 border-t-transparent rounded-full" />
                      ĐANG TẠO...
                    </>
                  ) : (
                    'TỔNG HỢP'
                  )}
                </button>
              </div>
              <p className="text-[11px] text-gray-600 italic py-3 text-center bg-white rounded-lg border border-dashed border-gray-300">
                {notes.length === 0 
                  ? 'Hãy thêm ghi chú trước khi tổng hợp bằng AI.' 
                  : 'Chưa có phân tích. Nhấn nút để bắt đầu phân tích.'}
              </p>
            </div>
          )}
        </div>

        {/* Notes (Chat Timeline) Section */}
        <div className="space-y-2.5 pb-4">
          <p className="text-xs text-gray-700 font-semibold">Ghi chú & Nhật ký</p>

          {/* Note tab selector (for group zalo pinned vs local notes) */}
          {isGroup && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-[11px] mb-2">
              <button
                onClick={() => setNoteTab('local')}
                className={`flex-1 py-1 font-medium transition-colors ${noteTab === 'local' ? 'bg-blue-600 text-white' : 'text-gray-655 hover:text-gray-800'}`}>
                Nội bộ
              </button>
              <button
                onClick={() => setNoteTab('zalo')}
                className={`flex-1 py-1 font-medium transition-colors ${noteTab === 'zalo' ? 'bg-yellow-500/80 text-white' : 'text-gray-655 hover:text-gray-800'}`}>
                Zalo ({zaloNotes.length})
              </button>
            </div>
          )}

          {/* Local Notes Timeline */}
          {(!isGroup || noteTab === 'local') && (
            <div className="space-y-3.5">
              {/* Timeline feed container */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {sortedNotes.map(note => (
                  <div key={note.id} className="w-full">
                    {editNoteId === note.id ? (
                      <div className="w-full bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5 shadow-sm">
                        <textarea 
                          value={editNoteText} 
                          onChange={e => setEditNoteText(e.target.value)}
                          rows={2} 
                          autoFocus
                          className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-500 resize-none" 
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setEditNoteId(null)} className="flex-1 py-1 rounded bg-gray-100 text-[11px] text-gray-700 hover:bg-gray-200 font-medium transition-colors border border-gray-300">Hủy</button>
                          <button onClick={() => handleEditNote(note.id)} disabled={savingNote || !editNoteText.trim()} className="flex-1 py-1 rounded bg-blue-600 text-[11px] text-white hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">Lưu</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-1 group">
                        <div className="max-w-[95%] bg-white border border-gray-300 rounded-xl rounded-tl-none px-3 py-2 text-xs text-gray-900 shadow-sm relative">
                          <p className="whitespace-pre-wrap leading-relaxed font-medium">{note.content}</p>
                          
                          <div className="absolute right-2 bottom-1 opacity-0 group-hover:opacity-100 flex gap-2 bg-white border border-gray-200 px-1.5 py-0.5 rounded transition-opacity shadow ml-4">
                            <button 
                              onClick={() => { setEditNoteId(note.id); setEditNoteText(note.content); }} 
                              className="text-[10px] text-blue-600 hover:text-blue-500 font-medium"
                            >
                              Sửa
                            </button>
                            <button 
                              onClick={() => handleDeleteNote(note.id)} 
                              className="text-[10px] text-red-655 hover:text-red-500 font-medium"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-500 ml-1">
                          {fmt(note.created_at || note.updated_at)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {notes.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4 bg-white border border-dashed border-gray-300 rounded-lg">
                    Chưa có ghi chú nào.
                  </p>
                )}
              </div>

              {/* Chat-style new note input bar */}
              <div className="flex items-center gap-2 bg-white border border-gray-300 px-2.5 py-1.5 rounded-lg focus-within:border-blue-500 transition-colors">
                <textarea
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder="Nhập ghi chú mới..."
                  rows={1}
                  className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 focus:outline-none resize-none max-h-16"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <button 
                  onClick={handleAddNote} 
                  disabled={savingNote || !newNoteText.trim()}
                  className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-40 self-end"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Zalo Pinned Notes */}
          {isGroup && noteTab === 'zalo' && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {zaloNotes.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4 bg-gray-50/50 border border-dashed border-gray-300 rounded-lg">Chưa có ghi chú Zalo nào</p>
              )}
              {zaloNotes.map(note => (
                <div key={note.topicId} className="bg-white border-l-4 border-l-yellow-500 border-y border-r border-gray-200 rounded-lg p-2.5 shadow-sm">
                  <p className="text-xs text-gray-900 font-medium whitespace-pre-wrap">{note.title}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    {note.creatorName && (
                      <span className="text-[10px] text-gray-500">{note.creatorName}</span>
                    )}
                    <span className="text-[10px] text-gray-500 ml-auto">
                      {note.editTime ? new Date(note.editTime).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
