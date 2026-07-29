import { ipcMain } from 'electron';
import * as fs from 'fs';
import ZaloService from '../../src/services/zalo/ZaloService';
import WorkflowEngineService from '../../src/services/workflow/WorkflowEngineService';
import ConnectionManager from '../../src/utils/ConnectionManager';
import HttpConnectionManager from '../../src/services/http/HttpConnectionManager';
import DatabaseService from '../../src/services/database/DatabaseService';
import WorkspaceManager from '../../src/utils/WorkspaceManager';
import Logger from '../../src/utils/Logger';
import EventBroadcaster from '../../src/services/event/EventBroadcaster';
import FileStorageService from '../../src/services/file/FileStorageService';
import { uploadEmployeeMedia } from './proxyHelper';
import { ipcHandlerRegistry } from './ipcRegistry';
export { ipcHandlerRegistry };

async function getService(auth: any, isReconnection = false): Promise<ZaloService> {
    return await ZaloService.getInstance(auth, isReconnection);
}

/** Lấy zaloId từ auth.cookies qua ConnectionManager */
function resolveZaloId(auth: any): string {
    try {
        const authObj = typeof auth === 'string' ? JSON.parse(auth) : auth;
        
        // 1. Ưu tiên: Lấy zaloId truyền trực tiếp từ frontend nếu có
        const explicitZaloId = authObj?.zaloId || authObj?.zalo_id;
        if (explicitZaloId) {
            const cleanId = String(explicitZaloId);
            if (ConnectionManager.isConnected(cleanId)) return cleanId;
        }

        const cookies = authObj?.cookies || '';

        if (cookies) {
            const cookiesB64 = Buffer.from(cookies).toString('base64');

            // 2. Đối khớp trực tiếp theo cookies base64 (Primary)
            for (const [id, conn] of ConnectionManager.getAllConnections()) {
                if (conn.authKey === cookiesB64) return id;
            }

            // 3. Dự phòng: Quét database và giải mã cookies để đối khớp chính xác
            try {
                const accounts = DatabaseService.getInstance().getAccounts() || [];
                for (const acc of accounts) {
                    if (acc.cookies === cookies && ConnectionManager.isConnected(acc.zalo_id)) {
                        return acc.zalo_id;
                    }
                }
            } catch (dbErr: any) {
                Logger.error(`[zaloIpc] resolveZaloId DB matching failed: ${dbErr.message}`);
            }
        }

        // 4. Giải pháp cuối: Chỉ tự động fallback nếu KHÔNG truyền cookies trong request và chỉ có duy nhất 1 tài khoản đang kết nối
        const allConns = ConnectionManager.getAllConnections();
        if (!cookies && allConns.size === 1) {
            const [onlyId] = allConns.keys();
            Logger.log(`[zaloIpc] resolveZaloId: using only connection (no cookies in request): ${onlyId}`);
            return onlyId;
        }
    } catch {}
    return '';
}

/**
 * Nếu auth không có cookies nhưng đã resolve được zaloId từ connection
 * đang active → dùng auth của connection để tránh tạo instance ZaloService
 * mới với cookies rỗng (dẫn đến lỗi "Cookies tài khoản không hợp lệ").
 */
function resolveAuthFromConnection(auth: any, zaloId: string): any {
    if (!zaloId) return auth;
    const authObj = typeof auth === 'string' ? JSON.parse(auth) : auth;
    if (authObj?.cookies) return auth;
    const conn = ConnectionManager.getConnection(zaloId);
    if (conn?.auth?.cookies) {
        Logger.log(`[zaloIpc] resolveAuthFromConnection: using connection auth for ${zaloId} (no cookies in request auth)`);
        return conn.auth;
    }
    return auth;
}

/**
 * Upload local media files from Employee machine to Boss storage before proxying.
 * Employee's local file paths are invalid on Boss — reads each file on the
 * Employee side, sends as base64 via uploadEmployeeMedia(), returns Boss-resolved paths.
 * In standalone/boss mode (no-op) returns original params unchanged.
 */
async function prepareLocalFilesForProxy(params: any): Promise<any> {
    const singleFields = ['filePath', 'videoPath', 'thumbPath', 'voicePath', 'avatarPath', 'mediaPath'];
    let result = { ...params };

    for (const field of singleFields) {
        const val = result[field];
        if (val && typeof val === 'string' && val.length > 0) {
            // Skip http/https URLs — they will be downloaded by ZaloService.ensureLocalImagePath on Boss
            if (val.startsWith('http://') || val.startsWith('https://')) continue;
            // Skip local-media:// references (Boss-side media URLs)
            if (val.startsWith('local-media://')) continue;
            const absPath = FileStorageService.resolveAbsolutePath(val);
            if (!absPath) continue; // Can't resolve — skip (don't corrupt the value)
            const bossPaths = await uploadEmployeeMedia([absPath]);
            if (bossPaths && bossPaths[0]) {
                result[field] = bossPaths[0];
            }
        }
    }

    // For filePaths array: skip if it contains http URLs (library items from employee)
    // Those are resolved to local paths by resolveLibFilePaths on Boss side via _libraryUuids
    if (result.filePaths && Array.isArray(result.filePaths) && result.filePaths.length > 0) {
        const hasHttpUrls = result.filePaths.some((fp: string) => fp && (fp.startsWith('http://') || fp.startsWith('https://')));
        if (!hasHttpUrls) {
            const resolvedPaths = result.filePaths.map((fp: string) => FileStorageService.resolveAbsolutePath(fp) || fp);
            const bossPaths = await uploadEmployeeMedia(resolvedPaths);
            if (bossPaths && bossPaths.length > 0) {
                result.filePaths = bossPaths;
            }
        }
        // If has http URLs: let resolveLibFilePaths on Boss resolve them via _libraryUuids
    }

    return result;
}

