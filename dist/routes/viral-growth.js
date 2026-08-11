"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const viralGrowthEngine_1 = require("../services/viralGrowthEngine");
const storeDeveloper_1 = require("../services/storeDeveloper");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Get available viral tools for industry
router.get('/tools/:industry?', async (req, res) => {
    try {
        const industry = req.params.industry || 'pet';
        const tools = viralGrowthEngine_1.viralGrowthEngine.getAvailableTools(industry);
        res.json({
            success: true,
            data: tools,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// Estimate lead potential
router.post('/estimate', async (req, res) => {
    try {
        const { tools } = req.body;
        const estimate = await viralGrowthEngine_1.viralGrowthEngine.estimateLeadPotential(tools);
        res.json({
            success: true,
            data: estimate,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// Generate tool code
router.post('/generate/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        const config = req.body;
        const code = viralGrowthEngine_1.viralGrowthEngine.generateToolCode(toolId, config);
        res.json({
            success: true,
            data: code,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// Deploy viral tools
router.post('/deploy', async (req, res) => {
    try {
        const { storeId, tools, config } = req.body;
        // Get store details
        const { data: store } = await supabase_1.supabase
            .from('stores')
            .select('*')
            .eq('id', storeId)
            .single();
        if (!store) {
            return res.status(404).json({
                success: false,
                error: 'Store not found',
            });
        }
        // Deploy each tool
        const deployments = [];
        for (const toolId of tools) {
            const toolConfig = {
                storeId,
                selectedTools: tools,
                emailProvider: config.emailProvider || 'klaviyo',
                emailProviderApiKey: config.emailProviderApiKey,
                listId: config.listId,
                upsellEnabled: config.upsellEnabled ?? true,
                bundleApp: config.bundleApp || 'bundler',
                branding: {
                    primaryColor: config.branding?.primaryColor || '#667eea',
                    logo: config.branding?.logo,
                    customDomain: config.branding?.customDomain,
                },
            };
            const code = viralGrowthEngine_1.viralGrowthEngine.generateToolCode(toolId, toolConfig);
            // Deploy via StoreDeveloper
            const deployment = await storeDeveloper_1.storeDeveloper.deployViralTool(storeId, toolId, code);
            deployments.push(deployment);
        }
        // Update store with viral tools
        await supabase_1.supabase
            .from('stores')
            .update({
            viral_tools_enabled: tools,
            viral_tools_config: config,
            updated_at: new Date().toISOString(),
        })
            .eq('id', storeId);
        res.json({
            success: true,
            data: {
                deployed: deployments.length,
                tools: tools,
                urls: deployments.map(d => d.url),
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// Get email sequences for tool
router.post('/email-sequence/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        const config = req.body;
        const sequences = viralGrowthEngine_1.viralGrowthEngine.generateEmailSequence(toolId, config);
        res.json({
            success: true,
            data: sequences,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// Get dashboard stats
router.get('/stats/:storeId', async (req, res) => {
    try {
        const { storeId } = req.params;
        // Get email signups from Supabase
        const { data: signups, error: signupsError } = await supabase_1.supabase
            .from('email_signups')
            .select('*')
            .eq('store_id', storeId);
        if (signupsError)
            throw signupsError;
        // Get sharing stats
        const { data: shares, error: sharesError } = await supabase_1.supabase
            .from('sharing_stats')
            .select('*')
            .eq('store_id', storeId);
        if (sharesError)
            throw sharesError;
        // Calculate stats
        const totalLeads = signups?.length || 0;
        const thisMonth = signups?.filter(s => {
            const signupDate = new Date(s.created_at);
            const now = new Date();
            return signupDate.getMonth() === now.getMonth();
        }).length || 0;
        const totalShares = shares?.length || 0;
        const viralRate = totalLeads > 0 ? (totalShares / totalLeads * 100).toFixed(1) : 0;
        res.json({
            success: true,
            data: {
                totalLeads,
                thisMonth,
                totalShares,
                viralRate,
                topTools: [], // Would aggregate by tool
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=viral-growth.js.map