// ─── CRM Types ────────────────────────────────────────────────────────────────

export type CRMCampaignStatus = 'draft' | 'active' | 'queued' | 'paused' | 'paused_quota' | 'paused_quiet' | 'done';
export type PhoneScanBatchStatus = 'draft' | 'active' | 'queued' | 'paused' | 'completed';
export type CRMContactStatus = 'pending' | 'sending' | 'sent' | 'failed';
export type CRMCampaignType = 'message' | 'friend_request' | 'mixed' | 'invite_to_group';

export interface CRMNote {
    id?: number;
    owner_zalo_id: string;
    contact_id: string;
    contact_type?: string;
    content: string;
    topic_id?: string | null;
    created_at?: number;
    updated_at?: number;
}

export interface CRMCampaign {
    id?: number;
    owner_zalo_id: string;
    name: string;
    template_message: string;
    friend_request_message: string;
    campaign_type: CRMCampaignType;
    mixed_config?: string;
    status: CRMCampaignStatus;
    priority?: 'high' | 'normal';
    queued_at?: number;
    pause_reason?: 'user_manual' | 'daily_quota' | 'quiet_hours' | null;
    queue_position?: number;
    delay_seconds: number;
    delay_min_seconds?: number;
    delay_max_seconds?: number;
    per_contact_delay_min_seconds?: number;
    per_contact_delay_max_seconds?: number;
    daily_send_limit?: number;
    daily_start_time?: string;
    scheduled_start_at?: number;
    created_at?: number;
    updated_at?: number;
    total_contacts?: number;
    sent_count?: number;
    pending_count?: number;
    failed_count?: number;
    sent_today_count?: number;
    quiet_hours_enabled?: number;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
}

export interface CRMCampaignContact {
    id?: number;
    campaign_id: number;
    owner_zalo_id: string;
    contact_id: string;
    display_name?: string;
    avatar?: string;
    phone?: string;
    status: CRMContactStatus;
    sent_at?: number;
    retry_count?: number;
    error?: string;
    template_message?: string;
    delay_seconds?: number;
    campaign_type?: CRMCampaignType;
    friend_request_message?: string;
}

export interface CRMSendLog {
    id?: number;
    owner_zalo_id: string;
    contact_id: string;
    display_name?: string;
    phone?: string;
    contact_type?: string;
    campaign_id?: number;
    message: string;
    sent_at: number;
    status: 'sent' | 'failed';
    error?: string;
    data_request?: string;
    data_response?: string;
    send_type?: string;
}

export interface CRMTag {
    id?: number;
    owner_zalo_id: string;
    name: string;
    color: string;
    emoji: string;
    created_at: number;
}

export interface CRMContactTag {
    id?: number;
    owner_zalo_id: string;
    contact_id: string;
    tag_id: number;
}
