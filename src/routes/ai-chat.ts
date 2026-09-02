import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';
import axios from 'axios';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { getWorkerCommandQueue, WORKER_TASKS } from '../services/workerCommands';
import { canMakeRequest, trackSpend, getBudgetStatus, formatBudgetAlert } from '../services/budgetGuard';
import { ONBOARDING_QUESTIONS, TOTAL_ONBOARDING_QUESTIONS, getQuestion } from '../onboarding-questions';

const router = Router();

// OpenRouter API client
async function callOpenRouter(
  messages: any[],
  apiKey: string,
  model: string = 'moonshotai/kimi-k2.5',
  userId?: string
) {
  console.log('Calling OpenRouter with model:', model, 'key length:', apiKey?.length);
  
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Invalid API key provided');
  }
 
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://shoppdropp.com',
        'X-Title': 'ShoppDropp AI Agent',
      },
      timeout: 30000,
    }
  );

  return response.data.choices[0].message;
}

// System prompt templates
const ONBOARDING_PROMPT = `You are the ShoppDropp AI Agent. You help users set up their dropshipping business.

CRITICAL RULES:
1. This is a 5-question streamlined onboarding. Ask one question at a time.
2. After user answers, acknowledge briefly then ask the NEXT question.
3. DO NOT mention API keys or integrations until ALL 5 questions are complete.
4. DO NOT generate [[FORM]] blocks - the system adds them automatically.

QUESTION SEQUENCE:
1. Brand name
2. Product category/niche  
3. Target audience
4. Price range
5. Marketing budget

Onboarding is IN PROGRESS. Complete all 5 questions before moving to next phase.`;

const POST_ONBOARDING_PROMPT = `You are the ShoppDropp AI Agent. The user has COMPLETED their onboarding.

CRITICAL RULES:
1. DO NOT ask onboarding questions again - they are already complete.
2. Help the user with their next steps: research, connect APIs (CJ, Shopify, Meta), or run product research.
3. Be helpful and action-oriented. Suggest what they should do next based on their business profile.
4. If they want to start research, confirm their niche and offer to begin.
5. DO NOT generate [[FORM]] blocks - the system adds them automatically.

The user is ready to proceed with their business setup.`;

