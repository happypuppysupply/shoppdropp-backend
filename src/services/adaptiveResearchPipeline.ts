import { apifyService } from './apifyService';
import { cjDropshippingService } from './cjDropshippingService';
import { supabase } from '../db/supabase';
import SearchCandidateGenerator, { SearchCandidate } from './searchCandidateGenerator';
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

interface StreamingActivity {
  type: 'info' | 'success' | 'warning' | 'error' | 'actor_start' | 'actor_complete' | 'product_found' | 'product_batch' | 'search_exhausted';
  timestamp: string;
  message: string;
  details?: any;
}

interface ResearchRun {
  id: string;
  userId: string;
  storeId: string;
  status: 'running' | 'completed' | 'failed' | 'exhausted';
  context: ResearchContext;
  activities: StreamingActivity[];
  results: Product[];
  startTime: string;
  endTime?: string;
  totalCost: number;
  productsFound: number;
  productsVerified: number;
  searchStats: SearchStats;
  config: ResearchConfig;
}

interface ResearchConfig {
  targetProducts: number;
  maxSearchCandidates: number;
  maxActorRuns: number;
  maxIterations: number;
  maxRetriesPerSearch: number;
  batchSize: number;
}

interface SearchStats {
  tiktokSearches: number;
  tiktokShopSearches: number;
  googleTrendsSearches: number;
  redditSearches: number;
  amazonSearches: number;
  totalSearches: number;
  productsFromTikTok: number;
  productsFromTikTokShop: number;
  productsFromGoogleTrends: number;
  productsFromReddit: number;
  productsFromAmazon: number;
  duplicateCount: number;
  rejectedCount: number;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  source: string;
  sourceUrl?: string;
  category: string;
  searchTerm: string;
  imageUrl?: string;
  videoUrl?: string;
  tiktokVideoUrl?: string;
  price?: number;
  originalPrice?: number;
  rating?: number;
  reviewCount?: number;
  trendSignal?: string;
  relevanceScore: number;
  timestamp: string;
  raw: any;
  cjData?: {
    available: boolean;
    productId?: string;
    price?: number;
    warehouse?: string;
  };
  tiktokShopData?: {
    shopName?: string;
    soldCount?: number;
    gmv?: number;
    commissionRate?: number;
    productId?: string;
  };
}

// Apify Actor IDs
const SHOPPDROPP_ACTORS = {
  tiktok: 'GdWCkxBtKWOsKjdch',
  reddit: 'oAuCIx3ItNrs2okjQ',
  google_trends: 'DyNQEYDj9awfGQf9A',
  amazon: 'BG3WDrGdteHgZgbPK',
  tiktok_shop: 'C97SUiMlbZ75x6u22',  // unseenuser/TikTok-Shop-Scraper - products, reviews, GMV
  tiktok_shop_creators: '7WXZyKLZvyOPbf5Ih',  // lemur/tiktok-shop-creators - creator performance
};

export class AdaptiveResearchPipeline extends EventEmitter {
  private activeRuns: Map<string, ResearchRun> = new Map();
  private candidateGenerator: SearchCandidateGenerator;

  constructor() {
    super();
    this.candidateGenerator = new SearchCandidateGenerator({
      maxSearchCandidates: 50
    });
  }

  /**
   * Start adaptive research with iterative multi-search strategy
   */
  async startResearch(context: ResearchContext, force: boolean = false): Promise<string> {
    const runId = uuidv4();
    const { onboardingData } = context;
    
    const config: ResearchConfig = {
      targetProducts: onboardingData.productCount || 20,
      maxSearchCandidates: 50,
      maxActorRuns: 100,
      maxIterations: 20,
      maxRetriesPerSearch: 2,
      batchSize: 5
    };

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
      searchStats: {
        tiktokSearches: 0,
        tiktokShopSearches: 0,
        googleTrendsSearches: 0,
        redditSearches: 0,
        amazonSearches: 0,
        totalSearches: 0,
        productsFromTikTok: 0,
        productsFromTikTokShop: 0,
        productsFromGoogleTrends: 0,
        productsFromReddit: 0,
        productsFromAmazon: 0,
        duplicateCount: 0,
        rejectedCount: 0
      },
      config
    };

    this.activeRuns.set(runId, run);
    
