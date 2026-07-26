import {
    MuteAction,
    MuteDuration,
    AcceptFriendRequestResponse,
    AddReactionResponse,
    AddUnreadMarkResponse,
    AddUserToGroupResponse,
    API,
    BlockUserResponse,
    ChangeGroupAvatarResponse,
    ChangeGroupNameResponse,
    CreateGroupResponse,
    CreateReminderOptions,
    CreateReminderResponse,
    DeleteChatLastMessage,
    DeleteChatResponse,
    DeleteMessageDestination,
    DeleteMessageResponse,
    DisableGroupLinkResponse,
    DisperseGroupResponse,
    EditReminderOptions,
    EditReminderResponse,
    EnableGroupLinkResponse,
    FindUserResponse,
    ForwardMessagePayload,
    ForwardMessageResponse,
    GetAliasListResponse,
    GetAllFriendsResponse,
    GetAllGroupsResponse,
    GetArchivedChatListResponse,
    GetFriendRequestStatusResponse,
    GetGroupChatHistoryResponse,
    GetListReminderResponse,
    GetPendingGroupMembersResponse,
    GetPinConversationsResponse,
    GetReminderResponse,
    GetReminderResponsesResponse,
    GetSentFriendRequestResponse,
    GroupInfoResponse,
    KeepAliveResponse,
    LeaveGroupResponse,
    ListReminderOptions,
    MessageContent,
    Reactions,
    RejectFriendRequestResponse,
    RemoveFriendAliasResponse,
    RemoveReminderResponse,
    RemoveUserFromGroupResponse, SendBankCardPayload,
    SendBankCardResponse,
    SendCardResponse,
    SendSeenEventResponse,
    SendFriendRequestResponse,
    SendVideoOptions,
    SendVideoResponse,
    SendVoiceOptions,
    SendVoiceResponse,
    SetHiddenConversationsResponse,
    SetPinnedConversationsResponse,
    StickerDetailResponse,
    ThreadType,
    UnBlockUserResponse,
    UndoPayload,
    UndoResponse,
    UpdateArchivedChatListResponse,
    UpdateArchivedChatListTarget,
    UpdateGroupSettingsOptions,
    UpdateGroupSettingsResponse,
    UserInfoResponse,
    UserMessage,
    GetMultiUsersByPhonesResponse,
    UpdateActiveStatusResponse,
    UndoFriendRequestResponse,
} from "zca-js";
import axios from "axios";
import path from "path";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import {SendMessageResult} from "zca-js/dist/apis/sendMessage";
import {SendCardOptions} from "zca-js/dist/apis/sendCard";
import ConnectionManager from "../../utils/ConnectionManager";
import FileStorageService from "../file/FileStorageService";
import {SendLinkOptions, SendLinkResponse} from "zca-js/dist/apis/sendLink";
import {GetGroupLinkDetailResponse} from "zca-js/dist/apis/getGroupLinkDetail";
import {imageSize} from "image-size";
import {convertThreadType, isImageFile} from "../../utils/Utils";
import Logger from "../../utils/Logger";


interface Auth {
    cookies: string;
    imei: string;
    userAgent: string;
}
export default class ZaloService {
    private static instances: Map<string, ZaloService> = new Map();
    private api: API | undefined;
    private auth: Auth;
    private zaloId: string | null = null;

    /**
     * Khởi tạo một đối tượng ZaloService mới
     * @param auth ID Zalo của người dùng
     */
    constructor(auth: Auth) {
        this.auth = auth;
    }
    
    /**
     * Lấy hoặc tạo một instance của ZaloService
     * @returns Promise<ZaloService> Instance của ZaloService
     * @param auth
     * @param isReconnection Whether this is a reconnection (force delete old connection and create new)
     */
    public static async getInstance(auth: any, isReconnection: boolean = false): Promise<ZaloService> {
        const parsedAuth = typeof auth === 'string' ? JSON.parse(auth) : auth;
        const key = Buffer.from(parsedAuth.cookies).toString('base64');

        // If reconnection, remove existing instance to force recreation
        // Nếu reconnection, xóa instance hiện có để buộc tạo lại
        if (isReconnection && this.instances.has(key)) {
            Logger.log(`[${new Date().toISOString()}] [ZaloService] 🔄 Reconnection: Removing existing ZaloService instance`);
            this.instances.delete(key);
        }

        if (!this.instances.has(key)) {
            const instance = new ZaloService(parsedAuth);
            await instance.initialize(isReconnection);
            this.instances.set(key, instance);
        }
        return this.instances.get(key)!;
    }

    /**
     * Lấy ZaloService instance hiện có theo zaloId (không tạo mới).
     * Dùng trong WorkflowEngine để tránh truyền auth object.
     */
    public static getInstanceByZaloId(zaloId: string): ZaloService | null {
        for (const instance of this.instances.values()) {
            if (instance.zaloId === zaloId) return instance;
        }
        return null;
    }


    public static removeInstanceByZaloId(zaloId: string): void {
        for (const [key, instance] of this.instances) {
            if (instance.zaloId === zaloId) {
                this.instances.delete(key);
                Logger.log(`[ZaloService] 🗑️ Removed instance for zaloId=${zaloId}`);
                return;
            }
        }
    }

    /**
     * Khởi tạo API Zalo cho instance hiện tại
     * SỬ DỤNG ConnectionManager làm single source of truth
     * API-only mode: không start listener (chỉ dùng cho gọi API)
     * @param isReconnection Whether this is a reconnection (force delete old connection and create new)
     */
    private async initialize(isReconnection: boolean = false): Promise<void> {
        Logger.log(`[${new Date().toISOString()}] [ZaloService] Initializing${isReconnection ? ' (reconnection mode)' : ''}...`);

        // GET API FROM CONNECTION MANAGER (not create new!)
        // Pass startListener=false for API-only operations (no WebSocket listener)
        // Pass isReconnection to force recreation if needed
        // LẤY API TỪ CONNECTION MANAGER (không tạo mới!)
        // Truyền startListener=false cho các thao tác chỉ dùng API (không có listener WebSocket)
        // Truyền isReconnection để buộc tạo lại nếu cần
        const connection = await ConnectionManager.getOrCreateConnection(this.auth, false, undefined, isReconnection);

        this.api = connection.api;
        this.zaloId = this.api.getOwnId();


        Logger.log(`[${new Date().toISOString()}] [ZaloService] ✅ Initialized for ${this.zaloId} - Using shared API instance from ConnectionManager (API-only mode, no listener)`);
    }

    /**
     * Lấy Zalo ID của người dùng hiện tại
     */
    public getZaloId(): string | null {
        return this.zaloId;
    }