function wrap(channel: string, fn: (service: ZaloService, params: any) => Promise<any>) {
    const handler = async (_event: any, params: any) => {
        try {
            // ─── Workspace-aware proxy routing ─────────────────────────
            // Skip if this call comes from HttpRelayService (boss-side proxy)
            const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
            if (activeWs?.type === 'remote' && !params?._fromRelay) {
                try {
                    // Upload local files (images, videos, voice) from Employee to Boss
                    // before proxying — Employee's file paths don't exist on Boss machine.
                    const preparedParams = await prepareLocalFilesForProxy(params);
                    return await HttpConnectionManager.getInstance().proxyAction(activeWs.id, channel, preparedParams);
                } catch (proxyErr: any) {
                    Logger.error(`[zaloIpc] Proxy error (${channel}): ${proxyErr.message}`);
                    return { success: false, error: `Proxy: ${proxyErr.message}` };
                }
            }
            // ───────────────────────────────────────────────────────────

            // Strip relay flag before passing to service
            let { auth, isReconnection = false, _fromRelay, ...rest } = params;
            if (!auth) return { error: 'Missing auth' };

            const zaloId = resolveZaloId(auth);

            // ─── Chặn tài khoản không có connection (đã ngắt kết nối) ──
            if (!isReconnection && !zaloId) {
                const authObj = typeof auth === 'string' ? JSON.parse(auth) : auth;
                const hasCookies = !!(authObj?.cookies);
                const connCount = ConnectionManager.getAllConnections().size;
                Logger.warn(`[zaloIpc] Blocked ${channel}: no active connection (hasCookies=${hasCookies}, activeConnections=${connCount})`);
                return { success: false, error: 'Tài khoản chưa kết nối.' };
            }
            // ────────────────────────────────────────────────────────────

            // ─── Fallback auth: nếu cookies rỗng nhưng đã có connection → dùng auth của connection
            auth = resolveAuthFromConnection(auth, zaloId);
            // ──────────────────────────────────────────────────────────────

            const service = await getService(typeof auth === 'string' ? auth : JSON.stringify(auth), isReconnection);
            const result = await fn(service, rest);
            return { success: true, response: result };
        } catch (error: any) {
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            Logger.error(`[zaloIpc] ${channel} error:`, error);
            return { success: false, error: errorMsg };
        }
    };

    // Register in both ipcMain and our handler registry
    ipcMain.handle(channel, handler);
    ipcHandlerRegistry.set(channel, handler);
}