    this.emitActivity(run.id, {
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🔬 Starting adaptive research for ${onboardingData.brandName}`,
      details: { 
        targetProducts: config.targetProducts,
        category: onboardingData.category,
        subcategory: onboardingData.subcategory,
      }
    });

    // Validate Apify token
    if (!process.env.APIFY_TOKEN) {
      this.emitActivity(run.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: '❌ Research cannot start: Apify API token is not configured',
      });
      this.failRun(runId, 'Apify API token not configured');
      return runId;
    }

    // Start research in background
    this.executeAdaptivePipeline(run).catch(err => {
      console.error(`Research run ${runId} failed:`, err);
      this.failRun(runId, err.message);
    });

    return runId;
  }

  /**
   * Main adaptive pipeline with iterative multi-search
   */
  private async executeAdaptivePipeline(run: ResearchRun): Promise<void> {
    const { context, config } = run;
    const { category: rawCategory, subcategory: rawSubcategory } = context.onboardingData;
    
    // Clean category/subcategory to remove emojis, descriptions, special chars
    const category = this.cleanKeyword(rawCategory);
    const subcategory = rawSubcategory ? this.cleanKeyword(rawSubcategory) : category;
    
    // Generate all search candidates
    this.emitActivity(run.id, {
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🎯 Generating search candidates for: ${category}`,
      details: { category, subcategory }
    });

    const candidates = this.candidateGenerator.generateCandidates(category, subcategory);
    
    this.emitActivity(run.id, {
      type: 'success',
      timestamp: new Date().toISOString(),
      message: `✅ Generated ${candidates.tiktok.length} TikTok, ${candidates.googleTrends.length} Trends, ${candidates.reddit.length} Reddit, ${candidates.amazon.length} Amazon candidates`,
    });

    // Product collection
    const products: Product[] = [];
    const seenUrls = new Set<string>();
    const seenNames = new Set<string>();
    
    // Track actor runs
    let totalActorRuns = 0;
    let iteration = 0;

