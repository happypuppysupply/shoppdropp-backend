import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';
import {
  getBudgetConfig,
  setBudgetConfig,
  getBudgetStatus,
  fetchOpenRouterBalance,
  formatBudgetAlert,
  BudgetConfig,
} from '../services/budgetGuard';

const router = Router();

/**
 * GET /api/budget/status
 * Get current budget status
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get AI config to fetch account balance
    const aiConfig = await db.getAIConfig(user.id);
    
    const status = await getBudgetStatus(user.id, aiConfig?.api_key_encrypted);
    
    if (!status) {
      return res.json({
        configured: false,
        message: 'Budget guard not configured. Set up to enable spending limits.',
      });
    }

    // Calculate days until reset
    const daysUntilReset = Math.ceil(
      (status.resetsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

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
  } catch (error: any) {
    console.error('Budget status error:', error);
    res.status(500).json({ error: 'Failed to fetch budget status' });
  }
});

/**
 * POST /api/budget/configure
 * Configure budget settings
 */
router.post(
  '/configure',
  authenticate,
  [
    body('weeklyLimitUsd')
      .optional()
      .isFloat({ min: 1, max: 10000 })
      .withMessage('Weekly limit must be between $1 and $10,000'),
    body('hardStopAt')
      .optional()
      .isFloat({ min: 0.1, max: 1 })
      .withMessage('Hard stop must be between 0.1 and 1.0'),
    body('maxRequestCostUsd')
      .optional()
      .isFloat({ min: 0.01, max: 100 })
      .withMessage('Max request cost must be between $0.01 and $100'),
    body('estimateBuffer')
      .optional()
      .isFloat({ min: 1, max: 3 })
      .withMessage('Estimate buffer must be between 1.0 and 3.0'),
  ],
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const {
        weeklyLimitUsd,
        hardStopAt,
        maxRequestCostUsd,
        estimateBuffer,
        alertThresholds,
      } = req.body;

      // Get existing config or use defaults
      const existing = await getBudgetConfig(user.id);
      
      const newConfig: Partial<BudgetConfig> = {
        weeklyLimitUsd: weeklyLimitUsd ?? existing?.weeklyLimitUsd ?? 60,
        hardStopAt: hardStopAt ?? existing?.hardStopAt ?? 0.95,
        maxRequestCostUsd: maxRequestCostUsd ?? existing?.maxRequestCostUsd ?? 5,
        estimateBuffer: estimateBuffer ?? existing?.estimateBuffer ?? 1.2,
        alertThresholds: alertThresholds ?? existing?.alertThresholds ?? [0.5, 0.75, 0.9, 0.95],
        weekStartedAt: existing?.weekStartedAt ?? new Date().toISOString().split('T')[0],
        weeklySpentUsd: existing?.weeklySpentUsd ?? 0,
      };

      await setBudgetConfig(user.id, newConfig);

      res.json({
        success: true,
        message: 'Budget configuration saved',
        config: newConfig,
      });
    } catch (error: any) {
      console.error('Budget config error:', error);
      res.status(500).json({ error: 'Failed to save budget configuration' });
    }
  }
);

/**
 * POST /api/budget/reset-week
 * Manually reset the weekly counter
 */
router.post('/reset-week', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const existing = await getBudgetConfig(user.id);
    if (!existing) {
      return res.status(400).json({ error: 'No budget config found' });
    }

    await setBudgetConfig(user.id, {
      ...existing,
      weeklySpentUsd: 0,
      weekStartedAt: new Date().toISOString().split('T')[0],
    });

    res.json({
      success: true,
      message: 'Weekly budget counter reset',
      newWeekStart: new Date().toISOString().split('T')[0],
    });
  } catch (error: any) {
    console.error('Budget reset error:', error);
    res.status(500).json({ error: 'Failed to reset budget' });
  }
});

/**
 * GET /api/budget/balance
 * Fetch current OpenRouter account balance
 */
router.get('/balance', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const aiConfig = await db.getAIConfig(user.id);
    if (!aiConfig?.api_key_encrypted) {
      return res.status(400).json({
        error: 'OpenRouter not configured',
        message: 'Please configure OpenRouter in AI settings first',
      });
    }

    const balance = await fetchOpenRouterBalance(aiConfig.api_key_encrypted);

    res.json({
      balance,
      currency: 'USD',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch account balance' });
  }
});

/**
 * DELETE /api/budget
 * Remove budget configuration (disable budget guard)
 */
router.delete('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const { error } = await supabase
      .from('budget_configs')
      .delete()
      .eq('user_id', user.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Budget guard disabled',
    });
  } catch (error: any) {
    console.error('Budget delete error:', error);
    res.status(500).json({ error: 'Failed to disable budget guard' });
  }
});

/**
 * GET /api/budget/pricing
 * Get model pricing information
 */
router.get('/pricing', authenticate, async (req: Request, res: Response) => {
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

export default router;
