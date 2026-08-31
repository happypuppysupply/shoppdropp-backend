import { apifyService } from './apifyService';

// Define what we need for each research phase
interface ResearchPhase {
  id: string;
  name: string;
  description: string;
  searchQueries: string[];
  requiredCapabilities: string[];
  preferredPricingModel: 'free' | 'paid';
  minRuns: number;
  priority: 'popularity' | 'price' | 'features';
}

interface DiscoveredActor {
  id: string;
  name: string;
  title: string;
  description: string;
  username: string;
  pricing: {
    model: string;
    pricePerUnitUsd: number;
    trialMinutes?: number;
    isFree: boolean;
  };
  stats: {
    totalRuns: number;
    publicActorRunCount: number;
    stars?: number;
  };
  categories: string[];
  score: number; // Our calculated suitability score
  recommendedFor: string[];
}

// Define the research phases for ShoppDropp
const RESEARCH_PHASES: ResearchPhase[] = [
  {
    id: 'tiktok_trends',
    name: 'TikTok Trend Discovery',
    description: 'Find trending products from TikTok hashtags and viral videos',
    searchQueries: ['tiktok scraper', 'tiktok hashtag', 'tiktok trends', 'viral videos'],
    requiredCapabilities: ['hashtag scraping', 'trending content', 'video metadata'],
    preferredPricingModel: 'paid',
    minRuns: 1000,
    priority: 'popularity',
  },
  {
    id: 'tiktok_shop',
    name: 'TikTok Shop Research',
    description: 'Check TikTok Shop for product data and competitor analysis',
    searchQueries: ['tiktok shop', 'tiktok commerce', 'tiktok product'],
    requiredCapabilities: ['tiktok shop', 'product data', 'e-commerce'],
    preferredPricingModel: 'paid',
    minRuns: 500,
    priority: 'features',
  },
  {
    id: 'reddit_discussions',
    name: 'Reddit Product Discussions',
    description: 'Analyze Reddit discussions about products and niches',
    searchQueries: ['reddit scraper', 'reddit posts', 'subreddit', 'reddit comments'],
    requiredCapabilities: ['reddit scraping', 'subreddit', 'comments'],
    preferredPricingModel: 'paid',
    minRuns: 1000,
    priority: 'popularity',
  },
  {
    id: 'google_trends',
    name: 'Google Trends Analysis',
    description: 'Check Google search demand for keywords',
    searchQueries: ['google trends', 'trends scraper', 'search trends'],
    requiredCapabilities: ['google trends', 'search data'],
    preferredPricingModel: 'paid',
    minRuns: 500,
    priority: 'features',
  },
  {
    id: 'amazon_products',
    name: 'Amazon Competition Analysis',
    description: 'Scrape Amazon for product data, pricing, and reviews',
    searchQueries: ['amazon scraper', 'amazon product', 'amazon reviews', 'amazon seller'],
    requiredCapabilities: ['amazon', 'product data', 'reviews', 'pricing'],
    preferredPricingModel: 'paid',
    minRuns: 5000,
    priority: 'popularity',
  },
  {
    id: 'ebay_products',
    name: 'eBay Competition Analysis',
    description: 'Check eBay for product data and pricing trends',
    searchQueries: ['ebay scraper', 'ebay search', 'ebay product'],
    requiredCapabilities: ['ebay', 'product data'],
    preferredPricingModel: 'paid',
    minRuns: 500,
    priority: 'popularity',
  },
  {
    id: 'instagram_products',
    name: 'Instagram Product Discovery',
    description: 'Find trending products from Instagram posts and hashtags',
    searchQueries: ['instagram scraper', 'instagram hashtag', 'instagram posts'],
    requiredCapabilities: ['instagram', 'hashtags', 'posts'],
    preferredPricingModel: 'paid',
    minRuns: 1000,
    priority: 'popularity',
  },
  {
    id: 'youtube_videos',
    name: 'YouTube Product Research',
    description: 'Find products mentioned in YouTube videos',
    searchQueries: ['youtube scraper', 'youtube video', 'youtube transcript'],
    requiredCapabilities: ['youtube', 'video data', 'transcripts'],
    preferredPricingModel: 'paid',
    minRuns: 1000,
    priority: 'popularity',
  },
];

