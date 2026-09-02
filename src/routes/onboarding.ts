import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { onboardingService } from '../services/onboardingService';
import { db, supabase } from '../db/supabase';
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

// Get current step prompt - NOW USES NEW 27-QUESTION SYSTEM
router.get('/step/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Use new 27-question system
    const { data: config } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();
    
    const currentIndex = config?.current_question_index || 0;
    const { ONBOARDING_QUESTIONS } = await import('../onboarding-questions');
    
    if (currentIndex >= ONBOARDING_QUESTIONS.length) {
      return res.json({
        stepNumber: 27,
        stepName: 'Onboarding Complete',
        prompt: 'You have completed all onboarding questions! You can now start using the AI workflow.',
        inputType: 'complete',
        isComplete: true,
      });
    }
    
    const question = ONBOARDING_QUESTIONS[currentIndex];
    
    // Map question type to old format
    let inputType = 'text';
    if (question.type === 'cards') inputType = 'single_select';
    else if (question.type === 'chips') inputType = 'multi_select';
    else if (question.type === 'slider') inputType = 'slider';
    else if (question.type === 'number') inputType = 'number';
    
    // Transform options to object format expected by frontend
    const transformedOptions = question.options?.map((opt, idx) => {
      // If option is already an object, return it
      if (typeof opt === 'object' && opt !== null && 'id' in opt) {
        return opt;
      }
      // Convert string option to object format
      const strOpt = String(opt);
      // Try to extract emoji and description from format like "Name (description)"
      const match = strOpt.match(/^([^)]+?)(?:\s*\(([^)]+)\))?$/);
      const name = match ? match[1].trim() : strOpt;
      const description = match && match[2] ? match[2].trim() : undefined;
      return {
        id: `${question.id}_${idx}`,
        name: name,
        description: description,
      };
    });
    
    // Map question to old format for compatibility
    res.json({
      stepNumber: currentIndex + 1,
      stepName: question.id,
      prompt: question.question,
      inputType: inputType,
      options: transformedOptions,
      section: question.section,
      totalSteps: 27,
    });
  } catch (error: any) {
    console.error('Get onboarding step error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save step response and advance - NOW USES NEW 27-QUESTION SYSTEM
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

    // Get current config
    const { data: config } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();
    
    const currentIndex = config?.current_question_index || 0;
    const answers = config?.onboarding_answers || {};
    
    // Save answer to new format
    answers[stepName] = data;
    const nextIndex = currentIndex + 1;
    const { ONBOARDING_QUESTIONS } = await import('../onboarding-questions');
    const isComplete = nextIndex >= ONBOARDING_QUESTIONS.length;
    
    // Update database
    const { error: updateError } = await supabase
      .from('store_configs')
      .update({
        current_question_index: nextIndex,
        onboarding_answers: answers,
        onboarding_status: isComplete ? 'complete' : 'in_progress',
        onboarding_step: nextIndex + 1, // backward compat
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', user.id);
    
    if (updateError) throw updateError;
    
    // Also save to memory
    await supabase.from('memory_entries').insert({
      user_id: user.id,
      store_id: storeId,
      type: 'onboarding_answer',
      key: stepName,
      value: typeof data === 'object' ? JSON.stringify(data) : String(data),
      created_at: new Date().toISOString(),
    });

    // Check if onboarding is now complete
    const workflowCheck = onboardingService.canStartWorkflow({ onboarding_answers: answers });

    // If complete, generate AI context summary
    if (isComplete) {
      await onboardingService.generateAIContextSummary(storeId);
    }

    res.json({
      success: true,
      nextStep: nextIndex + 1,
      status: isComplete ? 'complete' : 'in_progress',
      isComplete: isComplete,
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
    
    // Read from onboarding_data JSONB format
    // Read from actual columns with fallback to JSONB
    const answers = state.config?.onboarding_answers || state.config?.onboarding_data?.answers || {};
    const answers = onboardingData.answers || {};
    
    // Get credentials
    const { data: credentials } = await supabase
      .from('credentials')
      .select('*')
      .eq('store_id', storeId);
    
    const hasCredential = (type: string) => credentials?.some((c: any) => c.service_type === type);
    
    // Get worker
    const { data: workers } = await supabase
      .from('workers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    
    const worker = workers?.[0] ? {
      id: workers[0].id,
      status: workers[0].status,
      ip: workers[0].ip_address,
      created_at: workers[0].created_at,
    } : null;
    
    // Determine current stage
    let currentStage = 'onboarding';
    if (state.isComplete) {
      if (!onboardingData.research_complete) currentStage = 'research';
      else if (!hasCredential('cj_dropshipping')) currentStage = 'cj_dropshipping';
      else if (!hasCredential('shopify')) currentStage = 'shopify';
      else if (!hasCredential('meta_ads')) currentStage = 'meta_ads';
      else currentStage = 'complete';
    }
    
    res.json({
      onboardingComplete: state.isComplete,
      canStartWorkflow: workflowCheck.ready,
      missingRequirements: workflowCheck.missing,
      aiConfigured: true,
      researchComplete: onboardingData.research_complete || false,
      cjConnected: hasCredential('cj_dropshipping'),
      shopifyConnected: hasCredential('shopify'),
      metaConnected: hasCredential('meta_ads'),
      worker: worker,
      currentStage: currentStage,
      storeConfig: {
        market: answers.category || answers.niche || 'Not set',
        brandVoice: onboardingData.site_style || 'Not set',
        siteStyle: onboardingData.site_style || 'Not set',
        targetAudience: onboardingData.target_audience || 'Not set',
      },
      onboardingAnswers: answers,
      currentQuestion: state.config?.onboarding_step || 0,
      totalQuestions: 5,
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
    
    // Handle streamlined format (answers object) or legacy format
    const answers = onboardingData.onboarding_answers || onboardingData;
    
    // Extract values from streamlined format
    const category = Array.isArray(answers.category) ? answers.category[0] : answers.category;
    const audience = Array.isArray(answers.target_audience) ? answers.target_audience : [answers.target_audience];
    const priceRange = answers.price_range || answers.pricing || '$25-50';
    const budget = answers.monthly_budget || answers.marketing_budget_monthly || '$1,000 - $3,000';
    const storeName2 = answers.store_name || storeName || 'My Store';

    // Update store config with streamlined onboarding data
    const { data: updatedConfig, error: configError } = await db.supabase
      .from('store_configs')
      .update({
        onboarding_status: 'complete',
        onboarding_step: answers.current_question_index || 5,
        onboarding_answers: answers,
        onboarding_data: {
          completed_at: new Date().toISOString(),
          answers
        },
        // Store key fields in proper columns (SQL migration added these)
        site_style: 'modern',
        market_category: category?.split(' ')[0] || 'General',
        market_subcategory: category || 'Products',
        target_audience: Array.isArray(audience) ? audience : [audience].filter(Boolean),
        pricing: {
          range: priceRange,
          product_types: category ? [category] : [],
          marketing_budget_monthly: parseInt(budget.replace(/[^0-9]/g, '')) || 2000,
        },
        marketing_budget_monthly: parseInt(budget.replace(/[^0-9]/g, '')) || 2000,
        business_goals: [{
          goal: 'Launch store',
          revenue_target: 'TBD',
          primary_channel: 'Meta Ads'
        }],
        brand_voice: JSON.stringify({ audience }),
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

// Reset onboarding for a store
router.post('/reset/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { storeId } = req.params;

    // Verify store belongs to user
    const store = await db.getStoreById(storeId);
    if (!store || store.user_id !== user.id) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Reset store config onboarding data
    const { error: configError } = await supabase
      .from('store_configs')
      .update({
        current_question_index: 0,
        onboarding_answers: {},
        onboarding_status: 'incomplete',
        onboarding_step: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', user.id);

    if (configError) throw configError;

    // Delete all memory entries for this store's onboarding
    await supabase
      .from('memory_entries')
      .delete()
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .eq('type', 'onboarding_answer');

    res.json({ success: true, message: 'Onboarding reset successfully' });
  } catch (error: any) {
    console.error('Reset onboarding error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
