import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';
import axios from 'axios';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { getWorkerCommandQueue, WORKER_TASKS } from '../services/workerCommands';
import { canMakeRequest, trackSpend, getBudgetStatus, formatBudgetAlert } from '../services/budgetGuard';

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
  
  // Budget guard check (if userId provided)
  if (userId) {
    const guardResult = await canMakeRequest(userId, model, apiKey);
    
    if (!guardResult.allowed) {
      const error = new Error(guardResult.reason || 'Budget limit reached');
      (error as any).isBudgetError = true;
      (error as any).guardResult = guardResult;
      throw error;
    }
    
    console.log(`[Budget] Request allowed. Estimated: $${guardResult.estimatedCost?.toFixed(4)}`);
  }
  
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://shoppdropp.com',
          'X-Title': 'ShoppDropp AI Agent',
        },
      }
    );
    
    // Track actual spend
    if (userId && response.data?.usage) {
      const usage = response.data.usage;
      // Calculate cost based on actual tokens
      const pricing: Record<string, { input: number; output: number }> = {
        'moonshotai/kimi-k2.5': { input: 0.002, output: 0.008 },
        'moonshotai/kimi-k2.6': { input: 0.003, output: 0.012 },
        'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
        'openai/gpt-4o': { input: 0.005, output: 0.015 },
        'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      };
      
      const modelPricing = pricing[model] || pricing['moonshotai/kimi-k2.5'];
      const inputCost = (usage.prompt_tokens / 1000) * modelPricing.input;
      const outputCost = (usage.completion_tokens / 1000) * modelPricing.output;
      const actualCost = inputCost + outputCost;
      
      const trackResult = await trackSpend(userId, actualCost, model);
      console.log(`[Budget] Tracked spend: $${actualCost.toFixed(4)}, Total: $${trackResult.newTotal.toFixed(4)}`);
      
      // Check if threshold crossed and include alert in response
      if (trackResult.thresholdCrossed) {
        const status = await getBudgetStatus(userId);
        if (status) {
          (response.data as any).budgetAlert = formatBudgetAlert(
            trackResult.thresholdCrossed,
            trackResult.newTotal,
            status.weeklyLimit,
            status.resetsAt
          );
        }
      }
    }
    
    return response.data.choices[0].message;
  } catch (error: any) {
    // Re-throw budget errors as-is
    if (error.isBudgetError) throw error;
    
    console.error('OpenRouter API error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to get AI response');
  }
}

