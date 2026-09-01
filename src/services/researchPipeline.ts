import { apifyService } from './apifyService';
import { cjDropshippingService } from './cjDropshippingService';
import { supabase } from '../db/supabase';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

interface ResearchContext {
  userId: string;
  storeId: string;
  onboardingData: {
    category: string;
    subcategory: string;
    productCount: number;
    priceRange: { min: number; max: number };
    targetAudience: string;
    brandName: string;
  };
}

interface ResearchPhase {
  id: string;
  name: string;
  actorId: string;
  description: string;
  inputGenerator: (context: ResearchContext, accumulatedData: any) => any;
  dataProcessor: (results: any[], accumulatedData: any) => any;
}

interface StreamingActivity {
  type: 'info' | 'success' | 'warning' | 'error' | 'actor_start' | 'actor_complete' | 'cj_check' | 'product_found';
  timestamp: string;
  message: string;
  details?: any;
}

interface ResearchRun {
  id: string;
  userId: string;
  storeId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cached';
  context: ResearchContext;
  activities: StreamingActivity[];
  results: any[];
  startTime: string;
  endTime?: string;
  totalCost: number;
  productsFound: number;
  productsVerified: number;
  cacheKey?: string;
  cacheHit?: boolean;
}

// ShoppDropp Official Actors - VERIFIED 2025-08-31
// Actor IDs verified from Apify Store screenshots
const SHOPPDROPP_ACTORS = {
  tiktok: 'GdWCkxBtKWOsKjdch',        // clockworks/tiktok-scraper
  reddit: 'oAuCIx3ItNrs2okjQ',        // trudax/reddit-scraper-lite
  google_trends: 'DyNQEYDj9awfGQf9A', // apify/google-trends-scraper
  amazon: 'BG3WDrGdteHgZgbPK',        // junglee/amazon-crawler
  instagram: 'apify/instagram-hashtag-scraper', // Phase 2
  // TODO Phase 2: Add YouTube (streamers/youtube-scraper)
};

export class ResearchPipeline extends EventEmitter {
  private activeRuns: Map<string, ResearchRun> = new Map();

  /**
   * Start a new research run for a user
   */
  async startResearch(context: ResearchContext): Promise<string> {
    const runId = uuidv4();
    const { onboardingData } = context;
    
    // Generate cache key from onboarding data
    const cacheKey = this.generateCacheKey(onboardingData);
    
    const run: ResearchRun = {
      id: runId,
      userId: context.userId,
      storeId: context.storeId,
      status: 'running',
      context,
      activities: [],
      results: [],
      startTime: new Date().toISOString(),
      totalCost: 0,
      productsFound: 0,
      productsVerified: 0,
    };

    this.activeRuns.set(runId, run);
    
    // Check cache first!
    const cachedResult = await this.checkCache(cacheKey, run);
    
    if (cachedResult) {
      // Serve from cache - no Apify costs!
      run.status = 'cached';
      run.cacheKey = cacheKey;
      run.cacheHit = true;
      run.results = cachedResult.products;
      run.productsFound = cachedResult.products_count;
      run.productsVerified = cachedResult.products_count;
      run.endTime = new Date().toISOString();
      
      this.emitActivity(run.id, {
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `🎯 Cache hit! Found ${cachedResult.products_count} products from previous research.`,
        details: { cacheKey, savings: cachedResult.estimated_savings }
      });
      
      this.emitActivity(run.id, {
        type: 'success',
        timestamp: new Date().toISOString(),
        message: `✨ Research complete using cached data. Saved $${cachedResult.estimated_savings.toFixed(2)}!`,
      });
      
      this.emit('complete', run);
      return runId;
    }
    
    // No cache hit - run actual research
    run.cacheKey = cacheKey;
    run.cacheHit = false;
    
    // Start research pipeline in background
    this.executePipeline(run).catch(err => {
      console.error(`Research run ${runId} failed:`, err);
      this.failRun(runId, err.message);
    });

    return runId;
  }

  /**
   * Get research run status
   */
  getRun(runId: string): ResearchRun | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Get all activities for a run (for streaming)
   */
  getActivities(runId: string): StreamingActivity[] {
    return this.activeRuns.get(runId)?.activities || [];
  }

