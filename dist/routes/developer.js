"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const storeDeveloper_1 = require("../services/storeDeveloper");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Start full store development
router.post('/develop-store', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, shopifyToken, githubToken, vercelToken, cjApiKey, metaAccessToken, metaAdAccountId, } = req.body;
        if (!storeId) {
            return res.status(400).json({ error: 'Store ID required' });
        }
        // Get store details
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Store not found or access denied' });
        }
        // Get credentials (use provided or fall back to saved)
        const getCredential = async (type, provided) => {
            if (provided)
                return provided;
            const cred = await supabase_1.db.getUserCredential(user.id, type);
            return cred?.data?.token || cred?.data?.accessToken || cred?.data?.apiKey;
        };
        // Start development
        const developmentPromise = storeDeveloper_1.storeDeveloper.developStore({
            storeId,
            userId: user.id,
            storeName: store.name,
            shopifyDomain: store.url?.replace('https://', '').replace('http://', '') || '',
            shopifyToken: await getCredential('shopify', shopifyToken),
            githubToken: await getCredential('github', githubToken),
            vercelToken: await getCredential('vercel', vercelToken),
            cjApiKey: await getCredential('cj_dropshipping', cjApiKey),
            metaAccessToken: metaAccessToken || (await supabase_1.db.getUserCredential(user.id, 'meta'))?.data?.accessToken,
            metaAdAccountId: metaAdAccountId || (await supabase_1.db.getUserCredential(user.id, 'meta'))?.data?.adAccountId,
            supabaseUrl: process.env.SUPABASE_URL || '',
            supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
        });
        // Return immediately with task status
        res.json({
            success: true,
            message: 'Store development started',
            storeId,
            tasks: [
                { id: 'infrastructure', name: 'Setting up infrastructure', status: 'pending' },
                { id: 'database', name: 'Configuring database', status: 'pending' },
                { id: 'shopify', name: 'Connecting Shopify store', status: 'pending' },
                { id: 'products', name: 'Researching and importing products', status: 'pending' },
                { id: 'theme', name: 'Building custom theme', status: 'pending' },
                { id: 'landing', name: 'Creating landing pages', status: 'pending' },
                { id: 'meta', name: 'Setting up Meta advertising', status: 'pending' },
                { id: 'communication', name: 'Configuring communication channels', status: 'pending' },
                { id: 'workers', name: 'Deploying AI workers', status: 'pending' },
                { id: 'launch', name: 'Launching store', status: 'pending' },
            ],
        });
        // Continue development in background
        developmentPromise.catch((error) => {
            console.error('[Developer] Background development failed:', error);
        });
    }
    catch (error) {
        console.error('[Developer] Development error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get development status
router.get('/status/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const tasks = storeDeveloper_1.storeDeveloper.getTasks();
        res.json({
            storeId,
            storeName: store.name,
            tasks: tasks.map(t => ({
                id: t.id,
                type: t.type,
                status: t.status,
                progress: t.progress,
                message: t.message,
                startedAt: t.startedAt,
                completedAt: t.completedAt,
                error: t.error,
            })),
            overallProgress: tasks.length > 0
                ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
                : 0,
            isComplete: tasks.length > 0 && tasks.every(t => t.status === 'completed'),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Quick setup - single endpoint to configure all integrations
router.post('/quick-setup', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, integrations } = req.body;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const results = {};
        // Save all integration credentials
        if (integrations.shopify) {
            await supabase_1.db.saveUserCredential(user.id, 'shopify', {
                shopDomain: integrations.shopify.domain,
                accessToken: integrations.shopify.token,
            });
            results.shopify = { success: true, message: 'Shopify credentials saved' };
        }
        if (integrations.github) {
            await supabase_1.db.saveUserCredential(user.id, 'github', {
                token: integrations.github.token,
            });
            results.github = { success: true, message: 'GitHub credentials saved' };
        }
        if (integrations.vercel) {
            await supabase_1.db.saveUserCredential(user.id, 'vercel', {
                token: integrations.vercel.token,
                teamId: integrations.vercel.teamId,
            });
            results.vercel = { success: true, message: 'Vercel credentials saved' };
        }
        if (integrations.cj) {
            await supabase_1.db.saveUserCredential(user.id, 'cj_dropshipping', {
                apiKey: integrations.cj.apiKey,
                email: integrations.cj.email,
            });
            results.cj = { success: true, message: 'CJ Dropshipping credentials saved' };
        }
        if (integrations.meta) {
            await supabase_1.db.saveUserCredential(user.id, 'meta', {
                accessToken: integrations.meta.accessToken,
                adAccountId: integrations.meta.adAccountId,
            });
            results.meta = { success: true, message: 'Meta Ads credentials saved' };
        }
        if (integrations.supabase) {
            await supabase_1.db.saveUserCredential(user.id, 'supabase', {
                url: integrations.supabase.url,
                serviceKey: integrations.supabase.serviceKey,
            });
            results.supabase = { success: true, message: 'Supabase credentials saved' };
        }
        res.json({
            success: true,
            message: 'Quick setup complete',
            storeId,
            results,
            nextStep: 'Run POST /api/developer/develop-store to start full development',
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get user's saved credentials (without exposing full tokens)
router.get('/credentials', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const credentials = await supabase_1.db.getUserCredentials(user.id);
        const masked = credentials.map((c) => ({
            type: c.type,
            connected: true,
            masked: c.data?.token ? `${c.data.token.substring(0, 8)}...` :
                c.data?.accessToken ? `${c.data.accessToken.substring(0, 8)}...` :
                    c.data?.apiKey ? `${c.data.apiKey.substring(0, 8)}...` : 'connected',
            updatedAt: c.updated_at,
        }));
        res.json({ credentials: masked });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Deploy/update theme only
router.post('/deploy-theme/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const githubCreds = await supabase_1.db.getUserCredential(user.id, 'github');
        if (!githubCreds) {
            return res.status(404).json({ error: 'GitHub not connected' });
        }
        // Trigger theme build and deployment
        res.json({
            success: true,
            message: 'Theme deployment started',
            storeId,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Deploy/update landing page only
router.post('/deploy-landing/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const vercelCreds = await supabase_1.db.getUserCredential(user.id, 'vercel');
        if (!vercelCreds) {
            return res.status(404).json({ error: 'Vercel not connected' });
        }
        // Trigger landing page deployment
        res.json({
            success: true,
            message: 'Landing page deployment started',
            storeId,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=developer.js.map