// Typed wrappers quanh window.electronAPI
// Dùng trong React components thay vì gọi trực tiếp

import { useAppStore } from '../store/appStore';


declare global {
  interface Window {
    electronAPI: {
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        quit: () => void;
        isMaximized: () => Promise<boolean>;
      };
      shell: {
        openExternal: (url: string) => void;
        openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        openInApp: (url: string) => Promise<{ success: boolean; error?: string }>;
      };
      util: {
        fetchUrl: (args: { url: string }) => Promise<{ success: boolean; data?: string; contentType?: string; statusCode?: number; error?: string }>;
      };
      login: {
        loginQR: (tempId: string) => Promise<any>;
        loginQRAbort: (tempId: string) => Promise<any>;
        loginCookies: (imei: string, cookies: string, userAgent: string) => Promise<any>;
        loginAuth: (authJson: string) => Promise<any>;
        connectAccount: (auth: unknown) => Promise<any>;
        disconnectAccount: (zaloId: string) => Promise<any>;
        disconnectAll: () => Promise<any>;
        getAccounts: () => Promise<any>;
        removeAccount: (zaloId: string) => Promise<any>;
        checkHealth: (zaloIds: string | string[]) => Promise<{ success: boolean; results: Array<{ zaloId: string; healthy: boolean; readyState: number | null; reason?: string }>; error?: string }>;
        requestOldMessages: (zaloId: string) => Promise<{ success: boolean; error?: string }>;
      };
      zalo: {
        sendMessage: (params: unknown) => Promise<any>;
        sendImage: (params: unknown) => Promise<any>;
        sendImages: (params: unknown) => Promise<any>;
        sendFile: (params: unknown) => Promise<any>;
        sendSticker: (params: unknown) => Promise<any>;
        sendVoice: (params: unknown) => Promise<any>;
        sendVideo: (params: unknown) => Promise<any>;
        sendLink: (params: unknown) => Promise<any>;
        sendCard: (params: unknown) => Promise<any>;
        undoMessage: (params: unknown) => Promise<any>;
        deleteMessage: (params: unknown) => Promise<any>;
        deleteChat: (params: unknown) => Promise<any>;
        addReaction: (params: unknown) => Promise<any>;
        forwardMessage: (params: unknown) => Promise<any>;
        getFriends: (auth: unknown) => Promise<any>;
        getGroups: (auth: unknown) => Promise<any>;
        getUserInfo: (params: unknown) => Promise<any>;
        getContext: (params: unknown) => Promise<any>;
        findUser: (params: unknown) => Promise<any>;
        sendFriendRequest: (params: unknown) => Promise<any>;
        acceptFriendRequest: (params: unknown) => Promise<any>;
        rejectFriendRequest: (params: unknown) => Promise<any>;
        undoFriendRequest: (params: unknown) => Promise<any>;
        removeFriend: (params: unknown) => Promise<any>;
        getSentFriendRequests: (auth: unknown) => Promise<any>;
        getFriendRequestStatus: (params: unknown) => Promise<any>;
        getFriendRecommendations: (auth: unknown) => Promise<any>;
        getAliasList: (params: unknown) => Promise<any>;
        blockUser: (params: unknown) => Promise<any>;
        unblockUser: (params: unknown) => Promise<any>;
        getRelatedFriendGroup: (params: unknown) => Promise<any>;
        createGroup: (params: unknown) => Promise<any>;
        getGroupInfo: (params: unknown) => Promise<any>;
        addUserToGroup: (params: unknown) => Promise<any>;
        removeUserFromGroup: (params: unknown) => Promise<any>;
        leaveGroup: (params: unknown) => Promise<any>;
        changeGroupName: (params: unknown) => Promise<any>;
        changeGroupAvatar: (params: unknown) => Promise<any>;
        changeGroupOwner: (params: unknown) => Promise<any>;
        disperseGroup: (params: unknown) => Promise<any>;
        addGroupDeputy: (params: unknown) => Promise<any>;
        removeGroupDeputy: (params: unknown) => Promise<any>;
        getGroupMembersInfo: (params: unknown) => Promise<any>;
        addGroupBlockedMember: (params: unknown) => Promise<any>;
        removeGroupBlockedMember: (params: unknown) => Promise<any>;
        getGroupBlockedMember: (params: unknown) => Promise<any>;
        inviteUserToGroups: (params: unknown) => Promise<any>;
        updateGroupSettings: (params: unknown) => Promise<any>;
        getGroupLinkDetail: (params: unknown) => Promise<any>;
        getGroupLinkInfo: (params: unknown) => Promise<any>;
        enableGroupLink: (params: unknown) => Promise<any>;
        disableGroupLink: (params: unknown) => Promise<any>;
        getPendingGroupMembers: (params: unknown) => Promise<any>;
        reviewPendingMemberRequest: (params: unknown) => Promise<any>;
        getMessageHistory: (params: unknown) => Promise<any>;
        getGroupChatHistory: (params: unknown) => Promise<any>;
        getPinConversations: (auth: unknown) => Promise<any>;
        setPinConversation: (params: unknown) => Promise<any>;
        setMute: (params: unknown) => Promise<any>;
        keepAlive: (auth: unknown) => Promise<any>;
        getLabels: (params: unknown) => Promise<any>;
        updateLabels: (params: unknown) => Promise<any>;
        changeFriendAlias: (params: unknown) => Promise<any>;
        getStickers: (params: unknown) => Promise<any>;
        getStickersDetail: (params: unknown) => Promise<any>;
        getStickerCategoryDetail: (params: unknown) => Promise<any>;
        addUnreadMark: (params: unknown) => Promise<any>;
        removeUnreadMark: (params: unknown) => Promise<any>;
        createPoll: (params: unknown) => Promise<any>;
        getPollDetail: (params: unknown) => Promise<any>;
        lockPoll: (params: unknown) => Promise<any>;
        doVotePoll: (params: unknown) => Promise<any>;
        addPollOption: (params: unknown) => Promise<any>;
        uploadVideoThumb: (params: unknown) => Promise<any>;
        uploadVideoFile: (params: unknown) => Promise<any>;
        uploadVoiceFile: (params: unknown) => Promise<any>;
        getQuickMessageList: (params: unknown) => Promise<any>;
        addQuickMessage: (params: unknown) => Promise<any>;
        updateQuickMessage: (params: unknown) => Promise<any>;
        removeQuickMessage: (params: unknown) => Promise<any>;
        createNote: (params: unknown) => Promise<any>;
        editNote: (params: unknown) => Promise<any>;
        createReminder: (params: unknown) => Promise<any>;
        editReminder: (params: unknown) => Promise<any>;
        removeReminder: (params: unknown) => Promise<any>;
        getListReminder: (params: unknown) => Promise<any>;
        getReminder: (params: unknown) => Promise<any>;
        sendSeenEvent: (params: unknown) => Promise<any>;
        sendBankCard: (params: unknown) => Promise<any>;
      };
      db: {
        getMessages: (params: unknown) => Promise<any>;
        getMessagesAround: (params: { zaloId: string; threadId: string; timestamp: number; limit?: number }) => Promise<any>;
        getContacts: (zaloId: string) => Promise<any>;
        searchMessages: (params: unknown) => Promise<any>;
        getMediaMessages: (params: { zaloId: string; threadId?: string; limit?: number; offset?: number }) => Promise<any>;
        getFileMessages: (params: { zaloId: string; threadId: string; limit?: number; offset?: number }) => Promise<any>;
        getUnreadCount: (zaloId: string) => Promise<any>;
        markAsRead: (params: unknown) => Promise<any>;
        markMessageRecalled: (params: unknown) => Promise<any>;
        deleteMessages: (params: { zaloId: string; msgIds: string[] }) => Promise<{ success: boolean; error?: string }>;
        updateContactProfile: (params: unknown) => Promise<any>;
        updateAccountPhone: (params: { zaloId: string; phone: string }) => Promise<{ success: boolean; error?: string }>;
        updateReaction: (params: unknown) => Promise<any>;
        updateLocalPaths: (params: unknown) => Promise<any>;
        getMessageById: (params: unknown) => Promise<any>;
        getStoragePath: () => Promise<any>;
        setStoragePath: (params: unknown) => Promise<any>;
        selectStorageFolder: () => Promise<any>;
        getFriends: (params: { zaloId: string }) => Promise<{ success: boolean; friends: any[]; lastFetched: number }>;
        saveFriends: (params: { zaloId: string; friends: any[] }) => Promise<{ success: boolean }>;
        isFriend: (params: { zaloId: string; userId: string }) => Promise<{ success: boolean; isFriend: boolean }>;
        getFriendRequests: (params: { zaloId: string; direction: 'received' | 'sent' }) => Promise<{ success: boolean; requests: any[]; lastFetched: number }>;
        saveFriendRequests: (params: { zaloId: string; requests: any[]; direction: 'received' | 'sent' }) => Promise<{ success: boolean }>;
        upsertFriendRequest: (params: { zaloId: string; request: any; direction: 'received' | 'sent' }) => Promise<{ success: boolean }>;
        removeFriendRequest: (params: { zaloId: string; userId: string; direction: 'received' | 'sent' }) => Promise<{ success: boolean }>;
        addFriend: (params: { zaloId: string; friend: any }) => Promise<{ success: boolean }>;
        removeFriend: (params: { zaloId: string; userId: string }) => Promise<{ success: boolean }>;
        deleteConversation: (params: { zaloId: string; contactId: string }) => Promise<{ success: boolean; error?: string }>;
        getLinks: (params: { zaloId: string; threadId: string; limit?: number; offset?: number }) => Promise<{ success: boolean; links: any[] }>;
        saveLink: (params: unknown) => Promise<{ success: boolean }>;
        getGroupMembers: (params: { zaloId: string; groupId: string }) => Promise<{ success: boolean; members: Array<{ member_id: string; display_name: string; avatar: string; role: number; updated_at: number }> }>;
        getAllGroupMembers: (params: { zaloId: string }) => Promise<{ success: boolean; rows: Array<{ group_id: string; member_id: string; display_name: string; avatar: string; role: number; updated_at: number }> }>;
        saveGroupMembers: (params: { zaloId: string; groupId: string; members: Array<{ memberId: string; displayName: string; avatar: string; role: number }> }) => Promise<{ success: boolean }>;
        upsertGroupMember: (params: { zaloId: string; groupId: string; member: { memberId: string; displayName: string; avatar: string; role: number } }) => Promise<{ success: boolean }>;
        removeGroupMember: (params: { zaloId: string; groupId: string; memberId: string }) => Promise<{ success: boolean }>;
        saveStickers: (params: { stickers: any[] }) => Promise<{ success: boolean }>;
        getStickerById: (params: { stickerId: number }) => Promise<{ success: boolean; sticker: any | null }>;
        getRecentStickers: (params?: { limit?: number }) => Promise<{ success: boolean; stickers: any[] }>;
        addRecentSticker: (params: unknown) => Promise<{ success: boolean }>;
        markStickerUnsupported: (params: { stickerId: number }) => Promise<{ success: boolean }>;
        saveStickerPacks: (params: { packs: any[] }) => Promise<{ success: boolean }>;
        getStickerPacks: (params?: unknown) => Promise<{ success: boolean; packs: any[] }>;
        getStickersByPackId: (params: { catId: number }) => Promise<{ success: boolean; stickers: any[] }>;
        saveKeywordStickers: (params: { keyword: string; stickerIds: number[] }) => Promise<{ success: boolean }>;
        getKeywordStickers: (params: { keyword: string }) => Promise<{ success: boolean; stickerIds: number[] | null }>;
        getStickersByIds: (params: { stickerIds: number[] }) => Promise<{ success: boolean; stickers: any[] }>;
        getAllCachedPackSummaries: (params?: unknown) => Promise<{ success: boolean; packs: { catId: number; count: number; thumbUrl: string }[] }>;
        getPinnedMessages: (params: { zaloId: string; threadId: string }) => Promise<{ success: boolean; pins: any[] }>;
        getMessagesByType: (params: { zaloId: string; threadId: string; msgType: string; limit?: number }) => Promise<{ success: boolean; messages: any[] }>;
        pinMessage: (params: { zaloId: string; threadId: string; pin: any }) => Promise<{ success: boolean }>;
        unpinMessage: (params: { zaloId: string; threadId: string; msgId: string }) => Promise<{ success: boolean }>;
        bringPinnedToTop: (params: { zaloId: string; threadId: string; msgId: string }) => Promise<{ success: boolean }>;
        getLocalQuickMessages: (params: { zaloId: string }) => Promise<{ success: boolean; items: any[] }>;
        getAllLocalQuickMessages: () => Promise<{ success: boolean; items: any[] }>;
        upsertLocalQuickMessage: (params: { zaloId: string; item: { keyword: string; title: string; media?: any } }) => Promise<{ success: boolean; id: number }>;
        deleteLocalQuickMessage: (params: { zaloId: string; id: number }) => Promise<{ success: boolean }>;
        bulkReplaceLocalQuickMessages: (params: { zaloId: string; items: any[] }) => Promise<{ success: boolean }>;
        cloneLocalQuickMessages: (params: { sourceZaloId: string; targetZaloId: string }) => Promise<{ success: boolean; count?: number; error?: string }>;
        setLocalQMActive: (params: { id: number; isActive: number }) => Promise<{ success: boolean; error?: string }>;
        setLocalQMOrder: (params: { id: number; order: number }) => Promise<{ success: boolean; error?: string }>;
        setContactFlags: (params: { zaloId: string; contactId: string; flags: { is_muted?: number; mute_until?: number; is_in_others?: number } }) => Promise<{ success: boolean }>;
        getContactsWithFlags: (params: { zaloId: string }) => Promise<{ success: boolean; rows: Array<{ contact_id: string; is_muted: number; mute_until: number; is_in_others: number }> }>;
        setContactAlias: (params: { zaloId: string; contactId: string; alias: string }) => Promise<{ success: boolean }>;
        // Message Drafts
        upsertDraft: (params: { zaloId: string; threadId: string; content: string }) => Promise<{ success: boolean }>;
        deleteDraft: (params: { zaloId: string; threadId: string }) => Promise<{ success: boolean }>;
        getDraft: (params: { zaloId: string; threadId: string }) => Promise<{ success: boolean; draft: { content: string; updatedAt: number } | null }>;
        getDrafts: (params: { zaloId: string }) => Promise<{ success: boolean; drafts: Array<{ threadId: string; content: string; updatedAt: number }> }>;
        deleteOldDrafts: (params?: { days?: number }) => Promise<{ success: boolean }>;
        // Bank Cards
        getBankCards: (params: { zaloId: string }) => Promise<{ success: boolean; cards: any[] }>;
        upsertBankCard: (params: { zaloId: string; card: any }) => Promise<{ success: boolean; id?: number; error?: string }>;
        deleteBankCard: (params: { zaloId: string; id: number }) => Promise<{ success: boolean; error?: string }>;
        // Local Pinned Conversations
        getLocalPinnedConversations: (params: { zaloId: string }) => Promise<{ success: boolean; threadIds: string[] }>;
        setLocalPinnedConversation: (params: { zaloId: string; threadId: string; isPinned: boolean }) => Promise<{ success: boolean }>;
        getPipelineStages: () => Promise<{ success: boolean; stages: any[] }>;
        savePipelineStage: (params: { stage: any }) => Promise<{ success: boolean; id?: number; error?: string }>;
        deletePipelineStage: (params: { id: number }) => Promise<{ success: boolean; error?: string }>;
        updateContactPipelineStage: (params: { ownerZaloId: string; contactId: string; stageId: number | null }) => Promise<{ success: boolean; error?: string }>;
        getCalendarEventsByContact: (params: { contactId: string }) => Promise<{ success: boolean; events: any[]; error?: string }>;
        // Local Labels
        getLocalLabels: (params: { zaloId?: string }) => Promise<{ success: boolean; labels: any[] }>;
        upsertLocalLabel: (params: { label: { id?: number; name: string; color: string; textColor?: string; emoji: string; pageIds: string; isActive?: number; sortOrder?: number; shortcut?: string } }) => Promise<{ success: boolean; id?: number; error?: string }>;
        deleteLocalLabel: (params: { id: number }) => Promise<{ success: boolean; error?: string }>;
        cloneLocalLabels: (params: { sourceZaloId: string; targetZaloId: string }) => Promise<{ success: boolean; count?: number; error?: string }>;
        getLocalLabelThreads: (params: { zaloId: string }) => Promise<{ success: boolean; threads: Array<{ label_id: number; thread_id: string }> }>;
        assignLocalLabelToThread: (params: { zaloId: string; labelId: number; threadId: string; threadType?: number; labelText?: string; labelColor?: string; labelEmoji?: string }) => Promise<{ success: boolean; error?: string }>;
        removeLocalLabelFromThread: (params: { zaloId: string; labelId: number; threadId: string; threadType?: number; labelText?: string; labelColor?: string; labelEmoji?: string }) => Promise<{ success: boolean; error?: string }>;
        getThreadLocalLabels: (params: { zaloId: string; threadId: string }) => Promise<{ success: boolean; labels: any[] }>;
        setLocalLabelActive: (params: { id: number; isActive: number }) => Promise<{ success: boolean; error?: string }>;
        setLocalLabelOrder: (params: { id: number; order: number }) => Promise<{ success: boolean; error?: string }>;
      };
      crm: {
        getNotes: (params: { zaloId: string; contactId: string }) => Promise<{ success: boolean; notes: any[] }>;
        saveNote: (params: { zaloId: string; note: any }) => Promise<{ success: boolean; id: number }>;
        deleteNote: (params: { zaloId: string; noteId: number }) => Promise<{ success: boolean }>;
        getContacts: (params: { zaloId: string; opts?: any }) => Promise<{ success: boolean; contacts: any[]; total: number }>;
        getContactStats: (params: { zaloId: string }) => Promise<{ success: boolean; total: number; friendCount: number; noteCount: number }>;
        getCampaigns: (params: { zaloId: string }) => Promise<{ success: boolean; campaigns: any[] }>;
        saveCampaign: (params: { zaloId: string; campaign: any }) => Promise<{ success: boolean; id: number }>;
        deleteCampaign: (params: { zaloId: string; campaignId: number }) => Promise<{ success: boolean }>;
        cloneCampaign: (params: { zaloId: string; campaignId: number; includeContacts: boolean; newName?: string }) => Promise<{ success: boolean; id: number; error?: string }>;
        updateCampaignStatus: (params: { campaignId: number; status: string }) => Promise<{ success: boolean }>;
        addCampaignContacts: (params: { zaloId: string; campaignId: number; contacts: any[] }) => Promise<{ success: boolean }>;
        getCampaignContacts: (params: { campaignId: number }) => Promise<{ success: boolean; contacts: any[] }>;
        getSendLog: (params: { zaloId: string; opts?: any }) => Promise<{ success: boolean; logs: any[] }>;
        getQueueStatus: (params: { zaloId: string }) => Promise<{ success: boolean; status: any }>;
        getCampaignStats: (params: { zaloId: string; limit?: number }) => Promise<{ success: boolean; stats: any[] }>;
        getActivityStats: (params: { zaloId: string; sinceTs: number; untilTs?: number; }) => Promise<{ success: boolean; conversationCount: number; messageCount: number; sentCount: number; receivedCount: number }>;
      };
      analytics: {
        dashboardOverview: (params: { zaloId: string }) => Promise<{
          success: boolean; totalMessages: number; totalSent: number; totalReceived: number;
          totalContacts: number; totalFriends: number; totalGroups: number;
          todayMessages: number; todaySent: number; todayReceived: number;
          yesterdayMessages: number; activeCampaigns: number; totalCampaigns: number;
        }>;
        messageVolume: (params: { zaloId: string; sinceTs: number; untilTs: number; granularity: 'hour' | 'day'; threadType?: number }) => Promise<{
          success: boolean; data: Array<{ bucket: string; sent: number; received: number; total: number }>;
        }>;
        peakHours: (params: { zaloId: string; sinceTs: number; untilTs: number; threadType?: number }) => Promise<{
          success: boolean; data: Array<{ dayOfWeek: number; hour: number; count: number }>;
        }>;
        contactGrowth: (params: { zaloId: string; sinceTs: number; untilTs: number }) => Promise<{
          success: boolean; data: Array<{ bucket: string; newContacts: number; newFriends: number }>;
        }>;
        contactSegmentation: (params: { zaloId: string }) => Promise<{
          success: boolean; byType: Array<{ type: string; count: number }>;
          tagged: number; untagged: number; withNotes: number; withoutNotes: number;
        }>;
        campaignComparison: (params: { zaloId: string }) => Promise<{
          success: boolean; data: Array<{
            id: number; name: string; type: string; status: string; created_at: number;
            total: number; sent: number; failed: number; pending: number; replied: number;
            deliveryRate: number; replyRate: number;
          }>;
        }>;
        friendRequests: (params: { zaloId: string; sinceTs: number; untilTs: number }) => Promise<{
          success: boolean; totalSent: number; totalReceived: number;
          timeline: Array<{ bucket: string; sent: number; received: number }>;
        }>;
        workflowAnalytics: (params: { zaloId: string; sinceTs: number; untilTs: number }) => Promise<{
          success: boolean; totalRuns: number; successRuns: number; errorRuns: number; successRate: number;
          avgDuration: number;
          topWorkflows: Array<{ workflowName: string; runs: number; successRate: number }>;
          timeline: Array<{ bucket: string; success: number; error: number }>;
        }>;
        aiAnalytics: (params: { sinceTs: number; untilTs: number }) => Promise<{
          success: boolean; totalRequests: number; totalTokens: number; totalPromptTokens: number; totalCompletionTokens: number;
          byModel: Array<{ model: string; requests: number; tokens: number }>;
          byAssistant: Array<{ assistantName: string; requests: number; tokens: number }>;
          timeline: Array<{ bucket: string; requests: number; tokens: number }>;
        }>;
        responseTime: (params: { zaloId: string; sinceTs: number; untilTs: number; threadType?: number }) => Promise<{
          success: boolean; avgSeconds: number; medianSeconds: number; minSeconds: number; maxSeconds: number;
          totalConversations: number; totalReplies: number;
          distribution: Array<{ bucket: string; count: number }>;
          byHour: Array<{ hour: number; avgSeconds: number; count: number }>;
        }>;
        labelUsage: (params: { zaloId: string; sinceTs: number; untilTs: number }) => Promise<{
          success: boolean; totalAssignments: number; totalLabelsUsed: number; avgPerDay: number;
          timeline: Array<{ bucket: string; count: number }>;
          byLabel: Array<{ labelId: number; name: string; emoji: string; color: string; count: number }>;
          recentAssignments: Array<{ labelName: string; emoji: string; color: string; threadId: string; createdAt: number }>;
        }>;
      };
      file: {
        openDialog: (options?: unknown) => Promise<any>;
        saveImage: (params: unknown) => Promise<any>;
        getAppDataPath: () => Promise<any>;
        openPath: (filePath: string) => Promise<any>;
        showItemInFolder: (filePath: string) => Promise<any>;
        saveAs: (params: { localPath?: string; remoteUrl?: string; defaultName: string; zaloId?: string; cookiesJson?: string; userAgent?: string }) => Promise<{ success: boolean; canceled?: boolean; savedPath?: string; error?: string }>;
        saveTempBlob: (params: { base64: string; ext: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
        getVideoMeta: (params: { filePath: string }) => Promise<{ success: boolean; thumbPath: string; duration: number; width: number; height: number; error?: string }>;
      };
      app: {
        setBadge: (count: number) => void;
        openThread: (params: { zaloId: string; threadId: string; threadType: number }) => void;
        sendBadgeImage: (params: { dataUrl: string; count: number }) => void;
        flashFrame: (active: boolean) => void;
      };
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      removeAllListeners: (channel: string) => void;
      update: {
        download: () => void;
        install:  () => void;
      };
      workflow: {
        list: () => Promise<{ success: boolean; workflows: any[]; error?: string }>;
        get: (id: string) => Promise<{ success: boolean; workflow?: any; error?: string }>;
        save: (workflow: any) => Promise<{ success: boolean; id?: string; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean; error?: string }>;
        toggle: (id: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
        runManual: (id: string, triggerData?: any) => Promise<{ success: boolean; log?: any; error?: string }>;
        getLogs: (id: string, limit?: number) => Promise<{ success: boolean; logs: any[]; error?: string }>;
        deleteLogs: (id: string) => Promise<{ success: boolean; error?: string }>;
        clone: (id: string, targetZaloId: string) => Promise<{ success: boolean; newId?: string; error?: string }>;
        cloneAll: (sourceZaloId: string, targetZaloId: string) => Promise<{ success: boolean; count?: number; error?: string }>;
      };
      integration: {
        list:           () => Promise<{ success: boolean; integrations: any[]; webhookPort?: number; error?: string }>;
        get:            (id: string) => Promise<{ success: boolean; integration?: any; error?: string }>;
        save:           (integration: any) => Promise<{ success: boolean; id?: string; error?: string }>;
        delete:         (id: string) => Promise<{ success: boolean; error?: string }>;
        toggle:         (id: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
        test:           (id: string) => Promise<{ success: boolean; message?: string }>;
        execute:        (id: string, action: string, params?: any) => Promise<{ success: boolean; data?: any; error?: string }>;
        executeByType:  (type: string, action: string, params?: any) => Promise<{ success: boolean; data?: any; error?: string }>;
        getWebhookPort: () => Promise<{ success: boolean; port?: number }>;
      };
      ai: {
        listAssistants:  () => Promise<{ success: boolean; assistants: any[]; error?: string }>;
        getAssistant:    (id: string) => Promise<{ success: boolean; assistant?: any; error?: string }>;
        getDefault:      () => Promise<{ success: boolean; assistant: any | null }>;
        saveAssistant:   (assistant: any) => Promise<{ success: boolean; id?: string; error?: string }>;
        deleteAssistant: (id: string) => Promise<{ success: boolean; error?: string }>;
        testAssistant:   (id: string) => Promise<{ success: boolean; message?: string }>;
        getFiles:        (assistantId: string) => Promise<{ success: boolean; files: any[]; error?: string }>;
        uploadFile:      (assistantId: string, filePath: string) => Promise<{ success: boolean; id?: number; fileName?: string; error?: string }>;
        removeFile:      (fileId: number) => Promise<{ success: boolean; error?: string }>;
        suggest:         (assistantId: string, chatHistory: any[]) => Promise<{ success: boolean; suggestions: string[]; error?: string }>;
        chat:            (assistantId: string, messages: any[], structured?: boolean) => Promise<{ success: boolean; result?: string; totalTokens?: number; promptTokens?: number; completionTokens?: number; error?: string }>;
        getAccountAssistant:  (zaloId: string, role: string) => Promise<{ success: boolean; assistant?: any | null; error?: string }>;
        setAccountAssistant:  (zaloId: string, role: string, assistantId: string | null) => Promise<{ success: boolean; error?: string }>;
        getAccountAssistants: (zaloId: string) => Promise<{ success: boolean; suggestion?: string | null; panel?: string | null; error?: string }>;
        getUsageLogs:  (opts?: { assistantId?: string; dateFrom?: number; dateTo?: number; limit?: number }) => Promise<{ success: boolean; logs: any[]; error?: string }>;
        getUsageStats: (opts?: { assistantId?: string; days?: number }) => Promise<{ success: boolean; stats: any[]; error?: string }>;
        fetchModels:   (params: { platform: string; customUrl?: string; apiKey: string; assistantId?: string }) => Promise<{ success: boolean; models: string[]; error?: string }>;
        analyzeContact: (params: { ownerZaloId: string; contactId: string }) => Promise<{ success: boolean; sentiment: string; intent: string; error?: string }>;
        batchSummarizeContactNotes: (params: { ownerZaloId: string; contactId: string }) => Promise<{ success: boolean; summary: string; error?: string }>;
        suggestSmartTags: (params: { ownerZaloId: string; contactId: string }) => Promise<{ success: boolean; tags: string[]; error?: string }>;
      };
      tunnel: {
        start:  () => Promise<{ success: boolean; url?: string; error?: string }>;
        stop:   () => Promise<{ success: boolean; error?: string }>;
        status: () => Promise<{ active: boolean; url: string | null }>;
      };
      employee: {
        list: () => Promise<{ success: boolean; employees: any[]; error?: string }>;
        getById: (employeeId: string) => Promise<{ success: boolean; employee?: any; error?: string }>;
        create: (params: { username: string; password: string; display_name: string; avatar_url?: string; role?: string }) => Promise<{ success: boolean; employee?: any; error?: string }>;
        update: (employeeId: string, updates: { display_name?: string; avatar_url?: string; password?: string; is_active?: number; role?: string; group_id?: string | null }) => Promise<{ success: boolean; error?: string }>;
        delete: (employeeId: string) => Promise<{ success: boolean; error?: string }>;
        setPermissions: (employeeId: string, permissions: Array<{ module: string; can_access: boolean }>) => Promise<{ success: boolean; error?: string }>;
        getPermissions: (employeeId: string) => Promise<{ success: boolean; permissions?: Record<string, boolean>; error?: string }>;
        assignAccounts: (employeeId: string, zaloIds: string[]) => Promise<{ success: boolean; error?: string }>;
        getAssignedAccounts: (employeeId: string) => Promise<{ success: boolean; accounts?: string[]; error?: string }>;
        getAccountAccessDetails: (employeeId: string) => Promise<{ success: boolean; details: Array<{ zalo_id: string; allowed_groups: string; allowed_tags: string; exclude_blocked: number }>; error?: string }>;
        assignAccountAccessDetails: (employeeId: string, accessDetails: Array<{ zalo_id: string; allowed_groups: string; allowed_tags: string; exclude_blocked: number }>) => Promise<{ success: boolean; error?: string }>;
        getStats: (employeeId: string, sinceTs?: number, untilTs?: number) => Promise<{ success: boolean; stats?: any; error?: string }>;
        getSessions: (employeeId: string, limit?: number) => Promise<{ success: boolean; sessions?: any[]; error?: string }>;
        login: (username: string, password: string) => Promise<{ success: boolean; token?: string; employee?: any; error?: string }>;
        validateToken: (token: string) => Promise<{ valid: boolean; employee_id?: string; username?: string; role?: string }>;
        setMode: (mode: string) => Promise<{ success: boolean; error?: string }>;
        getMode: () => Promise<{ mode: string }>;
        connectToBoss: (bossUrl: string, token: string) => Promise<{ success: boolean; error?: string }>;
        disconnectFromBoss: () => Promise<{ success: boolean; error?: string }>;
        getConnectionStatus: () => Promise<{ connected: boolean; bossUrl: string; latency: number }>;
        proxyAction: (channel: string, params: any) => Promise<any>;
        // Groups
        listGroups: () => Promise<{ success: boolean; groups: any[]; error?: string }>;
        createGroup: (name: string, color?: string) => Promise<{ success: boolean; group?: any; error?: string }>;
        updateGroup: (groupId: string, updates: { name?: string; color?: string; sort_order?: number }) => Promise<{ success: boolean; error?: string }>;
        deleteGroup: (groupId: string) => Promise<{ success: boolean; error?: string }>;
        // Analytics
        analyticsComparison: (sinceTs: number, untilTs: number) => Promise<{ success: boolean; data: any[]; error?: string }>;
        analyticsMessageTimeline: (sinceTs: number, untilTs: number) => Promise<{ success: boolean; data: any[]; error?: string }>;
        analyticsOnlineTimeline: (sinceTs: number, untilTs: number) => Promise<{ success: boolean; data: any[]; error?: string }>;
        analyticsResponseDist: (sinceTs: number, untilTs: number) => Promise<{ success: boolean; data: any[]; error?: string }>;
        analyticsHourlyActivity: (sinceTs: number, untilTs: number) => Promise<{ success: boolean; data: any[]; error?: string }>;
      };
      workspace: {
        list: () => Promise<{ success: boolean; workspaces: any[]; error?: string }>;
        getActive: () => Promise<{ success: boolean; workspace: any; error?: string }>;
        create: (params: { name: string; type: 'local' | 'remote'; icon?: string; bossUrl?: string; token?: string; employeeId?: string; employeeName?: string; employeeUsername?: string; autoConnect?: boolean; relayPort?: number }) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        update: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean; error?: string }>;
        switch: (id: string) => Promise<{ success: boolean; workspace?: any; error?: string }>;
        isMulti: () => Promise<{ isMulti: boolean }>;
        getDbPath: (id: string) => Promise<{ success: boolean; dbPath?: string; error?: string }>;
        connectRemote: (id: string, bossUrl: string, token: string) => Promise<{ success: boolean; error?: string }>;
        disconnectRemote: (id: string) => Promise<{ success: boolean; error?: string }>;
        getConnectionStatus: (id: string) => Promise<{ success: boolean; connected: boolean; bossUrl: string; latency: number; error?: string }>;
        getAllStatuses: () => Promise<{ success: boolean; statuses: Record<string, { connected: boolean; bossUrl: string; latency: number }>; error?: string }>;
        loginRemote: (bossUrl: string, username: string, password: string) => Promise<{ success: boolean; token?: string; employee?: any; error?: string }>;
      };
      relay: {
        startServer: (port?: number) => Promise<{ success: boolean; port?: number; error?: string }>;
        stopServer: () => Promise<{ success: boolean; error?: string }>;
        getServerStatus: () => Promise<{ success: boolean; running?: boolean; port?: number; connectedEmployees?: any[]; localIPs?: string[]; error?: string }>;
        kickEmployee: (employeeId: string) => Promise<{ success: boolean; error?: string }>;
      };
      sync: {
        requestFullSync: (zaloIds: string[]) => Promise<{ success: boolean; error?: string }>;
        requestDeltaSync: (sinceTs?: number) => Promise<{ success: boolean; error?: string }>;
        resetEmployeeDB: (zaloIds: string[]) => Promise<{ success: boolean; error?: string }>;
        getStatus: () => Promise<{ success: boolean; lastSyncTs: number }>;
        requestMedia: (filePath: string) => Promise<{ success: boolean; data?: any; fileName?: string; error?: string }>;
      };
      // ─── Facebook ─────────────────────────────────────────────────────
      fb: {
        addAccount:           (params: { cookie: string }) => Promise<{ success: boolean; account?: any; facebookId?: string; name?: string; error?: string }>;
        removeAccount:        (params: { accountId: string }) => Promise<{ success: boolean; error?: string }>;
        updateCookie:         (params: { accountId: string; cookie: string }) => Promise<{ success: boolean; error?: string }>;
        refreshProfile:       (params: { accountId: string }) => Promise<{ success: boolean; name?: string; avatarUrl?: string; error?: string, facebookId?: string }>;
        getAccounts:          () => Promise<{ success: boolean; accounts: any[]; error?: string }>;
        connect:              (params: { accountId: string }) => Promise<{ success: boolean; error?: string }>;
        disconnect:           (params: { accountId: string }) => Promise<{ success: boolean; error?: string }>;
        checkHealth:          (params: { accountId: string }) => Promise<{ success: boolean; alive: boolean; listenerConnected: boolean; reason?: string }>;
        sendMessage:          (params: { accountId: string; threadId: string; body: string; options?: any }) => Promise<{ success: boolean; messageId?: string; error?: string }>;
        sendAttachment:       (params: { accountId: string; threadId: string; filePath: string; body?: string; typeChat?: 'user' | null }) => Promise<{ success: boolean; error?: string }>;
        sendAttachments:      (params: { accountId: string; threadId: string; filePaths: string[]; body?: string; typeChat?: 'user' | null }) => Promise<{ success: boolean; uploadedCount?: number; totalCount?: number; error?: string }>;
        unsendMessage:        (params: { accountId: string; messageId: string }) => Promise<{ success: boolean; error?: string }>;
        addReaction:          (params: { accountId: string; messageId: string; emoji: string; action: 'add' | 'remove' }) => Promise<{ success: boolean; error?: string }>;
        getThreads:           (params: { accountId: string; forceRefresh?: boolean }) => Promise<{ success: boolean; threads: any[]; error?: string }>;
        getMessages:          (params: { accountId: string; threadId: string; limit?: number; offset?: number }) => Promise<{ success: boolean; messages: any[]; error?: string }>;
        markAsRead:           (params: { accountId: string; threadId: string }) => Promise<{ success: boolean; error?: string }>;
        changeThreadName:     (params: { accountId: string; threadId: string; name: string }) => Promise<{ success: boolean; error?: string }>;
        changeThreadEmoji:    (params: { accountId: string; threadId: string; emoji: string }) => Promise<{ success: boolean; error?: string }>;
        changeNickname:       (params: { accountId: string; threadId: string; userId: string; nickname: string }) => Promise<{ success: boolean; error?: string }>;
        loginWithCredentials: (params: { username: string; password: string; twoFASecret?: string }) => Promise<{ success: boolean; result?: any; error?: string }>;
      };
      erp: {
      projectList:         (params?: { archived?: boolean }) => Promise<{ success: boolean; projects: any[]; error?: string }>;
      projectCreate:       (params: unknown) => Promise<{ success: boolean; project?: any; error?: string }>;
      projectUpdate:       (params: unknown) => Promise<{ success: boolean; project?: any; error?: string }>;
      projectDelete:       (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskList:            (params?: unknown) => Promise<{ success: boolean; tasks: any[]; error?: string }>;
      taskGet:             (params: { id: string }) => Promise<{ success: boolean; task?: any; error?: string }>;
      taskCreate:          (params: unknown) => Promise<{ success: boolean; task?: any; error?: string }>;
      taskUpdate:          (params: unknown) => Promise<{ success: boolean; task?: any; error?: string }>;
      taskUpdateStatus:    (params: unknown) => Promise<{ success: boolean; task?: any; error?: string }>;
      taskAssign:          (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskDelete:          (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskAddChecklist:    (params: unknown) => Promise<{ success: boolean; item?: any; error?: string }>;
      taskToggleChecklist: (params: unknown) => Promise<{ success: boolean; item?: any; error?: string }>;
      taskAddComment:      (params: unknown) => Promise<{ success: boolean; comment?: any; error?: string }>;
      taskEditComment:     (params: unknown) => Promise<{ success: boolean; comment?: any; error?: string }>;
      taskDeleteComment:   (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskListMyInbox:     (params: unknown) => Promise<{ success: boolean; tasks: any[]; error?: string }>;
      calendarListEvents:  (params: unknown) => Promise<{ success: boolean; events: any[]; error?: string }>;
      calendarCreate:      (params: unknown) => Promise<{ success: boolean; event?: any; error?: string }>;
      calendarUpdate:      (params: unknown) => Promise<{ success: boolean; event?: any; error?: string }>;
      calendarDelete:      (params: unknown) => Promise<{ success: boolean; error?: string }>;
      calendarCheckConflict:(params: unknown) => Promise<{ success: boolean; conflicts: any[]; error?: string }>;
      noteListFolders:     (params: unknown) => Promise<{ success: boolean; folders: any[]; error?: string }>;
      noteCreateFolder:    (params: unknown) => Promise<{ success: boolean; folder?: any; error?: string }>;
      noteRenameFolder:    (params: unknown) => Promise<{ success: boolean; error?: string }>;
      noteDeleteFolder:    (params: unknown) => Promise<{ success: boolean; error?: string }>;
      noteList:            (params?: unknown) => Promise<{ success: boolean; notes: any[]; error?: string }>;
      noteGet:             (params: unknown) => Promise<{ success: boolean; note?: any; error?: string }>;
      noteCreate:          (params: unknown) => Promise<{ success: boolean; note?: any; error?: string }>;
      noteUpdate:          (params: unknown) => Promise<{ success: boolean; note?: any; error?: string }>;
      noteDelete:          (params: unknown) => Promise<{ success: boolean; error?: string }>;
      notePin:             (params: unknown) => Promise<{ success: boolean; error?: string }>;
      noteListTags:        () => Promise<{ success: boolean; tags: any[]; error?: string }>;
      noteCreateTag:       (params: unknown) => Promise<{ success: boolean; tag?: any; error?: string }>;
      noteAddTag:          (params: unknown) => Promise<{ success: boolean; error?: string }>;
      noteRemoveTag:       (params: unknown) => Promise<{ success: boolean; error?: string }>;
      noteVersions:        (params: unknown) => Promise<{ success: boolean; versions: any[]; error?: string }>;
      noteRestoreVersion:  (params: unknown) => Promise<{ success: boolean; note?: any; error?: string }>;
      noteShare:           (params: unknown) => Promise<{ success: boolean; error?: string }>;
      noteListShares:      (params: unknown) => Promise<{ success: boolean; shares: any[]; error?: string }>;
      taskAddWatcher:      (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskRemoveWatcher:   (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskAddDependency:   (params: unknown) => Promise<{ success: boolean; error?: string }>;
      taskRemoveDependency:(params: unknown) => Promise<{ success: boolean; error?: string }>;
      calendarRespond:     (params: unknown) => Promise<{ success: boolean; error?: string }>;
      departmentList:      () => Promise<{ success: boolean; departments: any[]; error?: string }>;
      departmentCreate:    (params: unknown) => Promise<{ success: boolean; department?: any; error?: string }>;
      departmentUpdate:    (params: unknown) => Promise<{ success: boolean; department?: any; error?: string }>;
      departmentDelete:    (params: unknown) => Promise<{ success: boolean; error?: string }>;
      positionList:        () => Promise<{ success: boolean; positions: any[]; error?: string }>;
      positionCreate:      (params: unknown) => Promise<{ success: boolean; position?: any; error?: string }>;
      positionUpdate:      (params: unknown) => Promise<{ success: boolean; position?: any; error?: string }>;
      positionDelete:      (params: unknown) => Promise<{ success: boolean; error?: string }>;
      employeeGetProfile:  (params: unknown) => Promise<{ success: boolean; profile?: any; error?: string }>;
      employeeUpdateProfile:(params: unknown) => Promise<{ success: boolean; profile?: any; error?: string }>;
      employeeListByDepartment:(params: unknown) => Promise<{ success: boolean; profiles: any[]; error?: string }>;
      employeeDeleteProfile:(params: unknown) => Promise<{ success: boolean; error?: string }>;
      attendanceCheckIn:   (params?: unknown) => Promise<{ success: boolean; attendance?: any; error?: string }>;
      attendanceCheckOut:  (params?: unknown) => Promise<{ success: boolean; attendance?: any; error?: string }>;
      attendanceToday:     () => Promise<{ success: boolean; attendance?: any; error?: string }>;
      attendanceList:      (params: unknown) => Promise<{ success: boolean; list: any[]; error?: string }>;
      leaveCreate:         (params: unknown) => Promise<{ success: boolean; leave?: any; error?: string }>;
      leaveListMy:         () => Promise<{ success: boolean; leaves: any[]; error?: string }>;
      leaveListPending:    () => Promise<{ success: boolean; leaves: any[]; error?: string }>;
      leaveDecide:         (params: unknown) => Promise<{ success: boolean; leave?: any; error?: string }>;
      leaveCancel:         (params: unknown) => Promise<{ success: boolean; error?: string }>;
      licenseSeatStatus:   () => Promise<{ success: boolean; seat: { limit: number; used: number; remaining: number }; error?: string }>;
      notifyListInbox:     (params: unknown) => Promise<{ success: boolean; notifications: any[]; error?: string }>;
      notifyMarkRead:      (params: unknown) => Promise<{ success: boolean; error?: string }>;
      notifyMarkAllRead:   (params: unknown) => Promise<{ success: boolean; error?: string }>;
      notifyUnreadCount:   (params: unknown) => Promise<{ success: boolean; count: number; error?: string }>;
    };
  };
  licenseAPI: {
    verify: (email: string, licenseKey: string | null) => Promise<any>;
    register: (data: unknown) => Promise<any>;
    activateAfterRegister: (email: string, licenseKey: string) => Promise<any>;
    get: () => Promise<any>;
    logout: () => Promise<any>;
  };
}
}

function isErpPermissionDeniedResponse(result: any): boolean {
  if (!result || result.success !== false) return false;
  const errorText = String(result.error || '');
  return result.code === 'permission_denied' || /permission denied/i.test(errorText);
}

function normalizeErpPermissionMessage(rawError?: string): string {
  const message = String(rawError || '').trim();
  if (!message) {
    return 'Tài khoản hiện tại không có quyền thực hiện thao tác ERP này. Vui lòng liên hệ quản trị viên để được cấp quyền phù hợp.';
  }

  const actionMatch = message.match(/action="([^"]+)"/i);
  if (actionMatch?.[1]) {
    return `Bạn không có quyền thực hiện thao tác ERP: ${actionMatch[1]}. Vui lòng liên hệ quản trị viên để được cấp quyền.`;
  }

  const plainMatch = message.match(/permission denied:?\s*(.+)$/i);
  if (plainMatch?.[1]) {
    return `Bạn không có quyền thực hiện thao tác ERP: ${plainMatch[1]}. Vui lòng liên hệ quản trị viên để được cấp quyền.`;
  }

  return 'Tài khoản hiện tại không có quyền thực hiện thao tác ERP này. Vui lòng liên hệ quản trị viên để được cấp quyền phù hợp.';
}

function reportErpPermissionDenied(result: any) {
  const state = useAppStore.getState();
  state.showErpPermissionDialog({
    title: 'Bạn không có quyền thao tác ERP',
    message: normalizeErpPermissionMessage(result?.error),
    details: result?.error,
  });
}

function wrapErpApi<T extends Record<string, any> | undefined>(api: T): T {
  if (!api) return api;
  const wrapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(api)) {
    if (typeof value !== 'function') {
      wrapped[key] = value;
      continue;
    }
    wrapped[key] = async (...args: unknown[]) => {
      const result = await value(...args);
      if (isErpPermissionDeniedResponse(result)) {
        reportErpPermissionDenied(result);
      }
      return result;
    };
  }
  return wrapped as T;
}

const erp = wrapErpApi(window.electronAPI?.erp);

export const ipc = {
  login: window.electronAPI?.login,
  zalo: window.electronAPI?.zalo,
  db: window.electronAPI?.db,
  file: window.electronAPI?.file,
  app: window.electronAPI?.app,
  window: window.electronAPI?.window,
  shell: window.electronAPI?.shell,
  util: window.electronAPI?.util,
  crm: window.electronAPI?.crm,
  analytics: window.electronAPI?.analytics,
  workflow: window.electronAPI?.workflow,
  integration: window.electronAPI?.integration,
  ai: window.electronAPI?.ai,
  tunnel: window.electronAPI?.tunnel,
  employee: window.electronAPI?.employee,
  workspace: window.electronAPI?.workspace,
  sync: window.electronAPI?.sync,
  relay: window.electronAPI?.relay,
  fb: window.electronAPI?.fb,
  erp,
  on: window.electronAPI?.on,
  removeAllListeners: window.electronAPI?.removeAllListeners,
};

export default ipc;

