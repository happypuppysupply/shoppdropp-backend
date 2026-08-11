"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaService = exports.MetaService = void 0;
const axios_1 = __importDefault(require("axios"));
class MetaService {
    client;
    adAccountId;
    constructor(config) {
        this.adAccountId = config.adAccountId.replace('act_', '');
        const apiVersion = config.apiVersion || 'v18.0';
        this.client = axios_1.default.create({
            baseURL: `https://graph.facebook.com/${apiVersion}`,
            headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }
    // ============ CAMPAIGNS ============
    async getCampaigns(status) {
        const params = {
            fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time',
        };
        if (status)
            params.effective_status = status;
        const response = await this.client.get(`/act_${this.adAccountId}/campaigns`, { params });
        return response.data.data;
    }
    async createCampaign(campaign) {
        const response = await this.client.post(`/act_${this.adAccountId}/campaigns`, {
            name: campaign.name,
            objective: campaign.objective || 'CONVERSIONS',
            status: campaign.status || 'PAUSED',
            daily_budget: campaign.daily_budget,
            lifetime_budget: campaign.lifetime_budget,
            special_ad_categories: [],
        });
        return this.getCampaign(response.data.id);
    }
    async getCampaign(campaignId) {
        const response = await this.client.get(`/${campaignId}`, {
            params: {
                fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time',
            },
        });
        return response.data;
    }
    async updateCampaign(campaignId, updates) {
        await this.client.post(`/${campaignId}`, updates);
    }
    async deleteCampaign(campaignId) {
        await this.client.delete(`/${campaignId}`);
    }
    // ============ AD SETS ============
    async getAdSets(campaignId) {
        const params = {
            fields: 'id,name,campaign_id,status,targeting,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal',
        };
        const endpoint = campaignId
            ? `/${campaignId}/adsets`
            : `/act_${this.adAccountId}/adsets`;
        const response = await this.client.get(endpoint, { params });
        return response.data.data;
    }
    async createAdSet(adSet) {
        const response = await this.client.post(`/act_${this.adAccountId}/adsets`, {
            name: adSet.name,
            campaign_id: adSet.campaign_id,
            status: adSet.status || 'PAUSED',
            targeting: adSet.targeting,
            daily_budget: adSet.daily_budget,
            lifetime_budget: adSet.lifetime_budget,
            bid_amount: adSet.bid_amount,
            billing_event: adSet.billing_event || 'IMPRESSIONS',
            optimization_goal: adSet.optimization_goal || 'CONVERSIONS',
            destination_type: 'WEBSITE',
        });
        return this.getAdSet(response.data.id);
    }
    async getAdSet(adSetId) {
        const response = await this.client.get(`/${adSetId}`, {
            params: {
                fields: 'id,name,campaign_id,status,targeting,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal',
            },
        });
        return response.data;
    }
    // ============ ADS ============
    async getAds(adSetId) {
        const params = {
            fields: 'id,name,adset_id,status,creative,tracking_specs',
        };
        const endpoint = adSetId
            ? `/${adSetId}/ads`
            : `/act_${this.adAccountId}/ads`;
        const response = await this.client.get(endpoint, { params });
        return response.data.data;
    }
    async createAd(ad) {
        // First create the creative if not exists
        let creativeId = ad.creative?.id;
        if (!creativeId && ad.creative) {
            const creative = await this.createAdCreative(ad.creative);
            creativeId = creative.id;
        }
        const response = await this.client.post(`/act_${this.adAccountId}/ads`, {
            name: ad.name,
            adset_id: ad.adset_id,
            status: ad.status || 'PAUSED',
            creative: { creative_id: creativeId },
        });
        return this.getAd(response.data.id);
    }
    async getAd(adId) {
        const response = await this.client.get(`/${adId}`, {
            params: {
                fields: 'id,name,adset_id,status,creative,tracking_specs',
            },
        });
        return response.data;
    }
    // ============ AD CREATIVES ============
    async createAdCreative(creative) {
        const response = await this.client.post(`/act_${this.adAccountId}/adcreatives`, {
            name: creative.name || 'Creative',
            object_story_spec: creative.object_story_spec,
        });
        return { ...creative, id: response.data.id };
    }
    // ============ INSIGHTS / ANALYTICS ============
    async getInsights(level = 'campaign', datePreset = 'last_30d', fields) {
        const defaultFields = [
            'impressions',
            'clicks',
            'spend',
            'ctr',
            'cpc',
            'conversions',
            'actions',
        ];
        const params = {
            level,
            date_preset: datePreset,
            fields: (fields || defaultFields).join(','),
        };
        const response = await this.client.get(`/act_${this.adAccountId}/insights`, { params });
        return response.data.data;
    }
    async getCampaignInsights(campaignId, datePreset = 'last_30d') {
        const response = await this.client.get(`/${campaignId}/insights`, {
            params: {
                date_preset: datePreset,
                fields: 'impressions,clicks,spend,ctr,cpc,conversions,actions',
            },
        });
        return response.data.data;
    }
    // ============ AUDIENCES ============
    async getCustomAudiences() {
        const response = await this.client.get(`/act_${this.adAccountId}/customaudiences`, {
            params: { fields: 'id,name,approximate_count' },
        });
        return response.data.data;
    }
    async createCustomAudience(name, description) {
        const response = await this.client.post(`/act_${this.adAccountId}/customaudiences`, {
            name,
            description,
            subtype: 'CUSTOM',
        });
        return response.data;
    }
    // ============ TARGETING SUGGESTIONS ============
    async searchTargeting(query, type = 'interest') {
        const response = await this.client.get('/search', {
            params: {
                q: query,
                type,
                access_token: this.client.defaults.headers['Authorization'].replace('Bearer ', ''),
            },
        });
        return response.data.data;
    }
    // ============ AI AUTOMATION METHODS ============
    async createCampaignFromTemplate(template) {
        // 1. Create campaign
        const campaign = await this.createCampaign({
            name: template.name,
            objective: template.objective,
            status: 'PAUSED',
            daily_budget: (template.budget * 100).toString(), // Convert to cents
        });
        // 2. Create ad set
        const adSet = await this.createAdSet({
            name: `${template.name} - Ad Set`,
            campaign_id: campaign.id,
            status: 'PAUSED',
            targeting: template.targeting,
            daily_budget: (template.budget * 100).toString(),
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'CONVERSIONS',
        });
        // 3. Create ad
        const ad = await this.createAd({
            name: `${template.name} - Ad`,
            adset_id: adSet.id,
            status: 'PAUSED',
            creative: template.creative,
        });
        return { campaign, adSet, ad };
    }
    async optimizeCampaign(campaignId, targetCpa) {
        // Get current insights
        const insights = await this.getCampaignInsights(campaignId, 'last_7d');
        if (insights.length === 0)
            return;
        const latest = insights[0];
        const currentCpa = parseFloat(latest.spend) / (parseInt(latest.conversions?.[0]?.value || '1'));
        // Adjust bid based on performance
        const adSets = await this.getAdSets(campaignId);
        for (const adSet of adSets) {
            if (currentCpa > targetCpa) {
                // Reduce bid if CPA is too high
                const newBid = Math.floor((adSet.bid_amount || 1000) * 0.9);
                await this.client.post(`/${adSet.id}`, { bid_amount: newBid });
            }
            else if (currentCpa < targetCpa * 0.8) {
                // Increase bid if CPA is good
                const newBid = Math.floor((adSet.bid_amount || 1000) * 1.1);
                await this.client.post(`/${adSet.id}`, { bid_amount: newBid });
            }
        }
    }
    // ============ UTILITY ============
    async getAccountInfo() {
        const response = await this.client.get(`/act_${this.adAccountId}`, {
            params: {
                fields: 'id,name,account_status,currency,timezone_name,spend_cap,amount_spent',
            },
        });
        return response.data;
    }
}
exports.MetaService = MetaService;
const createMetaService = (config) => new MetaService(config);
exports.createMetaService = createMetaService;
//# sourceMappingURL=metaService.js.map