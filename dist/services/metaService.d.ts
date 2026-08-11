export interface MetaConfig {
    accessToken: string;
    adAccountId: string;
    apiVersion?: string;
}
export interface MetaCampaign {
    id: string;
    name: string;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
    objective: string;
    daily_budget?: string;
    lifetime_budget?: string;
    start_time?: string;
    stop_time?: string;
    created_time: string;
}
export interface MetaAdSet {
    id: string;
    name: string;
    campaign_id: string;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
    targeting: MetaTargeting;
    daily_budget?: string;
    lifetime_budget?: string;
    bid_amount?: number;
    billing_event: string;
    optimization_goal: string;
}
export interface MetaTargeting {
    geo_locations?: {
        countries?: string[];
        regions?: {
            key: string;
        }[];
        cities?: {
            key: string;
            radius: number;
            distance_unit: string;
        }[];
    };
    age_min?: number;
    age_max?: number;
    genders?: number[];
    interests?: {
        id: string;
        name: string;
    }[];
    behaviors?: {
        id: string;
        name: string;
    }[];
    custom_audiences?: {
        id: string;
    }[];
    excluded_custom_audiences?: {
        id: string;
    }[];
}
export interface MetaAd {
    id: string;
    name: string;
    adset_id: string;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
    creative: MetaAdCreative;
    tracking_specs?: any[];
}
export interface MetaAdCreative {
    id?: string;
    name?: string;
    object_story_spec: {
        page_id: string;
        link_data?: {
            link: string;
            message: string;
            name?: string;
            description?: string;
            image_hash?: string;
            call_to_action?: {
                type: string;
            };
        };
        video_data?: {
            video_id: string;
            message: string;
            call_to_action?: {
                type: string;
            };
        };
    };
}
export interface MetaInsights {
    date_start: string;
    date_stop: string;
    account_id?: string;
    campaign_id?: string;
    adset_id?: string;
    ad_id?: string;
    impressions: string;
    clicks: string;
    spend: string;
    ctr: string;
    cpc: string;
    conversions?: any[];
    actions?: any[];
}
export declare class MetaService {
    private client;
    private adAccountId;
    constructor(config: MetaConfig);
    getCampaigns(status?: string): Promise<MetaCampaign[]>;
    createCampaign(campaign: Partial<MetaCampaign>): Promise<MetaCampaign>;
    getCampaign(campaignId: string): Promise<MetaCampaign>;
    updateCampaign(campaignId: string, updates: Partial<MetaCampaign>): Promise<void>;
    deleteCampaign(campaignId: string): Promise<void>;
    getAdSets(campaignId?: string): Promise<MetaAdSet[]>;
    createAdSet(adSet: Partial<MetaAdSet>): Promise<MetaAdSet>;
    getAdSet(adSetId: string): Promise<MetaAdSet>;
    getAds(adSetId?: string): Promise<MetaAd[]>;
    createAd(ad: Partial<MetaAd>): Promise<MetaAd>;
    getAd(adId: string): Promise<MetaAd>;
    createAdCreative(creative: MetaAdCreative): Promise<MetaAdCreative>;
    getInsights(level?: 'account' | 'campaign' | 'adset' | 'ad', datePreset?: string, fields?: string[]): Promise<MetaInsights[]>;
    getCampaignInsights(campaignId: string, datePreset?: string): Promise<MetaInsights[]>;
    getCustomAudiences(): Promise<any[]>;
    createCustomAudience(name: string, description?: string): Promise<any>;
    searchTargeting(query: string, type?: 'interest' | 'behavior' | 'education_schools'): Promise<any[]>;
    createCampaignFromTemplate(template: {
        name: string;
        objective: string;
        budget: number;
        targeting: MetaTargeting;
        creative: MetaAdCreative;
    }): Promise<{
        campaign: MetaCampaign;
        adSet: MetaAdSet;
        ad: MetaAd;
    }>;
    optimizeCampaign(campaignId: string, targetCpa: number): Promise<void>;
    getAccountInfo(): Promise<any>;
}
export declare const createMetaService: (config: MetaConfig) => MetaService;
//# sourceMappingURL=metaService.d.ts.map