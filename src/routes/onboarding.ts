import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { onboardingService } from '../services/onboardingService';
import { db } from '../db/supabase';
import fs from 'fs';
import path from 'path';

const router = Router();

// Get current onboarding state
router.get('/state/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const state = await onboardingService.getOnboardingState(storeId, user.id);
    res.json({
      isComplete: state.isComplete,
      currentStep: state.config?.onboarding_step || 1,
      status: state.config?.onboarding_status || 'incomplete',
      progress: Math.round(((state.config?.onboarding_step || 1) / 11) * 100),
    });
  } catch (error: any) {
    console.error('Get onboarding state error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current step prompt with dynamic options
router.get('/step/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const state = await onboardingService.getOnboardingState(storeId, user.id);
    const step = await onboardingService.generateStepPrompt(
      storeId,
      user.id,
      state.config.onboarding_step || 1,
      state.config.onboarding_data || {}
    );

    res.json(step);
  } catch (error: any) {
    console.error('Get onboarding step error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save step response and advance
router.post('/step/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;
    const { stepNumber, stepName, data } = req.body;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const updatedConfig = await onboardingService.saveOnboardingStep(
      storeId,
      user.id,
      stepNumber,
      stepName,
      data
    );

    // Check if onboarding is now complete
    const workflowCheck = onboardingService.canStartWorkflow(updatedConfig);

    // If complete, generate AI context summary
    if (updatedConfig.onboarding_status === 'complete') {
      await onboardingService.generateAIContextSummary(storeId);
    }

    res.json({
      success: true,
      nextStep: updatedConfig.onboarding_step,
      status: updatedConfig.onboarding_status,
      isComplete: updatedConfig.onboarding_status === 'complete',
      canStartWorkflow: workflowCheck.ready,
      missingForWorkflow: workflowCheck.missing,
    });
  } catch (error: any) {
    console.error('Save onboarding step error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get full store configuration
router.get('/config/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const state = await onboardingService.getOnboardingState(storeId, user.id);
    
    res.json({
      config: state.config,
      isComplete: state.isComplete,
      canStartWorkflow: onboardingService.canStartWorkflow(state.config).ready,
    });
  } catch (error: any) {
    console.error('Get store config error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update specific configuration field
router.patch('/config/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;
    const updates = req.body;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const { data: updatedConfig, error } = await db.supabase
      .from('store_configs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      config: updatedConfig,
    });
  } catch (error: any) {
    console.error('Update store config error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Skip to specific step (for returning users)
router.post('/skip/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;
    const { targetStep } = req.body;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const { data: updatedConfig, error } = await db.supabase
      .from('store_configs')
      .update({
        onboarding_step: targetStep,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      currentStep: updatedConfig.onboarding_step,
    });
  } catch (error: any) {
    console.error('Skip onboarding step error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get workflow status
router.get('/workflow-status/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const state = await onboardingService.getOnboardingState(storeId, user.id);
    const workflowCheck = onboardingService.canStartWorkflow(state.config);

    res.json({
      onboardingComplete: state.isComplete,
      canStartWorkflow: workflowCheck.ready,
      missingRequirements: workflowCheck.missing,
      aiConfigured: !!state.config?.ai_context_summary,
      storeConfig: {
        market: state.config?.market_niche || state.config?.market_subcategory,
        brandVoice: state.config?.brand_voice,
        siteStyle: state.config?.site_style,
        targetAudience: state.config?.target_audience?.primary,
      },
    });
  } catch (error: any) {
    console.error('Get workflow status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete onboarding wizard - saves all data at once and writes MD file
router.post('/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId, storeName, onboardingData } = req.body;

    if (!storeId || !onboardingData) {
      return res.status(400).json({ error: 'Missing storeId or onboardingData' });
    }

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Update store config with all onboarding data
    const { data: updatedConfig, error: configError } = await db.supabase
      .from('store_configs')
      .update({
        onboarding_status: 'complete',
        onboarding_step: 11,
        onboarding_data: onboardingData,
        market_category: onboardingData.category?.primary,
        market_subcategory: onboardingData.category?.subcategory,
        brand_voice: JSON.stringify(onboardingData.brandVoice),
        site_style: onboardingData.visualStyle,
        target_audience: {
          primary: onboardingData.targetAudience?.[0],
          niche_angles: onboardingData.nicheAngles,
          demographics: onboardingData.targetAudience,
        },
        product_strategy: {
          pricing: onboardingData.pricing,
          types: onboardingData.productTypes,
        },
        marketing_budget_monthly: onboardingData.monthlyBudget,
        business_goals: [{
          goal: 'Launch and scale store',
          revenue_target: onboardingData.revenueGoal,
          primary_channel: onboardingData.primaryChannel,
        }],
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (configError) throw configError;

    // Generate AI context summary
    const summary = await onboardingService.generateAIContextSummary(storeId);

    // Write MD file to workspace
    const mdContent = generateOnboardingMD(storeName, onboardingData);
    const workspaceDir = process.env.WORKSPACE_DIR || '/tmp/workspace';
    const storeDir = path.join(workspaceDir, 'stores', storeId);
    
    // Ensure directory exists
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }

    const mdPath = path.join(storeDir, 'onboarding.md');
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    // Also write to memory directory for agent context
    const memoryDir = path.join(workspaceDir, 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    const memoryPath = path.join(memoryDir, `${storeId}-profile.md`);
    fs.writeFileSync(memoryPath, mdContent, 'utf-8');

    res.json({
      success: true,
      isComplete: true,
      canStartWorkflow: true,
      mdPath,
      memoryPath,
      summary,
    });
  } catch (error: any) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get onboarding profile MD content
router.get('/profile/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Try to read MD file
    const workspaceDir = process.env.WORKSPACE_DIR || '/tmp/workspace';
    const mdPath = path.join(workspaceDir, 'stores', storeId, 'onboarding.md');

    if (fs.existsSync(mdPath)) {
      const content = fs.readFileSync(mdPath, 'utf-8');
      res.json({ content, exists: true });
    } else {
      res.json({ content: null, exists: false });
    }
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate MD content
function generateOnboardingMD(storeName: string, data: any): string {
  const categoryLabels: Record<string, string> = {
    pet_supplies: 'Pet Supplies',
    fashion: 'Fashion & Apparel',
    home_garden: 'Home & Garden',
    beauty: 'Beauty & Personal Care',
    electronics: 'Electronics & Tech',
    sports: 'Sports & Fitness',
  };

  const visualStyleLabels: Record<string, string> = {
    minimal: 'Minimal & Clean',
    bold: 'Bold & Vibrant',
    rustic: 'Rustic & Natural',
    luxury: 'Luxury & Elegant',
    playful: 'Playful & Fun',
    tech: 'Tech & Modern',
  };

  const channelLabels: Record<string, string> = {
    meta_ads: 'Meta Ads (Facebook/Instagram)',
    google_ads: 'Google Ads',
    tiktok_ads: 'TikTok Ads',
    organic_social: 'Organic Social Media',
    influencer: 'Influencer Marketing',
    email: 'Email Marketing',
    seo: 'SEO / Content',
    affiliate: 'Affiliate Marketing',
  };

  const supplierLabels: Record<string, string> = {
    syncee: 'Syncee',
    spocket: 'Spocket',
    dsers: 'DSers',
    cj_dropshipping: 'CJ Dropshipping',
    modalyst: 'Modalyst',
    printful: 'Printful',
    printify: 'Printify',
    manual: 'Manual / Other',
  };

  return `# ${storeName} — Store Profile

## Overview
- **Store Name:** ${storeName}
- **Category:** ${categoryLabels[data.category?.primary] || data.category?.primary} → ${data.category?.subcategory || 'Not specified'}
- **Onboarding Date:** ${new Date().toISOString().split('T')[0]}
- **Status:** Active

## Category & Niche
- **Primary Category:** ${categoryLabels[data.category?.primary] || data.category?.primary}
- **Subcategory:** ${data.category?.subcategory || 'Not specified'}
- **Niche Angles:** ${data.nicheAngles?.map((id: string) => id.replace('_', ' ')).join(', ') || 'Not specified'}

## Target Audience
- **Primary Segments:** ${data.targetAudience?.map((id: string) => id.replace('_', ' ')).join(', ') || 'Not specified'}
- **Demographics:** ${data.targetAudience?.length > 0 ? 'Defined' : 'Not specified'}

## Brand Voice
- **Playful:** ${data.brandVoice?.playful || 5}/10
- **Professional:** ${data.brandVoice?.professional || 5}/10
- **Luxury:** ${data.brandVoice?.luxury || 5}/10
- **Visual Style:** ${visualStyleLabels[data.visualStyle] || data.visualStyle || 'Not specified'}

## Product Strategy
- **Product Types:** ${data.productTypes?.join(', ') || 'Not specified'}
- **Price Range:** $${data.pricing?.min || 0} - $${data.pricing?.max || 0}
- **Target Margin:** ${data.pricing?.targetMargin || 40}%

## Marketing
- **Monthly Budget:** $${data.monthlyBudget?.toLocaleString() || 0}
- **Revenue Goal:** $${data.revenueGoal?.toLocaleString() || 0}/month
- **Primary Channel:** ${channelLabels[data.primaryChannel] || data.primaryChannel || 'Not specified'}

## Platform
- **Shopify Connected:** ${data.shopifyConnected ? 'Yes' : 'No'}
- **Suppliers:** ${data.suppliers?.map((id: string) => supplierLabels[id] || id).join(', ') || 'Not specified'}

## Agent Instructions
${data.nicheAngles?.includes('eco_friendly') ? '- Prioritize eco-friendly and sustainable product sourcing\n' : ''}${data.nicheAngles?.includes('premium') ? '- Focus on premium positioning and quality over discounting\n' : ''}${data.nicheAngles?.includes('budget') ? '- Emphasize value and affordability in product selection\n' : ''}${data.nicheAngles?.includes('innovative') ? '- Seek innovative and unique products that stand out\n' : ''}${data.nicheAngles?.includes('health_focused') ? '- Prioritize health and wellness benefits in product descriptions\n' : ''}
- Maintain ${data.pricing?.targetMargin || 40}% or higher margins when suggesting products
- Use ${data.brandVoice?.playful > 6 ? 'a playful, enthusiastic' : data.brandVoice?.professional > 6 ? 'a professional, authoritative' : data.brandVoice?.luxury > 6 ? 'a sophisticated, luxury' : 'a balanced'} tone in all content
${data.visualStyle === 'playful' ? '- Use fun, engaging visuals and casual language' : data.visualStyle === 'luxury' ? '- Maintain premium aesthetic and elegant presentation' : data.visualStyle === 'minimal' ? '- Keep content clean, simple, and direct' : '- Follow brand visual guidelines consistently'}

## Notes
- This profile was generated by the Store Setup Wizard
- Update this file as your store evolves
- The AI agent uses this profile to make decisions about products, pricing, and marketing
`;
}

export default router;