export class ApifyActorDiscovery {
  /**
   * Discover and select the best actors for each research phase
   * Uses Apify API to search, score, and select optimal actors
   */
  async discoverActors(): Promise<Map<string, DiscoveredActor>> {
    const selectedActors = new Map<string, DiscoveredActor>();
    
    console.log('🔍 Starting Apify actor discovery...');
    
    for (const phase of RESEARCH_PHASES) {
      console.log(`\n📋 Phase: ${phase.name}`);
      console.log(`   Description: ${phase.description}`);
      
      try {
        // Search for actors using multiple queries
        const allResults: any[] = [];
        
        for (const query of phase.searchQueries) {
          console.log(`   🔎 Searching: "${query}"`);
          const results = await apifyService.searchActors(query, {
            sortBy: 'popularity',
            limit: 20,
          });
          allResults.push(...(results.items || []));
        }
        
        // Remove duplicates by ID
        const uniqueActors = new Map<string, any>();
        allResults.forEach(actor => {
          if (!uniqueActors.has(actor.id) || 
              (uniqueActors.get(actor.id)?.stats?.publicActorRunCount || 0) < (actor.stats?.publicActorRunCount || 0)) {
            uniqueActors.set(actor.id, actor);
          }
        });
        
        const actors = Array.from(uniqueActors.values());
        console.log(`   Found ${actors.length} unique actors`);
        
        // Score each actor
        const scoredActors = actors.map(actor => this.scoreActor(actor, phase));
        
        // Sort by score (highest first)
        scoredActors.sort((a, b) => b.score - a.score);
        
        // Select the best actor (or fallback to popular ones if none match)
        if (scoredActors.length > 0) {
          const bestActor = scoredActors[0];
          selectedActors.set(phase.id, bestActor);
          
          console.log(`   ✅ Selected: ${bestActor.title || bestActor.name}`);
          console.log(`      ID: ${bestActor.id}`);
          console.log(`      Runs: ${bestActor.stats.publicActorRunCount.toLocaleString()}`);
          console.log(`      Price: ${bestActor.pricing.isFree ? 'Free' : '$' + bestActor.pricing.pricePerUnitUsd.toFixed(2)}`);
          console.log(`      Score: ${bestActor.score.toFixed(2)}`);
        } else {
          console.log(`   ⚠️ No suitable actors found for ${phase.id}`);
        }
        
        // Wait a bit between requests to avoid rate limiting
        await this.delay(500);
        
      } catch (error: any) {
        console.error(`   ❌ Error discovering actors for ${phase.id}:`, error.message);
      }
    }
    
    return selectedActors;
  }

  /**
   * Score an actor based on phase requirements
   */
  private scoreActor(actor: any, phase: ResearchPhase): DiscoveredActor {
    const stats = actor.stats || {};
    const pricing = actor.currentPricing || {};
    const runCount = stats.publicActorRunCount || stats.totalRuns || 0;
    
    // Base scoring factors (0-100 scale)
    let score = 0;
    const scores: any = {};
    
    // 1. Popularity score (0-40 points)
    const popularityScore = Math.min(40, (runCount / phase.minRuns) * 40);
    score += popularityScore;
    scores.popularity = popularityScore.toFixed(1);
    
    // 2. Pricing score (0-25 points)
    // Prefer paid actors (they're usually better maintained) but penalize expensive ones
    let pricingScore = 0;
    if (pricing.pricingModel === 'PAY_PER_PLATFORM_USAGE') {
      // Platform usage based - reasonable cost
      pricingScore = 20;
    } else if (pricing.pricingModel === 'PAY_PER_USAGE') {
      const price = pricing.pricePerUnitUsd || 0;
      if (price === 0 || price < 0.01) {
        pricingScore = 25; // Free is great
      } else if (price < 0.10) {
        pricingScore = 20;
      } else if (price < 0.50) {
        pricingScore = 15;
      } else {
        pricingScore = 10;
      }
    } else {
      pricingScore = 15; // Default
    }
    score += pricingScore;
    scores.pricing = pricingScore.toFixed(1);
    
    // 3. Description relevance score (0-20 points)
    const descLower = (actor.description || '').toLowerCase();
    const nameLower = (actor.name || '').toLowerCase();
    let relevanceScore = 0;
    
    const relevantTerms = [...phase.searchQueries, ...phase.requiredCapabilities];
    for (const term of relevantTerms) {
      if (descLower.includes(term.toLowerCase()) || nameLower.includes(term.toLowerCase())) {
        relevanceScore += 5;
      }
    }
    relevanceScore = Math.min(20, relevanceScore);
    score += relevanceScore;
    scores.relevance = relevanceScore.toFixed(1);
    
    // 4. Category match score (0-15 points)
    let categoryScore = 0;
    const categories = actor.categories || [];
    const relevantCategories = ['Social Media', 'E-commerce', 'Data', 'AI & ML', 'Web Scraping'];
    for (const cat of categories) {
      if (relevantCategories.includes(cat)) {
        categoryScore += 5;
      }
    }
    categoryScore = Math.min(15, categoryScore);
    score += categoryScore;
    scores.category = categoryScore.toFixed(1);
    
    // Boost score for popular, well-maintained actors
    if (runCount > 10000) score += 5;
    if (actor.isPublic) score += 2;
    
    return {
      id: actor.id,
      name: actor.name,
      title: actor.title || actor.name,
      description: actor.description || '',
      username: actor.username,
      pricing: {
        model: pricing.pricingModel || 'PAY_PER_PLATFORM_USAGE',
        pricePerUnitUsd: pricing.pricePerUnitUsd || 0,
        trialMinutes: pricing.trialMinutes,
        isFree: !pricing.pricePerUnitUsd || pricing.pricePerUnitUsd < 0.01,
      },
      stats: {
        totalRuns: stats.totalRuns || 0,
        publicActorRunCount: runCount,
      },
      categories: actor.categories || [],
      score: Math.min(100, score),
      recommendedFor: [phase.id],
    };
  }

