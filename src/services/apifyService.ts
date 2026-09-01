import { db } from '../db/supabase';

const APIFY_API_BASE = 'https://api.apify.com/v2';

interface ApifyActor {
  id: string;
  userId: string;
  name: string;
  username: string;
  description?: string;
  isPublic: boolean;
  title?: string;
  pricingInfos?: Array<{
    pricingModel: string;
    createdAt: string;
    cpuUsdPerUnit: number;
    calculatedAt: string;
    enabledAt?: string;
    unitName: string;
    unitDescription: string;
  }>;
  categories?: string[];
  stats?: {
    totalRuns: number;
    publicActorRunCount: number;
  };
  currentPricing?: {
    pricingModel: string;
    pricePerUnitUsd: number;
    trialMinutes: number;
  };
}

interface ApifySearchResults {
  total: number;
  count: number;
  offset: number;
  limit: number;
  desc: boolean;
  items: ApifyActor[];
}

interface ApifyRunResult {
  id: string;
  actId: string;
  actName: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  startedAt: string;
  finishedAt?: string;
  buildId: string;
  buildNumber: string;
  defaultDatasetId: string;
  defaultKeyValueStoreId: string;
  output?: any;
}

export class ApifyService {
  private apiToken: string | null = null;

  constructor() {
    this.apiToken = process.env.APIFY_TOKEN || null;
  }

  setToken(token: string) {
    this.apiToken = token;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.apiToken) {
      throw new Error('Apify API token not configured');
    }

    const url = `${APIFY_API_BASE}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; message?: string };
      throw new Error(`Apify API error: ${response.status} - ${error.error || error.message || 'Unknown'}`);
    }

    return response.json();
  }

  /**
   * Search for actors in the Apify Store
   */
  async searchActors(query: string, options: {
    sortBy?: 'relevance' | 'popularity' | 'name';
    offset?: number;
    limit?: number;
    username?: string;
    verified?: boolean;
  } = {}): Promise<ApifySearchResults> {
    const params = new URLSearchParams();
    params.append('search', query);
    params.append('type', 'apify');
    params.append('sortBy', options.sortBy || 'relevance');
    params.append('offset', String(options.offset || 0));
    params.append('limit', String(options.limit || 20));
    
    if (options.verified) {
      params.append('isVerified', 'true');
    }

    const data = await this.request(`/store?${params.toString()}`);
    return data.data as ApifySearchResults;
  }

  /**
   * Get detailed info about a specific actor
   */
  async getActor(actorId: string): Promise<ApifyActor> {
    const data = await this.request(`/acts/${actorId}`);
    return data.data as ApifyActor;
  }

  /**
   * List top Actors by category
   */
  async getTopActors(category?: string, limit: number = 20): Promise<ApifyActor[]> {
    const params = new URLSearchParams();
    params.append('sortBy', 'mostPopular');
    params.append('limit', String(limit));
    
    if (category) {
      params.append('category', category);
    }

    const data = await this.request(`/store?${params.toString()}`);
    return (data.data?.items || []) as ApifyActor[];
  }

  /**
   * Get actor categories
   */
  async getCategories(): Promise<string[]> {
    // Known Apify categories based on their platform
    return [
      'Social Media',
      'E-commerce',
      'AI & ML',
      'Automation',
      'Data',
      'Marketing',
      'SEO',
      'Web Scraping',
      'Finance',
      'Health & Fitness',
      'Travel',
      'Entertainment',
      'News',
      'Real Estate',
      'Jobs',
    ];
  }

  /**
   * Start an actor run
   */
  async runActor(actorId: string, input: any, options: {
    memory?: number;
    timeout?: number;
    waitForFinish?: boolean;
    waitSecs?: number;
  } = {}): Promise<ApifyRunResult> {
    const runOptions: any = {
      ...input && { input },
      ...options.memory && { memory: options.memory },
      ...options.timeout && { timeout: options.timeout },
    };

    const data = await this.request(`/acts/${actorId}/runs`, {
      method: 'POST',
      body: JSON.stringify(runOptions),
    });

    const run = data.data as ApifyRunResult;

    if (options.waitForFinish && run.status === 'RUNNING') {
      return this.waitForRunToFinish(run.id, options.waitSecs || 60);
    }

    return run;
  }

  /**
   * Wait for a run to finish
   */
  async waitForRunToFinish(runId: string, maxWaitSecs: number = 600): Promise<ApifyRunResult> {
    const startTime = Date.now();
    const maxWaitMs = maxWaitSecs * 1000;

    while (true) {
      const run = await this.getRunStatus(runId);
      
      if (run.status === 'SUCCEEDED' || run.status === 'FAILED' || run.status === 'TIMED_OUT' || run.status === 'ABORTED') {
        return run;
      }

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Run ${runId} timed out after ${maxWaitSecs} seconds`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  /**
   * Get run status
   */
  async getRunStatus(runId: string): Promise<ApifyRunResult> {
    const data = await this.request(`/actor-runs/${runId}`);
    return data.data as ApifyRunResult;
  }