  /**
   * Main pipeline execution
   */
  private async executePipeline(run: ResearchRun) {
    const { context } = run;
    const { productCount } = context.onboardingData;

    this.emitActivity(run.id, {
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🔬 Starting research for ${context.onboardingData.brandName}`,
      details: { 
        targetProducts: productCount,
        category: context.onboardingData.category,
        subcategory: context.onboardingData.subcategory,
      }
    });

    this.emitActivity(run.id, {
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `📊 Target: Find ${productCount} products in ${context.onboardingData.category} > ${context.onboardingData.subcategory}`,
    });

    // Phase 1: Social Media Discovery
    let accumulatedData = await this.runPhase(run, {
      id: 'social_discovery',
      name: 'Social Media Discovery',
      actorId: SHOPPDROPP_ACTORS.tiktok,
      description: 'Finding trending products on TikTok',
      inputGenerator: (ctx) => this.generateTikTokInput(ctx),
      dataProcessor: (results, data) => this.processTikTokResults(results, data),
    });

    // Phase 2: Google Trends (Search Demand Validation)
    accumulatedData = await this.runPhase(run, {
      id: 'google_trends_validation',
      name: 'Google Trends Analysis',
      actorId: SHOPPDROPP_ACTORS.google_trends,
      description: 'Checking search demand for products',
      inputGenerator: (ctx, data) => this.generateGoogleTrendsInput(ctx, data),
      dataProcessor: (results, data) => this.processGoogleTrendsResults(results, data),
    }, accumulatedData);

    // Phase 3: Reddit Validation
    accumulatedData = await this.runPhase(run, {
      id: 'reddit_validation',
      name: 'Reddit Validation',
      actorId: SHOPPDROPP_ACTORS.reddit,
      description: 'Validating product demand on Reddit',
      inputGenerator: (ctx, data) => this.generateRedditInput(ctx, data),
      dataProcessor: (results, data) => this.processRedditResults(results, data),
    }, accumulatedData);

    // Phase 4: Market Analysis
    accumulatedData = await this.runPhase(run, {
      id: 'market_analysis',
      name: 'Amazon Market Analysis',
      actorId: SHOPPDROPP_ACTORS.amazon,
      description: 'Analyzing Amazon competition and pricing',
      inputGenerator: (ctx, data) => this.generateAmazonInput(ctx, data),
      dataProcessor: (results, data) => this.processAmazonResults(results, data),
    }, accumulatedData);

    // Phase 4-5: YouTube + Instagram (Deferred to Phase 2)
    // These platforms will be added in a future update
    // Currently using TikTok, Reddit, Trends, Amazon, and CJ for MVP

    // Phase 6: Deep Dive Expansion - Keep searching if not enough products
    accumulatedData = await this.deepDiveExpansion(run, accumulatedData, productCount);

    // Phase 7: CJ Dropshipping Verification
    accumulatedData = await this.runCJVerification(run, accumulatedData);

    // Complete the research
    await this.completeResearch(run, accumulatedData);
  }

  /**
   * Deep Dive Expansion - Repeatedly search with new terms until target met
   */
  private async deepDiveExpansion(run: ResearchRun, accumulatedData: any, targetCount: number): Promise<any> {
    const minNeeded = targetCount * 2; // Need 2x to account for CJ filtering
    let currentData = accumulatedData;
    let iteration = 0;
    const maxIterations = 5; // Prevent infinite loops
    
    while (currentData.products.length < minNeeded && iteration < maxIterations) {
      iteration++;
      
      const remaining = minNeeded - currentData.products.length;
      
      this.emitActivity(run.id, {
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `🔄 Deep Dive ${iteration}: Need ${remaining} more products. Expanding search...`,
        details: { 
          iteration,
          currentCount: currentData.products.length,
          target: minNeeded,
          remaining 
        }
      });
      
      // Generate new search terms based on what we found so far
      const expandedTerms = this.expandSearchTerms(currentData, iteration);
      
      // Run expanded searches
      currentData = await this.runExpandedSearch(run, currentData, expandedTerms, iteration);
      
      // Check if we found enough
      this.emitActivity(run.id, {
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `📊 After Deep Dive ${iteration}: Found ${currentData.products.length} products total`,
        details: { 
          iteration,
          totalFound: currentData.products.length,
          target: minNeeded,
        }
      });
    }
    
    // Report final status
    if (currentData.products.length >= minNeeded) {
      this.emitActivity(run.id, {
        type: 'success',
        timestamp: new Date().toISOString(),
        message: `🎯 Target reached! Found ${currentData.products.length} products (need ${targetCount} after CJ filtering)`,
      });
    } else {
      this.emitActivity(run.id, {
        type: 'warning',
        timestamp: new Date().toISOString(),
        message: `⚠️ Could only find ${currentData.products.length} products after ${maxIterations} deep dives. Proceeding with what we have.`,
      });
    }
    
    return currentData;
  }

  /**
   * Generate new search terms based on discovered products
   */
  private expandSearchTerms(data: any, iteration: number): { tiktok: string[], instagram: string[], youtube: string[] } {
    const products = data.products || [];
    const existingHashtags = new Set<string>();
    
    // Collect hashtags already used
    products.forEach((p: any) => {
      if (p.hashtags) p.hashtags.forEach((h: string) => existingHashtags.add(h.toLowerCase()));
    });
    
    // Generate new hashtags based on popular keywords from found products
    const keywords = this.extractKeywordsFromTikTok(products);
    
    // Add iteration-specific variations
    const tiktokHashtags = keywords.map(kw => `${kw}tok`).filter(h => !existingHashtags.has(h));
    const instagramHashtags = keywords.map(kw => `#${kw}`).filter(h => !existingHashtags.has(h.replace('#', '')));
    const youtubeKeywords = keywords.map(kw => `${kw} review`);
    
    // Also try related/synonym terms
    const relatedTerms = this.generateRelatedTerms(keywords, iteration);
    
    return {
      tiktok: [...tiktokHashtags, ...relatedTerms.map(t => `${t}tok`).slice(0, 5)],
      instagram: [...instagramHashtags, ...relatedTerms.slice(0, 5)],
      youtube: youtubeKeywords.slice(0, 5),
    };
  }

  /**
   * Generate related terms from keywords
   */
  private generateRelatedTerms(keywords: string[], iteration: number): string[] {
    const relatedMap: Record<string, string[]> = {
      'beauty': ['skincare', 'makeup', 'cosmetic', 'face', 'glow', 'serum'],
      'kitchen': ['cooking', 'chef', 'baking', 'food_prep', 'meal', 'culinary'],
      'home': ['decor', 'house', 'living', 'room', 'space', 'modern'],
      'gadget': ['device', 'tool', 'invention', 'innovation', 'smart', 'portable'],
      'pet': ['dog', 'cat', 'animal', 'puppy', 'kitten', 'furry'],
      'clean': ['organize', 'tidy', 'sparkle', 'fresh', 'neat', 'hygiene'],
    };
    
    const related: string[] = [];
    keywords.forEach(kw => {
      const lowerKw = kw.toLowerCase();
      Object.entries(relatedMap).forEach(([key, terms]) => {
        if (lowerKw.includes(key)) {
          // Add some terms, shifting based on iteration
          const start = (iteration - 1) % terms.length;
          related.push(...terms.slice(start, start + 3));
        }
      });
    });
    
    return [...new Set(related)].slice(0, 10);
  }

  /**
   * Run expanded searches with new terms
   */
  private async runExpandedSearch(run: ResearchRun, data: any, terms: any, iteration: number): Promise<any> {
    let currentData = { ...data };
    
    // TikTok with new hashtags
    if (terms.tiktok.length > 0) {
      this.emitActivity(run.id, {
        type: 'actor_start',
        timestamp: new Date().toISOString(),
        message: `🔍 Deep Dive ${iteration}: Searching TikTok with ${terms.tiktok.length} new hashtags...`,
        details: { hashtags: terms.tiktok }
      });
      
      try {
        const input = {
          hashtags: terms.tiktok.slice(0, 8),
          resultsPerPage: 30,
          maxResults: 50,
        };
        
        const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.tiktok, input, {
          waitForFinish: true,
          waitSecs: 300,
        });
        
        const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 500 });
        currentData = this.processTikTokResults(results, currentData);
        
        run.totalCost += 0.05;
      } catch (e) {
        console.error('Expanded TikTok search failed:', e);
      }
    }
    
