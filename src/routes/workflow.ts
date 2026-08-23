import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';
import axios from 'axios';

const router = Router();

// System API keys from environment
const SYSTEM_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const SYSTEM_OPENWEB_NINJA_KEY = process.env.OPENWEB_NINJA_API_KEY;

// Get workflow status
router.get('/workflow-status/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Get store config
    const { data: config } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();

    // Get credentials
    const { data: credentials } = await supabase
      .from('api_credentials')
      .select('*')
      .eq('store_id', storeId);

    // Get worker
    const { data: workers } = await supabase
      .from('workers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasCredential = (type: string) => credentials?.some((c: any) => c.type === type);

    res.json({
      onboardingComplete: config?.onboarding_status === 'complete',
      researchComplete: config?.research_complete || false,
      cjConnected: hasCredential('cj_dropshipping'),
      shopifyConnected: hasCredential('shopify'),
      metaConnected: hasCredential('meta_ads'),
      worker: workers?.[0] || null,
      currentStage: getCurrentStage(config, credentials),
    });
  } catch (error: any) {
    console.error('Workflow status error:', error);
    res.status(500).json({ error: error.message });
  }
});

function getCurrentStage(config: any, credentials: any[]) {
  if (!config || config.onboarding_status !== 'complete') return 'onboarding';
  if (!config.research_complete) return 'research';
  
  const hasCreds = (type: string) => credentials?.some((c: any) => c.type === type);
  
  if (!hasCreds('cj_dropshipping')) return 'cj_dropshipping';
  if (!hasCreds('shopify')) return 'shopify';
  if (!hasCreds('meta_ads')) return 'meta_ads';
  return 'complete';
}

// Start product research
router.post('/research', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { store_id } = req.body;

    // Get store config for niche info
    const { data: config } = await supabase
      .from('store_configs')
      .select('onboarding_answers')
      .eq('store_id', store_id)
      .single();

    const answers = config?.onboarding_answers || {};
    const niche = answers.niche_category || 'general';
    const priceRange = answers.price_range || 'mid';

    // Use system OpenWeb Ninja API
    const researchResults = await performResearch(niche, priceRange);

    // Save research results
    await supabase
      .from('store_configs')
      .update({
        research_results: researchResults,
        research_complete: true,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', store_id);

    res.json({
      success: true,
      products: researchResults.products,
    });
  } catch (error: any) {
    console.error('Research error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function performResearch(niche: string, priceRange: string) {
  // Use system OpenWeb Ninja API
  try {
    // Amazon research
    const amazonResponse = await axios.get(
      'https://api.openwebninja.com/realtime-amazon-data/search',
      {
        headers: { 'X-API-Key': SYSTEM_OPENWEB_NINJA_KEY },
        params: { query: niche, limit: 10 },
        timeout: 10000,
      }
    );

    // Transform results
    const products = amazonResponse.data?.results?.map((item: any) => ({
      name: item.title,
      price: item.price?.current_price || 29.99,
      margin: calculateMargin(item.price?.current_price || 29.99),
      source: 'amazon',
      asin: item.asin,
    })) || [];

    return { products: products.slice(0, 5) };
  } catch (error) {
    console.error('Research API error:', error);
    // Return mock data if API fails
    return {
      products: [
        { name: `${niche} Premium Product 1`, price: 49.99, margin: 45, source: 'mock' },
        { name: `${niche} Best Seller`, price: 34.99, margin: 50, source: 'mock' },
        { name: `${niche} Trending Item`, price: 59.99, margin: 40, source: 'mock' },
      ],
    };
  }
}

function calculateMargin(price: number) {
  // Simple margin calculation
  if (price < 20) return 60;
  if (price < 50) return 50;
  if (price < 100) return 40;
  return 35;
}

// Simple chat endpoint (no complex FORM blocks)
router.post('/simple', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { message, store_id, stage } = req.body;

    // Get store context
    const { data: config } = await supabase
      .from('store_configs')
      .select('onboarding_answers')
      .eq('store_id', store_id)
      .single();

    const answers = config?.onboarding_answers || {};

    // Use system OpenRouter
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'moonshotai/kimi-k2.5',
        messages: [
          {
            role: 'system',
            content: `You are an expert VC and investment banker advising on a dropshipping business. Current stage: ${stage}. Store niche: ${answers.niche_category || 'not set'}. Be concise and actionable.`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          'Authorization': `Bearer ${SYSTEM_OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    res.json({
      response: response.data.choices[0].message.content,
    });
  } catch (error: any) {
    console.error('Simple chat error:', error);
    res.json({
      response: 'I\'m here to help! What would you like to know about your store?',
    });
  }
});

export default router;
