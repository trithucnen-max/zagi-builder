# security-bugfix.md — Zagi: Fix P0→P2 Issues

## Overview

Kế hoạch xử lý toàn bộ lỗi và rủi ro tìm được qua phân tích brainstorm ngày 2026-07-08.
Thực hiện theo thứ tự từ P0 (nghiêm trọng nhất) đến P2 (kỹ thuật / maintenance).

**Project Type:** Electron + Node.js backend (desktop app)
**Agent:** `backend-specialist` (chính) + `security-auditor` (Risk security)

---

## Success Criteria

- [ ] `zalo.sendImage` gửi ảnh thành công từ máy nhân viên
- [ ] `zalo.sendFile` / `sendVoice` / `sendImages` hoạt động qua proxy
- [ ] File upload không thể path-traversal
- [ ] Cron workflow không gửi tin 2 lần (Boss lẫn nhân viên)
- [ ] `getApi()` throw rõ ràng khi proxy init fail
- [ ] Error không bị nuốt ngầm trong RelayService
- [ ] TypeScript build không có lỗi sau tất cả thay đổi

---

## Execution Order

```
P0-A (Bug-01 sendImage) → P0-B (Risk-03 path traversal) → VERIFY BUILD
P1-A (Bug-02 getApi)    → P1-B (Bug-03 missing proxy)   → P1-C (cron trùng)
P1-D (Risk-04 SSRF)     → P2-A (addUserToGroup)         → P2-B (memory)
P2-C (error silencing)  → PHASE X: Verification
```

> NOTE: P0-A phải xong trước P1-B (P1-B dùng uploadMedia từ P0-A).
> P0-A và P0-B có thể làm song song.

---

## 🔴 P0-A: Fix zalo.sendImage — proxy thiếu attachments

**File:** `src/services/workflow/WorkflowEngineService.ts`
**Root cause:** getApi() proxy sendMessage (dòng 3362-3371) chỉ lấy p1.msg, bỏ p1.attachments.
Boss nhận typeMessage='file' nhưng attachments=[] → throw. Dòng 1751-1754 hardcode success: true.

**Thay đổi cần làm:**
1. Thêm method `sendImages` vào proxy object trong `getApi()`:
   - Đọc file local → base64 → uploadMedia() lên Boss → nhận bossPath
   - proxyAction('zalo:sendImages', { filePaths: [bossPath], threadId, type })
2. Sửa `sendMessage` proxy khi typeMessage='file':
   - Upload attachments qua HttpClientService.uploadMedia()
   - Proxy zalo:sendImages thay vì sendMessage với typeMessage='file'
3. Sửa hardcode success: true (dòng 1751-1754) → phản ánh kết quả thực tế

**VERIFY:**
- [ ] Workflow zalo.sendImage từ nhân viên → ảnh thực sự gửi được
- [ ] Log workflow run không còn success: true khi ảnh fail
- [ ] npm run build:electron không lỗi

---

## 🔴 P0-B: Fix path traversal trong media upload

**File:** `src/services/http/HttpRelayService.ts`
**Root cause:** Nhân viên upload file với filename tùy ý, Boss không sanitize → có thể ghi đè file hệ thống.

**Thay đổi cần làm:**
```typescript
const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
const uploadDir = path.join(app.getPath('userData'), 'employee-uploads');
const finalPath = path.join(uploadDir, safeName);
if (!finalPath.startsWith(uploadDir)) {
  return this.json(res, 400, { success: false, error: 'Invalid filename' });
}
```

**VERIFY:**
- [ ] Upload filename='../../electron/main.js' → lỗi 400
- [ ] Upload file ảnh bình thường → thành công
- [ ] File lưu đúng trong userData/employee-uploads/

---

## 🟠 P1-A: Fix getApi() swallow exception

**File:** `src/services/workflow/WorkflowEngineService.ts:3443-3445`
**Root cause:** catch block chỉ log, không throw → fallback local → tin gửi từ sai account.

**Thay đổi:**
```typescript
// Sửa dòng 3443-3445: throw thay vì chỉ log
} catch (e: any) {
  Logger.error(`[WorkflowEngine] Proxy init error: ${e.message}`);
  throw new Error(`[WorkflowEngine] Không thể khởi tạo proxy API: ${e.message}`);
}
```

**VERIFY:**
- [ ] Khi WorkspaceManager throw → workflow node trả status: 'error'
- [ ] Không còn fallback về local khi workspace là remote

---

## 🟠 P1-B: Thêm proxy methods thiếu vào getApi()

**File:** `src/services/workflow/WorkflowEngineService.ts:3361-3441`
**Root cause:** Proxy object thiếu: sendFile, sendImages, sendVoice, assignLabel, removeLabel, forwardMessage.

**Thêm vào proxy object:**
- `sendFile(filePath, threadId, type)` — upload file trước, rồi proxyAction zalo:sendFile
- `sendVoice(options, threadId, type)` — proxyAction zalo:sendVoice
- `assignLabel(threadId, labelId)` — proxyAction zalo:assignLabel
- `removeLabel(threadId, labelId)` — proxyAction zalo:removeLabel
- `forwardMessage(p)` — proxyAction zalo:forwardMessage

**VERIFY:**
- [ ] Workflow zalo.sendFile từ nhân viên → gửi file được
- [ ] Workflow zalo.assignLabel → label được gán
- [ ] TypeScript không lỗi type

---

## 🟠 P1-C: Fix cron workflow trùng Boss + Nhân viên

**File:** `src/services/workflow/WorkflowEngineService.ts`
**Root cause:** registerCronJobs() chạy trên cả Boss lẫn nhân viên → trigger.schedule kích hoạt 2 lần.