// Main chat endpoint
router.post('/chat', authenticate, async (req: Request, res: Response) => {
  try {
    const { message, conversation_history = [] } = req.body;
    const user = (req as any).user;
    
    // Get user's AI config
    const { data: aiConfig } = await supabase
      .from('ai_configs')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    const apiKey = aiConfig?.api_key || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'No AI provider configured' });
    }

    // Budget guard
    const model = aiConfig?.model || 'moonshotai/kimi-k2.5';
    const budgetCheck = await canMakeRequest(user.id, model, apiKey);
    if (!budgetCheck.allowed) {
      return res.status(429).json({
        error: 'Budget limit reached',
        budget_error: true,
        ...budgetCheck,
      });
    }

    // Get user's active store and worker
    const { data: stores } = await supabase
      .from('stores')
      .select('*')
      .eq('user_id', user.id);
    
    const activeStore = stores?.find((s: any) => s.is_active) || stores?.[0];
    
    // Get active worker
    const { data: workers } = await supabase
      .from('workers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);
    
    const activeWorker = workers?.[0];

    // Get store config
    let storeConfig: any = null;
    let currentQuestionIndex = 0;
    let onboardingAnswers: Record<string, any> = {};
    
    if (activeStore) {
      const { data: config } = await supabase
        .from('store_configs')
        .select('*')
        .eq('store_id', activeStore.id)
        .single();
      
      if (config) {
        storeConfig = config;
        currentQuestionIndex = config.current_question_index || 0;
        onboardingAnswers = config.onboarding_answers || {};
      } else {
        // Create initial config
        const { data: newConfig } = await supabase
          .from('store_configs')
          .insert({
            store_id: activeStore.id,
            user_id: user.id,
            onboarding_status: 'incomplete',
            current_question_index: 0,
            onboarding_answers: {},
          })
          .select()
          .single();
        storeConfig = newConfig;
      }
    }

    // Check if we're in onboarding mode
    const isOnboarding = !storeConfig || storeConfig.onboarding_status !== 'complete';
    
    // Get credentials
    const { data: credentials } = await supabase
      .from('credentials')
      .select('*')
      .eq('store_id', activeStore?.id)

    // Select appropriate prompt based on onboarding status
    let contextPrompt = isOnboarding ? ONBOARDING_PROMPT : POST_ONBOARDING_PROMPT;
    
    if (activeStore) {
      contextPrompt += `\n\n## Active Store\nName: ${activeStore.name}\nID: ${activeStore.id}`;
    }
    
    if (isOnboarding && activeStore) {
      // ONBOARDING MODE - ask next question
      const question = getQuestion(currentQuestionIndex);
      
      if (question) {
        contextPrompt += `\n\n## ONBOARDING IN PROGRESS\n`;
        contextPrompt += `Question ${currentQuestionIndex + 1} of ${TOTAL_ONBOARDING_QUESTIONS}\n`;
        contextPrompt += `Completed: ${Object.keys(onboardingAnswers).length} questions\n\n`;
        contextPrompt += `CURRENT QUESTION:\n${question.question}\n\n`;
        contextPrompt += `Ask this question now. Include the appropriate FORM block.`;
        
        // Add form format
        const formData: any = { type: question.type };
        if (question.options) formData.options = question.options;
        if (question.placeholder) formData.placeholder = question.placeholder;
        if (question.multi) formData.multi = true;
        if (question.min !== undefined) formData.min = question.min;
        if (question.max !== undefined) formData.max = question.max;
        if (question.prefix) formData.prefix = question.prefix;
        
        contextPrompt += `\n\n[[FORM]]\n${JSON.stringify(formData)}\n[[/FORM]]`;
      } else {
        // All questions answered!
        contextPrompt += `\n\n## ONBOARDING COMPLETE!\n`;
        contextPrompt += `All ${TOTAL_ONBOARDING_QUESTIONS} questions answered.\n`;
        contextPrompt += `Congratulate the user and tell them to add their API keys in the sidebar.`;
      }
    } else if (storeConfig?.onboarding_status === 'complete') {
      // Check API keys
      const configuredServices = (credentials || []).map((c: any) => c.service_type);
      const missingApis = [
        'shopify', 'cj_dropshipping', 'meta_ads',
        'openwebninja_amazon', 'openwebninja_walmart',
        'openwebninja_ebay', 'openwebninja_product_search',
        'openwebninja_ecommerce'
      ].filter(s => !configuredServices.includes(s));
      
      if (missingApis.length > 0) {
        contextPrompt += `\n\n## NEXT: API KEYS REQUIRED\n`;
        contextPrompt += `Missing: ${missingApis.join(', ')}\n`;
        contextPrompt += `Tell user to click "API Keys" in sidebar and enter all keys.`;
      } else {
        contextPrompt += `\n\n## FULLY CONFIGURED ✅\n`;
        contextPrompt += `All APIs connected. Offer to start workflows.`;
      }
    }

    // Build messages
    const messages = [
      { role: 'system', content: contextPrompt },
      ...conversation_history.slice(-10),
      { role: 'user', content: message },
    ];

    // Call AI
    const aiResponse = await callOpenRouter(messages, apiKey, aiConfig?.model, user.id);

    // Track spend (estimate ~0.001 per request)
    await trackSpend(user.id, 0.001, aiConfig?.model || 'moonshotai/kimi-k2.5');

    // If in onboarding, save the answer
    if (isOnboarding && activeStore && currentQuestionIndex < TOTAL_ONBOARDING_QUESTIONS) {
      const question = getQuestion(currentQuestionIndex);
      if (question) {
        // Save answer
        const updatedAnswers = {
          ...onboardingAnswers,
          [question.id]: message,
        };
        
        const nextIndex = currentQuestionIndex + 1;
        const isComplete = nextIndex >= TOTAL_ONBOARDING_QUESTIONS;
        
        await supabase
          .from('store_configs')
          .update({
            current_question_index: nextIndex,
            onboarding_answers: updatedAnswers,
            onboarding_status: isComplete ? 'complete' : 'in_progress',
            updated_at: new Date().toISOString(),
          })
          .eq('store_id', activeStore.id);
        
        // Also save to memory for AI context
        await saveToMemory(activeStore.id, user.id, question.id, message);
      }
    }

    // Check for budget alert
    const budgetStatus = await getBudgetStatus(user.id, apiKey);
    let budgetAlert = null;
    if (budgetStatus && budgetStatus.percentageUsed > 80) {
      budgetAlert = formatBudgetAlert(
        80,
        budgetStatus.weeklySpent,
        budgetStatus.weeklyLimit,
        budgetStatus.resetsAt
      );
    }

    res.json({
      response: aiResponse.content,
      worker_status: activeWorker?.status || 'none',
      store: activeStore?.name || null,
      budget_alert: budgetAlert,
      onboarding_status: {
        isComplete: storeConfig?.onboarding_status === 'complete',
        currentQuestion: currentQuestionIndex,
        totalQuestions: TOTAL_ONBOARDING_QUESTIONS,
      },
    });

  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to process chat' });
  }
});