    // Continue searching until target reached or budget exhausted
    // Note: hasMoreCandidates is not a stopping condition because TikTok Shop
    // generates fresh keywords each iteration via generateTikTokShopKeywords
    while (
      products.length < config.targetProducts &&
      totalActorRuns < config.maxActorRuns &&
      iteration < config.maxIterations
    ) {
      iteration++;
      
      this.emitActivity(run.id, {
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `🔄 Iteration ${iteration}: ${products.length}/${config.targetProducts} products found (${totalActorRuns} searches)`,
      });

      // Run multiple searches per actor in this iteration
      const batchSize = Math.min(config.batchSize, config.targetProducts - products.length);
      
      // TIKTOK SHOP - PRIMARY SOURCE (search by keyword)
      if (products.length < config.targetProducts) {
        const tiktokShopKeywords = this.generateTikTokShopKeywords(category, subcategory, iteration);
        for (const keyword of tiktokShopKeywords.slice(0, batchSize)) {
          if (totalActorRuns >= config.maxActorRuns) break;
          const newProducts = await this.searchTikTokShop(run, keyword, category);
          this.addProducts(products, newProducts, seenUrls, seenNames, run);
          totalActorRuns++;
          run.searchStats.tiktokShopSearches++;
          
          if (products.length >= config.targetProducts) break;
        }
      }

      // TikTok hashtag searches (for trending signal)
      if (products.length < config.targetProducts && this.candidateGenerator.hasMoreCandidates(candidates.tiktok)) {
        const tiktokBatch = this.candidateGenerator.getNextCandidates(candidates.tiktok, batchSize);
        for (const candidate of tiktokBatch) {
          if (totalActorRuns >= config.maxActorRuns) break;
          const newProducts = await this.searchTikTok(run, candidate);
          this.addProducts(products, newProducts, seenUrls, seenNames, run);
          totalActorRuns++;
          run.searchStats.tiktokSearches++;
          
          if (products.length >= config.targetProducts) break;
        }
      }

      // Google Trends searches
      if (products.length < config.targetProducts && this.candidateGenerator.hasMoreCandidates(candidates.googleTrends)) {
        const trendsBatch = this.candidateGenerator.getNextCandidates(candidates.googleTrends, batchSize);
        for (const candidate of trendsBatch) {
          if (totalActorRuns >= config.maxActorRuns) break;
          const newProducts = await this.searchGoogleTrends(run, candidate);
          this.addProducts(products, newProducts, seenUrls, seenNames, run);
          totalActorRuns++;
          run.searchStats.googleTrendsSearches++;
          
          if (products.length >= config.targetProducts) break;
        }
      }

      // Reddit searches
      if (products.length < config.targetProducts && this.candidateGenerator.hasMoreCandidates(candidates.reddit)) {
        const redditBatch = this.candidateGenerator.getNextCandidates(candidates.reddit, batchSize);
        for (const candidate of redditBatch) {
          if (totalActorRuns >= config.maxActorRuns) break;
          const newProducts = await this.searchReddit(run, candidate, context.onboardingData);
          this.addProducts(products, newProducts, seenUrls, seenNames, run);
          totalActorRuns++;
          run.searchStats.redditSearches++;
          
          if (products.length >= config.targetProducts) break;
        }
      }

      // Amazon searches
      if (products.length < config.targetProducts && this.candidateGenerator.hasMoreCandidates(candidates.amazon)) {
        const amazonBatch = this.candidateGenerator.getNextCandidates(candidates.amazon, batchSize);
        for (const candidate of amazonBatch) {
          if (totalActorRuns >= config.maxActorRuns) break;
          const newProducts = await this.searchAmazon(run, candidate);
          this.addProducts(products, newProducts, seenUrls, seenNames, run);
          totalActorRuns++;
          run.searchStats.amazonSearches++;
          
          if (products.length >= config.targetProducts) break;
        }
      }

      // Progress update
      this.emitActivity(run.id, {
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `📊 Progress: ${products.length}/${config.targetProducts} products (${run.searchStats.duplicateCount} duplicates, ${run.searchStats.rejectedCount} rejected)`,
        details: {
          productsFound: products.length,
          target: config.targetProducts,
          searchesCompleted: totalActorRuns,
          bySource: {
            tiktok: run.searchStats.productsFromTikTok,
            googleTrends: run.searchStats.productsFromGoogleTrends,
            reddit: run.searchStats.productsFromReddit,
            amazon: run.searchStats.productsFromAmazon
          }
        }
      });

      // If no new products found this iteration, generate more candidates
      if (!this.hasMoreCandidates(candidates) && products.length < config.targetProducts) {
        this.emitActivity(run.id, {
          type: 'warning',
          timestamp: new Date().toISOString(),
          message: '⚠️ Search candidates exhausted, generating more...',
        });
        
        // Expand search with broader terms
        this.expandSearchCandidates(candidates, category, subcategory);
      }
    }

    // Update final stats
    run.searchStats.totalSearches = totalActorRuns;
    
