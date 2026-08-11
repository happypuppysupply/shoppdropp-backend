"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.viralGrowthEngine = exports.ViralGrowthEngine = void 0;
class ViralGrowthEngine {
    viralTools = [
        // VIRAL LEAD CAPTURE
        {
            id: 'ai-puppy-mixer',
            name: 'AI Puppy Photo Mixer',
            description: 'Users upload their dog photo, see what puppies with other community dogs look like. Highly viral!',
            icon: '📸',
            category: 'viral',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'medium',
            integration: ['supabase-storage', 'openai', 'klaviyo'],
            estimatedLeadsPerMonth: 1200,
            setupTimeMinutes: 120,
            workerType: 'theme-design',
        },
        {
            id: 'dog-personality-quiz',
            name: 'Dog Personality Quiz',
            description: 'Find the perfect product match based on personality traits. Captures email before showing results.',
            icon: '🐕',
            category: 'lead-capture',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'medium',
            integration: ['klaviyo', 'bundler'],
            estimatedLeadsPerMonth: 500,
            setupTimeMinutes: 60,
            workerType: 'catalog-optimization',
        },
        // SEO CONTENT TOOLS
        {
            id: 'breed-glossary',
            name: 'Breed Glossary (SEO Powerhouse)',
            description: 'Comprehensive breed pages with care guides. Targets 200+ breed keywords for organic traffic.',
            icon: '📚',
            category: 'seo',
            emailCapture: true,
            viralSharing: false,
            seoValue: 'high',
            integration: ['supabase', 'openai', 'shopify'],
            estimatedLeadsPerMonth: 800,
            setupTimeMinutes: 180,
            workerType: 'product-research',
        },
        {
            id: 'breed-comparison',
            name: 'Breed Comparison Tool',
            description: 'Compare dog breeds side-by-side. High search volume keywords.',
            icon: '⚖️',
            category: 'seo',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'high',
            integration: ['supabase', 'openai'],
            estimatedLeadsPerMonth: 600,
            setupTimeMinutes: 120,
            workerType: 'product-research',
        },
        // CONTENT AUTOMATION
        {
            id: 'ugc-video-generator',
            name: 'UGC Video Generator',
            description: 'AI creates product videos with user-generated style. TikTok/Reels format per product.',
            icon: '🎬',
            category: 'content',
            emailCapture: false,
            viralSharing: true,
            seoValue: 'medium',
            integration: ['openai', 'supabase-storage', 'shopify'],
            estimatedLeadsPerMonth: 0,
            setupTimeMinutes: 240,
            workerType: 'meta-ads',
        },
        {
            id: 'product-demo-creator',
            name: 'AI Product Demo Creator',
            description: 'Auto-generates video demos for each product. Script → Voice → Video.',
            icon: '🎥',
            category: 'content',
            emailCapture: false,
            viralSharing: true,
            seoValue: 'low',
            integration: ['openai', 'elevenlabs', 'shopify'],
            estimatedLeadsPerMonth: 0,
            setupTimeMinutes: 300,
            workerType: 'meta-ads',
        },
        // ENGAGEMENT TOOLS
        {
            id: 'activity-tracker',
            name: 'Dog Activity Tracker',
            description: 'Track walks, playtime, achievements. Gamified with leaderboards and weekly emails.',
            icon: '🏃',
            category: 'engagement',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'low',
            integration: ['supabase', 'klaviyo'],
            estimatedLeadsPerMonth: 300,
            setupTimeMinutes: 180,
            workerType: 'analytics',
        },
        {
            id: 'breed-analyzer',
            name: 'AI Breed Analyzer',
            description: 'Upload a photo, get AI breed analysis + personalized product recommendations.',
            icon: '🔬',
            category: 'viral',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'medium',
            integration: ['openai', 'klaviyo', 'shopify'],
            estimatedLeadsPerMonth: 800,
            setupTimeMinutes: 120,
            workerType: 'theme-design',
        },
        {
            id: 'nutrition-planner',
            name: 'Pet Nutrition Planner',
            description: 'Personalized feeding plans based on breed, age, weight. Upsells food bundles automatically.',
            icon: '🍖',
            category: 'lead-capture',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'medium',
            integration: ['klaviyo', 'bundler', 'shopify'],
            estimatedLeadsPerMonth: 400,
            setupTimeMinutes: 120,
            workerType: 'catalog-optimization',
        },
        {
            id: 'pet-name-generator',
            name: 'AI Pet Name Generator',
            description: 'Generate unique pet names with AI. Users can save favorites and share the best ones.',
            icon: '✨',
            category: 'viral',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'medium',
            integration: ['openai', 'klaviyo'],
            estimatedLeadsPerMonth: 600,
            setupTimeMinutes: 60,
            workerType: 'theme-design',
        },
        {
            id: 'training-challenge',
            name: '30-Day Training Challenge',
            description: 'Gamified training program with daily tasks, achievements, and social sharing.',
            icon: '🏆',
            category: 'engagement',
            emailCapture: true,
            viralSharing: true,
            seoValue: 'low',
            integration: ['klaviyo', 'shopify'],
            estimatedLeadsPerMonth: 350,
            setupTimeMinutes: 240,
            workerType: 'analytics',
        },
        {
            id: 'pet-age-calculator',
            name: 'Pet Age Calculator',
            description: 'Convert dog years to human years with personalized care tips for their age group.',
            icon: '🎂',
            category: 'utility',
            emailCapture: true,
            viralSharing: false,
            seoValue: 'high',
            integration: ['klaviyo'],
            estimatedLeadsPerMonth: 200,
            setupTimeMinutes: 30,
            workerType: 'catalog-optimization',
        },
    ];
    // Worker configuration based on selected tools
    workerConfig = {
        'product-research': {
            description: 'Find winning products and create SEO content',
            priority: 1,
            tasks: ['breed-glossary', 'breed-comparison', 'product-research'],
        },
        'catalog-optimization': {
            description: 'Optimize products and create quizzes/calculators',
            priority: 2,
            tasks: ['dog-personality-quiz', 'nutrition-planner', 'pet-age-calculator'],
        },
        'theme-design': {
            description: 'Build viral landing pages and interactive tools',
            priority: 3,
            tasks: ['ai-puppy-mixer', 'breed-analyzer', 'pet-name-generator'],
        },
        'meta-ads': {
            description: 'Create UGC videos and ad content',
            priority: 4,
            tasks: ['ugc-video-generator', 'product-demo-creator', 'ad-campaigns'],
        },
        'analytics': {
            description: 'Track engagement and gamification',
            priority: 5,
            tasks: ['activity-tracker', 'training-challenge', 'leaderboards'],
        },
        'pricing': {
            description: 'Dynamic pricing and bundle optimization',
            priority: 6,
            tasks: ['bundle-optimization', 'dynamic-pricing'],
        },
        'inventory-sync': {
            description: 'Stock management and supplier integration',
            priority: 7,
            tasks: ['inventory-sync', 'supplier-integration'],
        },
        'order-fulfillment': {
            description: 'Automated order processing',
            priority: 8,
            tasks: ['order-processing', 'shipping-automation'],
        },
    };
    getAvailableTools(industry = 'pet') {
        const industryMap = {
            'pet': [
                'ai-puppy-mixer', 'dog-personality-quiz', 'activity-tracker', 'breed-analyzer',
                'nutrition-planner', 'pet-name-generator', 'training-challenge', 'pet-age-calculator',
                'breed-glossary', 'breed-comparison', 'ugc-video-generator', 'product-demo-creator'
            ],
            'fashion': ['style-quiz', 'size-calculator', 'wardrobe-planner', 'outfit-generator', 'ugc-video-generator'],
            'home': ['room-planner', 'color-matcher', 'furniture-finder', 'ugc-video-generator'],
            'beauty': ['skin-quiz', 'shade-finder', 'routine-planner', 'ugc-video-generator'],
            'fitness': ['workout-planner', 'macro-calculator', 'progress-tracker', 'ugc-video-generator'],
        };
        const relevantIds = industryMap[industry] || industryMap['pet'];
        return this.viralTools.filter(t => relevantIds.includes(t.id));
    }
    // Generate AI recommendations based on store scan
    generateRecommendations(scanData) {
        const recommendations = [];
        // Check if they have SEO content
        if (!scanData.pages?.some((p) => p.path.includes('/blog') || p.path.includes('/guides'))) {
            recommendations.push({
                id: 'rec-seo-glossary',
                type: 'seo-opportunity',
                title: '📚 Create Breed Glossary',
                description: '200+ breed pages targeting high-volume keywords like "golden retriever care guide". Est. 5,000 organic visits/mo.',
                icon: '📚',
                impact: 'high',
                effort: 'medium',
                estimatedMonthlyValue: 5000,
                relatedWorkers: ['product-research', 'catalog-optimization'],
                reason: 'Your competitors rank for breed keywords but you have no content',
            });
        }
        // Check product count for UGC videos
        const productCount = scanData.collections?.find((c) => c.handle === 'all')?.productCount || 0;
        if (productCount > 20) {
            recommendations.push({
                id: 'rec-ugc-videos',
                type: 'content-strategy',
                title: '🎬 Generate UGC Videos',
                description: `Create TikTok/Reels-style videos for your ${productCount} products. AI generates scripts, voiceovers, and captions.`,
                icon: '🎬',
                impact: 'high',
                effort: 'low',
                estimatedMonthlyValue: 3000,
                relatedWorkers: ['meta-ads', 'catalog-optimization'],
                reason: `You have ${productCount} products but no video content. UGC videos increase conversion by 35%.`,
            });
        }
        // Recommend viral tools based on gaps
        if (!scanData.customPages?.some((p) => p.includes('quiz') || p.includes('assessment'))) {
            recommendations.push({
                id: 'rec-quiz',
                type: 'viral-tool',
                title: '🐕 Dog Personality Quiz',
                description: 'Capture 500+ emails/month. Users answer questions, get personalized product recommendations.',
                icon: '🐕',
                impact: 'high',
                effort: 'low',
                estimatedMonthlyValue: 2500,
                relatedWorkers: ['catalog-optimization', 'theme-design'],
                reason: 'Quizzes have 40% email capture rate vs 2% for popups',
            });
        }
        // SEO comparison tool
        recommendations.push({
            id: 'rec-breed-compare',
            type: 'seo-opportunity',
            title: '⚖️ Breed Comparison Tool',
            description: '"Golden Retriever vs Labrador" - targets 10K+ monthly searches. High intent buyers comparing breeds.',
            icon: '⚖️',
            impact: 'high',
            effort: 'medium',
            estimatedMonthlyValue: 4000,
            relatedWorkers: ['product-research', 'catalog-optimization'],
            reason: 'Breed comparison keywords have high commercial intent',
        });
        // AI photo mixer for virality
        recommendations.push({
            id: 'rec-ai-mixer',
            type: 'viral-tool',
            title: '📸 AI Puppy Photo Mixer',
            description: 'Most viral tool. 85% share rate. Users upload dog photos, see AI-generated mixed puppies.',
            icon: '📸',
            impact: 'high',
            effort: 'medium',
            estimatedMonthlyValue: 6000,
            relatedWorkers: ['theme-design', 'meta-ads'],
            reason: 'Visual, shareable content drives viral growth',
        });
        // Video content gap
        if (!scanData.apps?.includes('TikTok') && !scanData.apps?.includes('Reel')) {
            recommendations.push({
                id: 'rec-video-content',
                type: 'content-strategy',
                title: '🎥 AI Product Demo Videos',
                description: 'Auto-generate video demos for each product. Script → Voice → Video in minutes.',
                icon: '🎥',
                impact: 'medium',
                effort: 'low',
                estimatedMonthlyValue: 2000,
                relatedWorkers: ['meta-ads', 'catalog-optimization'],
                reason: 'Product videos increase conversions by 80%',
            });
        }
        return recommendations.sort((a, b) => {
            const impactScore = { high: 3, medium: 2, low: 1 };
            return impactScore[b.impact] - impactScore[a.impact];
        });
    }
    // Calculate worker organization based on selected tools
    calculateWorkerOrganization(selectedToolIds) {
        const selectedTools = this.viralTools.filter(t => selectedToolIds.includes(t.id));
        const requiredWorkerTypes = new Set(selectedTools.map(t => t.workerType).filter(Boolean));
        const workers = Object.entries(this.workerConfig).map(([workerId, config]) => {
            const isActive = requiredWorkerTypes.has(workerId);
            const relevantTasks = selectedTools
                .filter(t => t.workerType === workerId)
                .map(t => t.name);
            return {
                id: workerId,
                name: workerId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                description: config.description,
                priority: config.priority,
                tasks: relevantTasks,
                active: isActive,
            };
        }).sort((a, b) => a.priority - b.priority);
        const totalTasks = selectedTools.length;
        const estimatedSetupHours = selectedTools.reduce((sum, t) => sum + t.setupTimeMinutes, 0) / 60;
        return { workers, totalTasks, estimatedSetupHours };
    }
    async estimateLeadPotential(tools) {
        const selectedTools = this.viralTools.filter(t => tools.includes(t.id));
        const monthlyLeads = selectedTools.reduce((sum, t) => sum + t.estimatedLeadsPerMonth, 0);
        const setupTimeHours = selectedTools.reduce((sum, t) => sum + t.setupTimeMinutes, 0) / 60;
        const yearlyLeads = monthlyLeads * 12;
        // SEO value calculation
        const highSeoTools = selectedTools.filter(t => t.seoValue === 'high').length;
        const seoValue = highSeoTools >= 2 ? 'Excellent' : highSeoTools === 1 ? 'Good' : 'Moderate';
        // Revenue estimate: 2% conversion, $30 AOV
        const projectedRevenue = yearlyLeads * 0.02 * 30;
        return {
            monthlyLeads,
            yearlyLeads,
            projectedRevenue,
            setupTimeHours: Math.round(setupTimeHours * 10) / 10,
            seoValue,
            explanation: `With ${selectedTools.length} tools: ~${monthlyLeads} leads/mo, ${seoValue} SEO value. Est. revenue: $${projectedRevenue.toFixed(0)}/year`,
        };
    }
    generateToolCode(toolId, config) {
        const tool = this.viralTools.find(t => t.id === toolId);
        if (!tool)
            throw new Error(`Tool ${toolId} not found`);
        return {
            files: {
                [`app/${toolId}/page.tsx`]: `// ${tool.name} page component`,
                [`app/api/${toolId}/route.ts`]: `// API route for ${tool.name}`,
            },
            migrations: this.getMigrationsForTool(toolId),
            klaviyoFlows: this.getFlowsForTool(toolId),
            deploymentSteps: [
                `Create storage bucket for ${toolId}`,
                'Run database migrations',
                'Set up Klaviyo list and flows',
                'Configure API keys',
                'Deploy to Vercel',
            ],
        };
    }
    getMigrationsForTool(toolId) {
        const baseTables = [
            'CREATE TABLE IF NOT EXISTS email_signups (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, store_id UUID REFERENCES stores(id), email TEXT NOT NULL, source TEXT, created_at TIMESTAMP DEFAULT NOW())',
        ];
        const toolSpecific = {
            'ai-puppy-mixer': [
                'CREATE TABLE IF NOT EXISTS dog_photos (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, email TEXT, storage_path TEXT, created_at TIMESTAMP DEFAULT NOW())',
                'CREATE TABLE IF NOT EXISTS ai_generations (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, email TEXT, original_url TEXT, generated_url TEXT, created_at TIMESTAMP DEFAULT NOW())',
            ],
            'breed-glossary': [
                'CREATE TABLE IF NOT EXISTS breed_pages (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, breed_name TEXT, content JSONB, seo_score INTEGER, created_at TIMESTAMP DEFAULT NOW())',
            ],
            'ugc-video-generator': [
                'CREATE TABLE IF NOT EXISTS video_queue (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, product_id TEXT, status TEXT, video_url TEXT, created_at TIMESTAMP DEFAULT NOW())',
            ],
            'activity-tracker': [
                'CREATE TABLE IF NOT EXISTS activities (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, email TEXT, activity_type TEXT, duration INTEGER, created_at TIMESTAMP DEFAULT NOW())',
                'CREATE TABLE IF NOT EXISTS achievements (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, email TEXT, achievement_name TEXT, unlocked_at TIMESTAMP DEFAULT NOW())',
            ],
            'dog-personality-quiz': [
                'CREATE TABLE IF NOT EXISTS quiz_responses (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, email TEXT, quiz_id TEXT, answers JSONB, result TEXT, created_at TIMESTAMP DEFAULT NOW())',
            ],
        };
        return [...baseTables, ...(toolSpecific[toolId] || [])];
    }
    getFlowsForTool(toolId) {
        return [
            `Welcome Series (${toolId})`,
            'Product Recommendations',
            'Abandoned Cart Recovery',
            'Re-engagement (90 days)',
        ];
    }
    generateEmailSequence(toolId, config) {
        const tool = this.viralTools.find(t => t.id === toolId);
        return {
            welcome: `Welcome! Here's your ${tool?.name || 'tool'} result and personalized recommendations...`,
            followUp: [
                'Day 3: Did you try sharing with friends?',
                'Day 7: Here are more tools you might like',
                'Day 14: Special offer just for you',
            ],
            upsell: 'Ready to take the next step? Shop our recommended products!',
        };
    }
}
exports.ViralGrowthEngine = ViralGrowthEngine;
exports.viralGrowthEngine = new ViralGrowthEngine();
//# sourceMappingURL=viralGrowthEngine.js.map