    // Instagram with new hashtags
    if (terms.instagram.length > 0 && currentData.products.length < run.context.onboardingData.productCount * 2) {
      try {
        const input = {
          hashtags: terms.instagram.slice(0, 5),
          resultsLimit: 30,
        };
        
        const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.instagram, input, {
          waitForFinish: true,
          waitSecs: 300,
        });
        
        const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 500 });
        currentData = this.processInstagramResults(results, currentData);
        
        run.totalCost += 0.05;
      } catch (e) {
        console.error('Expanded Instagram search failed:', e);
      }
    }
    
    return currentData;
  }

  /**
   * Run a single research phase
   */
  private async runPhase(run: ResearchRun, phase: ResearchPhase, accumulatedData: any = {}): Promise<any> {
    this.emitActivity(run.id, {
      type: 'actor_start',
      timestamp: new Date().toISOString(),
      message: `🚀 Starting ${phase.name}...`,
      details: { phaseId: phase.id, actorId: phase.actorId }
    });

    try {
      // Generate input for this actor
      const input = phase.inputGenerator(run.context, accumulatedData);
      
      // Run the actor
      const actorRun = await apifyService.runActor(phase.actorId, input, {
        waitForFinish: true,
        waitSecs: 300, // 5 minutes max per phase
      });

      // Get results from dataset
      const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, {
        limit: 1000,
      });

      // Update cost
      run.totalCost += this.estimatePhaseCost(phase.id);

      this.emitActivity(run.id, {
        type: 'actor_complete',
        timestamp: new Date().toISOString(),
        message: `✅ ${phase.name} complete - Found ${results.length} items`,
        details: { 
          phaseId: phase.id, 
          itemsFound: results.length,
          actorRunId: actorRun.id 
        }
      });

      // Process results
      return phase.dataProcessor(results, accumulatedData);

    } catch (error: any) {
      this.emitActivity(run.id, {
        type: 'warning',
        timestamp: new Date().toISOString(),
        message: `⚠️ ${phase.name} encountered an issue: ${error.message}`,
        details: { phaseId: phase.id, error: error.message }
      });
      return accumulatedData; // Continue with what we have
    }
  }

  /**
   * Run CJ Dropshipping verification
   */
  private async runCJVerification(run: ResearchRun, data: any): Promise<any> {
    const { products } = data;
    const targetCount = run.context.onboardingData.productCount;

    this.emitActivity(run.id, {
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🔄 Verifying ${products.length} products on CJ Dropshipping...`,
    });

    const verifiedProducts = [];
    const failedProducts = [];

    // Check each product against CJ
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      // Skip after we have enough verified products
      if (verifiedProducts.length >= targetCount) {
        break;
      }

      try {
        const cjResult = await this.checkCJAvailability(product);
        
        if (cjResult.available) {
          verifiedProducts.push({
            ...product,
            cj: {
              available: true,
              productId: cjResult.productId,
              price: cjResult.price,
              shippingCost: cjResult.shippingCost,
              warehouse: cjResult.warehouse,
              variants: cjResult.variants,
            }
          });

          this.emitActivity(run.id, {
            type: 'cj_check',
            timestamp: new Date().toISOString(),
            message: `✅ ${product.name?.substring(0, 40) || product.title?.substring(0, 40)}... - Available on CJ`,
            details: { 
              productName: product.name || product.title,
              cjPrice: cjResult.price,
              progress: `${verifiedProducts.length}/${targetCount}`
            }
          });

        } else {
          failedProducts.push(product);
          
          // Only emit some failures to avoid spam
          if (failedProducts.length <= 5) {
            this.emitActivity(run.id, {
              type: 'cj_check',
              timestamp: new Date().toISOString(),
              message: `❌ ${product.name?.substring(0, 40) || product.title?.substring(0, 40)}... - Not on CJ`,
              details: { productName: product.name || product.title }
            });
          }
        }

        // Small delay to be nice to CJ API (500ms between calls)
        await new Promise(r => setTimeout(r, 500));

      } catch (error) {
        console.error('CJ check failed for product:', error);
        failedProducts.push(product);
      }
    }

    this.emitActivity(run.id, {
      type: 'success',
      timestamp: new Date().toISOString(),
      message: `🎉 Verified ${verifiedProducts.length} products available on CJ Dropshipping`,
      details: { 
        verified: verifiedProducts.length,
        unavailable: failedProducts.length 
      }
    });

    return {
      ...data,
      products: verifiedProducts,
      unavailableProducts: failedProducts,
    };
  }

  /**
   * Check CJ Dropshipping availability
   */
  private async checkCJAvailability(product: any): Promise<any> {
    const productName = product.name || product.title || '';
    const searchTerm = productName.substring(0, 50);
    
    try {
      // Search CJ for this product
      const cjProducts = await cjDropshippingService.searchProducts(searchTerm, { pageSize: 5 });
      
      if (cjProducts.length > 0) {
        // Find the best match
        const bestMatch = cjProducts.find(cj => 
          productName.toLowerCase().includes(cj.productName.toLowerCase().substring(0, 20)) ||
          cj.productName.toLowerCase().includes(productName.toLowerCase().substring(0, 20))
        ) || cjProducts[0]; // Fallback to first result

        const variant = bestMatch.variants?.[0];
        
        if (variant) {
          // Calculate shipping cost for US
          const shippingOptions = await cjDropshippingService.calculateShipping(
            [{ variantId: variant.vid, quantity: 1 }],
            'US'
          );
          const shipping = shippingOptions[0]?.shippingCost || 5;

          return {
            available: true,
            productId: bestMatch.pid,
            name: bestMatch.productName,
            image: bestMatch.productImage,
            price: variant.variationPrice,
            shippingCost: shipping,
            warehouse: 'CJ Dropshipping',
            variants: bestMatch.variants?.map(v => ({
              vid: v.vid,
              name: v.propertyValue || 'Default',
              price: v.variationPrice,
              sku: v.variationSku,
            })) || [{ name: 'Default', inventory: 999 }],
            cjUrl: bestMatch.productUrl,
          };
        }
      }
      
      return { available: false };
      
    } catch (error) {
      console.error('CJ check error:', error);
      return { available: false };
    }
  }

  /**
   * Complete research and save results
   */
  private async completeResearch(run: ResearchRun, finalData: any) {
    run.status = 'completed';
    run.endTime = new Date().toISOString();
    run.productsFound = finalData.products.length + (finalData.unavailableProducts?.length || 0);
    run.productsVerified = finalData.products.length;
    run.results = finalData.products;

    // Save to database
    try {
      await supabase.from('research_runs').insert({
        id: run.id,
        cache_key: run.cacheKey,
        cache_hit: run.cacheHit || false,
        user_id: run.userId,
        store_id: run.storeId,
        category: run.context.onboardingData.category,
        subcategory: run.context.onboardingData.subcategory,
        product_count: run.context.onboardingData.productCount,
        price_range: run.context.onboardingData.priceRange,
        target_audience: run.context.onboardingData.targetAudience,
        brand_name: run.context.onboardingData.brandName,
        status: 'completed',
        activities: run.activities,
        products: run.results,
        total_cost: run.totalCost,
        products_found: run.productsFound,
        products_verified: run.productsVerified,
        start_time: run.startTime,
        end_time: run.endTime,
        duration_seconds: Math.round((new Date(run.endTime!).getTime() - new Date(run.startTime).getTime()) / 1000),
        actors_used: Object.values(SHOPPDROPP_ACTORS),
      });
    } catch (err) {
      console.error('Failed to save research run:', err);
    }
    
    // Cache results for future use
    await this.cacheResults(run, finalData);

    this.emitActivity(run.id, {
      type: 'success',
      timestamp: new Date().toISOString(),
      message: `✨ Research Complete! Ready to import ${finalData.products.length} products to Shopify.`,
      details: {
        totalFound: run.productsFound,
        verified: run.productsVerified,
        estimatedCost: run.totalCost.toFixed(2),
      }
    });

    this.emit('complete', run);
  }

  /**
   * Mark a run as failed
   */
  private failRun(runId: string, errorMessage: string) {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.status = 'failed';
      run.endTime = new Date().toISOString();
      
      this.emitActivity(runId, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `❌ Research failed: ${errorMessage}`,
      });

      this.emit('error', { runId, error: errorMessage });
    }
  }

  /**
   * Emit activity event
   */
  private emitActivity(runId: string, activity: StreamingActivity) {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.activities.push(activity);
      this.emit('activity', { runId, activity });
    }
  }

  /**
   * Generate cache key from research criteria
   * Normalizes the criteria for consistent key generation
   */
  private generateCacheKey(onboarding: ResearchContext['onboardingData']): string {
    const { category, subcategory, productCount, priceRange, targetAudience } = onboarding;
    
    // Normalize and create consistent key
    const normalized = [
      category.trim().toLowerCase(),
      subcategory.trim().toLowerCase(),
      productCount.toString(),
      Math.round(priceRange.min / 5) * 5, // Round to nearest 5
      Math.round(priceRange.max / 5) * 5,
      (targetAudience || '').trim().toLowerCase(),
    ].join('|');
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Check if valid cached research exists
   */
  private async checkCache(cacheKey: string, run: ResearchRun): Promise<any> {
    try {
      const { data: cache, error } = await supabase
        .from('research_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !cache) {
        return null;
      }

      return cache;
    } catch (err) {
      console.error('Cache check error:', err);
      return null;
    }
  }

  /**
   * Cache research results for future use
   */
  private async cacheResults(run: ResearchRun, data: any): Promise<void> {
    if (!run.cacheKey || run.cacheHit) return;

    try {
      const { category, subcategory, productCount, priceRange, targetAudience } = run.context.onboardingData;
      
      await supabase.from('research_cache').upsert({
        cache_key: run.cacheKey,
        category,
        subcategory,
        product_count: data.products.length,
        price_range: priceRange,
        target_audience: targetAudience,
        products: data.products,
        products_count: data.products.length,
        actors_used: JSON.stringify(SHOPPDROPP_ACTORS),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        created_at: new Date().toISOString(),
        times_used: 0,
      });

      console.log(`Cached research results for key: ${run.cacheKey}`);
    } catch (err) {
      console.error('Failed to cache results:', err);
    }
  }

  // Input Generators

  private generateTikTokInput(context: ResearchContext): any {
    const { category, subcategory } = context.onboardingData;
    
    // Generate relevant hashtags
    const hashtags = this.generateHashtags(category, subcategory);
    
    return {
      hashtags,
      resultsPerPage: 50,
      maxResults: 100,
      shouldDownloadVideos: false,
      videoLimit: 0,
    };
  }

  private generateGoogleTrendsInput(context: ResearchContext, data: any): any {
    // Extract specific product keywords from TikTok results
    const productKeywords = this.extractProductKeywordsFromTikTok(data.products);
    
    // Add "buy" intent to each keyword
    const searchTerms = productKeywords.map(kw => `buy ${kw}`).slice(0, 10);
    
    // Activity will be emitted by the runPhase method
    
    return {
      searchTerms,
      timeRange: '3mo',
      geo: 'US',
    };
  }

  private extractProductKeywordsFromTikTok(products: any[]): string[] {
    if (!products || products.length === 0) return [];
    
    const keywords: string[] = [];
    
    products.forEach(product => {
      // Extract clean product name from title
      const title = product.title || product.name || '';
      
      // Clean up: remove emojis, extra words, keep core product name
      let cleanName = title
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis
        .replace(/tiktok.*buy/gi, '') // Remove "TikTok made me buy"
        .replace(/link in bio/gi, '')
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/part\s*\d+/gi, '') // Remove "Part 1"
        .trim();
      
      // Extract key product terms (2-4 words max)
      const words = cleanName.split(/\s+/).filter((w: string) => w.length > 2);
      
      if (words.length >= 2) {
        // Try to get product name (first 2-4 significant words)
        const productName = words.slice(0, 4).join(' ');
        if (productName.length > 5) {
          keywords.push(productName);
        }
      }
      
      // Also check hashtags for product identifiers
      if (product.hashtags && Array.isArray(product.hashtags)) {
        product.hashtags.forEach((tag: string) => {
          // Remove "tiktok", "fyp", "viral" etc, keep product tags
          if (!['tiktok', 'fyp', 'viral', 'foryou', 'foryoupage', 'trending'].includes(tag.toLowerCase())) {
            const cleanTag = tag.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
            if (cleanTag.length > 3 && !keywords.includes(cleanTag)) {
              keywords.push(cleanTag);
            }
          }
        });
      }
    });
    
    // Remove duplicates and return unique keywords
    return [...new Set(keywords)].slice(0, 15);
  }

  private processGoogleTrendsResults(results: any[], data: any): any {
    const trendsData = results.map(trend => ({
      keyword: trend.keyword,
      interest: trend.interest || trend.value || 0,
      trend: trend.trend || 'stable',
      peakDate: trend.peakDate,
    }));

    // Match trends back to specific products
    const existingProducts = data.products || [];
    const scoredProducts = existingProducts.map((p: any) => {
      const productName = (p.title || p.name || '').toLowerCase();
      
      // Find matching trend data
      const matchingTrend = trendsData.find((t: any) => 
        productName.includes(t.keyword.toLowerCase().replace('buy ', '')) ||
        t.keyword.toLowerCase().includes(productName.split(' ').slice(0, 2).join(' '))
      );
      
      if (matchingTrend) {
        return {
          ...p,
          searchDemand: matchingTrend.interest > 50 ? 'high' : 
                       matchingTrend.interest > 25 ? 'medium' : 'low',
          trendsInterest: matchingTrend.interest,
          trendDirection: matchingTrend.trend,
        };
      }
      
      return { ...p, searchDemand: 'unknown' };
    });

    // Count products with high search demand
    const highDemandCount = scoredProducts.filter((p: any) => p.searchDemand === 'high').length;
    
    // Activity will be emitted by the runPhase method

    return {
      ...data,
      products: scoredProducts,
      trendsData,
      highDemandCount,
    };
  }

  private generateRedditInput(context: ResearchContext, data: any): any {
    const { category, subcategory } = context.onboardingData;
    
    // Find relevant subreddits
    const subreddits = this.getRelevantSubreddits(category, subcategory);
    
    return {
      subreddits,
      sort: 'hot',
      time: 'month',
      maxPosts: 50,
      maxComments: 10,
      includeComments: true,
    };
  }

  private generateAmazonInput(context: ResearchContext, data: any): any {
    const { category, subcategory, priceRange } = context.onboardingData;
    
    // Generate search queries from TikTok/Reddit findings
    const searchTerms = data.keywords || [subcategory, category];
    
    return {
      searchTerms: searchTerms.slice(0, 5),
      maxResults: 50,
      productsFound: 0,
      reviewsCount: 1,
      proxy: {
        useApifyProxy: true,
      },
    };
  }

  private generateYouTubeInput(context: ResearchContext, data: any): any {
    const { subcategory } = context.onboardingData;
    
    const searchKeywords = [
      `${subcategory} review`,
      `${subcategory} unboxing`,
      `best ${subcategory}`,
      `${subcategory} amazon`,
    ];
    
    return {
      searchKeywords,
      maxResults: 30,
      includeComments: false,
    };
  }

  private generateInstagramInput(context: ResearchContext, data: any): any {
    const { category, subcategory } = context.onboardingData;
    
    const hashtags = this.generateHashtags(category, subcategory);
    
    return {
      hashtags: hashtags.slice(0, 5),
      resultsLimit: 50,
    };
  }

  // Data Processors

  private processTikTokResults(results: any[], data: any): any {
    const products = results.map(video => ({
      id: video.id || video.videoId,
      source: 'tiktok',
      title: video.title || video.text?.substring(0, 100) || 'TikTok Product',
      description: video.text || '',
      views: video.playCount || video.views || 0,
      likes: video.diggCount || video.likes || 0,
      hashtags: video.hashtags || [],
      author: video.authorMeta?.name || video.author || '',
      url: video.webVideoUrl || video.url || '',
      thumbnail: video.coverThumbUrl || video.thumbnail || '',
    }));

    return {
      ...data,
      products,
      keywords: this.extractKeywordsFromTikTok(products),
    };
  }

  private processRedditResults(results: any[], data: any): any {
    const redditProducts = results.map(post => ({
      id: post.id,
      source: 'reddit',
      title: post.title,
      description: post.body?.substring(0, 500) || '',
      subreddit: post.subreddit,
      upvotes: post.upvotes || post.score || 0,
      comments: post.numComments || 0,
      url: post.url || `https://reddit.com${post.permalink}`,
    }));

    // Score existing products based on Reddit mentions
    const existingProducts = data.products || [];
    const scoredProducts = existingProducts.map((p: any) => {
      const mentions = redditProducts.filter((r: any) => 
        p.title.toLowerCase().includes(r.title.toLowerCase().substring(0, 20)) ||
        r.description.toLowerCase().includes(p.title.toLowerCase().substring(0, 20))
      ).length;
      
      return { ...p, redditValidation: mentions };
    });

    return {
      ...data,
      products: scoredProducts,
      redditPosts: redditProducts,
    };
  }

  private processAmazonResults(results: any[], data: any): any {
    const amazonProducts = results.map(product => ({
      id: product.asin || product.id,
      source: 'amazon',
      name: product.name || product.title,
      price: product.price?.current || product.price || 0,
      rating: product.rating?.stars || product.rating || 0,
      reviews: product.rating?.reviewsCount || product.reviewsCount || 0,
      image: product.image || product.thumbnailImage || '',
      url: product.url || `https://amazon.com/dp/${product.asin}`,
      bestsellerRank: product.bestSellerRank || null,
    }));

    // Merge with existing products, favoring ones with Amazon data
    const existingProducts = data.products || [];
    const mergedProducts = existingProducts.map((p: any) => {
      const amazonMatch = amazonProducts.find((a: any) => 
        p.title.toLowerCase().includes(a.name.toLowerCase().substring(0, 30)) ||
        a.name.toLowerCase().includes(p.title.toLowerCase().substring(0, 30))
      );
      
      return amazonMatch ? { 
        ...p, 
        amazon: amazonMatch,
        marketCompetition: this.calculateCompetition(amazonMatch)
      } : p;
    });

    // Add unique Amazon products
    mergedProducts.push(...amazonProducts.slice(0, 20));

    return {
      ...data,
      products: mergedProducts,
    };
  }

  private processYouTubeResults(results: any[], data: any): any {
    const youtubeProducts = results.map(video => ({
      id: video.id || video.videoId,
      source: 'youtube',
      title: video.title,
      description: video.description?.substring(0, 200) || '',
      views: video.viewCount || video.views || 0,
      channel: video.channelTitle || video.channel,
      publishedAt: video.publishedAt || video.date,
    }));

    return {
      ...data,
      youtubeVideos: youtubeProducts,
    };
  }

  private processInstagramResults(results: any[], data: any): any {
    const instagramProducts = results.map(post => ({
      id: post.id,
      source: 'instagram',
      caption: post.caption || '',
      likes: post.likes || post.likesCount || 0,
      comments: post.comments || post.commentsCount || 0,
      hashtags: post.hashtags || [],
      user: post.username || post.user?.username,
      image: post.imageUrl || post.displayUrl || '',
    }));

    return {
      ...data,
      instagramPosts: instagramProducts,
    };
  }

  // Helper Methods

  private generateHashtags(category: string, subcategory: string): string[] {
    const normalizedSubcat = subcategory.toLowerCase().replace(/\s+/g, '');
    const normalizedCat = category.toLowerCase().replace(/\s+/g, '');
    
    // Industry-specific TikTokMadeMeBuyIt hashtags
    const categorizedTMM = [
      // General
      'tiktokmademebuyit',
      
      // Category-specific #TikTokMadeMeBuyIt tags
      `tiktokmademebuy${normalizedSubcat}`,    // e.g., #TikTokMadeMeBuyKitchen
      `tiktokmademebuy${normalizedCat}`,         // e.g., #TikTokMadeMeBuyHome      
      `tiktokmademebuyit${normalizedCat}`,      // e.g., #TikTokMadeMeBuyItHome
      `tmmb${normalizedSubcat}`,                  // abbreviation style
      
      // Niches
      `${normalizedSubcat}tmmb`,                  // e.g., #KitchenTMMIB
      `${normalizedSubcat}trend`,               // e.g., #KitchenTrend
      `${normalizedCat}trends`,                 // e.g., #HomeTrends
      `${normalizedSubcat}finds`,               // e.g., #KitchenFinds
      `${normalizedCat}finds`,                  // e.g., #HomeFinds
    ];
    
    // Industry-specific bonus tags
    const industryTags: Record<string, string[]> = {
      'Home & Garden': ['homegadgets', 'homehacks', 'cleankitchen', 'organization', 'homeautomation'],
      'Fashion': ['OOTD', 'fashionhacks', 'styleinspo', 'outfitideas', 'clothinghaul'],
      'Beauty': ['skincareroutine', 'makeuptutorial', 'beautyhacks', 'glowup', 'selfcare'],
      'Electronics': ['techtok', 'gadgets', 'techunboxing', 'smartgadgets', 'amazonmusthaves'],
      'Pet': ['pettok', 'dogsoftiktok', 'catsoftiktok', 'petgadgets', 'animaltok'],
      'Kitchen': ['foodtok', 'cookinghacks', 'kitchentools', 'recipes', 'easyrecipes'],
      'Sports': ['fitnesstok', 'workoutroutine', 'gymtok', 'runningtok', 'fitnessjourney'],
      'Toys': ['toytok', 'unboxing', 'satisfying', 'fyp', 'viral'],
      'Books': ['booktok', 'bookrecommendations', 'reading', 'bookstagram', 'bookworm'],
      'Stationery': ['studytok', 'stationeryhaul', 'bulletjournal', 'studymotivation'],
    };
    
    const bonusTags = industryTags[category] || ['viral', 'musthave', 'amazonfinds'];
    
    const allHashtags = [
      normalizedSubcat,
      `${normalizedSubcat}tok`,
      normalizedCat,
      ...categorizedTMM,
      ...bonusTags,
      'tiktokfinds',
      'musthave2025',
    ];
    
    return [...new Set(allHashtags)];
  }

  private getRelevantSubreddits(category: string, subcategory: string): string[] {
    const subredditMap: Record<string, string[]> = {
      'Home & Garden': ['homedecor', 'DIY', 'homeimprovement', 'BuyItForLife', 'ThriftStoreHauls'],
      'Fashion': ['fashion', 'streetwear', 'ThriftStoreHauls', 'femalefashionadvice', 'malefashionadvice'],
      'Electronics': ['gadgets', 'technology', 'BuyItForLife', 'deals'],
      'Beauty': ['SkincareAddiction', 'MakeupAddiction', 'beauty', 'AsianBeauty'],
      'Toys': ['toys', 'lego', 'games'],
      'Sports': ['sports', 'Fitness', 'running', 'hiking'],
      'Pet': ['dogs', 'cats', 'pets', 'reactivedogs', 'Pets'],
      'Kitchen': ['Cooking', 'KitchenConfidential', 'BuyItForLife'],
      'stationery': ['DigitalStationery', 'pens', 'notebooks'],
      'books': ['books', 'bookclub', 'suggestmeabook'],
    };

    return subredditMap[category] || ['BuyItForLife', 'ThriftStoreHauls', 'deals', 'ProductReviews'];
  }

  private extractKeywordsFromTikTok(products: any[]): string[] {
    // Extract common hashtags and keywords from TikTok data
    const allText = products.map(p => p.description + ' ' + p.hashtags?.join(' ') || '').join(' ');
    const words = allText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const wordFreq: Record<string, number> = {};
    
    words.forEach(w => {
      if (!['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any', 'say', 'man', 'try', 'ask', 'end', 'why', 'let', 'put', 'say', 'she', 'try', 'way', 'own', 'say', 'too'].includes(w)) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private calculateCompetition(amazonProduct: any): string {
    const reviews = amazonProduct.reviews || 0;
    if (reviews < 100) return 'low';
    if (reviews < 1000) return 'medium';
    return 'high';
  }

  private estimatePhaseCost(phaseId: string): number {
    const estimates: Record<string, number> = {
      social_discovery: 0.05,
      reddit_validation: 0.08,
      market_analysis: 0.10,
      youtube_research: 0.06,
      instagram_research: 0.05,
    };
    return estimates[phaseId] || 0.05;
  }
}

export const researchPipeline = new ResearchPipeline();

// WebSocket streaming support
if (typeof process !== 'undefined') {
  // Server-side: setup WebSocket broadcasting
  researchPipeline.on('activity', ({ runId, activity }) => {
    // Broadcast to connected WebSocket clients
    // This will be handled by the WebSocket server
  });
}