// System prompt for the AI agent
const SYSTEM_PROMPT = `You are the ShoppDropp AI Agent, an autonomous dropshipping assistant. You help entrepreneurs build and grow profitable dropshipping businesses on autopilot.

## YOUR PRIMARY WORKFLOW (The ShoppDropp Method)
When a user completes onboarding, you execute this continuous improvement cycle:

1. **Product Research** - Find trending, high-margin products in their niche
2. **Supplier Sourcing** - Connect with CJ Dropshipping for reliable fulfillment
3. **Store Building** - Create Shopify theme, product listings, catalog organization
4. **Marketing Launch** - Set up Meta Ads campaigns targeting their audience
5. **Performance Review** - Analyze metrics, conversion rates, ad performance
6. **Optimization Report** - Generate insights and recommendations
7. **Iterate & Repeat** - Continuously improve based on data

## ONBOARDING IS CRITICAL
Before starting the workflow, the user MUST complete store configuration. This includes:
- Market category and specific niche
- Target audience demographics and psychographics
- Customer pain points and goals
- Brand voice and visual style
- Product strategy and pricing
- Marketing budget and goals

If onboarding is incomplete, you MUST prompt them to complete it first. You cannot execute the workflow without this context.

## Current Context Sections
The following sections will be populated with the user's specific configuration:
- STORE_CONFIG: Their niche, audience, brand settings
- ONBOARDING_STATUS: Whether configuration is complete
- WORKER_STATUS: VPS worker health and capabilities
- CREDENTIALS: Available API keys and integrations

## Capabilities

### Store Management
- Create Shopify products with SEO-optimized descriptions
- Organize products into collections/categories
- Sync inventory with CJ Dropshipping or AutoDS
- Price monitoring and dynamic adjustments

### Marketing Automation
- Create Meta Ads campaigns with targeting
- Generate ad copy, headlines, descriptions
- A/B test creatives and audiences
- Optimize based on ROAS and conversion data

### Product Research
- Find trending products in their niche
- Analyze competitor pricing and positioning
- Calculate profit margins and demand
- Source from CJ Dropshipping catalog

### Analytics & Reporting
- Track store performance metrics
- Analyze ad campaign effectiveness
- Generate weekly/monthly reports
- Provide actionable recommendations

### VPS Worker Control
When the user wants infrastructure actions, return a JSON command block FIRST:

[[COMMAND]]
{"action": "worker_command", "command": "provision", "store_id": "STORE_ID"}
[[/COMMAND]]
Then your text response.

Available commands:
- "provision" - Create VPS and install OpenClaw Gateway
- "destroy" - Remove VPS (use with caution)
- "reboot" - Restart VPS
- "status" - Check VPS health and metrics
- "run_task" - Execute automation task

### Automation Tasks
- product_research - AI-powered trending product discovery
- catalog_sync - Import products from CJ Dropshipping
- price_optimization - Dynamic pricing based on competition
- meta_ads_create - Build and launch ad campaigns
- content_generation - Write blog posts, emails, social content
- inventory_sync - Update stock levels from suppliers

## IMPORTANT RULES

1. **ALWAYS check onboarding status first**. If incomplete, guide them through configuration before offering workflow execution.

2. **Be proactive**. Suggest next steps based on their current progress.

3. **Use their context**. Reference their specific niche, audience, and brand voice in all recommendations.

4. **Commands first**. When they want to take action (provision, run task, etc.), output the JSON command block before your explanation.

5. **No generic advice**. Everything should be tailored to their store configuration.

6. **Budget conscious**. Respect their marketing budget and suggest appropriate strategies.

7. **Iterate mindset**. Emphasize that dropshipping success comes from continuous testing and optimization.`;

