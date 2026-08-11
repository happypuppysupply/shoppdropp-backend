"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const budgetGuard_1 = require("../services/budgetGuard");
const router = (0, express_1.Router)();
/**
 * GET /api/budget/status
 * Get current budget status
 */
router.get('/status', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        // Get AI config to fetch account balance
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        const status = await (0, budgetGuard_1.getBudgetStatus)(user.id, aiConfig?.api_key_encrypted);
        if (!status) {
            return res.json({
                configured: false,
                message: 'Budget guard not configured. Set up to enable spending limits.',
            });
        }
        // Calculate days until reset
        const daysUntilReset = Math.ceil((status.resetsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        res.json({
            configured: true,
            weeklyLimit: status.weeklyLimit,
            weeklySpent: status.weeklySpent,
            percentageUsed: Math.round(status.percentageUsed),
            remaining: status.remaining,
            resetsAt: status.resetsAt.toISOString(),
            daysUntilReset,
            accountBalance: status.accountBalance,
            hardStopAt: status.hardStopAt,
            isBlocked: status.percentageUsed >= status.hardStopAt * 100,
        });
    }
    catch (error) {
        console.error('Budget status error:', error);
        res.status(500).json({ error: 'Failed to fetch budget status' });
    }
});
/**
 * POST /api/budget/configure
 * Configure budget settings
 */
router.post('/configure', auth_1.authenticate, [
    (0, express_validator_1.body)('weeklyLimitUsd')
        .optional()
        .isFloat({ min: 1, max: 10000 })
        .withMessage('Weekly limit must be between $1 and $10,000'),
    (0, express_validator_1.body)('hardStopAt')
        .optional()
        .isFloat({ min: 0.1, max: 1 })
        .withMessage('Hard stop must be between 0.1 and 1.0'),
    (0, express_validator_1.body)('maxRequestCostUsd')
        .optional()
        .isFloat({ min: 0.01, max: 100 })
        .withMessage('Max request cost must be between $0.01 and $100'),
    (0, express_validator_1.body)('estimateBuffer')
        .optional()
        .isFloat({ min: 1, max: 3 })
        .withMessage('Estimate buffer must be between 1.0 and 3.0'),
], async (req, res) => {
    try {
        const user = req.user;
        const { weeklyLimitUsd, hardStopAt, maxRequestCostUsd, estimateBuffer, alertThresholds, } = req.body;
        // Get existing config or use defaults
        const existing = await (0, budgetGuard_1.getBudgetConfig)(user.id);
        const newConfig = {
            weeklyLimitUsd: weeklyLimitUsd ?? existing?.weeklyLimitUsd ?? 60,
            hardStopAt: hardStopAt ?? existing?.hardStopAt ?? 0.95,
            maxRequestCostUsd: maxRequestCostUsd ?? existing?.maxRequestCostUsd ?? 5,
            estimateBuffer: estimateBuffer ?? existing?.estimateBuffer ?? 1.2,
            alertThresholds: alertThresholds ?? existing?.alertThresholds ?? [0.5, 0.75, 0.9, 0.95],
            weekStartedAt: existing?.weekStartedAt ?? new Date().toISOString().split('T')[0],
            weeklySpentUsd: existing?.weeklySpentUsd ?? 0,
        };
        await (0, budgetGuard_1.setBudgetConfig)(user.id, newConfig);
        res.json({
            success: true,
            message: 'Budget configuration saved',
            config: newConfig,
        });
    }
    catch (error) {
        console.error('Budget config error:', error);
        res.status(500).json({ error: 'Failed to save budget configuration' });
    }
});
/**
 * POST /api/budget/reset-week
 * Manually reset the weekly counter
 */
router.post('/reset-week', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const existing = await (0, budgetGuard_1.getBudgetConfig)(user.id);
        if (!existing) {
            return res.status(400).json({ error: 'No budget config found' });
        }
        await (0, budgetGuard_1.setBudgetConfig)(user.id, {
            ...existing,
            weeklySpentUsd: 0,
            weekStartedAt: new Date().toISOString().split('T')[0],
        });
        res.json({
            success: true,
            message: 'Weekly budget counter reset',
            newWeekStart: new Date().toISOString().split('T')[0],
        });
    }
    catch (error) {
        console.error('Budget reset error:', error);
        res.status(500).json({ error: 'Failed to reset budget' });
    }
});
/**
 * GET /api/budget/balance
 * Fetch current OpenRouter account balance
 */
router.get('/balance', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        if (!aiConfig?.api_key_encrypted) {
            return res.status(400).json({
                error: 'OpenRouter not configured',
                message: 'Please configure OpenRouter in AI settings first',
            });
        }
        const balance = await (0, budgetGuard_1.fetchOpenRouterBalance)(aiConfig.api_key_encrypted);
        res.json({
            balance,
            currency: 'USD',
            fetchedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Balance fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch account balance' });
    }
});
/**
 * DELETE /api/budget
 * Remove budget configuration (disable budget guard)
 */
router.delete('/', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { error } = await supabase_1.db.supabase
            .from('budget_configs')
            .delete()
            .eq('user_id', user.id);
        if (error)
            throw error;
        res.json({
            success: true,
            message: 'Budget guard disabled',
        });
    }
    catch (error) {
        console.error('Budget delete error:', error);
        res.status(500).json({ error: 'Failed to disable budget guard' });
    }
});
/**
 * GET /api/budget/pricing
 * Get model pricing information
 */
router.get('/pricing', auth_1.authenticate, async (req, res) => {
    const pricing = {
        'moonshotai/kimi-k2.5': { input: 0.002, output: 0.008 },
        'moonshotai/kimi-k2.6': { input: 0.003, output: 0.012 },
        'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
        'openai/gpt-4o': { input: 0.005, output: 0.015 },
        'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
        'meta-llama/llama-3.1-405b': { input: 0.005, output: 0.01 },
        'google/gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
        'google/gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
    };
    res.json({ pricing });
});
exports.default = router;
//# sourceMappingURL=budget.js.map