    /**
     * Gửi tin nhắn
     * @param message Nội dung tin nhắn (chuỗi hoặc đối tượng MessageContent)
     * @param threadId ID của cuộc trò chuyện
     * @param type Loại tin nhắn (tùy chọn)
     * @param typeMessage Loại tin nhắn đặc biệt (tùy chọn, ví dụ: 'file',...)
     * @param quote Tin nhắn trích dẫn (tùy chọn)
     * @param mentions Tag all hoặc tag member trong 1 group
     * @param styles định dạng văn bản
     * @returns Promise chứa kết quả gửi tin nhắn và tệp đính kèm
     */
    public async sendMessage(
        message: string | { msg: string, attachments?: any[], quote?: any, mentions?: any },
        threadId: string,
        type?: ThreadType | number,
        typeMessage = null,
        quote: any = null,
        mentions: any = null,
        styles: any = null
    ): Promise<{ message: SendMessageResult | null; attachment: SendMessageResult[] }> {
        let filesPath: string[] = [];
        try {
            if (!this.api) {
                throw new Error("API not initialized. Please ensure you've called initialize() first.");
            }

            type = convertThreadType(type);
            let messageContent: MessageContent;

            // ALWAYS use API from ConnectionManager for consistency
            // LUÔN sử dụng API từ ConnectionManager để đảm bảo tính nhất quán
            const zaloId = this.api.getOwnId();
            const connection = ConnectionManager.getConnection(zaloId);
            const apiSending = connection?.api || this.api;

            Logger.log(`[${new Date().toISOString()}] [ZaloService] 📤 Sending message using ${connection ? 'ConnectionManager API' : 'local API'}`);

            if (typeof message === 'string') {
                messageContent = {msg: message};
            } else {
                if (typeMessage === 'file' || (message && typeof message === 'object' && Array.isArray((message as any).attachments) && (message as any).attachments.length > 0)) {
                    if (!message?.attachments || message?.attachments.length === 0) {
                        throw new Error("No attachments provided for file type message");
                    }

                    filesPath = await this.handleDownloadAttachments(message.attachments);

                    // Đọc metadata nếu là ảnh
                    // nếu không phải ảnh thì gửi thẳng file url
                    message.attachments = filesPath.map(rawItem => {
                        if (typeof rawItem === 'object' && rawItem !== null) {
                            return rawItem;
                        }
                        const rawPath = String(rawItem);
                        const filePath = FileStorageService.resolveAbsolutePath(this.stripFileProtocol(rawPath));
                        if (filePath && fs.existsSync(filePath)) {
                            return filePath;
                        }
                        Logger.warn(`[ZaloService] File đính kèm không tồn tại trên đĩa: ${filePath || rawPath}`);
                        return null;
                    }).filter(Boolean);

                    if (message.attachments.length === 0) {
                        throw new Error(`Không tìm thấy tệp đính kèm nào trên máy chủ (Đường dẫn gốc: ${filesPath.join(', ')})`);
                    }
                    messageContent = message;
                } else {
                    messageContent = message;
                }
            }

            if (!messageContent.msg || !messageContent.msg.trim()) {
                messageContent.msg = ' ';
            }

            if (mentions) {
                messageContent.mentions = typeof mentions === 'string' ? JSON.parse(mentions) : mentions;
            }

            if (quote) {
                const quoteParsed = typeof quote === 'string' ? JSON.parse(quote) : quote;
                // Support both old format (with data wrapper) and new format (top level per SendMessageQuote type)
                const quoteData = quoteParsed.data || quoteParsed;

                // ThreadType.Group = 1, ThreadType.User = 0
                const isGroupThread = (type === ThreadType.Group || type === 1);

                let quoteContent = quoteData.content;
                let quoteMsgType: string = quoteData.msgType || 'webchat';

                // ── Chuẩn hoá msgType cho từng loại ────────────────────────────────
                // chat.recommended / chat.link = link được share (Facebook, web, ...)
                // Real Zalo dùng cliMsgType=1 (webchat) + qmsg=JSON string content
                // Nếu để nguyên 'chat.recommended' → getClientMessageType() = 38
                // → Zalo hiển thị "[danh thiếp] undefined" vì 38 = card type
                if (quoteMsgType === 'chat.recommended' || quoteMsgType === 'chat.link') {
                    quoteMsgType = 'webchat';
                }

                // ── Stringify content cho individual chat ───────────────────────────
                // zca-js:  qmsg = typeof content == "string" ? content : prepareQMSG(content)
                // prepareQMSG() trả về "" cho mọi loại trừ chat.todo
                // → Nếu content là object, qmsg="" → Zalo không hiển thị được quote
                //
                // Real Zalo (evidence từ webhook log):
                //   text  : cliMsgType=1,  qmsg="the text"
                //   link  : cliMsgType=1,  qmsg=JSON string of TAttachmentContent
                //   file  : cliMsgType=46, qmsg=JSON string of TAttachmentContent
                //
                // → Individual: stringify để qmsg nhận được JSON string ✓
                // → Group: giữ object để prepareQMSGAttach() build qmsgAttach đúng ✓
                if (!isGroupThread && typeof quoteContent === 'object' && quoteContent !== null) {
                    quoteContent = JSON.stringify(quoteContent);
                }

                messageContent.quote = {
                    content: quoteContent,
                    msgType: quoteMsgType,
                    propertyExt: quoteData.propertyExt ?? undefined,
                    uidFrom: quoteData.uidFrom,
                    msgId: String(quoteData.msgId),
                    cliMsgId: String(quoteData.cliMsgId),
                    ts: String(quoteData.ts),
                    ttl: quoteData.ttl ?? 0,
                };
            }

            if (styles) {
                messageContent.styles = typeof styles === 'string' ? JSON.parse(styles) : styles;
            }

            return await apiSending.sendMessage(messageContent, threadId, type);
        } catch (error: any) {
            throw new Error("Error sending message: " + error.message || error);
        } finally {
            // Xóa các file tạm thời sau khi gửi
            if (filesPath.length > 0) {
                await this.deleteTemporaryFiles(filesPath);
            }
        }
    }

    /**
     * Gửi sticker
     * @param stickerId ID của sticker cần gửi
     * @param threadId ID của người/nhóm cần gửi
     * @param type Loại thread: người dùng/nhóm (mặc định là người dùng)
     * @returns Promise chứa kết quả gửi sticker
     */
    public async sendSticker(stickerId: number, threadId: string, type: ThreadType = ThreadType.User): Promise<SendMessageResult> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            // Lấy chi tiết sticker
            const stickersDetail = await this.api.getStickersDetail(stickerId);
            if (stickersDetail.length === 0) {
                throw new Error("Sticker not found");
            }