// Chat endpoint
router.post('/chat', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { message, conversation_history = [] } = req.body;

    console.log('AI Chat request from user:', user.id);

    // Get user's AI config
    const aiConfig = await db.getAIConfig(user.id);
    console.log('AI Config retrieved:', aiConfig ? { 
      provider: aiConfig.provider, 
      model: aiConfig.model, 
      hasKey: !!aiConfig.api_key_encrypted,
      keyLength: aiConfig.api_key_encrypted?.length,
      keyPrefix: aiConfig.api_key_encrypted?.substring(0, 10) + '...'
    } : 'null');
    
    if (!aiConfig) {
      return res.status(400).json({ error: 'AI provider not configured. Please set up OpenRouter in settings.' });
    }

    // Determine which API key to use: personal or platform
    let apiKey = aiConfig.api_key_encrypted;
    let usingPlatformKey = false;
    
    if (!apiKey && aiConfig.use_platform_ai) {
      apiKey = process.env.OPENROUTER_API_KEY;
      usingPlatformKey = true;
    }
    
    if (!apiKey) {
      console.error('AI API key is missing for user:', user.id);
      return res.status(400).json({ error: 'AI API key not found. Please reconfigure your AI provider in settings.' });
    }
    
    console.log(`Using ${usingPlatformKey ? 'platform' : 'personal'} API key for user ${user.id}`);

    // Get user's worker/store info for context
    const workers = await db.getWorkersByUser(user.id);
    const stores = await db.getStoresByUser(user.id);
    
    const activeWorker = workers.find(w => w.status === 'running' || w.status === 'configuring');
    const activeStore = stores[0]; // Use first store for context

    // Get credentials for the active store
    let credentials: any[] = [];
    if (activeStore) {
      credentials = await db.getCredentialsByStore(activeStore.id);
    }

    // Get store configuration for context
    let storeConfig: any = null;
    let onboardingStatus: any = null;
    if (activeStore) {
      const { data: config } = await supabase
        .from('store_configs')
        .select('*')
        .eq('store_id', activeStore.id)
        .single();
      storeConfig = config;
      onboardingStatus = config ? {
        status: config.onboarding_status,
        step: config.onboarding_step,
        isComplete: config.onboarding_status === 'complete',
      } : null;
    }

    // Build context-enhanced system prompt
    let contextPrompt = SYSTEM_PROMPT;
    
    // Add worker info
    if (activeWorker) {
      contextPrompt += `\n\n## Current Worker\nID: ${activeWorker.id}\nStatus: ${activeWorker.status}\nIP: ${activeWorker.ip_address || 'N/A'}\nServer ID: ${activeWorker.hetzner_server_id || 'N/A'}`;
    }
    
    // Add store info
    if (activeStore) {
      contextPrompt += `\n\n## Active Store\nName: ${activeStore.name}\nPlatform: ${activeStore.platform}\nStore ID: ${activeStore.id}`;
    }
    
    // Add store configuration context (CRITICAL for workflow)
    if (storeConfig && storeConfig.onboarding_status === 'complete') {
      contextPrompt += `\n\n## STORE CONFIGURATION (Onboarding Complete ✅)\n`;
      contextPrompt += `Niche: ${storeConfig.market_niche || storeConfig.market_subcategory || 'Not specified'}\n`;
      contextPrompt += `Brand Voice: ${storeConfig.brand_voice || 'Not specified'}\n`;
      contextPrompt += `Site Style: ${storeConfig.site_style || 'Not specified'}\n`;
      if (storeConfig.target_audience) {
        const audience = storeConfig.target_audience;
        contextPrompt += `Target Audience: ${audience.primary?.age_range || 'General'} | ${audience.primary?.income_level || 'Various'} income\n`;
        if (audience.psychographics?.interests?.length) {
          contextPrompt += `Interests: ${audience.psychographics.interests.slice(0, 3).join(', ')}\n`;
        }
        if (audience.pain_points?.length) {
          contextPrompt += `Key Pain Points: ${audience.pain_points.slice(0, 3).join(', ')}\n`;
        }
      }
      contextPrompt += `Product Strategy: ${storeConfig.price_strategy || 'Not specified'} pricing\n`;
      if (storeConfig.ai_context_summary) {
        contextPrompt += `\nAI Summary: ${storeConfig.ai_context_summary}`;
      }
    } else if (storeConfig) {
      contextPrompt += `\n\n## ONBOARDING STATUS (Incomplete ⚠️)\n`;
      contextPrompt += `Current Step: ${storeConfig.onboarding_step || 1} of 11\n`;
      contextPrompt += `Status: ${storeConfig.onboarding_status || 'incomplete'}\n`;
      contextPrompt += `\n⚠️ CRITICAL: Store configuration is incomplete. You must prompt the user to complete onboarding before executing the workflow.`;
    } else {
      contextPrompt += `\n\n## ONBOARDING STATUS (Not Started ❌)\n`;
      contextPrompt += `Status: No configuration found\n`;
      contextPrompt += `\n⚠️ CRITICAL: User has not configured their store. They need to complete the onboarding wizard to provide market, audience, and brand information before you can help with the workflow.`;
    }
    
    // Add credentials info to context
    if (credentials.length > 0) {
      contextPrompt += `\n\n## Configured API Keys/Integrations\nThe following integrations have API credentials stored and are available for use:`;
      for (const cred of credentials) {
        const hasKeys = cred.api_key || cred.access_token || cred.refresh_token || cred.password;
        contextPrompt += `\n- ${cred.service_type}: ${hasKeys ? '✅ Configured' : '❌ Not configured'}`;
      }
      contextPrompt += `\n\nWhen the user asks about API keys or integrations, you should confirm which ones are available based on this list.`;
    }

    // Build messages array
    const messages = [
      { role: 'system', content: contextPrompt },
      ...conversation_history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message },
    ];

    // Call OpenRouter (with budget guard)
    const aiResponse = await callOpenRouter(messages, apiKey, aiConfig.model, user.id);

    // Parse for commands (using [[COMMAND]] format)
    let commandResult = null;
    const commandMatch = aiResponse.content.match(/\[\[COMMAND\]\]\s*(\{.*?\})\s*\[\[\/COMMAND\]\]/s);
    
    if (commandMatch) {
      try {
        const command = JSON.parse(commandMatch[1]);
        console.log('Parsed command:', command);
        
        // Execute the command
        if (command.action === 'worker_command') {
          commandResult = await executeWorkerCommand(command, activeWorker, user.id, activeStore);
        } else if (command.action === 'run_task' && activeWorker) {
          commandResult = await executeTask(command, activeWorker, user.id);
        }
        
        // Remove the command block from the response shown to user
        aiResponse.content = aiResponse.content.replace(/\[\[COMMAND\]\]\s*\{.*?\}\s*\[\[\/COMMAND\]\]\s*/s, '').trim();
      } catch (e) {
        console.error('Failed to parse command:', e);
      }
    }

    // Check for budget alert from the response
    const budgetAlert = (aiResponse as any).budgetAlert;
    
    res.json({
      response: aiResponse.content,
      command_executed: commandResult,
      worker_status: activeWorker?.status || 'none',
      store: activeStore?.name || null,
      budget_alert: budgetAlert || null,
    });

  } catch (error: any) {
    console.error('AI chat error:', error);
    
    // Handle budget guard errors specially
    if (error.isBudgetError) {
      const guardResult = error.guardResult;
      return res.status(429).json({
        error: 'Budget limit reached',
        budget_error: true,
        reason: guardResult.reason,
        remaining: guardResult.remaining,
        suggestion: guardResult.suggestion,
        resets_at: guardResult.resetsAt?.toISOString(),
        percentage_used: guardResult.percentageUsed,
      });
    }
    
    res.status(500).json({ error: error.message || 'Failed to process chat' });
  }
});