export function registerZaloIpc() {
    // ─── Tin nhắn ────────────────────────────────────────────────────────
    wrap('zalo:sendMessage', (s, p) =>
        s.sendMessage(p.message, p.threadId, p.type, p.typeMessage, p.quote, p.mentions, p.styles)
    );

    wrap('zalo:sendSticker', (s, p) =>
        s.sendSticker(p.stickerId, p.threadId, p.type)
    );

    function resolveMediaToken(p: any): string {
        const token = p.mediaToken || p.filePath || p._libraryUuid;
        if (!token && !p.fileUrl) return '';

        // Helper check library UUID
        const tryLibraryUuid = (uuid: string) => {
            if (!uuid) return null;
            try {
                const LibraryService = require('../../src/services/library/LibraryService').default;
                const item = LibraryService.getInstance().getItem(uuid);
                if (item) {
                    const resolved = FileStorageService.resolveAbsolutePath(item.file_path);
                    if (resolved && fs.existsSync(resolved)) return resolved;
                    if (item.fileUrl) return item.fileUrl;
                }
            } catch {}
            return null;
        };

        // 1. If explicitly passed _libraryUuid, try resolving it first
        if (p._libraryUuid) {
            const libRes = tryLibraryUuid(p._libraryUuid);
            if (libRes) return libRes;
        }

        // 2. Check if token itself is a Library UUID
        if (token) {
            const libRes = tryLibraryUuid(token);
            if (libRes) return libRes;

            // 3. Check if token is HTTP/HTTPS CDN URL
            if (token.startsWith('http://') || token.startsWith('https://')) {
                return token;
            }

            // 4. Check if token as a file path exists on disk
            const resolvedPath = FileStorageService.resolveAbsolutePath(token);
            if (resolvedPath && fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
        }

        // 5. Fallback to p.fileUrl if provided
        if (p.fileUrl && (p.fileUrl.startsWith('http://') || p.fileUrl.startsWith('https://'))) {
            return p.fileUrl;
        }

        return token || '';
    }

    function resolveMediaTokens(p: any): string[] {
        const rawTokens = p.mediaTokens || p._libraryUuids || p.filePaths || [];
        if (!Array.isArray(rawTokens) || rawTokens.length === 0) return [];

        const resolved: string[] = [];
        for (const t of rawTokens) {
            const res = resolveMediaToken(typeof t === 'object' ? t : { mediaToken: t });
            if (res) resolved.push(res);
        }
        return resolved;
    }

    wrap('zalo:sendImage', (s, p) =>
        s.sendImage(FileStorageService.resolveAbsolutePath(resolveMediaToken(p)), p.threadId, p.type, p.message, p.quote)
    );

    wrap('zalo:sendImages', (s, p) =>
        s.sendImages(resolveMediaTokens(p).map((fp: string) => FileStorageService.resolveAbsolutePath(fp)), p.threadId, p.type, p.quote)
    );

    wrap('zalo:sendFile', (s, p) =>
        s.sendFile(FileStorageService.resolveAbsolutePath(resolveMediaToken(p)), p.threadId, p.type, p.quote)
    );

    wrap('zalo:sendVoice', (s, p) =>
        s.sendVoice(p.options, p.threadId, p.type, p.quote)
    );

    wrap('zalo:uploadVoiceFile', (s, p) =>
        s.uploadVoiceFile(FileStorageService.resolveAbsolutePath(p.voicePath), p.threadId, p.type)
    );

    wrap('zalo:sendVideo', (s, p) =>
        s.sendVideo(p.options, p.threadId, p.type, p.quote)
    );

    wrap('zalo:uploadVideoThumb', (s, p) =>
        s.uploadVideoThumb(FileStorageService.resolveAbsolutePath(p.thumbPath), p.threadId, p.type)
    );

    wrap('zalo:uploadVideoFile', (s, p) =>
        s.uploadVideoFile(FileStorageService.resolveAbsolutePath(p.videoPath), p.threadId, p.type)
    );

    wrap('zalo:sendLink', (s, p) =>
        s.sendLink(p.url, p.threadId, p.type, p.quote, p.message)
    );

    wrap('zalo:sendCard', (s, p) =>
        s.sendCard([{ options: p.options, threadId: p.threadId, type: p.type, quote: p.quote }])
    );

    wrap('zalo:undoMessage', (s, p) =>
        s.undoMessage(p.message)
    );

    wrap('zalo:deleteMessage', (s, p) =>
        s.deleteMessage(p.message, p.onlyMe)
    );

    wrap('zalo:deleteChat', (s, p) =>
        s.deleteChat(p.lastMessage, p.threadId, p.type)
    );

    wrap('zalo:addReaction', (s, p) =>
        s.addReaction(p.reactionType, p.message)
    );
    // NOTE: No manual self-broadcast needed here.
    // Zalo DOES fire the "reaction" listener event for self-reactions (isSelf: true).
    // ZaloLoginHelper handles all reactions (including self) via EventBroadcaster.broadcastReaction.
    // Adding a manual broadcast here would cause double events at boss and duplicate relay to employees.

    wrap('zalo:forwardMessage', (s, p) =>
        s.forwardMessage(p.payload, p.threadIds, p.type)
    );

    // ─── Lịch sử tin nhắn ────────────────────────────────────────────────
    wrap('zalo:getMessageHistory', (s, p) =>
        s.getMessageHistory(p.threadId, p.type, p.lastMsgId, p.count)
    );

    wrap('zalo:getGroupChatHistory', async (s, p) => {
        const zaloId = s.getZaloId();
        const batchSize = p.count ?? 20;
        let result: any;
        let msgs: any[] = [];
        let unsyncedMsgs: any[] = [];
        let foundExisting = false;

        // Quét tăng dần tối đa 5 vòng (tổng cộng 100 tin) để lấp khoảng trống dữ liệu
        const maxBatches = 5;
        for (let step = 1; step <= maxBatches; step++) {
            const currentCount = batchSize * step;
            try {
                result = await s.getGroupChatHistory(p.groupId, currentCount);
            } catch (apiErr: any) {
                Logger.warn(`[zaloIpc] getGroupChatHistory API error for group ${p.groupId}: ${apiErr.message}`);
                throw apiErr;
            }

            const rawMsgs = result?.groupMsgs || result?.data;
            msgs = Array.isArray(rawMsgs) ? rawMsgs : [];
            
            // Tìm kiếm điểm giao với tin nhắn cũ đã đồng bộ
            foundExisting = false;
            unsyncedMsgs = [];

            for (const message of msgs) {
                const msgId = message.data?.msgId;
                if (zaloId && msgId && DatabaseService.getInstance().hasMessage(zaloId, String(msgId))) {
                    foundExisting = true;
                    break; // Đã tìm thấy tin nhắn cũ đã có sẵn trong DB
                }
                unsyncedMsgs.push(message);
            }

            // Nếu phát hiện tin nhắn cũ đã tồn tại, hoặc số tin trả về ít hơn giới hạn yêu cầu,
            // nghĩa là chúng ta đã bao phủ toàn bộ khoảng trống tin nhắn mới.
            if (foundExisting || msgs.length < currentCount) {
                break;
            }

            // Nếu chưa tìm thấy tin cũ, tiếp tục vòng lặp sau để quét sâu hơn (tải count lớn hơn)
            await new Promise(r => setTimeout(r, 200));
        }

        // Sau khi đã thu thập toàn bộ các tin nhắn chưa đồng bộ, tiến hành lưu và phát sóng
        let processedCount = 0;
        if (zaloId) {
            for (const message of unsyncedMsgs) {
                try {
                    message.zaloId = zaloId;
                    await EventBroadcaster.broadcastMessage(zaloId, message, { silent: true });
                    processedCount++;
                } catch (err: any) {
                    Logger.warn(`[zaloIpc] getGroupChatHistory broadcast error: ${err.message}`);
                }
            }
        }
        
        Logger.info(`[zaloIpc] getGroupChatHistory: processed ${processedCount}/${unsyncedMsgs.length} unsynced messages for group ${p.groupId}`);
        return { groupMsgsCount: unsyncedMsgs.length, groupMsgs: unsyncedMsgs };
    });

    // ─── Bạn bè ───────────────────────────────────────────────────────────
    wrap('zalo:getFriends', (s) => s.getAllFriends());

    wrap('zalo:findUser', (s, p) =>
        s.findUser(p.phone || p.username)
    );

    wrap('zalo:getUserInfo', (s, p) =>
        s.getUserInfo(p.userId)
    );

    // Lấy context của phiên đăng nhập (uid, phone, loginInfo, ...)
    {
        const handler = async (_event: any, params: any) => {
            try {
                const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
                if (activeWs?.type === 'remote' && !params?._fromRelay) {
                    return await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:getContext', params);
                }
                let { auth, _fromRelay } = params;
            if (!auth) return { success: false, error: 'Missing auth' };
            const zaloId = resolveZaloId(auth);
            auth = resolveAuthFromConnection(auth, zaloId);
            const service = await getService(typeof auth === 'string' ? auth : JSON.stringify(auth));
            const context = service.getContext();

            // Serialize cookie thành plain object để tránh lỗi "object could not be cloned"
            let cookieSerialized: any = null;
            try {
                cookieSerialized = context.cookie?.serializeSync
                    ? context.cookie.serializeSync()
                    : context.cookie?.toJSON?.()
                    ?? null;
            } catch (_) {}

            // Chỉ trả về các field serializable (bỏ CookieJar object)
            const safeContext = {
                uid: context.uid,
                imei: context.imei,
                userAgent: context.userAgent,
                language: context.language,
                secretKey: context.secretKey,
                cookie: cookieSerialized,
                loginInfo: context.loginInfo,
                extraVer: context.extraVer,
                settings: context.settings,
                zpwServiceMap: context.zpwServiceMap,
                API_TYPE: context.API_TYPE,
                API_VERSION: context.API_VERSION,
            };

            // Log đầy đủ để debug
            Logger.info('[zaloIpc] getContext safeContext:\n' + JSON.stringify(safeContext, null, 2));

            return { success: true, response: safeContext };
        } catch (error: any) {
            Logger.error('[zaloIpc] zalo:getContext error:', error);
            return { success: false, error: error?.message || String(error) };
        }
        };
        ipcMain.handle('zalo:getContext', handler);
        ipcHandlerRegistry.set('zalo:getContext', handler);
    }

    wrap('zalo:sendFriendRequest', (s, p) =>
        s.sendFriendRequest(p.msg || '', p.userId)
    );

    wrap('zalo:acceptFriendRequest', (s, p) =>
        s.acceptFriendRequest(p.userId)
    );

    wrap('zalo:rejectFriendRequest', (s, p) =>
        s.rejectFriendRequest(p.userId)
    );

    wrap('zalo:undoFriendRequest', (s, p) =>
        s.undoFriendRequest(p.userId)
    );

    wrap('zalo:removeFriend', (s, p) =>
        (s as any).removeFriend(p.userId)
    );

    wrap('zalo:getSentFriendRequests', (s) => s.getSentFriendRequest());

    wrap('zalo:getFriendRecommendations', (s) => s.getFriendRecommendations());

    wrap('zalo:getAliasList', (s, p) =>
        s.getAliasList(p.count || 500, p.page || 1)
    );


    wrap('zalo:getFriendRequestStatus', (s, p) =>
        s.getFriendRequestStatus(p.userId)
    );

    wrap('zalo:blockUser', (s, p) => s.blockUser(p.userId));

    wrap('zalo:unblockUser', (s, p) => s.unblockUser(p.userId));

    wrap('zalo:getRelatedFriendGroup', (s, p) => s.getRelatedFriendGroup(p.userId));

    // ─── Nhóm ────────────────────────────────────────────────────────────
    wrap('zalo:getGroups', (s) => s.getAllGroups());

    wrap('zalo:getGroupInfo', (s, p) => s.getGroupInfo(p.groupId));

    wrap('zalo:createGroup', (s, p) =>
        s.createGroup({ name: p.name, members: p.members || p.memberIds, avatarPath: p.avatarPath })
    );

    wrap('zalo:addUserToGroup', (s, p) => {
        const userId = p.userId || p.memberId || p.members;
        if (!userId) throw new Error('Thiếu userId');
        if (!p.groupId) throw new Error('Thiếu groupId');
        const groupId = String(p.groupId).startsWith('g') ? String(p.groupId).slice(1) : String(p.groupId);
        Logger.log(`[zaloIpc] addUserToGroup userId=${userId} groupId=${groupId} (raw=${p.groupId})`);
        return s.addUserToGroup(userId, groupId);
    });

    wrap('zalo:removeUserFromGroup', (s, p) => {
        const userId = p.userId || p.memberId || p.members;
        if (!userId) throw new Error('Thiếu userId');
        if (!p.groupId) throw new Error('Thiếu groupId');
        const groupId = String(p.groupId).startsWith('g') ? String(p.groupId).slice(1) : String(p.groupId);
        Logger.log(`[zaloIpc] removeUserFromGroup userId=${userId} groupId=${groupId} (raw=${p.groupId})`);
        return s.removeUserFromGroup(userId, groupId);
    });

    wrap('zalo:leaveGroup', (s, p) => s.leaveGroup(p.groupId, p.silent ?? false));

    wrap('zalo:changeGroupName', (s, p) =>
        s.changeGroupName(p.name, p.groupId)
    );

    wrap('zalo:changeGroupAvatar', (s, p) =>
        s.changeGroupAvatar(p.avatarPath, p.groupId)
    );

    wrap('zalo:changeGroupOwner', (s, p) =>
        s.changeGroupOwner(p.userId, p.groupId)
    );

    wrap('zalo:disperseGroup', (s, p) =>
        s.disperseGroup(p.groupId)
    );

    wrap('zalo:addGroupDeputy', (s, p) =>
        s.addGroupDeputy(p.userId, p.groupId)
    );

    wrap('zalo:removeGroupDeputy', (s, p) =>
        s.removeGroupDeputy(p.userId, p.groupId)
    );

    wrap('zalo:getGroupMembersInfo', (s, p) =>
        s.getGroupMembersInfo(p.groupId, p.memberIds)
    );

    wrap('zalo:addGroupBlockedMember', (s, p) =>
        s.addGroupBlockedMember(p.userId, p.groupId)
    );

    wrap('zalo:removeGroupBlockedMember', (s, p) =>
        s.removeGroupBlockedMember(p.userId, p.groupId)
    );

    wrap('zalo:getGroupBlockedMember', (s, p) =>
        s.getGroupBlockedMember(p.groupId)
    );

    wrap('zalo:inviteUserToGroups', (s, p) => {
        if (!p.userId) throw new Error('Thiếu userId');
        let ids = p.groupIds;
        if (typeof ids === 'string') {
            try { ids = JSON.parse(ids); } catch {}
        }
        if (!Array.isArray(ids) || ids.length === 0) throw new Error('Thiếu hoặc sai định dạng groupIds');
        return s.inviteUserToGroups(p.userId, ids);
    });

    wrap('zalo:updateGroupSettings', (s, p) => {
        // Pre-seed the EventBroadcaster settings cache with the PREVIOUS (before-toggle) settings
        // so that when the update_setting group event comes back we can diff and show text.
        if (p.oldSettings && p.groupId) {
            try {
                const oldSettingsParsed = typeof p.oldSettings === 'string'
                    ? JSON.parse(p.oldSettings) : p.oldSettings;
                EventBroadcaster.seedGroupSettings(s.getZaloId() || '', p.groupId, oldSettingsParsed);
            } catch {}
        }
        return s.updateGroupSettings(p.settings, p.groupId);
    });

    wrap('zalo:getGroupLinkDetail', (s, p) =>
        s.getGroupLinkDetail(p.groupId)
    );

    wrap('zalo:getGroupLinkInfo', (s, p) =>
        s.getGroupLinkInfo(p.link, p.memberPage)
    );

    wrap('zalo:joinGroupLink', (s, p) =>
        s.joinGroupLink(p.link)
    );

    wrap('zalo:enableGroupLink', (s, p) =>
        s.enableGroupLink(p.groupId)
    );

    wrap('zalo:disableGroupLink', (s, p) =>
        s.disableGroupLink(p.groupId)
    );

    wrap('zalo:getPendingGroupMembers', (s, p) =>
        s.getPendingGroupMembers(p.groupId)
    );

    wrap('zalo:reviewPendingMemberRequest', (s, p) =>
        s.reviewPendingMemberRequest(p.payload, p.groupId)
    );

    // ─── Hội thoại ────────────────────────────────────────────────────────
    wrap('zalo:getPinConversations', (s) => s.getPinConversations());

    wrap('zalo:setPinConversation', (s, p) =>
        s.setPinConversations(p.conversations, p.isPin)
    );

    wrap('zalo:setMute', (s, p) =>
        s.setMute(p.threadId, p.threadType ?? 0, p.duration, p.action)
    );

    // ─── Labels ───────────────────────────────────────────────────────────
    // getLabels dùng HTTP thuần, không cần WS connection active
    // → không dùng wrap() để tránh bị block bởi !zaloId guard
    {
        const handler = async (_event: any, params: any) => {
            try {
                const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
                if (activeWs?.type === 'remote' && !params?._fromRelay) {
                    if (!HttpConnectionManager.getInstance().isConnected(activeWs.id)) {
                        return { success: false, error: 'Chưa kết nối tới BOSS', response: { labelData: [] } };
                    }
                    return await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:getLabels', params);
                }
                let { auth, _fromRelay } = params;
                if (!auth) return { success: false, error: 'Missing auth' };
                const zaloId = resolveZaloId(auth);
                auth = resolveAuthFromConnection(auth, zaloId);
                const service = await getService(typeof auth === 'string' ? auth : JSON.stringify(auth), false);
                const result = await service.getLabels();
                Logger.info(`[zaloIpc] zalo:getLabels ✅ got ${result?.labelData?.length ?? 0} labels`);
                return { success: true, response: result };
            } catch (error: any) {
                Logger.error('[zaloIpc] zalo:getLabels error:', error);
                return { success: false, error: error?.message || String(error) };
            }
        };
        ipcMain.handle('zalo:getLabels', handler);
        ipcHandlerRegistry.set('zalo:getLabels', handler);
    }

    // ─── updateLabels: full handler to emit workflow events ─────────────
    {
        const handler = async (_event: any, params: any) => {
            try {
                const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
                if (activeWs?.type === 'remote' && !params?._fromRelay) {
                    if (!HttpConnectionManager.getInstance().isConnected(activeWs.id)) {
                        return { success: false, error: 'Chưa kết nối tới BOSS' };
                    }
                    return await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:updateLabels', params);
                }
                let { auth, isReconnection = false, _fromRelay, labelData, version, labelDiffs, ...rest } = params;
            if (!auth) return { error: 'Missing auth' };

            const zaloId = resolveZaloId(auth);
            if (!isReconnection && !zaloId) {
                Logger.warn(`[zaloIpc] Blocked zalo:updateLabels: no active connection`);
                return { success: false, error: 'Tài khoản chưa kết nối.' };
            }

            auth = resolveAuthFromConnection(auth, zaloId);
            const service = await getService(typeof auth === 'string' ? auth : JSON.stringify(auth), isReconnection);
            const result = await service.updateLabels(labelData, version);

            // Centralized workflow label event emission
            if (Array.isArray(labelDiffs) && labelDiffs.length > 0 && zaloId) {
                try {
                    const engine = WorkflowEngineService.getInstance();
                    for (const diff of labelDiffs) {
                        engine.triggerLabelEvent({
                            zaloId,
                            threadId: diff.threadId,
                            threadType: diff.threadType ?? 0,
                            labelId: diff.labelId,
                            labelText: diff.labelText || '',
                            labelColor: diff.labelColor || '',
                            labelEmoji: diff.labelEmoji || '',
                            labelSource: 'zalo',
                            action: diff.action,
                        });
                    }
                } catch (err: any) {
                    Logger.error(`[zaloIpc] updateLabels workflow event error: ${err.message}`);
                }
            }

            return { success: true, response: result };
        } catch (error: any) {
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            Logger.error(`[zaloIpc] zalo:updateLabels error:`, error);
            return { success: false, error: errorMsg };
        }
        };
        ipcMain.handle('zalo:updateLabels', handler);
        ipcHandlerRegistry.set('zalo:updateLabels', handler);
    }

    wrap('zalo:changeFriendAlias', (s, p) =>
        s.changeFriendAlias(p.alias, p.friendId)
    );

    wrap('zalo:getStickers', (s, p) => {
        const kw = (p.keyword || '').trim();
        if (!kw) throw new Error('Missing keyword');
        return s.getStickers(kw);
    });

    wrap('zalo:getStickersDetail', (s, p) =>
        s.getStickersDetail(p.stickerIds)
    );

    wrap('zalo:getStickerCategoryDetail', (s, p) =>
        s.getStickerCategoryDetail(p.cateId)
    );

    // ─── Keep Alive ───────────────────────────────────────────────────────
    wrap('zalo:keepAlive', (s) => s.keepAlive());

    // ─── Unread Mark ──────────────────────────────────────────────────────────
    wrap('zalo:addUnreadMark', (s, p) =>
        s.addUnreadMark(p.threadId, p.type)
    );

    wrap('zalo:removeUnreadMark', (s, p) =>
        s.removeUnreadMark(p.threadId, p.type)
    );

    // ─── Poll ─────────────────────────────────────────────────────────────────
    wrap('zalo:createPoll', (s, p) =>
        s.createPoll(p.options, p.groupId)
    );

    wrap('zalo:getPollDetail', (s, p) =>
        s.getPollDetail(p.pollId)
    );

    wrap('zalo:lockPoll', (s, p) =>
        s.lockPoll(Number(p.pollId))
    );

    wrap('zalo:doVotePoll', (s, p) =>
        s.doVotePoll(Number(p.pollId), p.optionIds as number[])
    );

    wrap('zalo:addPollOption', (s, p) =>
        s.addPollOption(Number(p.pollId), p.option as string)
    );

    // ─── Tin nhắn nhanh ───────────────────────────────────────────────────────
    wrap('zalo:getQuickMessageList', (s) => s.getQuickMessageList());

    wrap('zalo:addQuickMessage', (s, p) =>
        s.addQuickMessage({ keyword: p.keyword, title: p.title, mediaPath: p.mediaPath })
    );

    wrap('zalo:updateQuickMessage', (s, p) =>
        s.updateQuickMessage({ keyword: p.keyword, title: p.title, mediaPath: p.mediaPath }, Number(p.itemId))
    );

    wrap('zalo:removeQuickMessage', (s, p) =>
        s.removeQuickMessage(p.itemIds)
    );

    // ─── Ghi chú nhóm ─────────────────────────────────────────────────────────
    wrap('zalo:createNote', (s, p) =>
        s.createNote({ title: p.title, pinAct: p.pinAct }, p.groupId)
    );

    wrap('zalo:editNote', (s, p) =>
        s.editNote({ title: p.title, topicId: p.topicId, pinAct: p.pinAct }, p.groupId)
    );

    wrap('zalo:getListBoard', (s, p) =>
        s.getListBoard(p.options, p.groupId)
    );

    // ─── Nhắc hẹn ─────────────────────────────────────────────────────────────
    wrap('zalo:createReminder', (s, p) => {
        Logger.info('[zaloIpc] createReminder params:', JSON.stringify(p, null, 2));
        return s.createReminder(p.options, p.threadId, p.type);
    });

    wrap('zalo:editReminder', (s, p) =>
        s.editReminder(p.options, p.threadId, p.type)
    );

    wrap('zalo:removeReminder', (s, p) =>
        s.removeReminder(p.reminderId, p.threadId, p.type)
    );

    wrap('zalo:getListReminder', (s, p) =>
        s.getListReminder(p.options, p.threadId, p.type)
    );

    wrap('zalo:getReminder', (s, p) =>
        s.getReminder(p.reminderId)
    );

    // ─── Sự kiện đã đọc ────────────────────────────────────────────────────
    wrap('zalo:sendSeenEvent', (s, p) =>
        s.sendSeenEvent(p.messages, p.type)
    );

    // ─── Gửi thẻ ngân hàng ─────────────────────────────────────────────────
    wrap('zalo:sendBankCard', (s, p) =>
        s.sendBankCard(p.payload, p.threadId, p.type)
    );

    // ─── Tra cứu hàng loạt SĐT ────────────────────────────────────────────
    wrap('zalo:getMultiUsersByPhones', (s, p) =>
        s.getMultiUsersByPhones(p.phones)
    );

    // ─── Ghost Mode Online (ẩn trạng thái hoạt động) ─────────────────────
    wrap('zalo:updateActiveStatus', (s, p) =>
        s.updateActiveStatus(p.active)
    );

    // ─── Quét nhóm Nâng cao (Premium Group Scan) ─────────────────────────
    const activeScanMap = new Map<string, Promise<any>>();

    const scanAdvancedHandler = async (event: any, params: { zaloId: string; linkOrGroupId: string }) => {
        const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
        if (activeWs?.type === 'remote' && !(params as any)?._fromRelay) {
            try {
                return await HttpConnectionManager.getInstance().proxyAction(activeWs.id, 'zalo:scanAdvancedGroup', params);
            } catch (err: any) {
                Logger.error(`[zaloIpc] Error forwarding zalo:scanAdvancedGroup to Boss: ${err.message}`);
                return { success: false, error: err.message };
            }
        }

        const { zaloId, linkOrGroupId } = params || {};
        if (!zaloId || !linkOrGroupId) {
            return { success: false, error: 'Thiếu zaloId hoặc link/ID nhóm' };
        }

        const cleanInput = linkOrGroupId.trim();
        const scanKey = `${zaloId}_${cleanInput}`;

        // Kiểm tra ghép luồng trùng (Pending Scan Deduplication)
        if (activeScanMap.has(scanKey)) {
            Logger.log(`[zaloIpc] Ghép luồng quét trùng đang chạy cho key: ${scanKey}`);
            return await activeScanMap.get(scanKey);
        }

        const scanPromise = (async () => {
            try {
                // 1. Boss tự lấy auth từ DatabaseService
                const accounts = DatabaseService.getInstance().getAccounts() || [];
                const account = accounts.find(a => String(a.zalo_id) === String(zaloId));
                if (!account || !account.cookies) {
                    return { success: false, error: `Không tìm thấy thông tin đăng nhập tài khoản Zalo ${zaloId} trên máy Boss` };
                }

                // 2. Resolve link Zalo me nếu có
                let groupId = cleanInput;
                let groupInfoFromLink: any = null;

                if (groupId.includes('zalo.me') || groupId.includes('chat.zalo.me') || !/^\d+$/.test(groupId)) {
                    const auth = { cookies: account.cookies, imei: account.imei, userAgent: account.user_agent };
                    const zaloService = await getService(auth);
                    const linkRes: any = await zaloService.getGroupLinkInfo(groupId, 1);
                    const rawInfo = linkRes?.response || linkRes;
                    const resolvedGroupId = rawInfo?.groupId || rawInfo?.group_id || rawInfo?.id;
                    
                    if (!resolvedGroupId) {
                        return { success: false, error: linkRes?.error || linkRes?.message || 'Không lấy được thông tin nhóm từ link. Kiểm tra lại đường dẫn.' };
                    }
                    
                    groupId = String(resolvedGroupId);
                    const name = rawInfo.name || groupId;
                    const avatar = rawInfo.fullAvt || rawInfo.avt || rawInfo.avatar || '';
                    const creatorId = String(rawInfo.creatorId || rawInfo.ownerId || '').replace(/_0$/, '');
                    const adminIds: string[] = (rawInfo.adminIds || []).map((a: any) => String(a).replace(/_0$/, ''));
                    groupInfoFromLink = { groupId, name, avatar, creatorId, adminIds };

                    // Lưu profile nhóm vào SQLite Boss
                    DatabaseService.getInstance().updateContactProfile(
                        zaloId,
                        groupId,
                        name,
                        avatar,
                        '',
                        'group'
                    );
                }

                // 3. Gọi scanGroupViaBackend tới backend server, tự động chuyển về Local Scanning nếu server ngoại tuyến
                const { scanGroupViaBackend } = await import('../../src/ui/lib/backendService');
                let result = await scanGroupViaBackend({
                    pageId: zaloId,
                    cookie: account.cookies,
                    imei: account.imei || '',
                    groupId,
                });

                if (!result?.success || !result.members || result.members.length === 0) {
                    Logger.log(`[zaloIpc] Backend server unavailable (${result?.error || 'unreachable'}), falling back to local Zalo scanning engine...`);
                    try {
                        const auth = { cookies: account.cookies, imei: account.imei, userAgent: account.user_agent };
                        const zaloService = await getService(auth);
                        const localMembersMap = new Map<string, any>();

                        // Lấy thông tin nhóm & thành viên hiện tại
                        try {
                            const gRes: any = await zaloService.getGroupInfo(groupId);
                            const gridMap = gRes?.response?.gridInfoMap || gRes?.response?.data?.gridInfoMap || {};
                            const gData = gridMap[groupId] || Object.values(gridMap)[0] || {};
                            const rawMems: any[] = gData.currentMems || gData.members || [];
                            rawMems.forEach((m: any) => {
                                const uid = String(m.id || m.userId || m.uid || '').replace(/_0$/, '').trim();
                                if (uid && /^\d+$/.test(uid)) {
                                    localMembersMap.set(uid, {
                                        userId: uid,
                                        displayName: m.name || m.displayName || m.zaloName || uid,
                                        zaloName: m.name || m.zaloName || uid,
                                        avatar: m.avatar || m.fullAvt || m.avt || '',
                                    });
                                }
                            });
                        } catch (e: any) {
                            Logger.warn(`[zaloIpc] Local getGroupInfo fallback error: ${e.message}`);
                        }

                        // Quét lịch sử nhắn tin để thu thập thêm UID thành viên
                        try {
                            const histRes: any = await zaloService.getGroupChatHistory(groupId, 100);
                            const msgs = histRes?.response?.groupMsgs || [];
                            for (const msg of msgs) {
                                const senderId = msg.data?.uidFrom || msg.senderId;
                                if (senderId) {
                                    const uid = String(senderId).replace(/_0$/, '').trim();
                                    if (/^\d+$/.test(uid) && !localMembersMap.has(uid)) {
                                        localMembersMap.set(uid, { userId: uid, displayName: uid, zaloName: uid, avatar: '' });
                                    }
                                }
                            }
                        } catch (e: any) {
                            Logger.warn(`[zaloIpc] Local getGroupChatHistory fallback error: ${e.message}`);
                        }

                        if (localMembersMap.size > 0) {
                            result = {
                                success: true,
                                groupId,
                                totalMembers: localMembersMap.size,
                                members: Array.from(localMembersMap.values()),
                            };
                        }
                    } catch (fallbackErr: any) {
                        Logger.error(`[zaloIpc] Local fallback scan failed: ${fallbackErr.message}`);
                    }
                }

                if (!result?.success) {
                    return { success: false, error: result?.error || 'Không thể quét nhóm. Vui lòng kiểm tra lại tài khoản Zalo.' };
                }

                const members = result.members || [];
                if (members.length === 0) {
                    return { success: false, error: 'Không tìm thấy thành viên nào trong nhóm.' };
                }

                // 4. Lưu kết quả thành viên vào SQLite Boss
                const creatorId = groupInfoFromLink?.creatorId || '';
                const adminIdList = groupInfoFromLink?.adminIds || [];
                const adminSet = new Set([creatorId, ...adminIdList].filter(Boolean));

                const memberList = members.map((m: any) => {
                    const mid = String(m.userId || m.id);
                    let role = 0;
                    if (mid === creatorId) role = 2;
                    else if (adminSet.has(mid)) role = 1;
                    return {
                        memberId: mid,
                        displayName: m.displayName || m.zaloName || m.userId || m.id,
                        avatar: m.avatar || '',
                        role,
                    };
                });

                DatabaseService.getInstance().saveGroupMembers(zaloId, groupId, memberList);

                DatabaseService.getInstance().save();

                // 5. Phát sự kiện Real-time Broadcast cho các máy Nhân viên đang kết nối
                EventBroadcaster.emit('crm:groupMembersChanged', { ownerZaloId: zaloId, groupId, totalMembers: members.length });

                return {
                    success: true,
                    groupId,
                    totalMembers: members.length,
                    savedCount: memberList.length,
                    groupInfo: groupInfoFromLink,
                    members: members.slice(0, 50),
                };
            } finally {
                activeScanMap.delete(scanKey);
            }
        })();

        activeScanMap.set(scanKey, scanPromise);
        return await scanPromise;
    };

    ipcMain.handle('zalo:scanAdvancedGroup', scanAdvancedHandler);
    ipcHandlerRegistry.set('zalo:scanAdvancedGroup', scanAdvancedHandler);
}

