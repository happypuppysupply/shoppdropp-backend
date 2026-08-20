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
const SYSTEM_PROMPT = `You are the ShoppDropp AI Agent, an autonomous dropshipping assistant with full task execution capabilities.

## YOUR CAPABILITIES
You can execute real tasks: provision VPS workers, sync Shopify catalogs, research products, optimize prices, manage Meta Ads - not just chat.

## ONBOARDING VIA CHAT (FACEBOOK ADS ALIGNED)
When store configuration is incomplete, guide the user through onboarding IN THE CHAT INTERFACE. This data will be used to create targeted Facebook/Meta ad campaigns, so accuracy matters.

Ask ONE question at a time. Track answers in the conversation.

### REQUIRED ONBOARDING QUESTIONS (in order):

**Q1: Store Identity**
"What's your store name?" (text input)
[[FORM]]{"type":"text","placeholder":"e.g., Happy Puppy Supply"}[[/FORM]]

**Q2: Product Category** (single select)
"What category will you sell in?"
[[FORM]]{"type":"cards","options":["Pet Supplies 🐾","Home & Garden 🏡","Beauty & Health 💄","Electronics 🔌","Fashion & Apparel 👕","Fitness & Sports 🏋️","Toys & Kids 🧸","Food & Beverage 🍔"]}[[/FORM]]

**Q3: Specific Niche** (single select)
"What's your specific niche within [category]?"

**Q4: Target Location** (multi-select, Facebook Ads locations)
"Which countries/regions will you target?"
[[FORM]]{"type":"chips","options":["United States","United Kingdom","Canada","Australia","Germany","France","Europe (All)"],"multi":true}[[/FORM]]

**Q5: Target Age Range** (single select, Facebook Ads age)
"What's your target customer's age range?"
[[FORM]]{"type":"cards","options":["18-24 (Gen Z)","25-34 (Millennials)","35-44","45-54","55-64","65+"]}[[/FORM]]

**Q6: Target Gender** (single select)
"Which gender is your primary audience?"
[[FORM]]{"type":"cards","options":["All Genders","Women","Men"]}[[/FORM]]

**Q7: Detailed Targeting - Interests** (MULTI-SELECT, Facebook Ads interests)
"Select interests that match your ideal customer (choose ALL that apply):"
- Pet Supplies: Dog training, Cat care, Pet grooming, Veterinary, Pet adoption
- Home & Garden: Home decor, Interior design, DIY home, Gardening, Smart home
- Beauty: Skincare, Makeup, Hair care, Nail care, Organic beauty
- Fitness: Weight loss, Muscle building, Yoga, Running, Nutrition
- Electronics: Gaming, Technology, Smartphones, Photography, Software
- Fashion: Streetwear, Luxury, Sustainable fashion, Accessories, Shoes
[[FORM]]{"type":"chips","options":["Dog training","Cat care","Pet grooming","Veterinary","Pet adoption"],"multi":true}[[/FORM]]

**Q8: Behaviors & Pain Points** (multi-select)
"What problems does your product solve? Select ALL that apply:"
[[FORM]]{"type":"chips","options":["Too expensive alternatives","Poor quality existing products","Hard to find specialty items","Time-consuming process","Health/safety concerns","Environmental impact","Lack of convenience"],"multi":true}[[/FORM]]

**Q9: Brand Personality** (single select)
"What's your brand's personality?"
[[FORM]]{"type":"cards","options":["Fun & Playful 🎉","Luxury & Premium 💎","Eco-Friendly & Natural 🌿","Professional & Trustworthy 💼","Trendy & Bold 🔥","Cozy & Comforting 🏠"]}[[/FORM]]

**Q10: Price Positioning** (single select)
"What's your pricing strategy?"
[[FORM]]{"type":"cards","options":["Budget-friendly ($5-25)","Mid-range ($25-75)","Premium ($75-200)","Luxury ($200+)"]}[[/FORM]]

**Q11: Target Margin** (single select)  
"What's your target profit margin? (Higher margins = more ad spend flexibility)"
[[FORM]]{"type":"cards","options":["20-30% (Competitive)","30-40% (Healthy)","40-50% (Strong)","50%+ (Premium)"]}[[/FORM]]

**Q12: Product Price Range** (single select)
"What price range will your products sell for?"
[[FORM]]{"type":"cards","options":["$10-30","$30-60","$60-100","$100-200","$200+"]}[[/FORM]]

**Q13: Marketing Budget** (number input)
"What's your monthly marketing budget for Meta Ads?"
[[FORM]]{"type":"number","placeholder":"Monthly budget in USD","min":100,"max":10000,"prefix":"$"}[[/FORM]]

**Q14: Customer Acquisition Strategy** (multi-select)
"How do you plan to acquire customers?"
[[FORM]]{"type":"chips","options":["Meta/Facebook Ads","Google Ads","TikTok Ads","Influencer marketing","Email marketing","SEO/Content","Referral program"],"multi":true}[[/FORM]]

**Q15: Content Style** (single select)
"What type of content will you create?"
[[FORM]]{"type":"cards","options":["Product demos & tutorials","Lifestyle & aspirational","Educational & helpful","User-generated content","Behind-the-scenes","Customer testimonials"]}[[/FORM]]

**Q16: Competitive Advantage** (text input)
"What makes your store different from competitors?"
[[FORM]]{"type":"text","placeholder":"e.g., faster shipping, better quality, unique designs..."}[[/FORM]]

### SEAMLESS TRANSITION LOGIC:
- After Q16 completes → Check if API keys exist
- If NO API keys → Prompt user to enter keys in sidebar (NOT connect form)
- If API keys exist → Show "Connect Platforms" form
- After APIs connected → Show workflow options

### IMPORTANT RULES:
- Use multi-select (multi:true) for: Locations, Interests, Pain Points
- Use single-select for: Category, Niche, Age, Gender, Brand, Price strategy
- Always include the question text BEFORE the [[FORM]] block
- Wait for user answer before asking next question
- Acknowledge their previous answer before asking the next one

## ALWAYS SHOW ACTIVITY
When executing tasks, stream activity updates with [[ACTIVITY]] blocks showing:
- Tool calls being made
- APIs being accessed  
- Files being written
- Duration and timestamps

This proves you're an agent, not just a chatbot.

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
    const configuredServices = credentials.map(c => c.service_type);
    const missingRequiredServices = ['shopify', 'cj_dropshipping'].filter(s => !configuredServices.includes(s));
    const missingResearchApis = ['openwebninja_amazon', 'openwebninja_product_search'].filter(s => !configuredServices.includes(s));
    
    if (credentials.length > 0) {
      contextPrompt += `\n\n## Configured API Keys/Integrations\nThe following integrations have API credentials stored and are available for use:`;
      for (const cred of credentials) {
        const hasKeys = cred.api_key || cred.access_token || cred.refresh_token || cred.password;
        contextPrompt += `\n- ${cred.service_type}: ${hasKeys ? '✅ Configured' : '❌ Not configured'}`;
      }
    }
    
    // SEAMLESS FLOW LOGIC
    if (storeConfig?.onboarding_status === 'complete') {
      if (missingRequiredServices.length > 0) {
        contextPrompt += `\n\n## NEXT STEP: API Keys Required 🔑\n`;
        contextPrompt += `Onboarding is complete! Now we need to connect your platforms.\n`;
        contextPrompt += `CRITICAL: The user needs to ENTER their API keys in the sidebar BEFORE attempting to connect.\n`;
        contextPrompt += `Missing platforms: ${missingRequiredServices.join(', ')}\n`;
        contextPrompt += `\nINSTRUCTIONS FOR USER:\n`;
        contextPrompt += `1. Click "API Keys" in the right sidebar\n`;
        contextPrompt += `2. Enter your API keys for: ${missingRequiredServices.join(', ')}\n`;
        contextPrompt += `3. Click "Save" for each platform\n`;
        contextPrompt += `4. Return to chat and say "I've added my API keys"\n`;
        contextPrompt += `\nDO NOT show a "Connect" form yet - they need to enter keys first!`;
      } else if (missingResearchApis.length > 0) {
        contextPrompt += `\n\n## NEXT STEP: Research APIs 🔍\n`;
        contextPrompt += `Required platforms connected! Add research APIs for product hunting:\n`;
        contextPrompt += `Available: Amazon Data, Walmart Data, eBay Data, Product Search, E-commerce Data\n`;
        contextPrompt += `\nAsk which research APIs they want to enable.`;
      } else {
        contextPrompt += `\n\n## ✅ FULLY CONFIGURED\n`;
        contextPrompt += `All systems ready! The user can now start AI workflows.\n`;
        contextPrompt += `Offer to start: product research, store setup, ad campaigns, or order fulfillment.`;
      }
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
    
    // SEAMLESS FLOW: Auto-inject forms based on configuration state
    let autoForm = null;
    
    // If onboarding is complete but missing required API keys, DON'T show connect form
    // Instead, instruct them to enter keys in the sidebar first
    if (storeConfig?.onboarding_status === 'complete' && missingRequiredServices.length > 0) {
      // Check if user is confirming they've added API keys
      const hasAddedKeys = message.toLowerCase().includes('added') || 
                          message.toLowerCase().includes('entered') ||
                          message.toLowerCase().includes('saved') ||
                          message.toLowerCase().includes('done') ||
                          message.toLowerCase().includes('yes');
      
      if (!hasAddedKeys && !aiResponse.content.includes('sidebar') && !aiResponse.content.includes('API Keys')) {
        // Add instruction to use sidebar - NO FORM
        aiResponse.content += `\n\n**Next Step: Add Your API Keys** 🔑\n\nBefore I can connect your platforms, you need to enter your API keys:\n\n1. **Click "API Keys" in the right sidebar** →\n2. **Enter your keys for:** ${missingRequiredServices.join(', ')}\n3. **Click Save for each platform**\n4. **Return here and say "I've added my keys"**\n\n*Don't have API keys yet? I can help you get them from Shopify, CJ Dropshipping, and Meta.*`;
      }
    }
    
    // If all required APIs are configured but missing research APIs
    if (storeConfig?.onboarding_status === 'complete' && 
        missingRequiredServices.length === 0 && 
        missingResearchApis.length > 0) {
      const isResearchResponse = message.toLowerCase().includes('research') ||
                                message.toLowerCase().includes('amazon') ||
                                message.toLowerCase().includes('walmart');
      
      if (!isResearchResponse && !aiResponse.content.includes('[[FORM]]')) {
        autoForm = {
          type: 'connect',
          services: [
            { id: 'openwebninja_amazon', name: 'Amazon Data', description: 'Real-time Amazon product data' },
            { id: 'openwebninja_walmart', name: 'Walmart Data', description: 'Real-time Walmart product data' },
            { id: 'openwebninja_ebay', name: 'eBay Data', description: 'Real-time eBay product data' },
            { id: 'openwebninja_product_search', name: 'Product Search', description: 'Cross-platform product search' },
            { id: 'openwebninja_ecommerce', name: 'E-commerce Data', description: 'Multi-platform commerce data' }
          ]
        };
        aiResponse.content += `\n\n[[FORM]]\n${JSON.stringify(autoForm)}\n[[/FORM]]`;
      }
    }

    res.json({
      response: aiResponse.content,
      command_executed: commandResult,
      worker_status: activeWorker?.status || 'none',
      store: activeStore?.name || null,
      budget_alert: budgetAlert || null,
      onboarding_status: onboardingStatus || { isComplete: false, status: 'not_started' },
      interactive,
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

// Generate onboarding contextual response (summary + next question)
router.post('/onboarding-next', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { currentQuestionId, currentAnswer, previousAnswers, nextQuestion, storeInfo } = req.body;

    // Get user's AI config
    const aiConfig = await db.getAIConfig(user.id);
    if (!aiConfig) {
      return res.status(400).json({ error: 'AI not configured' });
    }

    const apiKey = aiConfig.api_key_encrypted || process.env.OPENROUTER_API_KEY;

    // Build prompt for contextual response
    const systemPrompt = `You are a helpful AI assistant guiding a user through store onboarding for a dropshipping platform.

Your task:
1. Briefly acknowledge and summarize their previous answer (1-2 sentences)
2. Naturally transition to the next question
3. Make it feel conversational and friendly
4. Keep it concise (under 100 words total)

The flow should feel like a natural conversation, not a form.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Previous answers so far: ${JSON.stringify(previousAnswers)}

They just answered "${currentQuestionId}" with: "${currentAnswer}"

Next question to ask: "${nextQuestion}"

Please respond with:
1. A brief acknowledgement of their answer (acknowledge the industry/category they picked with enthusiasm)
2. The next question naturally phrased as part of the conversation` }
    ];

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: aiConfig.model || 'moonshotai/kimi-k2.5',
        messages,
        temperature: 0.8,
        max_tokens: 200,
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

    const aiResponse = response.data.choices[0].message.content;

    res.json({
      response: aiResponse,
      success: true,
    });
  } catch (error: any) {
    console.error('Onboarding context error:', error);
    // Return fallback if AI fails
    res.json({
      response: `Great choice! Let's continue.\\n\\n${req.body.nextQuestion}`,
      fallback: true,
    });
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

// Save a chat message
router.post('/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { store_id, role, content, metadata = {} } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required' });
    }

    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        store_id: store_id || null,
        role,
        content,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save message:', error);
      return res.status(500).json({ error: 'Failed to save message' });
    }

    res.json({ success: true, message });
  } catch (error: any) {
    console.error('Save message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get chat messages for a user (optionally filtered by store)
router.get('/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { store_id, limit = 50 } = req.query;

    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(parseInt(limit as string));

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Failed to fetch messages:', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    res.json({ messages });
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear chat messages for a user/store
router.delete('/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { store_id } = req.query;

    let query = supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id);

    if (store_id) {
      query = query.eq('store_id', store_id);
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to clear messages:', error);
      return res.status(500).json({ error: 'Failed to clear messages' });
    }

    res.json({ success: true, message: 'Messages cleared' });
  } catch (error: any) {
    console.error('Clear messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
