"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const shopifyService_1 = require("../services/shopifyService");
const metaService_1 = require("../services/metaService");
const cjDropshippingService_1 = require("../services/cjDropshippingService");
const githubService_1 = require("../services/githubService");
const vercelService_1 = require("../services/vercelService");
const supabaseService_1 = require("../services/supabaseService");
const router = (0, express_1.Router)();
// ============ SHOPIFY INTEGRATION ============
// Connect Shopify store
router.post('/shopify/connect', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, shopDomain, accessToken } = req.body;
        if (!storeId || !shopDomain || !accessToken) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Verify store belongs to user
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Store not found or access denied' });
        }
        // Test connection
        const shopify = (0, shopifyService_1.createShopifyService)({ shopDomain, accessToken });
        const shopInfo = await shopify.getShopInfo();
        // Save credentials
        await supabase_1.db.saveIntegrationCredential(storeId, 'shopify', {
            shopDomain,
            accessToken,
            shopInfo: {
                name: shopInfo.name,
                email: shopInfo.email,
                currency: shopInfo.currency,
                timezone: shopInfo.iana_timezone,
            },
        });
        res.json({
            success: true,
            message: 'Shopify connected successfully',
            shop: {
                name: shopInfo.name,
                domain: shopDomain,
                currency: shopInfo.currency,
            },
        });
    }
    catch (error) {
        console.error('[Integrations] Shopify connect error:', error);
        res.status(500).json({ error: 'Failed to connect Shopify', details: error.message });
    }
});
// Get Shopify products
router.get('/shopify/products/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { limit = 50, pageInfo } = req.query;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'shopify');
        if (!credentials) {
            return res.status(404).json({ error: 'Shopify not connected' });
        }
        const shopify = (0, shopifyService_1.createShopifyService)({
            shopDomain: credentials.data.shopDomain,
            accessToken: credentials.data.accessToken,
        });
        const products = await shopify.getProducts(parseInt(limit), pageInfo);
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Sync inventory
router.post('/shopify/sync-inventory/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Get Shopify credentials
        const shopifyCreds = await supabase_1.db.getIntegrationCredential(storeId, 'shopify');
        if (!shopifyCreds) {
            return res.status(404).json({ error: 'Shopify not connected' });
        }
        // Get CJ credentials
        const cjCreds = await supabase_1.db.getIntegrationCredential(storeId, 'cj_dropshipping');
        if (!cjCreds) {
            return res.status(404).json({ error: 'CJ Dropshipping not connected' });
        }
        const shopify = (0, shopifyService_1.createShopifyService)({
            shopDomain: shopifyCreds.data.shopDomain,
            accessToken: shopifyCreds.data.accessToken,
        });
        const cj = (0, cjDropshippingService_1.createCJDropshippingService)({ apiKey: cjCreds.data.apiKey });
        // Get all Shopify products with SKUs
        const { products } = await shopify.getProducts(250);
        const skuMap = [];
        for (const product of products) {
            for (const variant of product.variants) {
                if (variant.sku) {
                    skuMap.push({
                        sku: variant.sku,
                        variantId: variant.id,
                        inventoryItemId: 0, // Would need to fetch inventory item ID
                    });
                }
            }
        }
        // Get CJ inventory
        // This is a simplified version - in production you'd map SKUs properly
        res.json({
            success: true,
            message: 'Inventory sync started',
            productsToSync: skuMap.length,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ META ADS INTEGRATION ============
// Connect Meta Ads
router.post('/meta/connect', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, accessToken, adAccountId } = req.body;
        if (!storeId || !accessToken || !adAccountId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Test connection
        const meta = (0, metaService_1.createMetaService)({ accessToken, adAccountId });
        const accountInfo = await meta.getAccountInfo();
        await supabase_1.db.saveIntegrationCredential(storeId, 'meta', {
            accessToken,
            adAccountId,
            accountInfo: {
                name: accountInfo.name,
                currency: accountInfo.currency,
                timezone: accountInfo.timezone_name,
            },
        });
        res.json({
            success: true,
            message: 'Meta Ads connected',
            account: {
                name: accountInfo.name,
                id: adAccountId,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get campaigns
router.get('/meta/campaigns/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { status } = req.query;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'meta');
        if (!credentials) {
            return res.status(404).json({ error: 'Meta not connected' });
        }
        const meta = (0, metaService_1.createMetaService)({
            accessToken: credentials.data.accessToken,
            adAccountId: credentials.data.adAccountId,
        });
        const campaigns = await meta.getCampaigns(status);
        res.json({ campaigns });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create campaign
router.post('/meta/campaigns/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { name, objective, budget, targeting, creative } = req.body;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'meta');
        if (!credentials) {
            return res.status(404).json({ error: 'Meta not connected' });
        }
        const meta = (0, metaService_1.createMetaService)({
            accessToken: credentials.data.accessToken,
            adAccountId: credentials.data.adAccountId,
        });
        const result = await meta.createCampaignFromTemplate({
            name,
            objective: objective || 'CONVERSIONS',
            budget,
            targeting,
            creative,
        });
        res.json({
            success: true,
            campaign: result.campaign,
            adSet: result.adSet,
            ad: result.ad,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get insights
router.get('/meta/insights/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { datePreset = 'last_30d' } = req.query;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'meta');
        if (!credentials) {
            return res.status(404).json({ error: 'Meta not connected' });
        }
        const meta = (0, metaService_1.createMetaService)({
            accessToken: credentials.data.accessToken,
            adAccountId: credentials.data.adAccountId,
        });
        const insights = await meta.getInsights('campaign', datePreset);
        res.json({ insights });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ CJ DROPSHIPPING INTEGRATION ============
// Connect CJ Dropshipping
router.post('/cj/connect', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, apiKey, email } = req.body;
        if (!storeId || !apiKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Test connection
        const cj = (0, cjDropshippingService_1.createCJDropshippingService)({ apiKey, email });
        const userInfo = await cj.getUserInfo();
        await supabase_1.db.saveIntegrationCredential(storeId, 'cj_dropshipping', {
            apiKey,
            email,
            userInfo: {
                name: userInfo.firstName + ' ' + userInfo.lastName,
                balance: userInfo.balance,
            },
        });
        res.json({
            success: true,
            message: 'CJ Dropshipping connected',
            user: userInfo,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Search CJ products
router.get('/cj/products/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { keywords, category, minPrice, maxPrice } = req.query;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'cj_dropshipping');
        if (!credentials) {
            return res.status(404).json({ error: 'CJ not connected' });
        }
        const cj = (0, cjDropshippingService_1.createCJDropshippingService)({ apiKey: credentials.data.apiKey });
        const results = await cj.searchProducts({
            keywords: keywords,
            categoryName: category,
            minPrice: minPrice ? parseFloat(minPrice) : undefined,
            maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
            pageSize: 20,
        });
        res.json(results);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Find winning products
router.get('/cj/winning-products/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { category, minListedNum = 100 } = req.query;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'cj_dropshipping');
        if (!credentials) {
            return res.status(404).json({ error: 'CJ not connected' });
        }
        const cj = (0, cjDropshippingService_1.createCJDropshippingService)({ apiKey: credentials.data.apiKey });
        const products = await cj.findWinningProducts({
            category: category,
            minListedNum: parseInt(minListedNum),
        });
        res.json({ products });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ GITHUB INTEGRATION ============
// Connect GitHub
router.post('/github/connect', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, token } = req.body;
        if (!storeId || !token) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Test connection
        const github = (0, githubService_1.createGitHubService)({ token });
        const userInfo = await github.getAuthenticatedUser();
        await supabase_1.db.saveIntegrationCredential(storeId, 'github', {
            token,
            userInfo: {
                login: userInfo.login,
                name: userInfo.name,
                email: userInfo.email,
            },
        });
        res.json({
            success: true,
            message: 'GitHub connected',
            user: {
                login: userInfo.login,
                name: userInfo.name,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get repositories
router.get('/github/repos/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'github');
        if (!credentials) {
            return res.status(404).json({ error: 'GitHub not connected' });
        }
        const github = (0, githubService_1.createGitHubService)({ token: credentials.data.token });
        const repos = await github.getRepositories();
        res.json({ repositories: repos });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create theme repository
router.post('/github/create-theme/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { themeFiles } = req.body;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'github');
        if (!credentials) {
            return res.status(404).json({ error: 'GitHub not connected' });
        }
        const github = (0, githubService_1.createGitHubService)({ token: credentials.data.token });
        const repo = await github.createThemeRepository(store.name, themeFiles);
        res.json({
            success: true,
            repository: repo,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ VERCEL INTEGRATION ============
// Connect Vercel
router.post('/vercel/connect', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, token, teamId } = req.body;
        if (!storeId || !token) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Test connection
        const vercel = (0, vercelService_1.createVercelService)({ token, teamId });
        const userInfo = await vercel.getUser();
        await supabase_1.db.saveIntegrationCredential(storeId, 'vercel', {
            token,
            teamId,
            userInfo: {
                username: userInfo.username,
                email: userInfo.email,
            },
        });
        res.json({
            success: true,
            message: 'Vercel connected',
            user: userInfo,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get projects
router.get('/vercel/projects/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'vercel');
        if (!credentials) {
            return res.status(404).json({ error: 'Vercel not connected' });
        }
        const vercel = (0, vercelService_1.createVercelService)({
            token: credentials.data.token,
            teamId: credentials.data.teamId,
        });
        const projects = await vercel.getProjects();
        res.json({ projects });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Deploy store frontend
router.post('/vercel/deploy/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { config } = req.body;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'vercel');
        if (!credentials) {
            return res.status(404).json({ error: 'Vercel not connected' });
        }
        const vercel = (0, vercelService_1.createVercelService)({
            token: credentials.data.token,
            teamId: credentials.data.teamId,
        });
        const result = await vercel.deployStoreFrontend(store.name, config);
        res.json({
            success: true,
            project: result.project,
            deployment: result.deployment,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ GET ALL INTEGRATION STATUS ============
router.get('/status/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const integrations = await supabase_1.db.getIntegrationCredentials(storeId);
        const status = {
            shopify: integrations.find((i) => i.type === 'shopify')?.data ? true : false,
            meta: integrations.find((i) => i.type === 'meta')?.data ? true : false,
            cj_dropshipping: integrations.find((i) => i.type === 'cj_dropshipping')?.data ? true : false,
            github: integrations.find((i) => i.type === 'github')?.data ? true : false,
            vercel: integrations.find((i) => i.type === 'vercel')?.data ? true : false,
            supabase: integrations.find((i) => i.type === 'supabase')?.data ? true : false,
        };
        res.json({ status, integrations: integrations.map((i) => ({ type: i.type, connected: true })) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ SUPABASE INTEGRATION ============
// Connect Supabase
router.post('/supabase/connect', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, url, serviceKey } = req.body;
        if (!storeId || !url || !serviceKey) {
            return res.status(400).json({ error: 'Missing required fields: storeId, url, serviceKey' });
        }
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Test connection
        const supabase = (0, supabaseService_1.createSupabaseService)({ url, serviceKey });
        const stats = await supabase.getStats();
        await supabase_1.db.saveIntegrationCredential(storeId, 'supabase', {
            url,
            serviceKey,
            stats,
        });
        res.json({
            success: true,
            message: 'Supabase connected',
            stats,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Setup store database tables
router.post('/supabase/setup-store/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'supabase');
        if (!credentials) {
            return res.status(404).json({ error: 'Supabase not connected' });
        }
        const supabase = (0, supabaseService_1.createSupabaseService)({
            url: credentials.data.url,
            serviceKey: credentials.data.serviceKey,
        });
        await supabase.setupStoreDatabase(storeId, store.name);
        res.json({
            success: true,
            message: 'Store database setup complete',
            tables: [
                `store_${storeId}_products`,
                `store_${storeId}_orders`,
                `store_${storeId}_analytics`,
                `store_${storeId}_campaigns`,
            ],
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create storage buckets
router.post('/supabase/create-buckets/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'supabase');
        if (!credentials) {
            return res.status(404).json({ error: 'Supabase not connected' });
        }
        const supabase = (0, supabaseService_1.createSupabaseService)({
            url: credentials.data.url,
            serviceKey: credentials.data.serviceKey,
        });
        const buckets = [];
        try {
            const productsBucket = await supabase.createBucket(`store-${storeId}-products`, { public: true });
            buckets.push(productsBucket);
        }
        catch (e) {
            if (!e.message?.includes('already exists'))
                throw e;
        }
        try {
            const assetsBucket = await supabase.createBucket(`store-${storeId}-assets`, { public: true });
            buckets.push(assetsBucket);
        }
        catch (e) {
            if (!e.message?.includes('already exists'))
                throw e;
        }
        res.json({
            success: true,
            message: 'Storage buckets created',
            buckets,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get Supabase stats
router.get('/supabase/stats/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const credentials = await supabase_1.db.getIntegrationCredential(storeId, 'supabase');
        if (!credentials) {
            return res.status(404).json({ error: 'Supabase not connected' });
        }
        const supabase = (0, supabaseService_1.createSupabaseService)({
            url: credentials.data.url,
            serviceKey: credentials.data.serviceKey,
        });
        const stats = await supabase.getStats();
        const buckets = await supabase.getBuckets();
        res.json({
            stats,
            buckets,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=integrations.js.map