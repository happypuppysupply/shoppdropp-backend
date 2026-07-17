import { Router, Request, Response } from 'express';
import { db } from '../db/supabase';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const router = Router();

interface StoreConfig {
  storeName: string;
  niche: string;
  targetMarket: string;
  productTypes: string[];
  adBudget: number;
  aiCreditBudget: number;
  goals: string[];
}

// Save store configuration
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || '4917a55a-59c3-4d41-af49-b95c678b63d1';
    const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
    const config: StoreConfig = req.body;

    console.log('[StoreConfig] Saving configuration:', { userId, storeId, config });

    // Validate required fields
    if (!config.storeName || !config.niche || !config.targetMarket) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Save to database
    await db.updateStore(storeId, {
      name: config.storeName,
      config_niche: config.niche,
      config_target_market: config.targetMarket,
      config_product_types: config.productTypes,
      config_ad_budget: config.adBudget,
      config_ai_budget: config.aiCreditBudget,
      config_goals: config.goals,
      config_updated_at: new Date().toISOString(),
    });

    // Also save to memory file for OpenClaw
    const memoryDir = join(process.cwd(), '..', 'memory');
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }

    const memoryContent = generateMemoryContent(config, userId, storeId);
    const memoryPath = join(memoryDir, `store-config-${storeId}.md`);
    writeFileSync(memoryPath, memoryContent);

    console.log('[StoreConfig] Saved to memory:', memoryPath);

    res.json({
      success: true,
      message: 'Store configuration saved',
      storeId,
    });
  } catch (error: any) {
    console.error('[StoreConfig] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get store configuration
router.get('/:storeId', async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const store = await db.getStoreById(storeId);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const config = {
      storeName: store.name,
      niche: store.config_niche,
      targetMarket: store.config_target_market,
      productTypes: store.config_product_types || [],
      adBudget: store.config_ad_budget || 50,
      aiCreditBudget: store.config_ai_budget || 100,
      goals: store.config_goals || [],
      updatedAt: store.config_updated_at,
    };

    res.json(config);
  } catch (error: any) {
    console.error('[StoreConfig] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

function generateMemoryContent(config: StoreConfig, userId: string, storeId: string): string {
  const nicheNames: Record<string, string> = {
    pet: 'Pet Supplies',
    beauty: 'Beauty & Personal Care',
    fitness: 'Fitness & Health',
    home: 'Home & Garden',
    tech: 'Tech & Gadgets',
    fashion: 'Fashion & Accessories',
    baby: 'Baby & Kids',
    other: 'Other',
  };

  const marketNames: Record<string, string> = {
    usa: 'United States',
    europe: 'Europe (EU)',
    canada: 'Canada',
    australia: 'Australia/NZ',
    global: 'Global/Multi',
  };

  return `# Store Configuration

**Generated:** ${new Date().toISOString()}
**Store ID:** ${storeId}
**User ID:** ${userId}

## Store Details

- **Name:** ${config.storeName}
- **Niche:** ${nicheNames[config.niche] || config.niche}
- **Target Market:** ${marketNames[config.targetMarket] || config.targetMarket}
- **Product Types:** ${config.productTypes.join(', ')}

## Budget Settings

- **Daily Ad Budget:** $${config.adBudget}
- **AI Credit Budget:** $${config.aiCreditBudget}/week

## Goals

${config.goals.map(g => `- ${g}`).join('\n')}

## AI Instructions

Based on this configuration, the AI should:

1. Focus on the **${nicheNames[config.niche] || config.niche}** niche
2. Target customers in **${marketNames[config.targetMarket] || config.targetMarket}**
3. Work within a $${config.adBudget}/day ad budget
4. Prioritize these goals: ${config.goals.join(', ')}
5. Use up to $${config.aiCreditBudget}/week in AI credits

## Product Research Focus

- Look for trending products in ${nicheNames[config.niche] || config.niche}
- Consider products suitable for ${config.productTypes.join(', ')}
- Target price points appropriate for ${marketNames[config.targetMarket] || config.targetMarket} market

## Ad Strategy

- Daily budget: $${config.adBudget}
- Focus on Meta Ads (Facebook/Instagram)
- Target audience based on niche and market
- A/B test creatives and audiences

---
*This configuration was set up by the user and should guide all AI automation tasks.*
`;
}

export default router;