**Thêm guard vào registerCronJobs():**
```typescript
private registerCronJobs(): void {
  try {
    const WorkspaceManager = require('../../utils/WorkspaceManager').default;
    const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
    if (activeWs?.type === 'remote') {
      Logger.log('[WorkflowEngine] Remote workspace — skipping cron registration');
      return;
    }
  } catch (e) { /* safe default: tiếp tục đăng ký */ }
  // ... existing cron logic
}
```

**VERIFY:**
- [ ] Nhân viên kết nối remote → cron schedule không chạy local
- [ ] Boss vẫn chạy cron bình thường
- [ ] Workflow trigger.schedule chỉ chạy 1 lần

---

## 🟠 P1-D: Fix SSRF qua callbackUrl

**File:** `src/services/http/HttpRelayService.ts:558-577`
**Root cause:** handleHeartbeat() nhận callbackUrl tùy ý, Boss sẽ POST events ra ngoài.

**Thêm validation:**
```typescript
private isValidInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const h = parsed.hostname;
    return h === 'localhost' || h === '127.0.0.1' ||
      /^192\.168\.\d+\.\d+$/.test(h) ||
      /^10\.\d+\.\d+\.\d+$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h);
  } catch { return false; }
}
```

> WARNING: Nhân viên dùng tunnel Cloudflared có thể dùng public callbackUrl.
> Cần kiểm tra thêm: chấp nhận nếu URL match tunnel URL đã đăng ký của nhân viên.

**VERIFY:**
- [ ] callbackUrl 'http://attacker.com' → bị reject
- [ ] callbackUrl 'http://192.168.1.100:27799' → được chấp nhận
- [ ] Nhân viên LAN vẫn nhận events bình thường

---

## 🟡 P2-A: Fix addUserToGroup chỉ gửi 1 member

**File:** `src/services/workflow/WorkflowEngineService.ts:3396-3398`
**Root cause:** Proxy lấy p.members?.[0] thay vì loop qua toàn bộ array.

**Sửa:**
```typescript
addUserToGroup: async (p: any) => {
  const members = Array.isArray(p.members) ? p.members : [p.members].filter(Boolean);
  const results = [];
  for (const userId of members) {
    const res = await HttpConnectionManager.getInstance().proxyAction(
      activeWs.id, 'zalo:addToGroup',
      { zaloId: targetZaloId, auth: {}, groupId: p.groupId, userId }
    );
    results.push(res);
  }
  return { success: results.every(r => r?.success), results };
}
```

**VERIFY:**
- [ ] addToGroup với members: ['id1','id2','id3'] → cả 3 được thêm

---

## 🟡 P2-B: Fix memory leak debounce timers + SSE queue

**Files:** WorkflowEngineService.ts + HttpRelayService.ts

**WorkflowEngineService — thêm cleanup trong initialize():**
```typescript
setInterval(() => {
  for (const key of this.debounceTimers.keys()) {
    if (!this.debounceBuffers.has(key)) this.debounceTimers.delete(key);
  }
  Logger.log(`[WorkflowEngine] Cleanup: ${this.debounceTimers.size} active debounce timers`);
}, 5 * 60 * 1000);
```

**HttpRelayService — thêm periodic SSE queue cleanup:**
```typescript
setInterval(() => {
  const ttl = HttpRelayService.SSE_QUEUE_TTL_MS;
  const now = Date.now();
  for (const [empId, queue] of this.sseEventQueue) {
    const filtered = queue.filter(e => now - e.ts < ttl);
    if (!filtered.length) this.sseEventQueue.delete(empId);
    else this.sseEventQueue.set(empId, filtered);
  }
}, 10 * 60 * 1000);
```

**VERIFY:**
- [ ] App chạy 30 phút → debounceTimers.size ổn định
- [ ] SSE queue không tăng vô hạn

---

## 🟡 P2-C: Fix error silencing trong RelayService

**File:** `src/services/http/HttpRelayService.ts`

**Tìm và sửa tất cả empty catch:**
```bash
grep -n "catch {}" src/services/http/HttpRelayService.ts
```

**Thay thế:**
```typescript
// Trước:
} catch {}
// Sau:
} catch (err: any) {
  Logger.warn(`[HttpRelayService] Non-critical error: ${err?.message}`);
}
```

**VERIFY:**
- [ ] grep "catch {}" HttpRelayService.ts → 0 kết quả
- [ ] Khi DB write fail → log xuất hiện

---

## Phase X: Final Verification

### TypeScript Build
```bash
cd ~/Downloads/deplao
npm run build:electron
# → Phải KHÔNG có error
```

### Security Scan
```bash
python .agents/skills/vulnerability-scanner/scripts/security_scan.py src/services/http/
```

### Functional Test Checklist (thực hiện trên máy nhân viên)
- [ ] P0-A: zalo.sendImage → ảnh gửi thành công
- [ ] P0-A: Workflow log success phản ánh thực tế
- [ ] P0-B: Upload ../etc/passwd → lỗi 400
- [ ] P1-A: Boss offline → workflow nhân viên báo lỗi rõ
- [ ] P1-B: zalo.sendFile → file gửi được
- [ ] P1-C: Cron chỉ chạy trên Boss
- [ ] P1-D: callbackUrl external → log rejected
- [ ] P2-A: addToGroup 3 members → cả 3 vào nhóm
- [ ] P2-B: Memory ổn định sau 30 phút
- [ ] P2-C: grep "catch {}" → 0 kết quả

### Exit Gate
```
[OK] npm run build:electron → success
[OK] zalo.sendImage từ nhân viên → ảnh gửi được
[OK] Path traversal test → bị block
[OK] All checkboxes ticked
```
