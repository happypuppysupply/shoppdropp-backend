import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';

const router = Router();

/**
 * GET /api/credits
 * Get user's current credit balance
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get or create user credits record
    const { data: credits, error } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // If no record exists, create one with $20 minimum (as per design)
    if (!credits) {
      const { data: newCredits, error: createError } = await supabase
        .from('user_credits')
        .insert({
          user_id: user.id,
          balance: 20.00,
          currency: 'USD',
          lifetime_spent: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;
      
      return res.json({
        credits: newCredits.balance,
        currency: newCredits.currency,
        lifetime_spent: newCredits.lifetime_spent,
      });
    }

    res.json({
      credits: credits.balance,
      currency: credits.currency,
      lifetime_spent: credits.lifetime_spent,
    });
  } catch (error: any) {
    console.error('Credits fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

/**
 * POST /api/credits/spend
 * Spend credits for a task (internal API)
 */
router.post(
  '/spend',
  authenticate,
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least $0.01'),
    body('task_type').isString().withMessage('Task type is required'),
    body('description').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { amount, task_type, description } = req.body;

      // Get current balance
      const { data: credits, error: fetchError } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (fetchError) throw fetchError;

      if (!credits || credits.balance < amount) {
        return res.status(400).json({
          error: 'Insufficient credits',
          balance: credits?.balance || 0,
          required: amount,
        });
      }

      // Deduct credits
      const { data: updated, error: updateError } = await supabase
        .from('user_credits')
        .update({
          balance: credits.balance - amount,
          lifetime_spent: credits.lifetime_spent + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log the transaction
      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        type: 'debit',
        amount,
        task_type,
        description: description || `${task_type} task`,
        balance_after: updated.balance,
        created_at: new Date().toISOString(),
      });

      res.json({
        success: true,
        new_balance: updated.balance,
        spent: amount,
        task_type,
      });
    } catch (error: any) {
      console.error('Credits spend error:', error);
      res.status(500).json({ error: 'Failed to spend credits' });
    }
  }
);

/**
 * POST /api/credits/add
 * Add credits to user account (for deposits)
 */
router.post(
  '/add',
  authenticate,
  [
    body('amount').isFloat({ min: 20 }).withMessage('Minimum deposit is $20'),
    body('payment_method').optional().isString(),
    body('payment_id').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { amount, payment_method, payment_id } = req.body;

      // Get current balance
      const { data: credits, error: fetchError } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();

      let newBalance: number;

      if (!credits) {
        // Create new record
        const { data: created, error: createError } = await supabase
          .from('user_credits')
          .insert({
            user_id: user.id,
            balance: amount,
            currency: 'USD',
            lifetime_spent: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError) throw createError;
        newBalance = created.balance;
      } else {
        // Update existing
        const { data: updated, error: updateError } = await supabase
          .from('user_credits')
          .update({
            balance: credits.balance + amount,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) throw updateError;
        newBalance = updated.balance;
      }

      // Log the deposit
      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        type: 'credit',
        amount,
        task_type: 'deposit',
        description: `Deposit via ${payment_method || 'stripe'}`,
        payment_id,
        balance_after: newBalance,
        created_at: new Date().toISOString(),
      });

      res.json({
        success: true,
        new_balance: newBalance,
        added: amount,
      });
    } catch (error: any) {
      console.error('Credits add error:', error);
      res.status(500).json({ error: 'Failed to add credits' });
    }
  }
);

/**
 * GET /api/credits/transactions
 * Get user's credit transaction history
 */
router.get('/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: transactions, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      transactions: transactions || [],
      count: transactions?.length || 0,
    });
  } catch (error: any) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/credits/pricing
 * Get task pricing information
 */
router.get('/pricing', async (req: Request, res: Response) => {
  const pricing = {
    tasks: {
      research_product: { base: 0.60, description: 'Research a single product' },
      generate_product_page: { base: 0.25, description: 'Generate product description & SEO' },
      create_ad_campaign: { base: 0.80, description: 'Create Meta Ads campaign' },
      deep_market_analysis: { base: 1.20, description: 'Deep market trend analysis' },
      price_optimization: { base: 0.40, description: 'Optimize pricing strategy' },
      inventory_sync: { base: 0.30, description: 'Sync inventory with suppliers' },
    },
    research_depth: {
      quick: { multiplier: 0.41, cost: 0.25, description: 'Quick research - basic trend check' },
      deep: { multiplier: 1.25, cost: 0.75, description: 'Deep research - comprehensive analysis' },
      maximum: { multiplier: 2.5, cost: 1.50, description: 'Maximum research - exhaustive research' },
    },
    note: 'All prices in USD. Research depth multiplies base research cost.',
  };

  res.json(pricing);
});

export default router;
