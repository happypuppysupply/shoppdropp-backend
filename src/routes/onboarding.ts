import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { onboardingService } from '../services/onboardingService';
import { db } from '../db/supabase';

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

export default router;
