"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiStorePlanner_1 = require("../services/aiStorePlanner");
const shopScorer_1 = require("../services/shopScorer");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const CJ_API_KEY = process.env.CJ_DROPSHIPPING_API_KEY || '';
const scanCache = new Map();
const CACHE_TTL = 1000 * 60 * 60;
// ============ SCAN STORE (YOUR STORE OR COMPETITOR) ============
router.post('/scan', async (req, res) => {
    try {
        const { userUrl, isCompetitor, forceFresh } = req.body;
        if (!userUrl)
            return res.status(400).json({ error: 'Store URL required' });
        if (!OPENROUTER_KEY)
            return res.status(500).json({ error: 'AI not configured' });
        // Clear cache if forceFresh requested
        if (forceFresh) {
            console.log('[AIScanner] Force fresh scan requested - clearing cache');
            for (const [key] of scanCache) {
                if (key.includes(userUrl))
                    scanCache.delete(key);
            }
        }
        const cacheKey = `${userUrl}-${isCompetitor ? 'comp' : 'own'}`;
        const cached = scanCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('[AIScanner] Returning cached plan');
            return res.json({
                success: true,
                cached: true,
                mode: isCompetitor ? 'competitor' : 'your-store',
                ...generateResponse(cached.plan, isCompetitor),
            });
        }
        console.log(`[AIScanner] Generating plan for: ${userUrl}`);
        const planner = (0, aiStorePlanner_1.createAIStorePlanner)(OPENROUTER_KEY, CJ_API_KEY);
        const plan = await planner.generatePlan(userUrl);
        if (!plan) {
            throw new Error('Failed to generate plan - plan is null');
        }
        if (!plan.scanResult) {
            throw new Error('Failed to generate plan - scanResult is missing');
        }
        console.log(`[AIScanner] Plan generated: ${plan.scanResult.pages?.length || 0} pages, ${plan.scanResult.collections?.length || 0} collections`);
        scanCache.set(cacheKey, { plan, timestamp: Date.now() });
        res.json({
            success: true,
            mode: isCompetitor ? 'competitor' : 'your-store',
            ...generateResponse(plan, isCompetitor),
        });
    }
    catch (error) {
        console.error('[AIScanner] Scan error:', error);
        console.error('[AIScanner] Stack:', error.stack);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});
// ============ GET FULL PLAN (REQUIRES AUTH) ============
router.get('/plan/:scanId', async (req, res) => {
    try {
        const user = req.user;
        let plan = null;
        for (const [key, value] of scanCache.entries()) {
            if (key.includes(req.params.scanId)) {
                plan = value.plan;
                break;
            }
        }
        if (!plan)
            return res.status(404).json({ error: 'Plan expired' });
        res.json({
            success: true,
            authenticated: !!user?.id,
            plan: {
                scanResult: plan.scanResult,
                shopScore: plan.shopScore,
                analysis: plan.analysis,
                designRecommendations: plan.designRecommendations,
                productStrategy: plan.productStrategy,
                marketingPlan: plan.marketingPlan,
                implementationPlan: plan.implementationPlan,
            },
            nextStep: user?.id ? '/api/ai-scanner/provision' : '/auth/google',
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ PROVISION & DEPLOY ============
router.post('/provision', async (req, res) => {
    try {
        const user = req.user;
        const { scanId, storeName, isCompetitor } = req.body;
        if (!user?.id)
            return res.status(401).json({ error: 'Sign in required' });
        let plan = null;
        for (const [key, value] of scanCache.entries()) {
            if (key.includes(scanId)) {
                plan = value.plan;
                break;
            }
        }
        if (!plan)
            return res.status(404).json({ error: 'Plan expired' });
        const store = await supabase_1.db.createStore({
            user_id: user.id,
            name: storeName || (isCompetitor ? `Competitor Strategy - ${plan.analysis.niche}` : `${plan.analysis.niche} Store`),
            url: plan.scanResult.url,
            status: 'provisioning',
            config_niche: plan.analysis.niche,
            config_plan: JSON.stringify(plan),
        });
        const provisionRes = await fetch(`http://localhost:${process.env.PORT || 3001}/api/vps-simple/provision-store`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization || '' },
            body: JSON.stringify({ storeId: store.id }),
        });
        const provisionResult = await provisionRes.json();
        res.json({
            success: true,
            store: { id: store.id, name: store.name, status: 'provisioning' },
            vps: provisionResult,
            nextStep: `/api/ai-scanner/start-workers?storeId=${store.id}`,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/start-workers', async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.body;
        if (!user?.id)
            return res.status(401).json({ error: 'Sign in required' });
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id)
            return res.status(403).json({ error: 'Access denied' });
        const workersRes = await fetch(`http://localhost:${process.env.PORT || 3001}/api/workers/start-store-workers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization || '' },
            body: JSON.stringify({ storeId }),
        });
        const workersResult = await workersRes.json();
        await supabase_1.db.updateStore(storeId, { status: 'running' });
        res.json({
            success: true,
            store: { id: storeId, status: 'running' },
            workers: workersResult,
            dashboardUrl: `/dashboard?storeId=${storeId}`,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ HELPERS ============
function generateResponse(plan, isCompetitor) {
    const scanId = Buffer.from(plan.scanResult.url).toString('base64').slice(0, 16);
    if (isCompetitor) {
        // Competitor mode: Show opportunities & strategy
        return {
            scanId,
            analysis: {
                productsFound: plan.productStrategy.winningProducts.length,
                priceGap: '$15-40 below market',
                contentGaps: plan.analysis.contentGaps,
                estimatedRevenue: '$15K-30K/mo',
                weaknesses: plan.analysis.improvementOpportunities,
            },
            strategy: [
                { title: 'Target Their Weaknesses', description: `Focus on: ${plan.analysis.improvementOpportunities[0]}` },
                { title: 'Price Competitively', description: 'Price 10-15% below their range while maintaining margins' },
                { title: 'Fill Content Gaps', description: `Create content for: ${plan.analysis.contentGaps[0]}` },
                { title: 'Better UX', description: `Implement ${plan.designRecommendations.style} design improvements` },
                { title: 'Superior Products', description: 'Source higher quality alternatives to their bestsellers' },
            ],
            winningProducts: plan.productStrategy.winningProducts.slice(0, 5),
            cta: {
                text: 'Build Store From This Analysis',
                action: `/api/ai-scanner/provision?mode=competitor`,
            },
        };
    }
    else {
        // Your store mode: Show score + what to fix
        const scorer = (0, shopScorer_1.createShopScorer)();
        const shopScore = scorer.calculateScore(plan.scanResult, plan);
        return {
            scanId,
            shopScore: {
                overall: shopScore.overall,
                grade: shopScore.grade,
                percentile: shopScore.benchmarks.percentile,
                breakdown: shopScore.breakdown,
                metrics: shopScore.metrics,
                recommendations: shopScore.recommendations.slice(0, 5),
            },
            plan: {
                scanResult: {
                    url: plan.scanResult.url,
                    pages: plan.scanResult.pages,
                    collections: plan.scanResult.collections,
                    apps: plan.scanResult.apps,
                    customPages: plan.scanResult.customPages,
                    design: plan.scanResult.design,
                }
            },
            cta: {
                text: 'Fix Issues Automatically',
                action: `/api/ai-scanner/provision?mode=your-store`,
            },
        };
    }
}
exports.default = router;
//# sourceMappingURL=aiScanner.js.map