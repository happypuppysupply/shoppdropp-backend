"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const axios_1 = __importDefault(require("axios"));
const vpsProvisioner_1 = require("../services/vpsProvisioner");
const workerCommands_1 = require("../services/workerCommands");
const budgetGuard_1 = require("../services/budgetGuard");
const router = (0, express_1.Router)();
// OpenRouter API client
async function callOpenRouter(messages, apiKey, model = 'moonshotai/kimi-k2.5', userId) {
    console.log('Calling OpenRouter with model:', model, 'key length:', apiKey?.length);
    if (!apiKey || apiKey.length < 10) {
        throw new Error('Invalid API key provided');
    }
    // Budget guard check (if userId provided)
    if (userId) {
        const guardResult = await (0, budgetGuard_1.canMakeRequest)(userId, model, apiKey);
        if (!guardResult.allowed) {
            const error = new Error(guardResult.reason || 'Budget limit reached');
            error.isBudgetError = true;
            error.guardResult = guardResult;
            throw error;
        }
        console.log(`[Budget] Request allowed. Estimated: $${guardResult.estimatedCost?.toFixed(4)}`);
    }
    try {
        const response = await axios_1.default.post('https://openrouter.ai/api/v1/chat/completions', {
            model,
            messages,
            temperature: 0.7,
            max_tokens: 4000,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://shoppdropp.com',
                'X-Title': 'ShoppDropp AI Agent',
            },
        });
        // Track actual spend
        if (userId && response.data?.usage) {
            const usage = response.data.usage;
            // Calculate cost based on actual tokens
            const pricing = {
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
            const trackResult = await (0, budgetGuard_1.trackSpend)(userId, actualCost, model);
            console.log(`[Budget] Tracked spend: $${actualCost.toFixed(4)}, Total: $${trackResult.newTotal.toFixed(4)}`);
            // Check if threshold crossed and include alert in response
            if (trackResult.thresholdCrossed) {
                const status = await (0, budgetGuard_1.getBudgetStatus)(userId);
                if (status) {
                    response.data.budgetAlert = (0, budgetGuard_1.formatBudgetAlert)(trackResult.thresholdCrossed, trackResult.newTotal, status.weeklyLimit, status.resetsAt);
                }
            }
        }
        return response.data.choices[0].message;
    }
    catch (error) {
        // Re-throw budget errors as-is
        if (error.isBudgetError)
            throw error;
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
router.post('/chat', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { message, conversation_history = [] } = req.body;
        console.log('AI Chat request from user:', user.id);
        // Get user's AI config
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        console.log('AI Config retrieved:', aiConfig ? { provider: aiConfig.provider, model: aiConfig.model, hasKey: !!aiConfig.api_key_encrypted } : 'null');
        if (!aiConfig) {
            return res.status(400).json({ error: 'AI provider not configured. Please set up OpenRouter in settings.' });
        }
        if (!aiConfig.api_key_encrypted) {
            return res.status(400).json({ error: 'AI API key not found. Please reconfigure your AI provider in settings.' });
        }
        // Get user's worker/store info for context
        const workers = await supabase_1.db.getWorkersByUser(user.id);
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const activeWorker = workers.find(w => w.status === 'running' || w.status === 'configuring');
        const activeStore = stores[0]; // Use first store for context
        // Get credentials for the active store
        let credentials = [];
        if (activeStore) {
            credentials = await supabase_1.db.getCredentialsByStore(activeStore.id);
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
        // Call OpenRouter (with budget guard)
        const aiResponse = await callOpenRouter(messages, aiConfig.api_key_encrypted, aiConfig.model, user.id);
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
                }
                else if (command.action === 'run_task' && activeWorker) {
                    commandResult = await executeTask(command, activeWorker, user.id);
                }
                // Remove the command block from the response shown to user
                aiResponse.content = aiResponse.content.replace(/\[\[COMMAND\]\]\s*\{.*?\}\s*\[\[\/COMMAND\]\]\s*/s, '').trim();
            }
            catch (e) {
                console.error('Failed to parse command:', e);
            }
        }
        // Check for budget alert from the response
        const budgetAlert = aiResponse.budgetAlert;
        res.json({
            response: aiResponse.content,
            command_executed: commandResult,
            worker_status: activeWorker?.status || 'none',
            store: activeStore?.name || null,
            budget_alert: budgetAlert || null,
        });
    }
    catch (error) {
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
async function executeWorkerCommand(command, worker, userId, store) {
    const { command: cmd, worker_id, store_id } = command;
    try {
        switch (cmd) {
            case 'status':
                if (!worker || !worker.hetzner_server_id) {
                    return { status: 'error', message: 'VPS not provisioned yet' };
                }
                const hetzner = (await Promise.resolve().then(() => __importStar(require('../services/hetznerService')))).getHetznerService();
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
                    const { data: newWorker, error } = await supabase_1.supabase
                        .from('workers')
                        .insert({
                        user_id: userId,
                        store_id: store?.id,
                        status: 'provisioning',
                    })
                        .select()
                        .single();
                    if (error)
                        throw new Error('Failed to create worker: ' + error.message);
                    targetWorker = newWorker;
                }
                if (targetWorker.status === 'running' || targetWorker.status === 'configuring' || targetWorker.status === 'provisioning') {
                    return { status: 'error', message: 'Worker already provisioned or provisioning' };
                }
                // Trigger provisioning
                const provisioner = (0, vpsProvisioner_1.createVPSProvisioner)();
                // Update worker status to provisioning
                await supabase_1.db.updateWorker(targetWorker.id, { status: 'provisioning' });
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
                        await supabase_1.db.updateWorker(targetWorker.id, {
                            status: 'configuring',
                            hetzner_server_id: result.serverId.toString(),
                            ip_address: result.ipAddress,
                        });
                    }
                    else {
                        await supabase_1.db.updateWorker(targetWorker.id, { status: 'error' });
                    }
                })
                    .catch(async (error) => {
                    console.error('Provisioning failed:', error);
                    await supabase_1.db.updateWorker(targetWorker.id, { status: 'error' });
                });
                return { status: 'in_progress', message: 'VPS provisioning started. This will take 2-3 minutes. The worker status will update automatically.' };
            case 'reboot':
                if (!worker || !worker.hetzner_server_id) {
                    return { status: 'error', message: 'VPS not provisioned' };
                }
                const hetznerReboot = (await Promise.resolve().then(() => __importStar(require('../services/hetznerService')))).getHetznerService();
                await hetznerReboot.reboot(parseInt(worker.hetzner_server_id));
                return { status: 'success', message: 'VPS reboot initiated' };
            case 'destroy':
                if (!worker || !worker.hetzner_server_id) {
                    return { status: 'error', message: 'VPS not provisioned' };
                }
                const provisionerDestroy = (0, vpsProvisioner_1.createVPSProvisioner)();
                await provisionerDestroy.destroyVPS(parseInt(worker.hetzner_server_id), worker.id);
                return { status: 'success', message: 'VPS destroyed' };
            default:
                return { status: 'error', message: `Unknown command: ${cmd}` };
        }
    }
    catch (error) {
        return { status: 'error', message: error.message };
    }
}
// Import product research service
const productResearchService_1 = require("../services/productResearchService");
// Execute tasks on worker
async function executeTask(command, worker, userId) {
    const { task, params = {} } = command;
    // Validate task type
    const taskDef = Object.values(workerCommands_1.WORKER_TASKS).find(t => t.name === task);
    if (!taskDef) {
        return {
            status: 'error',
            message: `Unknown task type: "${task}". Available tasks: ${Object.values(workerCommands_1.WORKER_TASKS).map(t => t.name).join(', ')}`
        };
    }
    // Handle specific tasks with real API calls
    if (task === 'product_research') {
        try {
            console.log(`🔍 Starting real product research for user ${userId}`);
            const result = await productResearchService_1.productResearchService.startResearch({
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
        }
        catch (error) {
            console.error('Product research error:', error);
            return {
                status: 'error',
                task,
                message: `Failed to start product research: ${error.message}`
            };
        }
    }
    // For other tasks, queue them for the worker
    const queue = (0, workerCommands_1.getWorkerCommandQueue)();
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
router.get('/context', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const workers = await supabase_1.db.getWorkersByUser(user.id);
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Run a task on the worker
router.post('/task', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { task, store_id, ...params } = req.body;
        if (!task) {
            return res.status(400).json({ error: 'Task name is required' });
        }
        // Get active worker for user
        const workers = await supabase_1.db.getWorkersByUser(user.id);
        const activeWorker = workers.find(w => w.status === 'running' || w.status === 'provisioning');
        if (!activeWorker) {
            return res.status(400).json({
                error: 'No active worker found',
                message: 'Please setup a VPS worker first'
            });
        }
        // Check if AI is configured
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        if (!aiConfig) {
            return res.status(400).json({
                error: 'AI not configured',
                message: 'Please configure AI provider in Integrations'
            });
        }
        // Get task definition
        const taskDef = Object.values(workerCommands_1.WORKER_TASKS).find(t => t.name === task);
        if (!taskDef) {
            return res.status(400).json({
                error: 'Unknown task',
                available: Object.values(workerCommands_1.WORKER_TASKS).map(t => t.name)
            });
        }
        // Queue the task
        const queue = (0, workerCommands_1.getWorkerCommandQueue)();
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
    }
    catch (error) {
        console.error('Task execution error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Stop worker
router.post('/stop-worker', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { worker_id } = req.body;
        const worker = await supabase_1.db.getWorkerById(worker_id);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // Update worker status
        await supabase_1.db.updateWorker(worker_id, { status: 'idle' });
        res.json({ success: true, message: 'Worker stopped' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Restart worker
router.post('/restart-worker', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { worker_id } = req.body;
        const worker = await supabase_1.db.getWorkerById(worker_id);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // Update worker status
        await supabase_1.db.updateWorker(worker_id, { status: 'running' });
        res.json({ success: true, message: 'Worker restarted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=ai-chat.js.map