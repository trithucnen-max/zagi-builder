/**
 * NotificationService — handles sound and desktop (OS) notifications
 */

let audioCtx: AudioContext | null = null;

let playTimeout: any = null;
let pendingCount = 0;
let lastPlayTime = 0;
let pendingVolume = 0.5;

function playSingleNotificationSound(volume = 0.5) {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    const vol = Math.max(0, Math.min(1, volume));

    // Two-tone ding: 880 Hz then 1100 Hz
    const tones = [880, 1100];
    let t = ctx.currentTime + 0.01;
    for (const freq of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol * 0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.16;
    }
  } catch (e) {
    console.warn('[NotificationService] playSingleNotificationSound error:', e);
  }
}

function playDoubleNotificationSound(volume = 0.5) {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    const vol = Math.max(0, Math.min(1, volume));

    // Double ding: 880, 1100 (ding 1) -> 880, 1100 (ding 2)
    const tones = [880, 1100, 880, 1100];
    const delays = [0.01, 0.17, 0.35, 0.51];
    
    for (let i = 0; i < tones.length; i++) {
      const freq = tones[i];
      const delay = delays[i];
      const t = ctx.currentTime + delay;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol * 0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch (e) {
    console.warn('[NotificationService] playDoubleNotificationSound error:', e);
  }
}

export function playNotificationSound(volume = 0.5) {
  const now = Date.now();
  if (now - lastPlayTime < 3000) {
    return;
  }

  pendingVolume = volume;
  pendingCount++;

  if (!playTimeout) {
    playTimeout = setTimeout(() => {
      const countToPlay = pendingCount;
      pendingCount = 0;
      playTimeout = null;
      lastPlayTime = Date.now();

      if (countToPlay > 1) {
        playDoubleNotificationSound(pendingVolume);
      } else {
        playSingleNotificationSound(pendingVolume);
      }
    }, 250);
  }
}

/** Request OS notification permission (call once at app start) */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── Notification queue ───────────────────────────────────────────────────────
// OS giới hạn số notification hiển thị cùng lúc.
// Queue đảm bảo mỗi notification được hiển thị đủ thời gian trước khi cái tiếp theo.

interface QueueItem {
  title: string;
  body: string;
  icon?: string;
  threadInfo?: { zaloId: string; threadId: string; threadType: number } | { erpLink?: string };
}

const notifQueue: QueueItem[] = [];
let notifBusy = false;
// Track last notification time per thread để group rapid messages
const lastNotifTime: Record<string, number> = {};
// Active notification instance per thread (để replace khi có tin mới cùng thread)
const activeNotifs: Record<string, Notification> = {};

function processQueue() {
  if (notifBusy || notifQueue.length === 0) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  notifBusy = true;
  const item = notifQueue.shift()!;
  const threadKey = item.threadInfo && 'zaloId' in item.threadInfo
    ? `${item.threadInfo.zaloId}_${item.threadInfo.threadId}`
    : 'global';

  // Đóng notification cũ của cùng thread nếu còn đang hiện
  if (activeNotifs[threadKey]) {
    try { activeNotifs[threadKey].close(); } catch {}
    delete activeNotifs[threadKey];
  }

  try {
    const n = new Notification(item.title, {
      body: item.body.length > 120 ? item.body.slice(0, 117) + '…' : item.body,
      icon: item.icon || undefined,
      silent: true,
      // KHÔNG dùng tag — tag khiến OS replace thay vì stack, làm mất notification
    });

    activeNotifs[threadKey] = n;

    // Lưu ref để onclick có thể truy cập ngay cả sau khi timeout close
    const threadInfo = item.threadInfo;
    let handled = false;

    if (threadInfo) {
      n.onclick = () => {
        if (handled) return;
        handled = true;
        try { n.close(); } catch {}
        delete activeNotifs[threadKey];
        // Gửi IPC mở hội thoại
        try {
          (window as any).electronAPI?.app?.openThread(threadInfo);
        } catch (e) {
          console.warn('[NotificationService] openThread IPC error:', e);
        }
      };
    }

    // onclose: giải phóng queue slot cho notification tiếp theo
    n.onclose = () => {
      delete activeNotifs[threadKey];
      notifBusy = false;
      setTimeout(processQueue, 300);
    };

    // Hiển thị 4 giây, sau đó tự động đóng
    // onclose sẽ xử lý queue tiếp theo (không cần duplicate trong setTimeout)
    setTimeout(() => {
      try { n.close(); } catch {}
    }, 4000);
  } catch (e) {
    console.warn('[NotificationService] showDesktopNotification error:', e);
    notifBusy = false;
    setTimeout(processQueue, 300);
  }
}

/** Show a desktop (OS) notification that appears in the system tray corner.
 *  Sử dụng queue để đảm bảo mọi notification đều được hiển thị.
 *  Rapid messages từ cùng thread trong 800ms được gộp thành 1 notification.
 */
export function showDesktopNotification(
  title: string,
  body: string,
  icon?: string,
  threadInfo?: { zaloId: string; threadId: string; threadType: number } | { erpLink?: string }
) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const threadKey = threadInfo && 'zaloId' in threadInfo
    ? `${threadInfo.zaloId}_${threadInfo.threadId}`
    : 'global';

  const now = Date.now();
  const timeSinceLast = now - (lastNotifTime[threadKey] || 0);
  lastNotifTime[threadKey] = now;

  // Nếu có notification cùng thread đang trong queue, replace nó thay vì add mới
  if (timeSinceLast < 800 && threadInfo && 'zaloId' in threadInfo) {
    const info = threadInfo as { zaloId: string; threadId: string; threadType: number };
    const existingIdx = notifQueue.findIndex(
      q => q.threadInfo && 'zaloId' in q.threadInfo &&
           (q.threadInfo as any).threadId === info.threadId &&
           (q.threadInfo as any).zaloId === info.zaloId
    );
    if (existingIdx >= 0) {
      // Update body của notification đang chờ
      notifQueue[existingIdx].body = body;
      notifQueue[existingIdx].title = title;
      return;
    }
  }

  notifQueue.push({ title, body, icon, threadInfo });
  processQueue();
}
