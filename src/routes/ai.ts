import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';

const router = Router();

// Valid AI providers
const VALID_PROVIDERS = ['openai', 'openrouter', 'anthropic', 'google', 'mistral'];

// Default model configurations
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  openrouter: 'moonshotai/kimi-k2.5',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-pro',
  mistral: 'mistral-large-latest',
};

// Configure AI provider
router.post(
  '/configure',
  authenticate,
  body('provider').isIn(VALID_PROVIDERS).withMessage('Invalid provider'),
  body('model').notEmpty().withMessage('Model is required'),
  body('apiKey').notEmpty().withMessage('API key is required'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { provider, model, apiKey } = req.body;

      // Validate the provider/model combo exists
      const validModels = getValidModels(provider);
      if (!validModels.includes(model)) {
        return res.status(400).json({ error: `Invalid model for ${provider}` });
      }

      // Save encrypted to database
      await db.saveAIConfig(user.id, {
        provider,
        model,
        apiKey, // Will be encrypted by db layer
      });

      res.json({ 
        success: true, 
        message: 'AI provider configured',
        provider,
        model,
      });
    } catch (error: any) {
      console.error('AI config error:', error);
      res.status(500).json({ error: 'Failed to save AI configuration' });
    }
  }
);

// Get AI config (without API key)
router.get('/config', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const config = await db.getAIConfig(user.id);
    
    if (!config) {
      return res.json({ configured: false });
    }

    res.json({
      configured: true,
      provider: config.provider,
      model: config.model,
      // Don't return the API key for security
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch AI configuration' });
  }
});

function getValidModels(provider: string): string[] {
  const models: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo', 'gpt-4o-mini'],
    openrouter: ['moonshotai/kimi-k2.5', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-405b', 'openai/gpt-4o'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
    google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro-latest'],
    mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  };
  return models[provider] || [];
}

export default router;