            // Gửi sticker
            return await this.api.sendSticker(stickersDetail[0], threadId, type);
        } catch (error: any) {
            throw new Error("Error sending sticker: " + error.message || error);
        }
    }

    /**
     * Thêm biểu tượng cảm xúc (reaction) vào tin nhắn
     * @param reaction Biểu tượng cảm xúc cần thêm (thuộc enum Reactions)
     * @param message Đối tượng Message cần thêm biểu tượng cảm xúc
     * @returns Promise<AddReactionResponse>
     */
    public async addReaction(reaction: keyof typeof Reactions, message: string): Promise<AddReactionResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            const parsedMessage = JSON.parse(message);
            const msgId = String(parsedMessage.data?.msgId || parsedMessage.msgId || '0');
            // cliMsgId MUST be a parseable integer — fallback to msgId if missing/empty
            const rawCliMsgId = parsedMessage.data?.cliMsgId || parsedMessage.cliMsgId;
            const cliMsgId = (rawCliMsgId && String(rawCliMsgId) !== '' && String(rawCliMsgId) !== 'undefined')
                ? String(rawCliMsgId)
                : msgId;

            const dest = {
                data: { msgId, cliMsgId },
                threadId: String(parsedMessage.threadId || ''),
                type: parsedMessage.type ?? 0,
            };
            return await this.api.addReaction(Reactions[reaction], dest as any);
        } catch (error: any) {
            throw new Error("Error sending reaction: " + (error.message || error));
        }
    }

    private stripFileProtocol(url: string): string {
        if (!url) return '';
        if (url.startsWith('file://')) {
            const decoded = decodeURIComponent(url);
            if (decoded.startsWith('file:///')) {
                const pathPart = decoded.substring(8);
                if (/^[a-zA-Z]:/.test(pathPart)) {
                    return pathPart;
                }
                return '/' + pathPart;
            }
            return decoded.substring(7);
        }
        return url;
    }

    /**
     * Xử lý tải xuống các tệp đính kèm
     * @param attachments Mảng các URL của tệp đính kèm
     * @returns Promise<string[]> Mảng đường dẫn của các tệp đã tải xuống
     */
    private async handleDownloadAttachments(attachments: string[]): Promise<string[]> {
        const downloadedFiles: string[] = [];
        const imageDir = path.join(__dirname, '..', '..', 'data', 'image_message');

        // Đảm bảo thư mục tồn tại
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, {recursive: true});
        }

        for (let item of attachments as any[]) {
            if (typeof item === 'object' && item !== null) {
                if (item.data && Buffer.isBuffer(item.data)) {
                    downloadedFiles.push(item);
                    continue;
                }
                item = item.url || item.filePath || item.path || '';
            }
            if (typeof item !== 'string' || !item) continue;

            let fileUrl = this.stripFileProtocol(item);
            if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
                // Nếu là đường dẫn tệp cục bộ, sử dụng trực tiếp không tải xuống
                downloadedFiles.push(FileStorageService.resolveAbsolutePath(fileUrl));
                continue;
            }
            try {
                let filePath = '';
                const u = new URL(fileUrl);
                const timestamp = Date.now();
                const randomString = this.generateRandomString(5);
                const fileName = this.getFileNameFromUrl(fileUrl);

                //  TH gửi file, tạo hẳn folder tạm để giữ tên file nguyên bản
                if (u.searchParams.get("name")) {
                    // Tạo folder tạm
                    const folderPathCreated = path.join(imageDir, `${timestamp}_${randomString}`);
                    fs.mkdirSync(folderPathCreated, {recursive: true});
                    filePath = path.join(folderPathCreated, `${fileName}`);
                } else {
                    filePath = path.join(imageDir, `${timestamp}_${randomString}_${fileName}`);
                }

                const response = await axios({
                    method: 'GET',
                    url: fileUrl,
                    responseType: 'stream'
                });

                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                await new Promise<void>((resolve, reject) => {
                    writer.on('finish', () => resolve());
                    writer.on('error', reject);
                });

                downloadedFiles.push(filePath);
            } catch (error) {
                // console.error(`Error downloading file from ${fileUrl}:`, error);
            }
        }

        return downloadedFiles;
    }

    private getFileNameFromUrl(url: string): string | null {
        const u = new URL(url);
        return u.searchParams.get("name") || path.basename(u.pathname)
    }

    /**
     * Tạo chuỗi ngẫu nhiên
     * @param length Độ dài của chuỗi cần tạo
     * @returns string Chuỗi ngẫu nhiên
     */
    private generateRandomString(length: number): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    /**
     * Xóa các tệp tạm thời
     * @param filePaths Mảng đường dẫn của các tệp cần xóa
     * xóa cả folder tạm với trường hợp gửi file
     */
    private async deleteTemporaryFiles(filePaths: string[]): Promise<void> {
        // Không cho phép xóa file sau khi gửi theo yêu cầu người dùng
        return;
    }

    /**
     * Lấy danh sách sticker dựa trên từ khóa
     * @param keyword Từ khóa tìm kiếm sticker
     */
    public async getStickers(keyword: string): Promise<number[]> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getStickers(keyword);
        } catch (error: any) {
            throw new Error("Error getting stickers: " + error.message || error);
        }
    }

    /**
     * Lấy chi tiết của các sticker dựa trên ID
     * @param stickerIds ID của sticker hoặc mảng các ID sticker cần lấy chi tiết
     */
    public async getStickersDetail(stickerIds: number | number[]): Promise<StickerDetailResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getStickersDetail(stickerIds);
        } catch (error: any) {
            throw new Error("Error getting sticker details: " + error.message || error);
        }
    }

    /**
     * Lấy tất cả sticker trong một category/pack
     * @param cateId ID category sticker
     */
    public async getStickerCategoryDetail(cateId: number): Promise<StickerDetailResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getStickerCategoryDetail(cateId);
        } catch (error: any) {
            throw new Error("Error getting sticker category detail: " + error.message || error);
        }
    }

    /**
     * Thu hồi tin nhắn
     * @param message Đối tượng Message cần thu hồi
     * @returns Promise<UndoResponse>
     */
    public async undoMessage(message: any): Promise<UndoResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            const parsedMessage = JSON.parse(message);
            const undoOptions: UndoPayload = {
                msgId: parsedMessage.data.msgId,
                cliMsgId: parsedMessage.data.cliMsgId,
            };

            // Dùng convertThreadType để đảm bảo group dùng ThreadType.Group (1), user dùng ThreadType.User (0)
            const threadType = convertThreadType(parsedMessage.type);
            const uidFrom: string | undefined = parsedMessage.data?.uidFrom;

            Logger.log(`[ZaloService] undoMessage: msgId=${parsedMessage.data.msgId} threadId=${parsedMessage.threadId} type=${threadType}(raw=${parsedMessage.type})${uidFrom ? ` uidFrom=${uidFrom}` : ''}`);

            // Trưởng/phó nhóm thu hồi tin nhắn của thành viên — cần gửi uidFrom
            if (uidFrom && threadType === ThreadType.Group) {
                return await this.adminRecallGroupMessage(undoOptions, parsedMessage.threadId, uidFrom);
            }

            return await this.api.undo(undoOptions, parsedMessage.threadId, threadType);
        } catch (error: any) {
            throw new Error("Error undoing message: " + (error.message || error));
        }
    }

    /**
     * Admin (trưởng/phó nhóm) thu hồi tin nhắn của thành viên khác trong nhóm.
     * Dùng deleteMessage(onlyMe=false) → xóa cho tất cả thành viên.
     * Endpoint /api/group/undomsg chỉ hỗ trợ người gửi tự thu hồi, không hỗ trợ admin thu hồi của người khác.
     */
    private async adminRecallGroupMessage(
        payload: UndoPayload,
        threadId: string,
        uidFrom: string,
    ): Promise<any> {
        if (!this.api) throw new Error("API not initialized");

        Logger.log(`[ZaloService] adminRecallGroupMessage: msgId=${payload.msgId} threadId=${threadId} uidFrom=${uidFrom}`);

        // deleteMessage với onlyMe=false xóa tin nhắn cho tất cả thành viên nhóm
        // Điều kiện: isSelf=false (admin != sender) nên không bị reject bởi zca-js
        return await this.api.deleteMessage(
            {
                threadId,
                type: ThreadType.Group,
                data: {
                    msgId: String(payload.msgId),
                    cliMsgId: String(payload.cliMsgId),
                    uidFrom: String(uidFrom),
                },
            },
            false, // onlyMe = false → xóa cho tất cả
        );
    }

    /**
     * Xóa một hoặc nhiều thành viên khỏi nhóm
     * @param memberId ID của thành viên hoặc mảng các ID thành viên cần xóa khỏi nhóm
     * @param groupId ID của nhóm
     */
    public async removeUserFromGroup(memberId: string | string[], groupId: string): Promise<RemoveUserFromGroupResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const cleanGroupId = groupId.startsWith('g') ? groupId.slice(1) : groupId;

        try {
            const res = await this.api.removeUserFromGroup(memberId, cleanGroupId);
            if (res && typeof res === 'object' && (res as any).error) {
                const errCode = (res as any).error;
                const errMsg = (res as any).message || (res as any).error_message || `Lỗi ${errCode}`;
                Logger.warn(`[ZaloService] removeUserFromGroup returned error ${errCode}: ${errMsg}`);
                throw new Error(errMsg);
            }
            return res;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Thay đổi ảnh đại diện của nhóm
     * @param avatarPath Đường dẫn đến file ảnh đại diện mới
     * @param groupId ID của nhóm cần thay đổi ảnh đại diện
     */
    public async changeGroupAvatar(avatarPath: string, groupId: string): Promise<ChangeGroupAvatarResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.changeGroupAvatar(avatarPath, groupId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Thay đổi tên nhóm
     * @param name Tên mới của nhóm
     * @param groupId ID của nhóm cần đổi tên
     */
    public async changeGroupName(name: string, groupId: string): Promise<ChangeGroupNameResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.changeGroupName(name, groupId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Gửi yêu cầu kết bạn đến một người dùng Zalo
     * @param msg Nội dung tin nhắn kèm theo yêu cầu kết bạn
     * @param userId ID của người dùng mà bạn muốn gửi yêu cầu kết bạn
     */
    public async sendFriendRequest(msg: string, userId: string): Promise<SendFriendRequestResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.sendFriendRequest(msg, userId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Tìm kiếm người dùng Zalo dựa trên số điện thoại
     * @param phoneNumber Số điện thoại của người dùng cần tìm kiếm
     */
    public async findUser(phoneNumber: string): Promise<FindUserResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.findUser(phoneNumber);
        } catch (error) {
            throw error;
        }
    }


    /**
     * Lấy danh sách tất cả bạn bè của người dùng hiện tại
     */
    public async getAllFriends(): Promise<GetAllFriendsResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getAllFriends();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Lấy danh sách tất cả các nhóm mà người dùng hiện tại tham gia
     */
    public async getAllGroups(): Promise<GetAllGroupsResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getAllGroups();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Xóa tin nhắn
     * @param message Đối tượng Message cần xóa
     * @param onlyMe Chỉ xóa tin nhắn cho bản thân (mặc định là true)
     */
    public async deleteMessage(message: any, onlyMe: boolean = true): Promise<DeleteMessageResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const parsedMessage = JSON.parse(message);
        let options: DeleteMessageDestination = {
            data: {
                cliMsgId: parsedMessage.data.cliMsgId,
                msgId: parsedMessage.data.msgId,
                uidFrom: parsedMessage.data.uidFrom,
            },
            threadId: parsedMessage.threadId,
            type: parsedMessage.type
        }

        // if (parsedMessage.type === ThreadType.User) {
        //     message = new UserMessage(this.api.getOwnId(), parsedMessage.data);
        // } else if (parsedMessage.type === ThreadType.Group) {
        //     message = new GroupMessage(this.api.getOwnId(), parsedMessage.data);
        // }

        try {
            return await this.api.deleteMessage(options, onlyMe);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Xóa đoạn chat (ẩn hội thoại phía server)
     * @param lastMessage Thông tin tin nhắn cuối cùng trong hội thoại
     * @param threadId ID của hội thoại
     * @param type Loại hội thoại (User/Group)
     */
    public async deleteChat(lastMessage: DeleteChatLastMessage, threadId: string, type: ThreadType = ThreadType.User): Promise<DeleteChatResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await this.api.deleteChat(lastMessage, threadId, type);
        } catch (error: any) {
            throw new Error("Error deleting chat: " + (error.message || error));
        }
    }

    /**
     * Tạo một nhóm mới trên Zalo
     * @param options Các tùy chọn để tạo nhóm, bao gồm thông tin như tên nhóm, danh sách thành viên, v.v.
     */
    public async createGroup(options: any): Promise<CreateGroupResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        let filesPath: string[] = [];
        if (options.members && !Array.isArray(options.members)) {
            options.members = options.members.split(",");
        }

        const avatarUrl = options.avatarSource || '';
        if (avatarUrl) {
            filesPath = await this.handleDownloadAttachments([avatarUrl]);
            if (filesPath.length) {
                options.avatarSource = filesPath[0];
            }
        }

        try {
            return await this.api.createGroup(options);
        } catch (error) {
            throw error;
        } finally {
            // Xóa các file tạm thời sau khi gửi
            if (filesPath.length > 0) {
                await this.deleteTemporaryFiles(filesPath);
            }
        }
    }

    public async disperseGroup(groupId: string): Promise<DisperseGroupResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.disperseGroup(groupId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Chặn một người dùng Zalo
     * @param userId ID của người dùng cần chặn
     */
    public async blockUser(userId: string): Promise<BlockUserResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await this.api.blockUser(userId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Lấy danh sách nhóm chung với một người dùng
     * @param userId ID của người dùng cần xem nhóm chung
     */
    public async getRelatedFriendGroup(userId: string): Promise<any> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await (this.api as any).getRelatedFriendGroup(userId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Thêm một hoặc nhiều người dùng vào nhóm
     * @param memberId ID của thành viên hoặc mảng các ID thành viên cần thêm vào nhóm
     * @param groupId ID của nhóm
     */
    public async addUserToGroup(memberId: string | string[], groupId: string): Promise<AddUserToGroupResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const cleanGroupId = groupId.startsWith('g') ? groupId.slice(1) : groupId;

        try {
            // Thử thêm trực tiếp trước bằng API mặc định
            const res = await this.api.addUserToGroup(memberId, cleanGroupId);
            if (res && typeof res === 'object' && (res as any).error) {
                const errCode = (res as any).error;
                const errMsg = (res as any).message || (res as any).error_message || `Lỗi ${errCode}`;
                throw new Error(errMsg);
            }
            return res;
        } catch (error: any) {
            Logger.warn(`[ZaloService] Direct addUserToGroup failed: ${error.message}. Trying inviteUserToGroups fallback...`);
            try {
                // Nếu lỗi, thử dùng API mời vào nhóm (inviteUserToGroups)
                if (typeof memberId === 'string') {
                    const res = await (this.api as any).inviteUserToGroups(memberId, [cleanGroupId]);
                    if (res && typeof res === 'object' && (res as any).error) {
                        throw new Error((res as any).message || (res as any).error_message || `Lỗi ${(res as any).error}`);
                    }
                    return { success: true, ...res } as any;
                } else if (Array.isArray(memberId)) {
                    const results = [];
                    for (const mId of memberId) {
                        const res = await (this.api as any).inviteUserToGroups(mId, [cleanGroupId]);
                        results.push(res);
                    }
                    return { success: true, results } as any;
                }
            } catch (fallbackError: any) {
                Logger.error(`[ZaloService] inviteUserToGroups fallback also failed: ${fallbackError.message}`);
            }
            // Nếu cả hai đều lỗi, ném ra lỗi của API gốc để giao diện hiển thị đúng lý do
            throw error;
        }
    }

    /**
     * Chấp nhận lời mời kết bạn từ một người dùng Zalo
     * @param userId ID của người dùng đã gửi lời mời kết bạn
     */
    public async acceptFriendRequest(userId: string): Promise<AcceptFriendRequestResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.acceptFriendRequest(userId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Bỏ chặn một người dùng Zalo
     * @param userId ID của người dùng cần bỏ chặn
     */
    public async unblockUser(userId: string): Promise<UnBlockUserResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.unblockUser(userId);
        } catch (error) {
            throw error;
        }
    }


    /**
     * Lấy context của phiên đăng nhập hiện tại (uid, phone, loginInfo, ...)
     */
    public getContext(): any {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        return this.api.getContext();
    }

    /**
     * Lấy thông tin của người dùng Zalo
     * @param userId ID của người dùng cần lấy thông tin
     */
    public async getUserInfo(userId: string | string[]): Promise<UserInfoResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getUserInfo(userId);
        } catch (error: any) {
            throw new Error(error.message || error);
        }
    }

    public async getAliasList(count: number = 100, page: number = 1): Promise<GetAliasListResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getAliasList(count, page);
        } catch (error: any) {
            throw new Error(error.message || error);
        }
    }


    /**
     * Gửi nhiều danh thiếp (cards) đến một hoặc nhiều người dùng hoặc nhóm
     * @param cardsInfo Mảng chứa thông tin về các danh thiếp cần gửi
     * @returns Promise<SendCardResponse[]>
     */
    public async sendCard(cardsInfo: Array<{
        options: SendCardOptions,
        threadId: string,
        type?: ThreadType,
        quote?: any
    }>): Promise<SendCardResponse[]> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            const sendPromises = cardsInfo.map(({options, threadId, type = ThreadType.User, quote}) => {
                if (!this.api) {
                    throw new Error("API became undefined during execution.");
                }
                const quoteParsed = quote ? (typeof quote === 'string' ? JSON.parse(quote) : quote) : null;
                const payload = quoteParsed ? { ...(options as any), quote: quoteParsed } : options;
                return (this.api as any).sendCard(payload, threadId, type);
            });

            return await Promise.all(sendPromises);
        } catch (error: any) {
            throw new Error("Error sending multiple cards: " + (error.message || error));
        }
    }

    /**
     * Lấy thông tin chi tiết của một nhóm hoặc nhiều nhóm
     * */
    public async getGroupInfo(groupId: string | string[]): Promise<GroupInfoResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getGroupInfo(groupId);
        } catch (error: any) {
            throw new Error(`Error getting group info: ${error.message || error}`);
        }
    }

    private getFfmpegBin(): string {
        try {
            let ffmpegStatic = require('ffmpeg-static') as string;
            if (ffmpegStatic && ffmpegStatic.includes('app.asar') && !ffmpegStatic.includes('app.asar.unpacked')) {
                ffmpegStatic = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
            }
            if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
                return ffmpegStatic;
            }
        } catch {}
        return 'ffmpeg';
    }

    private async extractVideoMetaAndThumb(videoPath: string): Promise<{ duration?: number; width?: number; height?: number; thumbPath?: string }> {
        const ffmpegBin = this.getFfmpegBin();
        const os = require('os');
        const tmpDir = path.join(os.tmpdir(), 'zagi-videometa');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const thumbPath = path.join(tmpDir, `thumb_${Date.now()}.jpg`);

        let duration = 0;
        let width = 0;
        let height = 0;

        try {
            const probe = spawnSync(ffmpegBin, ['-i', videoPath, '-hide_banner'], {
                timeout: 10000,
                encoding: 'utf8',
            });
            const stderr = (probe.stderr || '') + (probe.stdout || '');
            const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
            if (durMatch) {
                duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
            }
            const dimMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
            if (dimMatch) {
                width = parseInt(dimMatch[1]);
                height = parseInt(dimMatch[2]);
            }
        } catch (e: any) {
            Logger.warn(`[ZaloService] Video probe failed: ${e.message}`);
        }

        try {
            const seekSec = duration > 2 ? 1 : 0;
            spawnSync(ffmpegBin, [
                '-ss', seekSec.toString(),
                '-i', videoPath,
                '-vframes', '1',
                '-q:v', '2',
                thumbPath,
                '-y'
            ], { timeout: 10000 });
            if (fs.existsSync(thumbPath)) {
                return { duration, width, height, thumbPath };
            }
        } catch (e: any) {
            Logger.warn(`[ZaloService] Thumb extraction failed: ${e.message}`);
        }

        return { duration, width, height };
    }

    public async sendVideo(videoOptions: SendVideoOptions, threadId: string, type?: ThreadType, quote: any = null): Promise<SendVideoResponse> {
        let filesPath: string[] = [];
        try {
            if (!this.api) {
                throw new Error("API not initialized. Please ensure you've called initialize() first.");
            }

            type = convertThreadType(type);
            const quoteParsed = quote ? (typeof quote === 'string' ? JSON.parse(quote) : quote) : null;

            let videoUrl = videoOptions.videoUrl;
            if (videoUrl) {
                videoUrl = this.stripFileProtocol(videoUrl);
            }
            let thumbnailUrl = videoOptions.thumbnailUrl;
            let duration = videoOptions.duration;
            let width = videoOptions.width;
            let height = videoOptions.height;

            if (videoUrl && !videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
                const resolvedVideoPath = FileStorageService.resolveAbsolutePath(videoUrl);
                if (fs.existsSync(resolvedVideoPath)) {
                    // Trích xuất metadata và thumbnail tự động
                    const meta = await this.extractVideoMetaAndThumb(resolvedVideoPath);
                    if (meta.duration) duration = Math.round(meta.duration);
                    if (meta.width) width = meta.width;
                    if (meta.height) height = meta.height;

                    if (meta.thumbPath && fs.existsSync(meta.thumbPath)) {
                        filesPath.push(meta.thumbPath);
                        // Upload ảnh bìa lên Zalo
                        const thumbResp = await this.uploadVideoThumb(meta.thumbPath, threadId, type);
                        const uploadedThumbUrl = thumbResp?.normalUrl || thumbResp?.hdUrl || thumbResp?.url || thumbResp?.thumbUrl || thumbResp?.fileUrl || thumbResp?.href;
                        if (uploadedThumbUrl) {
                            thumbnailUrl = uploadedThumbUrl;
                        }
                    }

                    // Upload file video lên Zalo
                    const videoResp = await this.uploadVideoFile(resolvedVideoPath, threadId, type);
                    const uploadedUrl = videoResp?.fileUrl || videoResp?.normalUrl || videoResp?.hdUrl || videoResp?.url;
                    if (uploadedUrl) {
                        videoUrl = uploadedUrl;
                    }
                }
            }

            const payload: any = {
                videoUrl,
                thumbnailUrl: thumbnailUrl || '',
                duration: duration || 10,
                width: width || 480,
                height: height || 480,
                msg: videoOptions.msg || '',
                ttl: videoOptions.ttl || 0
            };

            if (quoteParsed) {
                payload.quote = quoteParsed;
            }

            return await (this.api as any).sendVideo(payload, threadId, type);
        } catch (error: any) {
            throw new Error("Error sending video: " + error.message || error);
        } finally {
            // Xóa các file tạm thời sau khi gửi
            if (filesPath.length > 0) {
                await this.deleteTemporaryFiles(filesPath);
            }
        }
    }

    public async keepAlive(): Promise<KeepAliveResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.keepAlive();
        } catch (error: any) {
            throw new Error("Error keeping alive: " + error.message || error);
        }
    }

    public async leaveGroup(groupId: string, silent: boolean = false): Promise<LeaveGroupResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.leaveGroup(groupId, silent);
        } catch (error) {
            throw error;
        }
    }

    public async forwardMessage(payload: ForwardMessagePayload, threadIds: string[], type?: ThreadType): Promise<ForwardMessageResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        type = convertThreadType(type);
        try {
            return await this.api.forwardMessage(payload, threadIds, type);
        } catch (error) {
            throw error;
        }
    }

    public async sendLink(link: string, threadId: string, type?: ThreadType, quote: any = null, message?: string): Promise<SendLinkResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const quoteParsed = quote ? (typeof quote === 'string' ? JSON.parse(quote) : quote) : null;
        let payload: SendLinkOptions & { quote?: any } = {
            link
        };
        if (message && message.trim()) payload.msg = message.trim();
        if (quoteParsed) payload.quote = quoteParsed;

        type = convertThreadType(type);
        try {
            return await this.api.sendLink(payload, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    public async pinConversation(pinned: boolean, threadId: string, type?: ThreadType): Promise<SetPinnedConversationsResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.setPinnedConversations(pinned, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Tắt/bật âm cuộc trò chuyện qua Zalo API
     * @param threadId ID hội thoại
     * @param threadType 0=User (mặc định), 1=Group
     * @param duration MuteDuration hoặc giây; undefined = unmute
     * @param action MuteAction.MUTE (1) hoặc MuteAction.UNMUTE (3)
     */
    public async setMute(
        threadId: string,
        threadType: number,
        duration?: MuteDuration | number,
        action: MuteAction = MuteAction.MUTE,
    ): Promise<any> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        const type = threadType === 1 ? ThreadType.Group : ThreadType.User;
        try {
            return await (this.api as any).setMute(
                { duration, action },
                threadId,
                type,
            );
        } catch (error) {
            throw error;
        }
    }

    public async getGroupLinkDetail(groupId: string): Promise<GetGroupLinkDetailResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getGroupLinkDetail(groupId);
        } catch (error) {
            throw error;
        }
    }

    public async getGroupLinkInfo(link: string, memberPage: number = 1): Promise<any> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await (this.api as any).getGroupLinkInfo({ link, memberPage });
        } catch (error) {
            throw error;
        }
    }

    public async joinGroupLink(link: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized. Please ensure you've called initialize() first.");
        try {
            return await (this.api as any).joinGroupLink(link);
        } catch (error) {
            throw error;
        }
    }

    public async enableGroupLink(groupId: string): Promise<EnableGroupLinkResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.enableGroupLink(groupId);
        } catch (error) {
            throw error;
        }
    }

    public async disableGroupLink(groupId: string): Promise<DisableGroupLinkResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.disableGroupLink(groupId);
        } catch (error) {
            throw error;
        }
    }

    public async updateGroupSettings(options: string, groupId: string): Promise<UpdateGroupSettingsResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const parsedOptions: UpdateGroupSettingsOptions = JSON.parse(options);
        try {
            return await this.api.updateGroupSettings(parsedOptions, groupId);
        } catch (error) {
            throw error;
        }
    }

    public async rejectFriendRequest(friendId: string): Promise<RejectFriendRequestResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.rejectFriendRequest(friendId);
        } catch (error) {
            throw error;
        }
    }

    public async getFriendRecommendations(): Promise<any> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await (this.api as any).getFriendRecommendations();
        } catch (error) {
            throw error;
        }
    }

    public async getArchivedChatList(): Promise<GetArchivedChatListResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getArchivedChatList();
        } catch (error) {
            throw error;
        }
    }

    public async setHiddenConversations(hidden: any, threadId: string | string[], type?: ThreadType): Promise<SetHiddenConversationsResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        type = convertThreadType(type);
        try {
            return await this.api.setHiddenConversations(hidden == 1, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    public async getFriendRequestStatus(friendId: string): Promise<GetFriendRequestStatusResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getFriendRequestStatus(friendId);
        } catch (error) {
            throw error;
        }
    }

    public async getPinConversations(): Promise<GetPinConversationsResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await this.api.getPinConversations();
        } catch (error) {
            throw error;
        }
    }

    public async getLabels(): Promise<any> {
        if (!this.api) throw new Error("API not initialized.");
        try {
            return await (this.api as any).getLabels();
        } catch (error: any) {
            throw new Error("Error getting labels: " + error.message);
        }
    }

    public async updateLabels(labelData: any[], version: number): Promise<any> {
        if (!this.api) throw new Error("API not initialized.");
        try {
            return await (this.api as any).updateLabels({ labelData, version });
        } catch (error: any) {
            throw new Error("Error updating labels: " + error.message);
        }
    }

    public async changeFriendAlias(alias: string, friendId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized.");
        try {
            return await (this.api as any).changeFriendAlias(alias, friendId);
        } catch (error: any) {
            throw new Error("Error changing alias: " + error.message);
        }
    }

    public async getReminder(reminderId: string): Promise<GetReminderResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await this.api.getReminder(reminderId);
        } catch (error) {
            throw error;
        }
    }

    public async sendVoice(voiceOptions: SendVoiceOptions, threadId: string, type?: ThreadType, quote: any = null): Promise<SendVoiceResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const quoteParsed = quote ? (typeof quote === 'string' ? JSON.parse(quote) : quote) : null;
        type = convertThreadType(type);
        try {
            let voiceUrl = voiceOptions.voiceUrl;
            if (voiceUrl) {
                voiceUrl = this.stripFileProtocol(voiceUrl);
            }
            if (voiceUrl && !voiceUrl.startsWith('http://') && !voiceUrl.startsWith('https://')) {
                const resolvedVoicePath = FileStorageService.resolveAbsolutePath(voiceUrl);
                if (fs.existsSync(resolvedVoicePath)) {
                    // Upload voice file to Zalo
                    const voiceResp = await this.uploadVoiceFile(resolvedVoicePath, threadId, type);
                    if (voiceResp && voiceResp.fileUrl) {
                        voiceUrl = voiceResp.fileUrl;
                    }
                }
            }

            const payload: any = {
                voiceUrl,
                ttl: voiceOptions.ttl || 0
            };

            if (quoteParsed) {
                payload.quote = quoteParsed;
            }

            return await (this.api as any).sendVoice(payload, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Upload file âm thanh lên server Zalo
     * Trả về fileUrl để dùng trong sendVoice.voiceUrl
     */
    public async uploadVoiceFile(voicePath: string, threadId: string, type?: ThreadType): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const threadType = convertThreadType(type);
            let targetPath = voicePath;
            const ext = path.extname(voicePath).toLowerCase();
            const isTempConversion = ext !== '.m4a' && ext !== '.mp3';

            if (isTempConversion) {
                const m4aPath = voicePath.substring(0, voicePath.length - ext.length) + '.m4a';
                const ffmpegBin = this.getFfmpegBin();
                Logger.info(`[ZaloService] Converting voice file ${voicePath} to ${m4aPath} using ${ffmpegBin}`);
                const result = spawnSync(ffmpegBin, ['-y', '-i', voicePath, '-c:a', 'aac', '-b:a', '128k', m4aPath], { stdio: 'ignore' });
                if (result.status === 0 && fs.existsSync(m4aPath)) {
                    targetPath = m4aPath;
                } else {
                    Logger.error(`[ZaloService] ffmpeg conversion failed, status: ${result.status}`);
                }
            }

            const result = await this.api.uploadAttachment([targetPath], threadId, threadType);
            const resp = Array.isArray(result) ? result[0] : result;
            Logger.info(`[ZaloService] uploadVoiceFile raw result: ${JSON.stringify(resp)}`);

            // Clean up the converted file if we created one
            if (isTempConversion && targetPath !== voicePath) {
                try {
                    fs.unlinkSync(targetPath);
                } catch (cleanupErr: any) {
                    Logger.warn(`[ZaloService] Failed to clean up converted voice file: ${cleanupErr.message}`);
                }
            }

            return resp;
        } catch (error: any) {
            throw new Error('uploadVoiceFile error: ' + error.message);
        }
    }

    public async createReminder(reminderOptions: CreateReminderOptions, threadId: string, type?: ThreadType): Promise<CreateReminderResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        type = convertThreadType(type);
        try {
            return await this.api.createReminder(reminderOptions, threadId, type);
        }
        catch (error) {
            throw error;
        }
    }

    public async editReminder(reminderOptions: EditReminderOptions, threadId: string, type?: ThreadType): Promise<EditReminderResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        type = convertThreadType(type);
        try {
            return await this.api.editReminder(reminderOptions, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    public async removeReminder(reminderId: string, threadId: string, type?: ThreadType): Promise<RemoveReminderResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        type = convertThreadType(type);
        try {
            return await this.api.removeReminder(reminderId, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    public async getListReminder(options: ListReminderOptions, threadId: string, type?: ThreadType): Promise<GetListReminderResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        type = convertThreadType(type);
        try {
            return await this.api.getListReminder(options, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    public async getReminderResponses(reminderId: string): Promise<GetReminderResponsesResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getReminderResponses(reminderId);
        } catch (error) {
            throw error;
        }
    }

    public async removeFriendAlias(friendId: string): Promise<RemoveFriendAliasResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.removeFriendAlias(friendId);
        } catch (error) {
            throw error;
        }
    }

    public async removeFriend(friendId: string): Promise<{ success: boolean }> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            await this.api.removeFriend(friendId);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    public async getPendingGroupMembers(groupId: string): Promise<GetPendingGroupMembersResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getPendingGroupMembers(groupId);
        } catch (error) {
            throw error;
        }
    }

    public async getSentFriendRequest(): Promise<GetSentFriendRequestResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await this.api.getSentFriendRequest();
        } catch (error) {
            throw error;
        }
    }

    public async undoFriendRequest(friendId: string): Promise<UndoFriendRequestResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            return await (this.api as any).undoFriendRequest(friendId);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Lấy URL proxy đang được sử dụng cho kết nối Zalo hiện tại
     * @returns The proxy URL or null if not assigned
     */
    public getProxyUrl(): string | null {
        return null; // No proxy in desktop mode
    }

    /**
     * Tải URL về tệp đĩa tạm trong media/temp_forward/
     */
    private async downloadUrlToTempFile(url: string): Promise<string> {
        try {
            const tempDir = path.join(FileStorageService.getBaseDir(), 'temp_forward');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const cleanUrl = url.split('?')[0] || url;
            let ext = path.extname(cleanUrl);
            if (!ext || ext.length > 5) ext = '.jpg';
            const tempPath = path.join(tempDir, `fw_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`);
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://chat.zalo.me/',
                }
            });
            fs.writeFileSync(tempPath, Buffer.from(response.data));
            Logger.info(`[ZaloService] Downloaded image URL to temp file: ${tempPath} (${response.data.byteLength} bytes)`);
            return tempPath;
        } catch (err: any) {
            Logger.error(`[ZaloService] downloadUrlToTempFile error for ${url}: ${err.message}`);
            throw new Error(`Cannot download image from URL: ${err.message}`);
        }
    }

    /**
     * Quy đổi và kiểm tra đường dẫn ảnh địa phương.
     * Tự động giải quyết đường dẫn tương đối (media/...) hoặc tải URL CDN về tệp đĩa tạm.
     */
    private async ensureLocalImagePath(rawPath: string): Promise<{ resolvedPath: string; isTemp: boolean }> {
        if (!rawPath) throw new Error("Image path is empty");
        const cleanPath = this.stripFileProtocol(rawPath).trim();

        // Check 1: If path contains an HTTP/HTTPS URL
        const urlMatch = cleanPath.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
            const tempPath = await this.downloadUrlToTempFile(urlMatch[0]);
            return { resolvedPath: tempPath, isTemp: true };
        }

        // Check 2: Try resolving relative path (media/zaloId/...) or remapped absolute path
        const resolved = FileStorageService.resolveAbsolutePath(cleanPath);
        if (resolved && fs.existsSync(resolved)) {
            return { resolvedPath: resolved, isTemp: false };
        }

        // Check 3: Check cleanPath directly on disk
        if (fs.existsSync(cleanPath)) {
            return { resolvedPath: cleanPath, isTemp: false };
        }

        throw new Error(`File does not exist on disk: ${cleanPath} (resolved: ${resolved})`);
    }

    /**
     * Gửi ảnh từ local file path hoặc URL HTTP/HTTPS
     */
    public async sendImage(filePath: string, threadId: string, type: ThreadType = ThreadType.User, caption?: string, quote: any = null): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        let tempCreated = false;
        let resolvedPath = filePath;
        try {
            const target = await this.ensureLocalImagePath(filePath);
            resolvedPath = target.resolvedPath;
            tempCreated = target.isTemp;

            const buffer = fs.readFileSync(resolvedPath);
            const baseName = path.basename(resolvedPath);
            let width = 0, height = 0;
            try { const dim = imageSize(buffer); width = dim.width ?? 0; height = dim.height ?? 0; } catch {}
            const attachment: any = {
                data: buffer,
                filename: baseName,
                metadata: { totalSize: buffer.length, width, height },
            };
            const content: MessageContent = { msg: caption || '', attachments: [attachment] };
            const result = await this.sendMessage(content as any, threadId, type, null, quote);
            return result;
        } catch (error: any) {
            throw new Error('sendImage error: ' + error.message);
        } finally {
            if (tempCreated && resolvedPath && fs.existsSync(resolvedPath)) {
                try { fs.unlinkSync(resolvedPath); } catch {}
            }
        }
    }

    /**
     * Upload thumbnail ảnh đại diện của video lên server Zalo
     * Trả về URL để dùng trong sendVideo.thumbnailUrl
     */
    public async uploadVideoThumb(thumbPath: string, threadId: string, type?: ThreadType): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const threadType = convertThreadType(type);
            const result = await this.api.uploadAttachment([thumbPath], threadId, threadType);
            const resp = Array.isArray(result) ? result[0] : result;
            Logger.info(`[ZaloService] uploadVideoThumb raw result: ${JSON.stringify(resp)}`);
            return resp;
        } catch (error: any) {
            throw new Error('uploadVideoThumb error: ' + error.message);
        }
    }

    /**
     * Upload file video lên server Zalo
     * Trả về fileUrl để dùng trong sendVideo.videoUrl
     */
    public async uploadVideoFile(videoPath: string, threadId: string, type?: ThreadType): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const threadType = convertThreadType(type);
            const result = await this.api.uploadAttachment([videoPath], threadId, threadType);
            const resp = Array.isArray(result) ? result[0] : result;
            Logger.info(`[ZaloService] uploadVideoFile raw result: ${JSON.stringify(resp)}`);
            return resp;
        } catch (error: any) {
            throw new Error('uploadVideoFile error: ' + error.message);
        }
    }

    /**
     * Gửi nhiều ảnh trong một tin nhắn (dùng groupLayoutId của zca-js)
     */
    public async sendImages(filePaths: string[], threadId: string, type: ThreadType = ThreadType.User, quote: any = null): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        if (!filePaths.length) return [];
        // Nếu chỉ 1 ảnh, dùng sendImage thông thường
        if (filePaths.length === 1) return this.sendImage(filePaths[0], threadId, type, undefined, quote);
        
        const tempPathsToClean: string[] = [];
        try {
            const resolvedTargets = await Promise.all(
                filePaths.map(p => this.ensureLocalImagePath(p))
            );

            const attachments = resolvedTargets.map(({ resolvedPath, isTemp }) => {
                if (isTemp) tempPathsToClean.push(resolvedPath);
                const buffer = fs.readFileSync(resolvedPath);
                const baseName = path.basename(resolvedPath);
                // zca-js requires filename to contain an extension (`${string}.${string}`)
                const ext = path.extname(baseName) || '.jpg';
                const safeFilename = (path.extname(baseName) ? baseName : `${baseName}${ext}`) as `${string}.${string}`;
                let width = 0, height = 0;
                try { const dim = imageSize(buffer); width = dim.width ?? 0; height = dim.height ?? 0; } catch {}
                return {
                    data: buffer,
                    filename: safeFilename,
                    metadata: { totalSize: buffer.length, width, height },
                };
            });
            const content: MessageContent = { msg: '', attachments };
            const result = await this.sendMessage(content as any, threadId, type, null, quote);
            return result;
        } catch (error: any) {
            throw new Error('sendImages error: ' + error.message);
        } finally {
            for (const tPath of tempPathsToClean) {
                if (fs.existsSync(tPath)) {
                    try { fs.unlinkSync(tPath); } catch {}
                }
            }
        }
    }

    /**
     * Gửi file từ local path
     */
    public async sendFile(filePath: string, threadId: string, type: ThreadType = ThreadType.User, quote: any = null): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const content: MessageContent = { msg: '', attachments: [filePath] };
            return await this.sendMessage(content as any, threadId, type, 'file', quote);
        } catch (error: any) {
            throw new Error('sendFile error: ' + error.message);
        }
    }

    /**
     * Lấy lịch sử tin nhắn (group) hoặc trả về rỗng (user - không hỗ trợ trong API)
     */
    public async getMessageHistory(threadId: string, type: number, lastMsgId?: string, count?: number): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        if (type === 1) {
            try {
                const cleanGroupId = threadId.startsWith('g') ? threadId : `g${threadId}`;
                return await this.api.getGroupChatHistory(cleanGroupId, count ?? 500);
            } catch (error: any) {
                // zca-js có thể throw SyntaxError khi response JSON bị truncated
                if (error instanceof SyntaxError) {
                    throw new Error(`Không thể tải tin nhắn nhóm (lỗi phản hồi từ Zalo): ${error.message}`);
                }
                throw error;
            }
        }
        return { data: [] };
    }

    /**
     * Pin/unpin conversation
     * conversations can be string[], string, or [{threadId, type}] objects
     */
    public async setPinConversations(
        conversations: Array<{ threadId: string; type: number }> | string | string[],
        isPin: boolean
    ): Promise<SetPinnedConversationsResponse> {
        if (!this.api) throw new Error("API not initialized");
        let threadIds: string[];
        let threadType: any = 0; // ThreadType.User default
        if (Array.isArray(conversations) && conversations.length > 0 && typeof conversations[0] === 'object' && conversations[0] !== null) {
            const convObjs = conversations as Array<{ threadId: string; type: number }>;
            threadIds = convObjs.map(c => String(c.threadId));
            threadType = convObjs[0].type ?? 0;
        } else if (Array.isArray(conversations)) {
            threadIds = (conversations as string[]).map(String);
        } else {
            threadIds = [String(conversations)];
        }
        return await this.api.setPinnedConversations(isPin, threadIds, threadType);
    }

    public async getGroupChatHistory(groupId: string, count: number = 500): Promise<GetGroupChatHistoryResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        try {
            const cleanGroupId = groupId.startsWith('g') ? groupId : `g${groupId}`;
            return await this.api.getGroupChatHistory(cleanGroupId, count);
        } catch (error: any) {
            if (error instanceof SyntaxError) {
                throw new Error(`Không thể tải tin nhắn nhóm (lỗi phản hồi từ Zalo): ${error.message}`);
            }
            throw error;
        }
    }

    public async updateArchivedChatList(isArchived: any, conversationsData: string): Promise<UpdateArchivedChatListResponse> {
         if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        let dataUpdate: UpdateArchivedChatListTarget[] = [],
            conversationArray = JSON.parse(conversationsData);

        conversationArray.forEach((item: any) => {
            dataUpdate.push({
                id: item.id,
                type: item.thread == 1 ? ThreadType.Group : ThreadType.User,
            });
        });

        try {
            return await this.api.updateArchivedChatList(isArchived == 1, dataUpdate);
        } catch (error) {
            throw error;
        }
    }

    public async sendBankCard(payload: string | Object, threadId: string, type: any = ThreadType.User): Promise<SendBankCardResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }

        const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload,
            binBank = parsedPayload.binBank || '',
            numAccBank = parsedPayload.numAccBank || '',
            nameAccBank = parsedPayload.nameAccBank || ''
        if (!binBank || !numAccBank) {
            throw new Error("Invalid payload: empty array");
        }

        const finalPayload: any = {
            binBank: parseInt(binBank),
            numAccBank,
            nameAccBank,
            amount: parsedPayload.amount ? Number(parsedPayload.amount) : undefined,
            description: parsedPayload.description || undefined,
        }

        type = convertThreadType(type);

        try {
            // Thử tự đóng gói params để truyền đầy đủ amount và description lên Zalo server
            const listener = (this.api as any).listener;
            const ctx = listener ? listener.ctx : null;
            if (ctx && ctx.utils) {
                const utils = ctx.utils;
                const serviceURL = utils.makeURL(`${this.api.zpwServiceMap.zimsg[0]}/api/transfer/card`);
                const params = {
                    binBank: finalPayload.binBank,
                    numAccBank: finalPayload.numAccBank,
                    nameAccBank: finalPayload.nameAccBank?.toUpperCase() || "---",
                    amount: finalPayload.amount,
                    description: finalPayload.description,
                    desc: finalPayload.description, // Gửi cả desc và description để đảm bảo Zalo App nhận dạng đúng
                    cliMsgId: Date.now().toString(),
                    tsMsg: Date.now(),
                    destUid: threadId,
                    destType: type === ThreadType.Group ? 1 : 0,
                };
                const encryptedParams = utils.encodeAES(JSON.stringify(params));
                if (!encryptedParams) throw new Error("Failed to encrypt params");
                const response = await utils.request(serviceURL, {
                    method: "POST",
                    body: new URLSearchParams({
                        params: encryptedParams,
                    }),
                });
                return utils.resolve(response);
            }
            
            // Fallback nếu không có context zca-js
            return await this.api.sendBankCard(finalPayload, threadId, type);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Gửi sự kiện đã đọc tin nhắn (seen event) cho Zalo
     */
    public async sendSeenEvent(messages: any[], type: any = ThreadType.User): Promise<SendSeenEventResponse> {
        if (!this.api) {
            throw new Error("API not initialized. Please ensure you've called initialize() first.");
        }
        try {
            return await this.api.sendSeenEvent(messages, type);
        } catch (error) {
            throw error;
        }
    }

    public async addGroupDeputy(userId: string | string[], groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).addGroupDeputy(userId, groupId); } catch (error) { throw error; }
    }

    public async removeGroupDeputy(userId: string | string[], groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).removeGroupDeputy(userId, groupId); } catch (error) { throw error; }
    }

    public async changeGroupOwner(userId: string, groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).changeGroupOwner(userId, groupId); } catch (error) { throw error; }
    }

    public async getGroupMembersInfo(groupId: string, memberIds?: string[]): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const ids = memberIds && memberIds.length > 0 ? memberIds : [groupId];
            
            if (ids.length <= 50) {
                return await (this.api as any).getGroupMembersInfo(ids);
            }

            Logger.log(`[ZaloService] getGroupMembersInfo: batching ${ids.length} member IDs in chunks of 50`);
            const allProfiles: Record<string, any> = {};
            const allUnchangeds: any[] = [];

            for (let i = 0; i < ids.length; i += 50) {
                const chunk = ids.slice(i, i + 50);
                try {
                    const res = await (this.api as any).getGroupMembersInfo(chunk);
                    if (res?.profiles) {
                        Object.assign(allProfiles, res.profiles);
                    } else if (res?.membersInfo) {
                        Object.assign(allProfiles, res.membersInfo);
                    } else if (res?.data?.membersInfo) {
                        Object.assign(allProfiles, res.data.membersInfo);
                    }
                    if (res?.unchangeds_profile) {
                        allUnchangeds.push(...res.unchangeds_profile);
                    }
                } catch (chunkErr: any) {
                    Logger.error(`[ZaloService] getGroupMembersInfo chunk failed for indices ${i} to ${i + chunk.length}: ${chunkErr.message}`);
                }
                if (i + 50 < ids.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            return {
                profiles: allProfiles,
                unchangeds_profile: allUnchangeds
            };
        } catch (error) { throw error; }
    }

    public async addGroupBlockedMember(userId: string | string[], groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).addGroupBlockedMember(userId, groupId); } catch (error) { throw error; }
    }

    public async removeGroupBlockedMember(userId: string | string[], groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).removeGroupBlockedMember(userId, groupId); } catch (error) { throw error; }
    }

    public async getGroupBlockedMember(groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).getGroupBlockedMember(groupId); } catch (error) { throw error; }
    }

    public async inviteUserToGroups(userId: string, groupIds: string[]): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        const cleanGroupIds = groupIds.map(g => g.startsWith('g') ? g.slice(1) : g);
        try { return await (this.api as any).inviteUserToGroups(userId, cleanGroupIds); } catch (error) { throw error; }
    }

    public async addUnreadMark(threadId: string, type?: ThreadType): Promise<AddUnreadMarkResponse> {
        if (!this.api) throw new Error("API not initialized");
        const t = convertThreadType(type);
        try { return await (this.api as any).addUnreadMark(threadId, t); } catch (error) { throw error; }
    }

    public async removeUnreadMark(threadId: string, type?: ThreadType): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        const t = convertThreadType(type);
        try { return await (this.api as any).removeUnreadMark(threadId, t); } catch (error) { throw error; }
    }

    public async createPoll(options: {
        question: string;
        options: string[];
        expiredTime?: number;
        allowMultiChoices?: boolean;
        allowAddNewOption?: boolean;
        hideVotePreview?: boolean;
        isAnonymous?: boolean;
    }, groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).createPoll(options, groupId); } catch (error) { throw error; }
    }

    public async getPollDetail(pollId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).getPollDetail(pollId); } catch (error) { throw error; }
    }

    public async lockPoll(pollId: number): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).lockPoll(pollId); } catch (error) { throw error; }
    }

    public async doVotePoll(pollId: number, optionIds: number[]): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).votePoll(pollId, optionIds); } catch (error) { throw error; }
    }

    public async addPollOption(pollId: number, option: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            return await (this.api as any).addPollOptions({
                pollId,
                options: [{ voted: false, content: option }],
                votedOptionIds: [],
            });
        } catch (error) { throw error; }
    }

    // ─── Tin nhắn nhanh ──────────────────────────────────────────────────────
    public async getQuickMessageList(): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).getQuickMessageList(); } catch (error) { throw error; }
    }

    public async addQuickMessage(payload: { keyword: string; title: string; mediaPath?: string }): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const addPayload: any = { keyword: payload.keyword, title: payload.title };
            if (payload.mediaPath) addPayload.media = payload.mediaPath;
            return await (this.api as any).addQuickMessage(addPayload);
        } catch (error) { throw error; }
    }

    public async updateQuickMessage(payload: { keyword: string; title: string; mediaPath?: string }, itemId: number): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try {
            const updatePayload: any = { keyword: payload.keyword, title: payload.title };
            if (payload.mediaPath) updatePayload.media = payload.mediaPath;
            return await (this.api as any).updateQuickMessage(updatePayload, itemId);
        } catch (error) { throw error; }
    }

    public async removeQuickMessage(itemIds: number | number[]): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).removeQuickMessage(itemIds); } catch (error) { throw error; }
    }

    // ─── Ghi chú nhóm ────────────────────────────────────────────────────────
    public async createNote(options: { title: string; pinAct?: boolean }, groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).createNote(options, groupId); } catch (error) { throw error; }
    }

    public async editNote(options: { title: string; topicId: string; pinAct?: boolean }, groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).editNote(options, groupId); } catch (error) { throw error; }
    }

    public async getListBoard(options: any, groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).getListBoard(options, groupId); } catch (error) { throw error; }
    }

    // ─── Phê duyệt thành viên nhóm ───────────────────────────────────────────
    public async reviewPendingMemberRequest(payload: any, groupId: string): Promise<any> {
        if (!this.api) throw new Error("API not initialized");
        try { return await (this.api as any).reviewPendingMemberRequest(payload, groupId); } catch (error) { throw error; }
    }

    // ─── Tra cứu hàng loạt SĐT ───────────────────────────────────────────────
    /**
     * Tra cứu nhiều người dùng theo số điện thoại trong 1 API call.
     * Thay thế vòng lặp findUser đơn lẻ khi import CSV số điện thoại hàng loạt.
     * @param phoneNumbers Mảng số điện thoại (tối đa 100)
     */
    public async getMultiUsersByPhones(phoneNumbers: string[]): Promise<GetMultiUsersByPhonesResponse> {
        if (!this.api) throw new Error("API not initialized");
        try {
            return await (this.api as any).getMultiUsersByPhones(phoneNumbers);
        } catch (error) {
            throw error;
        }
    }

    // ─── Ghost Mode Online ────────────────────────────────────────────────────
    /**
     * Cập nhật trạng thái hoạt động (online/offline) của tài khoản.
     * active=true: hiển thị online; active=false: ẩn khỏi mắt bạn bè (Ghost Mode)
     * @param active true = online, false = ẩn
     */
    public async updateActiveStatus(active: boolean): Promise<UpdateActiveStatusResponse> {
        if (!this.api) throw new Error("API not initialized");
        try {
            return await (this.api as any).updateActiveStatus(active);
        } catch (error) {
            throw error;
        }
    }
}