  /**
   * Get dataset items from a run
   */
  async getDatasetItems(datasetId: string, options: {
    offset?: number;
    limit?: number;
    clean?: boolean;
    fields?: string[];
    unwind?: string;
  } = {}): Promise<any[]> {
    const params = new URLSearchParams();
    params.append('format', 'json');
    params.append('offset', String(options.offset || 0));
    params.append('limit', String(options.limit || 250));
    
    if (options.clean !== false) {
      params.append('clean', 'true');
    }
    if (options.fields && options.fields.length > 0) {
      params.append('fields', options.fields.join(','));
    }
    if (options.unwind) {
      params.append('unwind', options.unwind);
    }

    const data = await this.request(`/datasets/${datasetId}/items?${params.toString()}`);
    return data || [];
  }

  /**
   * Quick search for TikTok actors
   */
  async findTikTokActors(): Promise<ApifyActor[]> {
    const results = await this.searchActors('tiktok', { sortBy: 'popularity', limit: 10 });
    return results.items.filter(actor => 
      actor.name.toLowerCase().includes('tiktok') ||
      actor.description?.toLowerCase().includes('tiktok')
    );
  }

  /**
   * Quick search for social media actors
   */
  async findSocialMediaActors(platform: 'tiktok' | 'instagram' | 'youtube' | 'reddit' | 'twitter' | 'facebook'): Promise<ApifyActor[]> {
    const results = await this.searchActors(platform, { sortBy: 'popularity', limit: 10 });
    return results.items.slice(0, 5);
  }

  /**
   * Get actor pricing info
   */
  async getActorPricing(actorId: string): Promise<any> {
    try {
      const actor = await this.getActor(actorId);
      return actor.currentPricing || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Calculate estimated cost for a run
   */
  async estimateRunCost(actorId: string, estimatedDurationMinutes: number = 1): Promise<number> {
    try {
      const actor = await this.getActor(actorId);
      const pricing = actor.currentPricing;
      
      if (!pricing) {
        // Free tier if no pricing set
        return 0;
      }

      if (pricing.pricingModel === 'PAY_PER_PLATFORM_USAGE') {
        // Platform usage is roughly $0.256 per compute unit hour
        // Actor runs are typically 0.1-0.5 CU/h
        const cuPerHour = 0.25; // Estimate
        const hours = estimatedDurationMinutes / 60;
        return cuPerHour * hours * 0.256; // $0.256 per CU/h
      }

      if (pricing.pricingModel === 'PAY_PER_USAGE') {
        return pricing.pricePerUnitUsd || 0;
      }

      // PAY_PER_RESULT or other models
      return pricing.pricePerUnitUsd || 0;
    } catch (e) {
      return 0; // Assume free
    }
  }
}

// Export singleton
export const apifyService = new ApifyService();

// Popular TikTok actors for product research
export const POPULAR_TIKTOK_ACTORS = [
  {
    id: 'janpolowinski/tiktok-scraper',
    name: 'TikTok Scraper',
    description: 'Scrape TikTok videos, hashtags, users, and trending content',
    category: 'Social Media',
  },
  {
    id: 'clockworks/tiktok-scraper',
    name: 'TikTok Scraper & Hashtag Explorer',
    description: 'Extract TikTok videos by hashtag, user, or trend',
    category: 'Social Media',
  },
  {
    id: 'apify/tiktok-hashtag-scraper',
    name: 'TikTok Hashtag Scraper',
    description: 'Scrape TikTok videos by hashtags',
    category: 'Social Media',
  },
  {
    id: 'epctex/tiktok-hashtag-scraper',
    name: 'TikTok Hashtag Scraper',
    description: 'Extract TikTok posts by hashtags',
    category: 'Social Media',
  },
];


// Popular Reddit actors
export const POPULAR_REDDIT_ACTORS = [
  {
    id: 'trudko/reddit-scraper',
    name: 'Reddit Scraper',
    description: 'Scrape Reddit posts and comments from any subreddit',
    category: 'Social Media',
  },
  {
    id: 'voyager/reddit-scraper',
    name: 'Reddit Posts & Comments Scraper',
    description: 'Extract Reddit posts and comments',
    category: 'Social Media',
  },
];

// Popular Google Trends actors
export const POPULAR_GOOGLE_ACTORS = [
  {
    id: 'epctex/google-trends-scraper',
    name: 'Google Trends Scraper',
    description: 'Scrape Google Trends data for keywords',
    category: 'Data',
  },
  {
    id: 'anchor/google-trends',
    name: 'Google Trends Daily Trends',
    description: 'Get daily trending searches from Google',
    category: 'Data',
  },
];

// Amazon product research actors
export const POPULAR_AMAZON_ACTORS = [
  {
    id: 'junglee/amazon-scraper',
    name: 'Amazon Product Scraper',
    description: 'Scrape Amazon product data, reviews, and prices',
    category: 'E-commerce',
  },
  {
    id: 'apify/amazon-product-scraper',
    name: 'Amazon Product Scraper',
    description: 'Extract Amazon products and reviews',
    category: 'E-commerce',
  },
];