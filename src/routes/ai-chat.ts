import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';
import axios from 'axios';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { getWorkerCommandQueue, WORKER_TASKS } from '../services/workerCommands';

const router = Router();

// OpenRouter API client
async function callOpenRouter(messages: any[], apiKey: string, model: string = 'moonshotai/kimi-k2.5') {
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
}

// System prompt for the AI agent
const SYSTEM_PROMPT = `You are the ShoppDropp AI Agent, an autonomous dropshipping assistant. You help manage Shopify stores, automate tasks, and make decisions.

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
You can control the VPS worker with these commands:
- "provisioning" - Create a new VPS and install OpenClaw
- "destroy" - Remove the VPS
- "reboot" - Restart the VPS
- "status" - Check VPS status and metrics
- "run task [task_name]" - Execute a specific task on the worker

## Available Tasks
- product_research - Find trending products
- catalog_sync - Sync products with supplier
- price_optimization - Adjust prices based on competitors
- inventory_check - Check and update inventory levels
- meta_ads_create - Create new ad campaigns
- content_generation - Generate blog posts, emails, social content

When you want to execute a command, respond with a JSON block like this (before your natural language response):

\`\`\`json
{"action": "worker_command", "command": "status", "worker_id": "WORKER_ID"}
\`\`\`

Or for tasks:
\`\`\`json
{"action": "run_task", "task": "product_research", "worker_id": "WORKER_ID", "params": {"niche": "pet supplies"}}
\`\`\`

Always be helpful, concise, and action-oriented. If you need more information, ask for it.`;

// Chat endpoint
router.post('/chat', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { message, conversation_history = [] } = req.body;

    // Get user's AI config
    const aiConfig = await db.getAIConfig(user.id);
    if (!aiConfig) {
      return res.status(400).json({ error: 'AI provider not configured. Please set up OpenRouter in settings.' });
    }

    // Get user's worker/store info for context
    const workers = await db.getWorkersByUser(user.id);
    const stores = await db.getStoresByUser(user.id);
    
    const activeWorker = workers.find(w => w.status === 'running' || w.status === 'configuring');
    const activeStore = stores[0]; // Use first store for context

    // Build context-enhanced system prompt
    let contextPrompt = SYSTEM_PROMPT;
    if (activeWorker) {
      contextPrompt += `\n\n## Current Worker\nID: ${activeWorker.id}\nStatus: ${activeWorker.status}\nIP: ${activeWorker.ip_address || 'N/A'}\nServer ID: ${activeWorker.hetzner_server_id || 'N/A'}`;
    }
    if (activeStore) {
      contextPrompt += `\n\n## Active Store\nName: ${activeStore.name}\nPlatform: ${activeStore.platform}\nStore ID: ${activeStore.id}`;
    }

    // Build messages array
    const messages = [
      { role: 'system', content: contextPrompt },
      ...conversation_history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message },
    ];

    // Call OpenRouter
    const aiResponse = await callOpenRouter(messages, aiConfig.api_key_encrypted, aiConfig.model);

    // Parse for commands
    let commandResult = null;
    const jsonMatch = aiResponse.content.match(/```json\s*({.*?})\s*```/s);
    
    if (jsonMatch) {
      try {
        const command = JSON.parse(jsonMatch[1]);
        
        // Execute the command
        if (command.action === 'worker_command' && activeWorker) {
          commandResult = await executeWorkerCommand(command, activeWorker, user.id);
        } else if (command.action === 'run_task' && activeWorker) {
          commandResult = await executeTask(command, activeWorker, user.id);
        }
        
        // Remove the JSON block from the response shown to user
        aiResponse.content = aiResponse.content.replace(/```json\s*{.*?}\s*```\s*/s, '').trim();
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
async function executeWorkerCommand(command: any, worker: any, userId: string) {
  const { command: cmd, worker_id } = command;
  
  try {
    switch (cmd) {
      case 'status':
        if (!worker.hetzner_server_id) {
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
        
      case 'provisioning':
        if (worker.status === 'running' || worker.status === 'configuring') {
          return { status: 'error', message: 'Worker already provisioned' };
        }
        // Trigger provisioning
        const provisioner = createVPSProvisioner();
        // This happens async, return immediately
        return { status: 'in_progress', message: 'VPS provisioning started' };
        
      case 'reboot':
        if (!worker.hetzner_server_id) {
          return { status: 'error', message: 'VPS not provisioned' };
        }
        const hetznerReboot = (await import('../services/hetznerService')).getHetznerService();
        await hetznerReboot.reboot(parseInt(worker.hetzner_server_id));
        return { status: 'success', message: 'VPS reboot initiated' };
        
      case 'destroy':
        if (!worker.hetzner_server_id) {
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
  
  // Queue the command
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

export default router;
