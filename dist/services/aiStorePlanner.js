"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAIStorePlanner = exports.AIStorePlanner = void 0;
const axios_1 = __importDefault(require("axios"));
const storeScanner_1 = require("./storeScanner");
const cjDropshippingService_1 = require("./cjDropshippingService");
const shopScorer_1 = require("./shopScorer");
/**
 * AI Store Planner - MARKETING/LEAD GENERATION ONLY
 *
 * This service generates AI-powered store analysis and recommendations.
 * IMPORTANT: This is for MARKETING PURPOSES ONLY.
 * No actual store modifications, deployments, or infrastructure provisioning occurs.
 *
 * To actually build a store, users must:
 * 1. Sign up for a paid plan
 * 2. Provision VPS separately via /api/vps-simple/provision-store
 * 3. Connect their own GitHub/Vercel/Shopify credentials
 * 4. Trigger deployment via Store Developer
 */
class AIStorePlanner {
    openRouterKey;
    cjApiKey;
    constructor(openRouterKey, cjApiKey) {
        this.openRouterKey = openRouterKey;
        this.cjApiKey = cjApiKey;
    }
    /**
     * Generate a marketing plan for lead generation
     * This is NOT a deployment plan - it's a sales tool
     */
    async generatePlan(url) {
        console.log(`[AIStorePlanner] Generating MARKETING plan for: ${url}`);
        console.log(`[AIStorePlanner] NOTE: This is for lead generation only. No deployment occurs.`);
        // Step 1: Scan the store (read-only analysis)
        let scanResult;
        try {
            scanResult = await storeScanner_1.storeScanner.scanStore(url);
        }
        catch (error) {
            console.log(`[AIStorePlanner] Scan failed: ${error.message}`);
            console.log(`[AIStorePlanner] Using mock data for demo...`);
            // scanStore already returns mock data on failure, but if we get here it's URL resolution error
            scanResult = {
                url,
                shopifyDomain: url,
                theme: { features: [] },
                pages: [
                    { path: '/', title: 'Home', type: 'home' },
                    { path: '/collections/all', title: 'All Products', type: 'collection' },
                    { path: '/pages/about', title: 'About', type: 'page' },
                    { path: '/pages/contact', title: 'Contact', type: 'page' },
                ],
                collections: [
                    { handle: 'all', title: 'All Products' },
                    { handle: 'featured', title: 'Featured' },
                    { handle: 'new', title: 'New Arrivals' },
                    { handle: 'sale', title: 'Sale' },
                ],
                navigation: [
                    { title: 'Shop', url: '/collections/all', position: 'header' },
                    { title: 'About', url: '/pages/about', position: 'header' },
                    { title: 'Contact', url: '/pages/contact', position: 'header' },
                ],
                products: [],
                design: { style: 'modern' },
                customPages: [],
                apps: [],
                seo: {
                    title: 'Store',
                    hasStructuredData: false,
                    hasOpenGraph: false,
                    hasTwitterCard: false,
                    headings: { h1: 1, h2: 0, h3: 0 },
                },
            };
        }
        // Step 2: AI Analysis with OpenRouter (marketing insights)
        const analysis = await this.analyzeWithAI(scanResult);
        // Step 3: Calculate comprehensive Shop Score
        const shopScorer = (0, shopScorer_1.createShopScorer)();
        const partialPlan = {
            scanResult,
            analysis,
            designRecommendations: await this.generateDesignRecommendations(scanResult, analysis),
            productStrategy: { winningProducts: [], collections: [], priceRange: { min: 15, max: 150, currency: 'USD' } },
            marketingPlan: await this.generateMarketingPlan(analysis),
        };
        const shopScore = shopScorer.calculateScore(scanResult, partialPlan);
        // Step 4: Product Research with CJ Dropshipping (for recommendations)
        const productStrategy = await this.researchProducts(analysis, scanResult);
        // Step 5: Generate complete marketing plan
        const plan = {
            scanResult,
            shopScore,
            analysis: analysis,
            designRecommendations: await this.generateDesignRecommendations(scanResult, analysis),
            productStrategy,
            marketingPlan: await this.generateMarketingPlan(analysis),
            technicalRequirements: this.determineTechnicalRequirements(scanResult, analysis),
            implementationPlan: this.createImplementationPlan(),
        };
        console.log(`[AIStorePlanner] Marketing plan generated successfully`);
        console.log(`[AIStorePlanner] To deploy: User must signup + provision VPS + connect credentials`);
        return plan;
    }
    async analyzeWithAI(scanResult) {
        const prompt = this.buildAnalysisPrompt(scanResult);
        try {
            const response = await axios_1.default.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'openrouter/moonshotai/kimi-k2.5',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert e-commerce analyst and Shopify strategist. Analyze the provided store data and return insights in JSON format.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openRouterKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://shoppdropp.com',
                    'X-Title': 'ShoppDropp AI Scanner',
                },
            });
            const aiResponse = response.data.choices[0].message.content;
            // Extract JSON from response
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            // Fallback if JSON parsing fails
            return this.generateFallbackAnalysis(scanResult);
        }
        catch (error) {
            console.error('[AIStorePlanner] AI analysis error:', error.message);
            return this.generateFallbackAnalysis(scanResult);
        }
    }
    buildAnalysisPrompt(scanResult) {
        return `Analyze this Shopify store and provide strategic insights:

STORE URL: ${scanResult.url}
SHOPIFY DOMAIN: ${scanResult.shopifyDomain}

PAGES DETECTED:
${scanResult.pages.map(p => `- ${p.path} (${p.type}): ${p.title}`).join('\n')}

NAVIGATION:
${scanResult.navigation.map(n => `- ${n.title}: ${n.url} (${n.position})`).join('\n')}

COLLECTIONS:
${scanResult.collections.map(c => `- ${c.title} (${c.handle})`).join('\n')}

DESIGN PROFILE:
- Style: ${scanResult.design.style}
- Colors: ${JSON.stringify(scanResult.design.colors)}
- Typography: ${JSON.stringify(scanResult.design.typography)}

INSTALLED APPS:
${scanResult.apps.join(', ')}

CUSTOM PAGES:
${scanResult.pages.filter(p => p.type === 'custom').map(p => `- ${p.path}: ${p.title} (Form: ${p.hasForm}, Quiz: ${p.hasQuiz})`).join('\n')}

Please analyze and return a JSON object with this structure:
{
  "niche": "specific niche identification",
  "targetAudience": "detailed target audience description",
  "competitiveAdvantages": ["advantage 1", "advantage 2"],
  "improvementOpportunities": ["opportunity 1", "opportunity 2"],
  "estimatedTraffic": "traffic estimate with reasoning",
  "contentGaps": ["missing content type 1", "missing content type 2"]
}`;
    }
    generateFallbackAnalysis(scanResult) {
        const hasPetKeywords = scanResult.pages.some(p => p.title.toLowerCase().includes('pet') ||
            p.title.toLowerCase().includes('dog') ||
            p.title.toLowerCase().includes('puppy'));
        const hasAssessment = scanResult.pages.some(p => p.path.includes('assessment'));
        return {
            niche: hasPetKeywords ? 'Pet Supplies & Accessories' : 'General E-commerce',
            targetAudience: hasPetKeywords
                ? 'Pet owners aged 25-45, primarily dog owners, middle-income households'
                : 'General consumers',
            competitiveAdvantages: [
                hasAssessment ? 'Interactive assessment tool for personalization' : 'Clean store design',
                'Well-organized navigation',
                'Professional appearance',
            ],
            improvementOpportunities: [
                'Add more product collections',
                'Implement email capture',
                'Add customer reviews',
                'Create blog content for SEO',
            ],
            estimatedTraffic: '1,000-5,000 monthly visitors (estimated based on store structure)',
            contentGaps: [
                'About us story',
                'Detailed product guides',
                'Customer testimonials',
                'FAQ section',
            ],
        };
    }
    async generateDesignRecommendations(scanResult, analysis) {
        const niche = analysis.niche.toLowerCase();
        // Color palettes by niche
        const palettes = {
            pet: {
                primary: '#8B5CF6',
                secondary: '#EC4899',
                accent: '#F59E0B',
                background: '#FFFFFF',
            },
            fashion: {
                primary: '#1F2937',
                secondary: '#6B7280',
                accent: '#EF4444',
                background: '#FAFAFA',
            },
            beauty: {
                primary: '#EC4899',
                secondary: '#F472B6',
                accent: '#8B5CF6',
                background: '#FFF1F2',
            },
            tech: {
                primary: '#3B82F6',
                secondary: '#1E40AF',
                accent: '#10B981',
                background: '#F8FAFC',
            },
            home: {
                primary: '#059669',
                secondary: '#10B981',
                accent: '#D97706',
                background: '#F0FDF4',
            },
        };
        // Find matching palette
        let palette = palettes.pet; // default
        for (const [key, value] of Object.entries(palettes)) {
            if (niche.includes(key)) {
                palette = value;
                break;
            }
        }
        return {
            style: analysis.niche.includes('Pet') ? 'playful' : 'modern',
            colorPalette: palette,
            typography: 'modern',
            layout: 'grid',
            mood: analysis.niche.includes('Pet') ? 'friendly and approachable' : 'professional and trustworthy',
        };
    }
    async researchProducts(analysis, scanResult) {
        console.log('[AIStorePlanner] Researching products with CJ Dropshipping...');
        let winningProducts = [];
        let collections = [];
        // Use CJ API if available
        if (this.cjApiKey) {
            try {
                const cj = (0, cjDropshippingService_1.createCJDropshippingService)({ apiKey: this.cjApiKey });
                // Search products based on niche
                const searchResults = await cj.findWinningProducts({
                    category: this.mapNicheToCategory(analysis.niche),
                    minListedNum: 50,
                });
                // Transform to recommendations
                winningProducts = searchResults.slice(0, 10).map((p) => ({
                    name: p.name,
                    description: p.description || `High-quality ${p.name}`,
                    whyItWins: `Popular with ${p.listedNum}+ listings, proven demand`,
                    targetPrice: Math.round(p.price * 2.5 * 100) / 100, // 2.5x markup
                    supplierCost: p.price,
                    profitMargin: 60,
                    searchKeywords: [p.categoryName, p.name.split(' ')[0]],
                    cjProductIds: [p.pid],
                    images: p.images || [p.imageUrl],
                }));
                console.log(`[AIStorePlanner] Found ${winningProducts.length} winning products from CJ`);
            }
            catch (e) {
                console.error('[AIStorePlanner] CJ product research failed:', e.message);
            }
        }
        // Fallback AI-generated products if CJ fails
        if (winningProducts.length === 0) {
            winningProducts = this.generateAIProductRecommendations(analysis.niche);
        }
        // Generate collections based on niche
        collections = this.generateCollections(analysis.niche, winningProducts);
        return {
            recommendedNiches: [analysis.niche, 'Complementary products', 'Accessories'],
            priceRange: { min: 15, max: 150, currency: 'USD' },
            sourcingStrategy: 'CJ Dropshipping for automated fulfillment',
            winningProducts,
            collections,
        };
    }
    mapNicheToCategory(niche) {
        const nicheMap = {
            'pet': 'Pet Supplies',
            'dog': 'Pet Supplies',
            'cat': 'Pet Supplies',
            'fashion': 'Clothing & Accessories',
            'beauty': 'Beauty & Personal Care',
            'home': 'Home & Garden',
            'tech': 'Electronics',
            'fitness': 'Sports & Outdoors',
        };
        const lowerNiche = niche.toLowerCase();
        for (const [key, value] of Object.entries(nicheMap)) {
            if (lowerNiche.includes(key))
                return value;
        }
        return undefined;
    }
    generateAIProductRecommendations(niche) {
        const recommendationsByNiche = {
            'pet': [
                {
                    name: 'Interactive Pet Puzzle Feeder',
                    description: 'Mental stimulation toy that dispenses treats as your pet solves puzzles',
                    whyItWins: 'High engagement, reduces anxiety, viral on TikTok',
                    targetPrice: 29.99,
                    supplierCost: 8.50,
                    profitMargin: 71,
                    searchKeywords: ['pet toy', 'puzzle feeder', 'dog enrichment'],
                },
                {
                    name: 'Orthopedic Pet Bed with Cooling Gel',
                    description: 'Memory foam bed with cooling technology for joint support',
                    whyItWins: 'Addresses pain point for senior pets, high perceived value',
                    targetPrice: 79.99,
                    supplierCost: 25.00,
                    profitMargin: 68,
                    searchKeywords: ['pet bed', 'orthopedic', 'cooling', 'dog bed'],
                },
                {
                    name: 'Hands-Free Dog Leash with Bungee',
                    description: 'Waist-worn leash with shock absorption for running/walking',
                    whyItWins: 'Trending fitness product, solves real problem',
                    targetPrice: 24.99,
                    supplierCost: 7.00,
                    profitMargin: 72,
                    searchKeywords: ['dog leash', 'hands free', 'running leash'],
                },
            ],
            'fashion': [
                {
                    name: 'Minimalist Crossbody Bag',
                    description: 'Vegan leather crossbody with adjustable strap',
                    whyItWins: 'Timeless design, appeals to wide audience',
                    targetPrice: 45.00,
                    supplierCost: 12.00,
                    profitMargin: 73,
                    searchKeywords: ['crossbody bag', 'vegan leather', 'minimalist'],
                },
            ],
            'default': [
                {
                    name: 'Premium Smart Gadget',
                    description: 'High-quality tech accessory',
                    whyItWins: 'Universal appeal, good margins',
                    targetPrice: 39.99,
                    supplierCost: 12.00,
                    profitMargin: 70,
                    searchKeywords: ['gadget', 'tech', 'premium'],
                },
            ],
        };
        const lowerNiche = niche.toLowerCase();
        for (const [key, products] of Object.entries(recommendationsByNiche)) {
            if (lowerNiche.includes(key))
                return products;
        }
        return recommendationsByNiche.default;
    }
    generateCollections(niche, products) {
        const baseCollections = [
            {
                name: 'Best Sellers',
                description: 'Our most popular products',
                productCount: 8,
                theme: 'Featured products grid',
                seoKeywords: ['best sellers', 'popular', 'top rated'],
            },
            {
                name: 'New Arrivals',
                description: 'Fresh additions to our store',
                productCount: 6,
                theme: 'New products showcase',
                seoKeywords: ['new arrivals', 'new products', 'just in'],
            },
        ];
        if (niche.toLowerCase().includes('pet')) {
            baseCollections.push({
                name: 'For Dogs',
                description: 'Everything your dog needs',
                productCount: 12,
                theme: 'Dog-focused products',
                seoKeywords: ['dog supplies', 'dog accessories', 'pet care'],
            }, {
                name: 'For Cats',
                description: 'Perfect products for felines',
                productCount: 10,
                theme: 'Cat-focused products',
                seoKeywords: ['cat supplies', 'cat toys', 'cat care'],
            }, {
                name: 'Pet Health & Wellness',
                description: 'Supplements, grooming, and care',
                productCount: 8,
                theme: 'Health products',
                seoKeywords: ['pet health', 'pet wellness', 'pet supplements'],
            });
        }
        return baseCollections;
    }
    async generateMarketingPlan(analysis) {
        return {
            adChannels: [
                'Meta Ads (Facebook/Instagram) - Primary channel',
                'Google Ads - Search and Shopping',
                'TikTok Ads - For viral product discovery',
            ],
            contentStrategy: `Focus on educational content about ${analysis.niche}. Create how-to guides, product comparisons, and customer success stories.`,
            emailFlows: [
                'Welcome series (5 emails)',
                'Abandoned cart recovery (3 emails)',
                'Post-purchase follow-up',
                'Win-back campaign for inactive customers',
                'VIP customer rewards',
            ],
            viralHooks: [
                'Before/after product demonstrations',
                'User-generated content campaigns',
                'Limited-time flash sales',
                'Influencer partnerships',
                'Referral program with incentives',
            ],
        };
    }
    determineTechnicalRequirements(scanResult, analysis) {
        const requirements = {
            requiredApps: ['Klaviyo (email marketing)', 'Loox or Judge.me (reviews)'],
            integrations: ['Meta Pixel', 'Google Analytics 4'],
            customFeatures: [],
        };
        if (analysis.niche.toLowerCase().includes('pet')) {
            requirements.requiredApps.push('Product recommendation quiz');
            requirements.customFeatures.push('Pet assessment tool', 'Breed-specific product matching');
        }
        if (!scanResult.apps.includes('Klaviyo')) {
            requirements.requiredApps.push('Klaviyo setup and email flows');
        }
        return requirements;
    }
    createImplementationPlan() {
        return {
            phases: [
                {
                    name: 'Phase 1: Foundation',
                    duration: 'Week 1',
                    tasks: [
                        'Scan and analyze competitor store',
                        'Set up Shopify store with custom theme',
                        'Configure domain and SSL',
                        'Install essential apps',
                    ],
                    deliverables: ['Live Shopify store', 'Custom theme deployed', 'Apps installed'],
                },
                {
                    name: 'Phase 2: Product Setup',
                    duration: 'Week 1-2',
                    tasks: [
                        'Import winning products from CJ Dropshipping',
                        'Create optimized product descriptions',
                        'Set up product collections',
                        'Configure inventory sync',
                    ],
                    deliverables: ['20+ products imported', 'Collections created', 'Inventory automated'],
                },
                {
                    name: 'Phase 3: Marketing Setup',
                    duration: 'Week 2',
                    tasks: [
                        'Configure Meta Pixel and Google Analytics',
                        'Set up email marketing flows',
                        'Create initial ad campaigns',
                        'Build landing pages',
                    ],
                    deliverables: ['Tracking installed', 'Email flows active', 'Ads running'],
                },
                {
                    name: 'Phase 4: Launch & Optimize',
                    duration: 'Week 3+',
                    tasks: [
                        'Launch store publicly',
                        'Monitor and optimize ad performance',
                        'A/B test product pages',
                        'Scale winning products',
                    ],
                    deliverables: ['Live traffic', 'Sales generated', 'Optimization ongoing'],
                },
            ],
            timeline: '3-4 weeks to full launch',
            estimatedCost: '$500-1000 initial setup + $300-500/month ongoing',
        };
    }
    // Generate viral marketing content
    generateViralContent(storeUrl, plan) {
        const niche = plan.analysis.niche;
        const opportunity = plan.analysis.improvementOpportunities[0];
        return {
            headline: `I analyzed ${storeUrl} and found ${plan.productStrategy.winningProducts.length} winning products`,
            subheadline: `${niche} niche analysis reveals $${plan.productStrategy.priceRange.max}+ monthly opportunity. ${opportunity}`,
            cta: 'Get Your Free Store Plan',
            socialProof: 'Join 1,000+ stores using AI to grow faster',
        };
    }
}
exports.AIStorePlanner = AIStorePlanner;
const createAIStorePlanner = (openRouterKey, cjApiKey) => new AIStorePlanner(openRouterKey, cjApiKey);
exports.createAIStorePlanner = createAIStorePlanner;
//# sourceMappingURL=aiStorePlanner.js.map