// Execute worker commands
async function executeWorkerCommand(command: any, worker: any, userId: string, store: any) {
  const { command: cmd, worker_id, store_id } = command;
  
  try {
    switch (cmd) {
      case 'status':
        if (!worker || !worker.hetzner_server_id) {
          return { status: 'error', message: 'VPS not provisioned yet' };
        }
        const hetzner = (await import('../services/hetznerService')).getHetznerService();
        const server = await hetzner.getServer(parseInt(worker.hetzner_server_id));
        return { 
          status: 'success', 
          data: {
            server_status: server.status,
            ip: server.public_net.ipv4.ip,
            type: server.server_type.name,
            cores: server.server_type.cores,
            memory: server.server_type.memory,
          }
        };
        
      case 'provision':
        // Find or create a worker for this store
        let targetWorker = worker;
        if (!targetWorker) {
          // Create a new worker
          const { data: newWorker, error } = await supabase
            .from('workers')
            .insert({
              user_id: userId,
              store_id: store?.id,
              status: 'provisioning',
            })
            .select()
            .single();
          if (error) throw new Error('Failed to create worker: ' + error.message);
          targetWorker = newWorker;
        }
        
        if (targetWorker.status === 'running' || targetWorker.status === 'configuring' || targetWorker.status === 'provisioning') {
          return { status: 'error', message: 'Worker already provisioned or provisioning' };
        }
        
        // Trigger provisioning
        const provisioner = createVPSProvisioner();
        
        // Update worker status to provisioning
        await db.updateWorker(targetWorker.id, { status: 'provisioning' });
        
        // Start provisioning asynchronously
        provisioner.provisionVPS({
          workerId: targetWorker.id,
          storeId: store?.id || '',
          userId: userId,
          envVars: {}
        })
          .then(async (result) => {
            console.log('Provisioning result:', result);
            if (result.status === 'success') {
              await db.updateWorker(targetWorker.id, { 
                status: 'configuring',
                hetzner_server_id: result.serverId.toString(),
                ip_address: result.ipAddress,
              });
            } else {
              await db.updateWorker(targetWorker.id, { status: 'error' });
            }
          })
          .catch(async (error) => {
            console.error('Provisioning failed:', error);
            await db.updateWorker(targetWorker.id, { status: 'error' });
          });
        
        return { status: 'in_progress', message: 'VPS provisioning started. This will take 2-3 minutes. The worker status will update automatically.' };
        
      case 'reboot':
        if (!worker || !worker.hetzner_server_id) {
          return { status: 'error', message: 'VPS not provisioned' };
        }
        const hetznerReboot = (await import('../services/hetznerService')).getHetznerService();
        await hetznerReboot.reboot(parseInt(worker.hetzner_server_id));
        return { status: 'success', message: 'VPS reboot initiated' };
        
      case 'destroy':
        if (!worker || !worker.hetzner_server_id) {
          return { status: 'error', message: 'VPS not provisioned' };
        }
        const provisionerDestroy = createVPSProvisioner();
        await provisionerDestroy.destroyVPS(parseInt(worker.hetzner_server_id), worker.id);
        return { status: 'success', message: 'VPS destroyed' };
        
      default:
        return { status: 'error', message: `Unknown command: ${cmd}` };
    }
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}

// Import product research service
import { productResearchService } from '../services/productResearchService';

// Execute tasks on worker
async function executeTask(command: any, worker: any, userId: string) {
  const { task, params = {} } = command;
  
  // Validate task type
  const taskDef = Object.values(WORKER_TASKS).find(t => t.name === task);
  if (!taskDef) {
    return {
      status: 'error',
      message: `Unknown task type: "${task}". Available tasks: ${Object.values(WORKER_TASKS).map(t => t.name).join(', ')}`
    };
  }
  
  // Handle specific tasks with real API calls
  if (task === 'product_research') {
    try {
      console.log(`🔍 Starting real product research for user ${userId}`);
      
      const result = await productResearchService.startResearch({
        store_id: params.store_id,
        user_id: userId,
        category: params.category,
        keywords: params.keywords,
        min_price: params.min_price,
        max_price: params.max_price,
      });
      
      return {
        status: 'running',
        task,
        research_id: result.id,
        command_id: result.id,
        worker_id: worker.id,
        estimated_duration: '5-10 minutes',
        message: `Product research started. Research ID: ${result.id}`,
        note: 'Research is running in background. Check back in 5-10 minutes for results.'
      };
    } catch (error: any) {
      console.error('Product research error:', error);
      return {
        status: 'error',
        task,
        message: `Failed to start product research: ${error.message}`
      };
    }
  }
  
  // For other tasks, queue them for the worker
  const queue = getWorkerCommandQueue();
  const queuedCommand = await queue.createCommand(worker.id, 'run_task', {
    task_type: task,
    params,
    task_definition: taskDef,
    user_id: userId,
  });
  
  return { 
    status: 'queued', 
    task, 
    params,
    command_id: queuedCommand.id,
    worker_id: worker.id,
    estimated_duration: taskDef.duration_estimate,
    message: `Task "${task}" has been queued for the worker. Estimated duration: ${taskDef.duration_estimate}` 
  };
}

// Get worker status for chat context
router.get('/context', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    const workers = await db.getWorkersByUser(user.id);
    const stores = await db.getStoresByUser(user.id);
    const aiConfig = await db.getAIConfig(user.id);
    
    res.json({
      workers: workers.map(w => ({
        id: w.id,
        status: w.status,
        ip: w.ip_address,
        server_id: w.hetzner_server_id,
      })),
      stores: stores.map(s => ({
        id: s.id,
        name: s.name,
        platform: s.platform,
      })),
      ai_configured: !!aiConfig,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run a task on the worker
router.post('/task', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { task, store_id, ...params } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task name is required' });
    }
    
    // Get active worker for user
    const workers = await db.getWorkersByUser(user.id);
    const activeWorker = workers.find(w => w.status === 'running' || w.status === 'provisioning');
    
    if (!activeWorker) {
      return res.status(400).json({ 
        error: 'No active worker found',
        message: 'Please setup a VPS worker first'
      });
    }
    
    // Check if AI is configured
    const aiConfig = await db.getAIConfig(user.id);
    if (!aiConfig) {
      return res.status(400).json({ 
        error: 'AI not configured',
        message: 'Please configure AI provider in Integrations'
      });
    }
    
    // Get task definition
    const taskDef = Object.values(WORKER_TASKS).find(t => t.name === task);
    if (!taskDef) {
      return res.status(400).json({ 
        error: 'Unknown task',
        available: Object.values(WORKER_TASKS).map(t => t.name)
      });
    }
    
    // Queue the task
    const queue = getWorkerCommandQueue();
    const queuedCommand = await queue.createCommand(activeWorker.id, 'run_task', {
      task_type: task,
      task_params: { store_id, ...params },
      task_definition: taskDef,
      user_id: user.id,
    });
    
    res.json({
      success: true,
      task: task,
      status: 'queued',
      command_id: queuedCommand.id,
      worker_id: activeWorker.id,
      estimated_duration: taskDef.duration_estimate,
      message: `Task "${task}" queued successfully. Estimated duration: ${taskDef.duration_estimate}`
    });
  } catch (error: any) {
    console.error('Task execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop worker
router.post('/stop-worker', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { worker_id } = req.body;
    
    const worker = await db.getWorkerById(worker_id);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Update worker status
    await db.updateWorker(worker_id, { status: 'idle' });
    
    res.json({ success: true, message: 'Worker stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restart worker
router.post('/restart-worker', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { worker_id } = req.body;
    
    const worker = await db.getWorkerById(worker_id);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Update worker status
    await db.updateWorker(worker_id, { status: 'running' });
    
    res.json({ success: true, message: 'Worker restarted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DEBUG: Test AI configuration and API key
router.get('/debug-ai-config', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const aiConfig = await db.getAIConfig(user.id);
    
    if (!aiConfig) {
      return res.json({ configured: false, message: 'No AI config found' });
    }
    
    // Test the API key with a simple request
    let apiTestResult = null;
    let apiTestError = null;
    
    if (aiConfig.api_key_encrypted) {
      try {
        const testResponse = await axios.get('https://openrouter.ai/api/v1/auth/key', {
          headers: {
            'Authorization': `Bearer ${aiConfig.api_key_encrypted}`,
          },
          timeout: 5000,
        });
        apiTestResult = {
          valid: true,
          data: testResponse.data,
        };
      } catch (error: any) {
        apiTestResult = {
          valid: false,
          status: error.response?.status,
          error: error.response?.data?.error?.message || error.message,
        };
      }
    }
    
    res.json({
      configured: true,
      provider: aiConfig.provider,
      model: aiConfig.model,
      keyLength: aiConfig.api_key_encrypted?.length || 0,
      keyPrefix: aiConfig.api_key_encrypted ? `${aiConfig.api_key_encrypted.substring(0, 15)}...` : null,
      keySuffix: aiConfig.api_key_encrypted ? `...${aiConfig.api_key_encrypted.slice(-5)}` : null,
      apiTest: apiTestResult,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
