/**
 * SocketIOClient - Employee-side Socket.IO client.
 *
 * Replaces the SSE connection for real-time event delivery.
 * - Connects to Boss Socket.IO server (attach to same port, path /socket.io)
 * - Authenticates via JWT token
 * - Auto-reconnects with Socket.IO built-in (không watchdog, không code tay)
 * - Tracks lastSeqId for catch-up on reconnect
 * - Forwards received events to EventBroadcaster.sendDirect
 *
 * Integration:
 *   HttpClientService.connect() → this.connect(bossUrl, token)
 *   HttpClientService.disconnect() → this.disconnect()
 */
import { io as socketIOClient, Socket } from 'socket.io-client';
import Logger from '../../utils/Logger';

class SocketIOClient {
  private socket: Socket | null = null;
  private bossUrl = '';
  private token = '';
  private workspaceId = '';

  /** SeqId của event cuối cùng đã nhận (dùng cho catch-up khi reconnect) */
  private lastSeqId = 0;

  /** Callback khi nhận event từ Boss */
  private onEvent: ((channel: string, data: any) => void) | null = null;
  /** Callback khi trạng thái kết nối thay đổi */
  private onStatusChange: ((connected: boolean) => void) | null = null;

  /**
   * Kết nối đến Boss Socket.IO server.
   * Socket.IO tự động:
   * - Dùng WebSocket nếu khả dụng, fallback xuống HTTP polling
   * - Ping/pong để phát hiện mất kết nối
   * - Auto-reconnect với exponential backoff
   * - Buffer events trong quá trình reconnect
   */
  public connect(bossUrl: string, token: string): void {
    this.disconnect();
    this.bossUrl = bossUrl;
    this.token = token;
    this.lastSeqId = 0;

    Logger.log(`[SocketIOClient] Connecting to ${bossUrl}...`);

    this.socket = socketIOClient(bossUrl, {
      path: '/socket.io',
      auth: { token },
      // Ưu tiên WebSocket, fallback polling cho tunnel
      transports: ['websocket', 'polling'],
      // Auto-reconnect
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.5,
      timeout: 20000,
      // Giảm memory
      forceNew: true,
    });

    // ─── Connected ───────────────────────────────────────────────
    this.socket.on('connect', () => {
      Logger.log(`[SocketIOClient] 🟢 Connected to ${this.bossUrl} (id=${this.socket?.id})`);
      this.onStatusChange?.(true);

      // Catch-up: xin lại event đã miss khi offline
      // lastSeqId có thể = 0 (lần đầu) → Boss gửi toàn bộ buffer
      this.socket?.emit('catch-up', { lastSeqId: this.lastSeqId });
    });

    // ─── Event từ Boss ──────────────────────────────────────────
    this.socket.on('event', (payload: { seqId: number; channel: string; data: any }) => {
      if (!payload || !payload.channel) return;

      // Track seqId
      if (payload.seqId > this.lastSeqId) {
        this.lastSeqId = payload.seqId;
      }

      // Forward đến handler (handlePushedEvent trong HttpClientService)
      this.onEvent?.(payload.channel, payload.data);
    });

    // ─── Disconnected ───────────────────────────────────────────
    this.socket.on('disconnect', (reason) => {
      Logger.log(`[SocketIOClient] 🔴 Disconnected from ${this.bossUrl}: ${reason}`);
      this.onStatusChange?.(false);
    });

    // ─── Connect error ──────────────────────────────────────────
    this.socket.on('connect_error', (err) => {
      Logger.warn(`[SocketIOClient] Connection error: ${err.message}`);
      this.onStatusChange?.(false);
    });

    // ─── Error ──────────────────────────────────────────────────
    this.socket.on('error', (err) => {
      Logger.warn(`[SocketIOClient] Error: ${err.message}`);
    });

    // ─── Auto reconnect on Wake-up / Network Recovery ─────────────
    const gWindow = typeof globalThis !== 'undefined' ? (globalThis as any).window : null;
    const gDoc = typeof globalThis !== 'undefined' ? (globalThis as any).document : null;
    if (gWindow && gWindow.addEventListener) {
      const handleWakeup = () => {
        if (this.socket && !this.socket.connected && this.bossUrl && this.token) {
          Logger.log(`[SocketIOClient] ⚡ System wake-up / focus / network back online -> reconnecting to ${this.bossUrl}`);
          this.socket.connect();
        }
      };
      gWindow.addEventListener('visibilitychange', () => {
        if (gDoc && gDoc.visibilityState === 'visible') handleWakeup();
      });
      gWindow.addEventListener('focus', handleWakeup);
      gWindow.addEventListener('online', handleWakeup);
    }
  }

  /**
   * Chủ động ép thử kết nối lại ngay lập tức nếu đang ngắt
   */
  public reconnectIfNeeded(): void {
    if (this.socket) {
      if (!this.socket.connected) {
        Logger.log(`[SocketIOClient] 🔄 Manual reconnect trigger to ${this.bossUrl}`);
        this.socket.connect();
      }
    } else if (this.bossUrl && this.token) {
      this.connect(this.bossUrl, this.token);
    }
  }

  /**
   * Ngắt kết nối
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
    this.lastSeqId = 0;
  }

  /**
   * Kiểm tra trạng thái kết nối
   */
  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ─── Callbacks ────────────────────────────────────────────────

  public setOnEvent(cb: (channel: string, data: any) => void): void {
    this.onEvent = cb;
  }

  public setOnStatusChange(cb: (connected: boolean) => void): void {
    this.onStatusChange = cb;
  }

  public setWorkspaceId(id: string): void {
    this.workspaceId = id;
  }

  /** Reset seqId (dùng khi reconnect toàn bộ) */
  public resetSeqId(): void {
    this.lastSeqId = 0;
  }
}

export default SocketIOClient;
