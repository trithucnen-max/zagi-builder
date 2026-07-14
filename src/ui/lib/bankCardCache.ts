/**
 * bankCardCache — lưu tạm dữ liệu thẻ ngân hàng khi gửi, để hiển thị UI đẹp.
 *
 * Flow:
 *  1. BankCardModal gọi cacheSentBankCard() TRƯỚC khi gửi API
 *  2. Webhook echo về → BankCardBubble gọi getCachedBankCard() để lấy data
 *  3. Render UI riêng thay vì dùng iframe/img
 */

export interface BankCardData {
  binBank: number;
  bankName: string;
  numAccBank: string;
  nameAccBank: string;
  /** timestamp khi gửi, dùng để match + cleanup */
  sentAt: number;
  amount?: number;
  description?: string;
}

// Cache: key = `${ownerZaloId}:${threadId}` → array of recent sent cards (LIFO)
const cache = new Map<string, BankCardData[]>();

// ── Subscription system ──────────────────────────────────────────────────────
// BankCardBubble subscribes to know when new data is available (race condition fix)
const _updateListeners: Array<() => void> = [];

/**
 * Subscribe to cache updates. Returns unsubscribe function.
 * Called by BankCardBubble to re-render when bankCardCached event arrives late.
 */
export function subscribeToUpdates(fn: () => void): () => void {
  _updateListeners.push(fn);
  return () => {
    const idx = _updateListeners.indexOf(fn);
    if (idx >= 0) _updateListeners.splice(idx, 1);
  };
}

/** Notify all BankCardBubble subscribers that new data was cached */
function _notifyUpdate(): void {
  for (const fn of _updateListeners) {
    try { fn(); } catch {}
  }
}

/** Lưu dữ liệu bank card khi gửi */
export function cacheSentBankCard(ownerZaloId: string, threadId: string, data: Omit<BankCardData, 'sentAt'>): void {
  const key = `${ownerZaloId}:${threadId}`;
  const list = cache.get(key) || [];
  list.push({ ...data, sentAt: Date.now() });
  // Giữ tối đa 20 entries, xóa cũ
  if (list.length > 20) list.splice(0, list.length - 20);
  cache.set(key, list);
  // Notify all BankCardBubble instances to re-check
  _notifyUpdate();
}

/**
 * Tìm bank card data đã cache cho message vừa gửi.
 * Match bằng threadId + timestamp gần nhất (trong 30 giây).
 * Consume = xóa khỏi cache sau khi lấy.
 */
export function getCachedBankCard(ownerZaloId: string, threadId: string, msgTimestamp: number): BankCardData | null {
  const key = `${ownerZaloId}:${threadId}`;
  const list = cache.get(key);
  if (!list || list.length === 0) return null;

  // Tìm entry gần nhất trong khoảng 60s
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = list.length - 1; i >= 0; i--) {
    const diff = Math.abs(msgTimestamp - list[i].sentAt);
    if (diff < 60000 && diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) {
    const data = list[bestIdx];
    list.splice(bestIdx, 1); // consume
    if (list.length === 0) cache.delete(key);
    return data;
  }

  return null;
}

/** Cleanup entries cũ hơn 5 phút */
export function cleanupBankCardCache(): void {
  const now = Date.now();
  for (const [key, list] of cache.entries()) {
    const filtered = list.filter(e => now - e.sentAt < 300000);
    if (filtered.length === 0) cache.delete(key);
    else cache.set(key, filtered);
  }
}

// Tự động cleanup mỗi 2 phút
setInterval(cleanupBankCardCache, 120000);

