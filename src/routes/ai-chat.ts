import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';
import axios from 'axios';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { getWorkerCommandQueue, WORKER_TASKS } from '../services/workerCommands';

const router = Router();

// OpenRouter API client
async function callOpenRouter(messages: any[], apiKey: string, model: string = 'moonshotai/kimi-k2.5') {
  console.log('Calling OpenRouter with model:', model, 'key length:', apiKey?.length);
  
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Invalid API key provided');
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
    return response.data.choices[0].message;
  } catch (error: any) {
    console.error('OpenRouter API error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to get AI response');
  }
}

// System prompt for the AI agent
const SYSTEM_PROMPT = `You are the ShoppDropp AI Agent, an autonomous dropshipping assistant. You help manage Shopify stores, automate tasks, and make decisions.

IMPORTANT: When users ask about API keys or credentials, check the "Configured API Keys/Integrations" section in your context. If credentials are marked as "✅ Configured", confirm they are available. Do NOT say you don't have access to keys that are listed as configured.

You have access to the following capabilities:

## Store Management
- Create, update, and delete products
- Sync inventory with CJ Dropshipping or AutoDS
- Monitor competitor prices and adjust pricing
- Generate product descriptions and titles

## Marketing  
- Create and manage Meta Ads campaigns
- Generate ad copy and creatives
- Optimize campaigns based on performance

## VPS Worker Control
When the user wants to provision, destroy, reboot, or check status, YOU MUST return a JSON command block BEFORE your text response.

Available commands:
- "provision" - Create a new VPS and install OpenClaw
- "destroy" - Remove the VPS
- "reboot" - Restart the VPS
- "status" - Check VPS status and metrics
- "run_task" - Execute a specific task on the worker

## Available Tasks
- product_research - Find trending products
- catalog_sync - Sync products with supplier
- price_optimization - Adjust prices based on competitors
- inventory_check - Check and update inventory levels
- meta_ads_create - Create new ad campaigns
- content_generation - Generate blog posts, emails, social content

## CRITICAL: Command Format
You MUST respond with a JSON command FIRST, then your text response. Use this exact format:

[[COMMAND]]
{"action": "worker_command", "command": "status", "worker_id": "WORKER_ID"}
[[/COMMAND]]
Provisioning status check initiated...

Or for provisioning (when user says "provision a vps"):
[[COMMAND]]
{"action": "worker_command", "command": "provision", "store_id": "STORE_ID"}
[[/COMMAND]]
Provisioning a new VPS for you now...

Always include the JSON command block when the user wants to take action.`;

// Chat endpoint
router.post('/chat', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { message, conversation_history = [] } = req.body;

    console.log('AI Chat request from user:', user.id);

    // Get user's AI config
    const aiConfig = await db.getAIConfig(user.id);
    console.log('AI Config retrieved:', aiConfig ? { provider: aiConfig.provider, model: aiConfig.model, hasKey: !!aiConfig.api_key_encrypted } : 'null');
    
    if (!aiConfig) {
      return res.status(400).json({ error: 'AI provider not configured. Please set up OpenRouter in settings.' });
    }

    if (!aiConfig.api_key_encrypted) {
      return res.status(400).json({ error: 'AI API key not found. Please reconfigure your AI provider in settings.' });
    }

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

    // Build context-enhanced system prompt
    let contextPrompt = SYSTEM_PROMPT;
    if (activeWorker) {
      contextPrompt += `\n\n## Current Worker\nID: ${activeWorker.id}\nStatus: ${activeWorker.status}\nIP: ${activeWorker.ip_address || 'N/A'}\nServer ID: ${activeWorker.hetzner_server_id || 'N/A'}`;
    }
    if (activeStore) {
      contextPrompt += `\n\n## Active Store\nName: ${activeStore.name}\nPlatform: ${activeStore.platform}\nStore ID: ${activeStore.id}`;
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

    // Call OpenRouter
    const aiResponse = await callOpenRouter(messages, aiConfig.api_key_encrypted, aiConfig.model);

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

    res.json({
      response: aiResponse.content,
      command_executed: commandResult,
      worker_status: activeWorker?.status || 'none',
      store: activeStore?.name || null,
    });

  } catch (error: any) {
    console.error('AI chat error:', error);
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

export default router;
