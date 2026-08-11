"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
const OPENWEBNINJA_BASE_URL = 'https://api.openwebninja.com';
// Service configurations with their test endpoints
const SERVICE_CONFIGS = {
    amazon: {
        name: 'Real-Time Amazon Data',
        searchEndpoint: '/realtime-amazon-data/search',
        testParam: { query: 'test', page: 1 }
    },
    walmart: {
        name: 'Real-Time Walmart Data',
        searchEndpoint: '/real-time-walmart-data/search',
        testParam: { query: 'test', page: 1 }
    },
    ebay: {
        name: 'Real-Time eBay Data',
        searchEndpoint: '/real-time-ebay-data/search',
        testParam: { query: 'test', page: 1 }
    },
    product_search: {
        name: 'Real-Time Product Search',
        searchEndpoint: '/realtime-product-search/search-light-v2',
        testParam: { q: 'test', page: 1 }
    },
    ecommerce: {
        name: 'Real-Time E-commerce Data',
        searchEndpoint: '/realtime-ecommerce-data/amazon/search',
        testParam: { query: 'test', page: 1 }
    },
};
// Configure a specific OpenWeb Ninja API
router.post('/configure/:service', auth_1.authenticate, (0, express_validator_1.body)('apiKey').notEmpty().withMessage('API key is required'), async (req, res) => {
    try {
        const user = req.user;
        const { apiKey } = req.body;
        const { service } = req.params;
        const { storeId } = req.query;
        // Validate service
        if (!SERVICE_CONFIGS[service]) {
            return res.status(400).json({
                error: 'Invalid service',
                validServices: Object.keys(SERVICE_CONFIGS)
            });
        }
        // Validate the API key with a test call
        const isValid = await validateApiKey(apiKey, service);
        if (!isValid) {
            return res.status(400).json({ error: `Invalid API key for ${service}` });
        }
        // Find store
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const targetStore = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!targetStore) {
            return res.status(404).json({ error: 'Store not found' });
        }
        // Save to credentials with service-specific type
        await supabase_1.db.upsertCredentials({
            store_id: targetStore.id,
            service_type: `openwebninja_${service}`,
            api_key: apiKey,
        });
        res.json({
            success: true,
            message: `OpenWeb Ninja ${SERVICE_CONFIGS[service].name} configured`,
            service,
            storeId: targetStore.id,
        });
    }
    catch (error) {
        console.error('OpenWeb Ninja config error:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});
// Configure all OpenWeb Ninja APIs at once
router.post('/configure-all', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { apiKeys, storeId } = req.body; // apiKeys: { amazon?: string, walmart?: string, ... }
        if (!apiKeys || typeof apiKeys !== 'object') {
            return res.status(400).json({ error: 'apiKeys object is required' });
        }
        // Find store
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const targetStore = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!targetStore) {
            return res.status(404).json({ error: 'Store not found' });
        }
        const results = {};
        // Configure each provided API key
        for (const [service, apiKey] of Object.entries(apiKeys)) {
            if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
                continue; // Skip empty keys
            }
            if (!SERVICE_CONFIGS[service]) {
                results[service] = { success: false, error: 'Invalid service' };
                continue;
            }
            try {
                // Validate the API key
                const isValid = await validateApiKey(apiKey, service);
                if (!isValid) {
                    results[service] = { success: false, error: 'Invalid API key' };
                    continue;
                }
                // Save to credentials
                await supabase_1.db.upsertCredentials({
                    store_id: targetStore.id,
                    service_type: `openwebninja_${service}`,
                    api_key: apiKey,
                });
                results[service] = { success: true };
            }
            catch (e) {
                results[service] = { success: false, error: e.message };
            }
        }
        res.json({
            success: true,
            message: 'OpenWeb Ninja APIs configured',
            results,
            storeId: targetStore.id,
        });
    }
    catch (error) {
        console.error('OpenWeb Ninja configure-all error:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});
// Get OpenWeb Ninja config for all services
router.get('/config', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.query;
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const targetStore = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!targetStore) {
            return res.json({ configured: false, services: {} });
        }
        const creds = await supabase_1.db.getCredentialsByStore(targetStore.id);
        const services = {};
        // Check each service
        for (const service of Object.keys(SERVICE_CONFIGS)) {
            const serviceCreds = creds.find(c => c.service_type === `openwebninja_${service}`);
            services[service] = !!serviceCreds?.api_key;
        }
        const anyConfigured = Object.values(services).some(v => v);
        res.json({
            configured: anyConfigured,
            services,
            storeId: targetStore.id,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
});
// Search products across platforms
router.post('/search', auth_1.authenticate, [
    (0, express_validator_1.body)('platform').isIn(['amazon', 'walmart', 'ebay', 'product_search', 'ecommerce']).withMessage('Invalid platform'),
    (0, express_validator_1.body)('query').notEmpty().withMessage('Query is required'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = req.user;
        const { platform, query, page = 1, country = 'US', sort_by = 'RELEVANCE' } = req.body;
        const { storeId } = req.query;
        // Map platform to service
        const serviceMap = {
            amazon: 'amazon',
            walmart: 'walmart',
            ebay: 'ebay',
            product_search: 'product_search',
            ecommerce: 'ecommerce',
        };
        const service = serviceMap[platform];
        // Get API key from store credentials
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const targetStore = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!targetStore) {
            return res.status(404).json({ error: 'Store not found' });
        }
        const creds = await supabase_1.db.getCredentialsByStore(targetStore.id);
        const serviceCreds = creds.find(c => c.service_type === `openwebninja_${service}`);
        if (!serviceCreds?.api_key) {
            return res.status(400).json({
                error: `OpenWeb Ninja ${SERVICE_CONFIGS[service].name} not configured. Please add your API key in Settings > Integrations.`
            });
        }
        // Build request
        const config = SERVICE_CONFIGS[service];
        let params = {};
        if (service === 'product_search') {
            params = { q: query, page };
        }
        else {
            params = { query, country, sort_by, page };
        }
        const response = await axios_1.default.get(`${OPENWEBNINJA_BASE_URL}${config.searchEndpoint}`, {
            headers: {
                'X-API-Key': serviceCreds.api_key,
            },
            params,
            timeout: 30000,
        });
        res.json({
            success: true,
            platform,
            query,
            results: response.data,
        });
    }
    catch (error) {
        console.error('OpenWeb Ninja search error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Search failed',
            details: error.response?.data?.message || error.message,
        });
    }
});
// Get product details
router.get('/product/:platform/:id', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { platform, id } = req.params;
        const { storeId } = req.query;
        // Map platform to service
        const serviceMap = {
            amazon: 'amazon',
            walmart: 'walmart',
            ebay: 'ebay',
        };
        const service = serviceMap[platform];
        if (!service) {
            return res.status(400).json({ error: 'Invalid platform for product details' });
        }
        // Get API key
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const targetStore = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!targetStore) {
            return res.status(404).json({ error: 'Store not found' });
        }
        const creds = await supabase_1.db.getCredentialsByStore(targetStore.id);
        const serviceCreds = creds.find(c => c.service_type === `openwebninja_${service}`);
        if (!serviceCreds?.api_key) {
            return res.status(400).json({
                error: `OpenWeb Ninja ${SERVICE_CONFIGS[service].name} not configured`
            });
        }
        // Build endpoint
        let endpoint = '';
        let params = {};
        switch (platform) {
            case 'amazon':
                endpoint = '/realtime-amazon-data/product-details';
                params = { asin: id };
                break;
            case 'walmart':
                endpoint = '/real-time-walmart-data/product-details';
                params = { id };
                break;
            case 'ebay':
                endpoint = '/real-time-ebay-data/product-details';
                params = { item_id: id };
                break;
        }
        const response = await axios_1.default.get(`${OPENWEBNINJA_BASE_URL}${endpoint}`, {
            headers: {
                'X-API-Key': serviceCreds.api_key,
            },
            params,
            timeout: 30000,
        });
        res.json({
            success: true,
            platform,
            productId: id,
            data: response.data,
        });
    }
    catch (error) {
        console.error('Product details error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch product details',
            details: error.response?.data?.message || error.message,
        });
    }
});
// Trending products search
router.post('/trending', auth_1.authenticate, [
    (0, express_validator_1.body)('category').optional(),
], async (req, res) => {
    try {
        const user = req.user;
        const { category, limit = 20 } = req.body;
        const { storeId } = req.query;
        // Get API key (prefer Amazon if available)
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const targetStore = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!targetStore) {
            return res.status(404).json({ error: 'Store not found' });
        }
        const creds = await supabase_1.db.getCredentialsByStore(targetStore.id);
        // Try to find any configured service
        let serviceCreds = creds.find(c => c.service_type === 'openwebninja_amazon');
        if (!serviceCreds) {
            serviceCreds = creds.find(c => c.service_type?.startsWith('openwebninja_'));
        }
        if (!serviceCreds?.api_key) {
            return res.status(400).json({
                error: 'No OpenWeb Ninja APIs configured. Please add at least one API key in Settings > Integrations.'
            });
        }
        // Search for trending products (high sales volume indicators)
        const queries = category
            ? [`${category} bestseller`, `${category} trending`]
            : ['bestseller', 'trending products', 'top rated'];
        const results = await Promise.all(queries.map(q => axios_1.default.get(`${OPENWEBNINJA_BASE_URL}/realtime-amazon-data/search`, {
            headers: { 'X-API-Key': serviceCreds.api_key },
            params: { query: q, sort_by: 'RELEVANCE', page: 1 },
            timeout: 30000,
        })));
        // Combine and deduplicate results
        const allProducts = results.flatMap(r => r.data.data?.products || []);
        const uniqueProducts = allProducts.filter((p, i, arr) => arr.findIndex((t) => t.asin === p.asin) === i);
        // Sort by sales volume/ratings
        const sorted = uniqueProducts
            .sort((a, b) => {
            const aSales = parseInt(a.sales_volume?.replace(/[^0-9]/g, '') || '0');
            const bSales = parseInt(b.sales_volume?.replace(/[^0-9]/g, '') || '0');
            return bSales - aSales;
        })
            .slice(0, limit);
        res.json({
            success: true,
            category: category || 'general',
            trending: sorted,
            total: sorted.length,
        });
    }
    catch (error) {
        console.error('Trending search error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch trending products',
            details: error.response?.data?.message || error.message,
        });
    }
});
// Validate API key helper
async function validateApiKey(apiKey, service) {
    try {
        const config = SERVICE_CONFIGS[service];
        const response = await axios_1.default.get(`${OPENWEBNINJA_BASE_URL}${config.searchEndpoint}`, {
            headers: { 'X-API-Key': apiKey },
            params: config.testParam,
            timeout: 10000,
        });
        return response.status === 200;
    }
    catch (error) {
        // Check if it's an auth error vs other error
        if (error.response?.status === 401 || error.response?.status === 403) {
            return false;
        }
        // For other errors, assume key might be valid (rate limits, etc)
        return true;
    }
}
exports.default = router;
//# sourceMappingURL=openwebninja.js.map