// Save onboarding answer to memory
async function saveToMemory(storeId: string, userId: string, questionId: string, answer: string) {
  try {
    await supabase.from('memory_entries').insert({
      user_id: userId,
      store_id: storeId,
      type: 'onboarding_answer',
      key: questionId,
      value: answer,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to save memory:', e);
  }
}

// Get onboarding progress
router.get('/onboarding-progress/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const user = (req as any).user;
    
    const { data: config } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .single();
    
    if (!config) {
      return res.json({
        currentQuestion: 0,
        totalQuestions: TOTAL_ONBOARDING_QUESTIONS,
        answers: {},
        isComplete: false,
      });
    }
    
    res.json({
      currentQuestion: config.current_question_index || 0,
      totalQuestions: TOTAL_ONBOARDING_QUESTIONS,
      answers: config.onboarding_answers || {},
      isComplete: config.onboarding_status === 'complete',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset onboarding (for editing)
router.post('/reset-onboarding/:storeId', authenticate, async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const user = (req as any).user;
    
    await supabase
      .from('store_configs')
      .update({
        current_question_index: 0,
        onboarding_answers: {},
        onboarding_status: 'incomplete',
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', user.id);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get AI context (used by frontend to initialize chat)
router.get('/context', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get user's active store
    const { data: stores } = await supabase
      .from('stores')
      .select('*')
      .eq('user_id', user.id);
    
    const activeStore = stores?.find((s: any) => s.is_active) || stores?.[0];
    
    // Get active worker
    const { data: workers } = await supabase
      .from('workers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);
    
    const activeWorker = workers?.[0];
    
    // Get store config for onboarding status
    let storeConfig: any = null;
    let currentQuestionIndex = 0;
    let onboardingAnswers: Record<string, any> = {};
    
    if (activeStore) {
      const { data: config } = await supabase
        .from('store_configs')
        .select('*')
        .eq('store_id', activeStore.id)
        .single();
      
      if (config) {
        storeConfig = config;
        currentQuestionIndex = config.current_question_index || 0;
        onboardingAnswers = config.onboarding_answers || {};
      }
    }
    
    // Get credentials
    const { data: credentials } = await supabase
      .from('credentials')
      .select('*')
      .eq('store_id', activeStore?.id)
    
    // Build context
    const context = {
      user: {
        id: user.id,
        email: user.email,
      },
      stores: activeStore ? [{
        id: activeStore.id,
        name: activeStore.name,
        url: activeStore.url,
        onboarding_status: storeConfig?.onboarding_status || 'incomplete',
        current_question_index: currentQuestionIndex,
        onboarding_answers: onboardingAnswers,
      }] : [],
      workers: activeWorker ? [{
        id: activeWorker.id,
        status: activeWorker.status,
        ip: activeWorker.ip_address,
      }] : [],
      credentials: credentials || [],
      budget: {
        configured: false,
        weekly_limit: 0,
        weekly_spent: 0,
      },
    };
    
    res.json(context);
  } catch (error: any) {
    console.error('Get context error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple chat endpoint - no onboarding logic, just AI response
router.post('/simple', authenticate, async (req: Request, res: Response) => {
  try {
    const { message, store_id, stage } = req.body;
    const user = (req as any).user;
    
    // Get system API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Build simple system prompt
    const systemPrompt = `You are the ShoppDropp AI Business Advisor - an expert VC and investment banker who helps build dropshipping businesses.

Current workflow stage: ${stage || 'onboarding'}

Be concise, professional, and helpful. You have access to:
- OpenWeb Ninja for product research (5 platforms)
- CJ Dropshipping for sourcing
- Shopify for store building
- Meta Ads for marketing
- Railway for video generation

Guide users through the workflow: Onboarding → Research → CJ → Shopify → Meta Ads.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    const aiResponse = await callOpenRouter(messages, apiKey, 'moonshotai/kimi-k2.5', user.id);

    res.json({ response: aiResponse.content });
  } catch (error: any) {
    console.error('Simple chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to get AI response' });
  }
});

export default router;