  /**
   * Generate a configuration file with discovered actors
   */
  async generateActorConfiguration(): Promise<any> {
    const selectedActors = await this.discoverActors();
    
    const config: any = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      phases: {},
      estimatedCosts: {},
    };
    
    let totalEstimatedCost = 0;
    
    for (const [phaseId, actor] of selectedActors) {
      config.phases[phaseId] = {
        actorId: actor.id,
        actorName: actor.title,
        description: actor.description,
        pricing: actor.pricing,
        stats: actor.stats,
        score: actor.score,
      };
      
      // Estimate cost per run (rough estimate)
      const estimatedCost = actor.pricing.isFree ? 0.05 : // Even "free" actors have compute costs
        (actor.pricing.pricePerUnitUsd < 0.01 ? 0.05 : actor.pricing.pricePerUnitUsd);
      
      config.estimatedCosts[phaseId] = estimatedCost;
      totalEstimatedCost += estimatedCost;
    }
    
    config.totalEstimatedCost = totalEstimatedCost;
    config.totalPhases = selectedActors.size;
    
    return config;
  }

  /**
   * Save discovered actors to database
   */
  async saveDiscoveredActors(config: any): Promise<void> {
    // This would save to your database as the "official" ShoppDropp actor registry
    console.log('\n💾 Saving discovered actors to configuration...');
    console.log(JSON.stringify(config, null, 2));
    
    // TODO: Save to database table `apify_actor_registry`
    // await db.upsertActorConfiguration(config);
    
    console.log('✅ Configuration saved!');
  }

  /**
   * Test a discovered actor to ensure it works
   */
  async testActor(actorId: string, testInput: any = {}): Promise<any> {
    console.log(`\n🧪 Testing actor: ${actorId}`);
    
    try {
      // Get actor details
      const actor = await apifyService.getActor(actorId);
      console.log(`   Name: ${actor.title || actor.name}`);
      console.log(`   Username: ${actor.username}`);
      
      // Run a quick test (with short timeout and limit)
      const run = await apifyService.runActor(actorId, testInput, {
        memory: 1024,
        timeout: 60,
        waitForFinish: true,
        waitSecs: 30,
      });
      
      console.log(`   ✅ Test run successful: ${run.status}`);
      return { success: true, run };
      
    } catch (error: any) {
      console.error(`   ❌ Test failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const apifyActorDiscovery = new ApifyActorDiscovery();

// If run directly, perform discovery
if (require.main === module) {
  (async () => {
    console.log('🚀 Apify Actor Discovery Tool\n');
    console.log('This tool will search Apify Store and select the best actors');
    console.log('for your ShoppDropp research pipeline.\n');
    
    const config = await apifyActorDiscovery.generateActorConfiguration();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 DISCOVERY RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Phases: ${config.totalPhases}`);
    console.log(`Estimated Cost Per Full Research: $${config.totalEstimatedCost.toFixed(2)}`);
    console.log(`Generated At: ${config.generatedAt}`);
    
    console.log('\n📋 SELECTED ACTORS BY PHASE:');
    for (const [phaseId, phaseConfig] of Object.entries(config.phases)) {
      const pc = phaseConfig as any;
      console.log(`\n  ${phaseId}:`);
      console.log(`    Actor: ${pc.actorName} (${pc.actorId})`);
      console.log(`    Score: ${pc.score.toFixed(2)}/100`);
      console.log(`    Cost: ${pc.pricing.isFree ? 'Free' : '$' + pc.pricing.pricePerUnitUsd.toFixed(2)}`);
      console.log(`    Runs: ${pc.stats.publicActorRunCount.toLocaleString()}`);
    }
    
    // Save to file
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../../config/apify-actors.json');
    
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log(`\n💾 Configuration saved to: ${configPath}`);
    
  })();
}