    // Complete research
    await this.completeResearch(run, products);
  }

  /**
   * Check if any actor has more candidates
   */
  private hasMoreCandidates(candidates: {
    tiktok: SearchCandidate[];
    googleTrends: SearchCandidate[];
    reddit: SearchCandidate[];
    amazon: SearchCandidate[];
  }): boolean {
    return this.candidateGenerator.hasMoreCandidates(candidates.tiktok) ||
           this.candidateGenerator.hasMoreCandidates(candidates.googleTrends) ||
           this.candidateGenerator.hasMoreCandidates(candidates.reddit) ||
           this.candidateGenerator.hasMoreCandidates(candidates.amazon);
  }

  /**
   * Add products to collection with deduplication
   */
  private addProducts(
    products: Product[], 
    newProducts: Product[], 
    seenUrls: Set<string>, 
    seenNames: Set<string>,
    run: ResearchRun
  ): void {
    for (const product of newProducts) {
      // Deduplicate by URL or normalized name
      const urlKey = product.sourceUrl ? this.normalizeUrl(product.sourceUrl) : null;
      const nameKey = this.normalizeName(product.name);
      
      if (urlKey && seenUrls.has(urlKey)) {
        run.searchStats.duplicateCount++;
        continue;
      }
      
      if (seenNames.has(nameKey)) {
        run.searchStats.duplicateCount++;
        continue;
      }
      
      // Add to collection
      products.push(product);
      if (urlKey) seenUrls.add(urlKey);
      seenNames.add(nameKey);
      
      // Update source stats
      switch (product.source) {
        case 'tiktok': run.searchStats.productsFromTikTok++; break;
        case 'tiktok_shop': run.searchStats.productsFromTikTokShop++; break;
        case 'google_trends': run.searchStats.productsFromGoogleTrends++; break;
        case 'reddit': run.searchStats.productsFromReddit++; break;
        case 'amazon': run.searchStats.productsFromAmazon++; break;
      }
      
      run.productsFound++;
      
      // Emit product batch for UI rendering (every 3 products or on first)
      if (products.length <= 3 || products.length % 3 === 0) {
        this.emitActivity(run.id, {
          type: 'product_batch',
          timestamp: new Date().toISOString(),
          message: `🛍️ Found ${products.length} products so far`,
          details: {
            products: products.slice(-6).map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              imageUrl: p.imageUrl,
              videoUrl: p.videoUrl || p.tiktokVideoUrl,
              sourceUrl: p.sourceUrl,
              price: p.price,
              originalPrice: p.originalPrice,
              rating: p.rating,
              reviewCount: p.reviewCount,
              source: p.source,
              cjData: p.cjData,
              tiktokShopData: p.tiktokShopData,
            })),
            totalProducts: products.length
          }
        });
      }
      
      this.emitActivity(run.id, {
        type: 'product_found',
        timestamp: new Date().toISOString(),
        message: `🛍️ Found: ${product.name.substring(0, 50)}...`,
        details: {
          source: product.source,
          searchTerm: product.searchTerm,
          totalProducts: products.length
        }
      });
    }
  }

  /**
   * Search TikTok with a specific hashtag
   */
  private async searchTikTok(run: ResearchRun, candidate: SearchCandidate): Promise<Product[]> {
    const products: Product[] = [];
    
    this.emitActivity(run.id, {
      type: 'actor_start',
      timestamp: new Date().toISOString(),
      message: `[TikTok] Searching: #${candidate.term}`,
      details: { hashtag: candidate.term }
    });

    try {
      const input = {
        hashtags: [candidate.term],
        resultsPerPage: 30,
        maxResults: 50,
        shouldDownloadVideos: false,
        videoLimit: 0,
      };

      const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.tiktok, input, {
        waitForFinish: true,
        waitSecs: 120,
      });

      const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 100 });
      
      this.emitActivity(run.id, {
        type: 'actor_complete',
        timestamp: new Date().toISOString(),
        message: `[TikTok] #${candidate.term}: ${results.length} results`,
        details: { hashtag: candidate.term, count: results.length }
      });

      // Extract products from TikTok videos
      for (const video of results) {
        if (video.title || video.desc) {
          const productName = this.extractProductNameFromText(video.title || video.desc || '');
          if (productName && productName.length > 3) {
            products.push({
              id: uuidv4(),
              name: productName,
              source: 'tiktok',
              sourceUrl: video.webVideoUrl || video.url,
              category: candidate.category,
              searchTerm: candidate.term,
              imageUrl: video.videoCover,
              relevanceScore: video.heartCount ? Math.min(video.heartCount / 1000, 10) : 5,
              timestamp: new Date().toISOString(),
              raw: video
            });
          }
        }
      }
    } catch (error: any) {
      this.emitActivity(run.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `[TikTok] #${candidate.term} failed: ${error.message}`,
      });
    }

    return products;
  }

  /**
   * Generate TikTok Shop search keywords from category
   * Uses specific product terms rather than generic categories for better results
   */
  // Track used TikTok Shop keywords to avoid infinite loops
  private usedTikTokShopKeywords: Set<string> = new Set();

  private generateTikTokShopKeywords(category: string, subcategory: string, iteration: number): string[] {
    // Map categories to specific product search terms that work well on TikTok Shop
    // Use terms that are known to work on TikTok Shop US
    const categoryProductMap: Record<string, string[]> = {
      'pet': ['pet', 'dog', 'cat', 'puppy', 'kitten'],
      'dog': ['dog', 'puppy', 'pet'],
      'cat': ['cat', 'kitten', 'pet'],
      'home': ['home', 'decor', 'kitchen', 'bathroom', 'bedroom'],
      'kitchen': ['kitchen', 'cooking', 'food', 'dining'],
      'beauty': ['beauty', 'makeup', 'skincare', 'cosmetics', 'hair'],
      'fashion': ['fashion', 'clothing', 'accessories', 'jewelry', 'shoes'],
      'electronics': ['electronics', 'phone', 'tech', 'gadgets', 'charger'],
      'sports': ['sports', 'fitness', 'gym', 'workout', 'yoga'],
      'toys': ['toys', 'kids', 'children', 'games', 'educational'],

    };

    // Find matching category - check if category contains any map key
    const catLower = category.toLowerCase();
    const subLower = subcategory.toLowerCase();
    
    let baseTerms: string[] | null = null;
    
    // Try exact match first
    if (categoryProductMap[catLower]) {
      baseTerms = categoryProductMap[catLower];
    } else if (categoryProductMap[subLower]) {
      baseTerms = categoryProductMap[subLower];
    } else {
      // Try partial match
      for (const [key, terms] of Object.entries(categoryProductMap)) {
        if (catLower.includes(key) || subLower.includes(key)) {
          baseTerms = terms;

          break;
        }
      }
    }
    
    // Fallback to category-based terms
    if (!baseTerms) {
      baseTerms = [category, subcategory].filter(Boolean);
    }

    // Generate keywords based on iteration, avoiding used ones
    const keywords: string[] = [];
    const variations = [
      // Simple broad terms that work on TikTok Shop
      ...baseTerms,
      // Common TikTok Shop categories
      `${baseTerms[0]} accessories`,
      `${baseTerms[0]} products`,
      `${baseTerms[0]} finds`,
      // Add iteration-specific variations
      iteration === 1 ? `${baseTerms[0]}` : null,
      iteration === 2 ? `${baseTerms[0]} must have` : null,
      iteration >= 3 ? `viral ${baseTerms[0]}` : null,
      iteration >= 3 ? `trending ${baseTerms[0]}` : null,
      iteration >= 4 ? `${baseTerms[0]} 2026` : null,
      iteration >= 4 ? `best ${baseTerms[0]}` : null,
    ].filter(Boolean) as string[];

    // Filter out already-used keywords
    for (const kw of variations) {
      if (!this.usedTikTokShopKeywords.has(kw) && keywords.length < 4) {
        keywords.push(kw);
        this.usedTikTokShopKeywords.add(kw);
      }
    }

    // If we've exhausted all variations, clear and try broader terms
    if (keywords.length === 0) {
      this.usedTikTokShopKeywords.clear();
      keywords.push(...baseTerms.slice(0, 4));
    }

    return keywords;

  }

  /**
   * Search TikTok Shop with keyword - returns actual products with images, prices, videos
   */
  private async searchTikTokShop(run: ResearchRun, keyword: string, category: string): Promise<Product[]> {
    const products: Product[] = [];
    
    this.emitActivity(run.id, {
      type: 'actor_start',
      timestamp: new Date().toISOString(),
      message: `[TikTok Shop] Searching: "${keyword}"`,
      details: { keyword, source: 'tiktok_shop' }
    });

    try {
      const input = {
        mode: 'shop_search',
        searchKeywords: [keyword],
        region: 'US',
        maxResults: 20,
        maxReviewsPerProduct: 0,
        getRelatedVideos: false
      };

      const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.tiktok_shop, input, {
        waitForFinish: true,
        waitSecs: 180,
      });

      const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 50 });
      
      this.emitActivity(run.id, {
        type: 'actor_complete',
        timestamp: new Date().toISOString(),
        message: `[TikTok Shop] "${keyword}": ${results.length} products`,
        details: { keyword, count: results.length, source: 'tiktok_shop' }
      });

      // Extract products from TikTok Shop results
      for (const item of results) {
        if (item.title || item.productName) {
          const productName = item.title || item.productName || '';
          const description = item.description || item.productDescription || '';
          
          // Parse price
          let price: number | undefined;
          if (item.price?.min || item.price?.max) {
            price = item.price.min || item.price.max;
          } else if (typeof item.price === 'number') {
            price = item.price;
          } else if (typeof item.price === 'string') {
            price = parseFloat(item.price.replace(/[^0-9.]/g, ''));
          }
          
          // Parse original/compare price
          let originalPrice: number | undefined;
          if (item.originalPrice || item.compareAtPrice) {
            const raw = item.originalPrice || item.compareAtPrice;
            if (typeof raw === 'number') originalPrice = raw;
            else if (typeof raw === 'string') originalPrice = parseFloat(raw.replace(/[^0-9.]/g, ''));
          }
          
          // Get images
          const imageUrl = item.mainImage?.url || item.images?.[0]?.url || item.image || item.thumbnail;
          
          // Get video URL if available
          const videoUrl = item.videoUrl || item.video?.url || item.promotionVideo?.url;
          
          // Get product URL
          const sourceUrl = item.productUrl || item.url || item.link || `https://shop.tiktok.com/product/${item.productId}`;
          
          products.push({
            id: uuidv4(),
            name: productName.substring(0, 200),
            description: description.substring(0, 500),
            source: 'tiktok_shop',
            sourceUrl: sourceUrl,
            category: category,
            searchTerm: keyword,
            imageUrl: imageUrl,
            videoUrl: videoUrl,
            tiktokVideoUrl: videoUrl,
            price: price,
            originalPrice: originalPrice,
            rating: item.rating || item.ratingScore,
            reviewCount: item.reviewCount || item.reviews,
            relevanceScore: item.soldCount ? Math.min(item.soldCount / 100, 10) : 5,
            timestamp: new Date().toISOString(),
            raw: item,
            tiktokShopData: {
              shopName: item.shopName || item.seller,
              soldCount: item.soldCount || item.sales,
              gmv: item.gmv || item.grossMerchandiseValue,
              commissionRate: item.commissionRate,
              productId: item.productId || item.id,
            }
          });
        }
      }
    } catch (error: any) {
      this.emitActivity(run.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `[TikTok Shop] "${keyword}" failed: ${error.message}`,
        details: { keyword, error: error.message }
      });
    }

    return products;
  }

  /**
   * Search Google Trends with a specific keyword
   */
  private async searchGoogleTrends(run: ResearchRun, candidate: SearchCandidate): Promise<Product[]> {
    const products: Product[] = [];
    
    this.emitActivity(run.id, {
      type: 'actor_start',
      timestamp: new Date().toISOString(),
      message: `[Trends] Searching: "${candidate.term}"`,
      details: { keyword: candidate.term }
    });

    try {
      const input = {
        searchTerms: [candidate.term],
        timeRange: '3mo',
        geo: 'US',
      };

      const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.google_trends, input, {
        waitForFinish: true,
        waitSecs: 60,
      });

      const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 50 });
      
      this.emitActivity(run.id, {
        type: 'actor_complete',
        timestamp: new Date().toISOString(),
        message: `[Trends] "${candidate.term}": ${results.length} results`,
        details: { keyword: candidate.term, count: results.length }
      });

      // Trends data provides keywords, not products directly
      // Use for signal detection and keyword expansion
      for (const trend of results) {
        if (trend.keyword) {
          // Mark as potential product keyword for next iterations
          this.candidateGenerator.markUsed(candidate.term);
        }
      }
    } catch (error: any) {
      this.emitActivity(run.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `[Trends] "${candidate.term}" failed: ${error.message}`,
      });
    }

    return products;
  }

  /**
   * Search Reddit with a specific subreddit
   */
  private async searchReddit(run: ResearchRun, candidate: SearchCandidate, onboardingData: any): Promise<Product[]> {
    const products: Product[] = [];
    
    this.emitActivity(run.id, {
      type: 'actor_start',
      timestamp: new Date().toISOString(),
      message: `[Reddit] Searching r/${candidate.term}`,
      details: { subreddit: candidate.term }
    });

    try {
      // Search for product mentions
      const searchTerms = [
        onboardingData.category,
        'product',
        'recommendation',
        'best',
        'buy'
      ];

      const input = {
        subreddits: [candidate.term],
        searchQueries: searchTerms,
        sort: 'hot',
        time: 'month',
        maxPosts: 30,
        maxComments: 5,
        includeComments: true,
      };

      const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.reddit, input, {
        waitForFinish: true,
        waitSecs: 120,
      });

      const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 100 });
      
      this.emitActivity(run.id, {
        type: 'actor_complete',
        timestamp: new Date().toISOString(),
        message: `[Reddit] r/${candidate.term}: ${results.length} posts`,
        details: { subreddit: candidate.term, count: results.length }
      });

      // Extract products from posts
      for (const post of results) {
        const text = `${post.title || ''} ${post.body || ''}`;
        const productName = this.extractProductNameFromText(text);
        
        if (productName && productName.length > 5) {
          products.push({
            id: uuidv4(),
            name: productName,
            source: 'reddit',
            sourceUrl: post.url,
            category: candidate.category,
            searchTerm: `${candidate.term}: ${post.title?.substring(0, 30)}`,
            relevanceScore: post.score ? Math.min(post.score / 100, 10) : 5,
            timestamp: new Date().toISOString(),
            raw: post
          });
        }
      }
    } catch (error: any) {
      this.emitActivity(run.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `[Reddit] r/${candidate.term} failed: ${error.message}`,
      });
    }

    return products;
  }

  /**
   * Search Amazon with a specific URL
   */
  private async searchAmazon(run: ResearchRun, candidate: SearchCandidate): Promise<Product[]> {
    const products: Product[] = [];
    
    this.emitActivity(run.id, {
      type: 'actor_start',
      timestamp: new Date().toISOString(),
      message: `[Amazon] Searching: ${candidate.term.substring(0, 60)}...`,
      details: { url: candidate.term }
    });

    try {
      // Amazon crawler actor (junglee/amazon-crawler) expects search keywords, not URLs
      const input = {
        keyword: candidate.term.replace(/^https?:\/\/www\.amazon\.com\/s\?k=/, '').replace(/&.*$/, '').replace(/\+/g, ' '),
        maxResults: 50,
      };

      const actorRun = await apifyService.runActor(SHOPPDROPP_ACTORS.amazon, input, {
        waitForFinish: true,
        waitSecs: 180,
      });

      const results = await apifyService.getDatasetItems(actorRun.defaultDatasetId, { limit: 100 });
      
      this.emitActivity(run.id, {
        type: 'actor_complete',
        timestamp: new Date().toISOString(),
        message: `[Amazon] Found ${results.length} products`,
        details: { url: candidate.term, count: results.length }
      });

      // Extract products from Amazon results
      for (const item of results) {
        if (item.title) {
          products.push({
            id: uuidv4(),
            name: item.title,
            source: 'amazon',
            sourceUrl: item.url || item.detailPageUrl,
            category: candidate.category,
            searchTerm: candidate.term,
            imageUrl: item.image,
            price: item.price ? parseFloat(item.price.replace(/[^0-9.]/g, '')) : undefined,
            rating: item.rating,
            reviewCount: item.reviewCount,
            relevanceScore: item.rating ? item.rating : 5,
            timestamp: new Date().toISOString(),
            raw: item
          });
        }
      }
    } catch (error: any) {
      this.emitActivity(run.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: `[Amazon] Search failed: ${error.message}`,
      });
    }

    return products;
  }

  /**
   * Expand search candidates when initial set is exhausted
   */
  private expandSearchCandidates(
    candidates: any,
    category: string,
    subcategory: string
  ): void {
    // Generate broader terms
    const broaderTerms = [
      `${category} accessories`,
      `${category} products`,
      `${category} must have`,
      `${category} finds`,
      `best ${category}`,
      `viral ${category}`,
      `amazon ${category}`,
      `tiktok ${category}`
    ];
    
    // Add to existing candidates
    broaderTerms.forEach(term => {
      const sanitized = term.toLowerCase().replace(/[^a-z0-9]/g, '');
      candidates.tiktok.push({
        term: sanitized,
        type: 'hashtag',
        priority: 5,
        category
      });
      
      candidates.amazon.push({
        term: `https://www.amazon.com/s?k=${encodeURIComponent(term)}&ref=nb_sb_noss`,
        type: 'url',
        priority: 5,
        category
      });
    });
  }

  /**
   * Clean keyword - remove emojis, special chars, extra spaces
   */
  private cleanKeyword(input: any): string {
    let str = Array.isArray(input) ? input[0] : String(input || '');
    return str
      .toLowerCase()
      // Remove all emojis and special unicode symbols
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2B06}\u{2B07}\u{2B05}\u{27A1}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{2934}-\u{2935}\u{25AA}-\u{25AB}\u{25FB}-\u{25FE}\u{25FD}-\u{25FE}\u{2B50}\u{2B55}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{23EE}\u{23ED}\u{23EF}\u{267E}\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}-\u{269C}\u{26A0}-\u{26A1}\u{26AA}-\u{26AB}\u{26B0}-\u{26B1}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D1}\u{26D3}-\u{26D4}\u{26E9}-\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}]/gu, '')
      // Split on dash and take first part (remove descriptions)
      .split(/\s*[-–—]\s*/)[0]
      // Remove URLs
      .replace(/https?:\/\/\S+/g, '')
      // Remove special characters except spaces and basic punctuation
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Extract product name from text
   */
  private extractProductNameFromText(text: string): string | null {
    // Look for patterns like "product name" or product mentions
    const cleaned = text
      .replace(/[#@]/g, '')
      .replace(/\b(https?:\/\/\S+)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract first sentence or phrase that looks like a product
    const sentences = cleaned.split(/[.!?]+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      // Look for product-like phrases (nouns with descriptors)
      if (trimmed.length > 10 && trimmed.length < 100) {
        return trimmed;
      }
    }
    
    return null;
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove tracking parameters
      urlObj.searchParams.delete('utm_source');
      urlObj.searchParams.delete('utm_medium');
      urlObj.searchParams.delete('utm_campaign');
      urlObj.searchParams.delete('ref');
      return urlObj.toString().toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Normalize product name for deduplication
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 50);
  }

  /**
   * Complete research and save results
   */
  private async completeResearch(run: ResearchRun, products: Product[]): Promise<void> {
    run.status = products.length >= run.config.targetProducts ? 'completed' : 'exhausted';
    run.endTime = new Date().toISOString();
    run.results = products;
    run.productsFound = products.length;

    // Run CJ verification
    const verifiedProducts = await this.verifyOnCJ(run, products);
    run.productsVerified = verifiedProducts.length;
    run.results = verifiedProducts;

    this.emitActivity(run.id, {
      type: run.status === 'completed' ? 'success' : 'warning',
      timestamp: new Date().toISOString(),
      message: run.status === 'completed' 
        ? `🎉 Research complete! Found ${verifiedProducts.length}/${run.config.targetProducts} verified products`
        : `⚠️ Research exhausted. Found ${verifiedProducts.length}/${run.config.targetProducts} products`,
      details: {
        productsFound: verifiedProducts.length,
        target: run.config.targetProducts,
        searches: run.searchStats.totalSearches,
        bySource: {
          tiktok: run.searchStats.productsFromTikTok,
          tiktokShop: run.searchStats.productsFromTikTokShop,
          googleTrends: run.searchStats.productsFromGoogleTrends,
          reddit: run.searchStats.productsFromReddit,
          amazon: run.searchStats.productsFromAmazon
        },
        duplicates: run.searchStats.duplicateCount,
        rejected: run.searchStats.rejectedCount
      }
    });

    this.emit('complete', run);
  }

  /**
   * Verify products on CJ Dropshipping
   */
  private async verifyOnCJ(run: ResearchRun, products: Product[]): Promise<Product[]> {
    this.emitActivity(run.id, {
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🔄 Verifying ${products.length} products on CJ Dropshipping...`,
    });

    const verified: Product[] = [];
    const targetCount = Math.min(products.length, run.config.targetProducts);

    for (let i = 0; i < products.length && verified.length < targetCount; i++) {
      const product = products[i];
      const searchTerm = product.name.substring(0, 50);
      
      try {
        const cjProducts = await cjDropshippingService.searchProducts(searchTerm, { pageSize: 5 });
        
        if (cjProducts.length > 0) {
          const bestMatch = cjProducts[0];
          verified.push({
            ...product,
            cjData: {
              available: true,
              productId: bestMatch.pid,
              price: bestMatch.variants?.[0]?.variationPrice,
              warehouse: 'CJ Dropshipping',
            }
          });
        }
      } catch (error) {
        // Continue with next product
      }
    }

    this.emitActivity(run.id, {
      type: 'success',
      timestamp: new Date().toISOString(),
      message: `✅ Verified ${verified.length} products on CJ Dropshipping`,
    });

    return verified;
  }

  /**
   * Fail a research run
   */
  private failRun(runId: string, errorMessage: string): void {
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
  private emitActivity(runId: string, activity: StreamingActivity): void {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.activities.push(activity);
      // Console log for Render debugging
      console.log(`[Research-Activity] ${activity.type}: ${activity.message}`);
      // Emit to WebSocket listeners
      this.emit('activity', { runId, activity });
    }
  }

  /**
   * Get research run
   */
  getRun(runId: string): ResearchRun | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Get activities for a run
   */
  getActivities(runId: string): StreamingActivity[] {
    return this.activeRuns.get(runId)?.activities || [];
  }
}

export const adaptiveResearchPipeline = new AdaptiveResearchPipeline();