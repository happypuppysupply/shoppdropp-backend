import axios from 'axios';

const OPENWEBNINJA_API_KEY = 'ak_y2u0jpbk9jccnbg2jleklh2vyqyy2ad7pwyrlowuovx5pcq';
const BASE_URL = 'https://api.openwebninja.com';

interface SearchParams {
  query: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  sort_by?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'sales';
  limit?: number;
}

export interface ProductResult {
  id: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  image_url?: string;
  rating?: number;
  reviews_count?: number;
  sales_count?: number;
  source: 'amazon' | 'walmart' | 'ebay';
  product_url: string;
  in_stock: boolean;
  shipping?: {
    cost: number;
    estimated_days: number;
  };
}

export class OpenWebNinjaService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = OPENWEBNINJA_API_KEY;
    this.baseUrl = BASE_URL;
  }

  // Search Amazon products
  async searchAmazon(params: SearchParams): Promise<ProductResult[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/realtime-amazon-data/search`, {
        params: {
          query: params.query,
          category: params.category,
          min_price: params.min_price,
          max_price: params.max_price,
          sort_by: params.sort_by,
          limit: params.limit || 20,
        },
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      return this.formatAmazonResults(response.data?.results || []);
    } catch (error) {
      console.error('Amazon search error:', error);
      throw error;
    }
  }

  // Search Walmart products
  async searchWalmart(params: SearchParams): Promise<ProductResult[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/real-time-walmart-data/search`, {
        params: {
          query: params.query,
          category: params.category,
          min_price: params.min_price,
          max_price: params.max_price,
          sort_by: params.sort_by,
          limit: params.limit || 20,
        },
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      return this.formatWalmartResults(response.data?.results || []);
    } catch (error) {
      console.error('Walmart search error:', error);
      throw error;
    }
  }

  // Search eBay products
  async searchEbay(params: SearchParams): Promise<ProductResult[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/real-time-ebay-data/search`, {
        params: {
          query: params.query,
          category: params.category,
          min_price: params.min_price,
          max_price: params.max_price,
          sort_by: params.sort_by,
          limit: params.limit || 20,
        },
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      return this.formatEbayResults(response.data?.results || []);
    } catch (error) {
      console.error('eBay search error:', error);
      throw error;
    }
  }

  // Multi-source search (combines Amazon, Walmart, eBay)
  async multiSourceSearch(params: SearchParams): Promise<ProductResult[]> {
    const [amazonResults, walmartResults, ebayResults] = await Promise.allSettled([
      this.searchAmazon(params),
      this.searchWalmart(params),
      this.searchEbay(params),
    ]);

    const results: ProductResult[] = [];

    if (amazonResults.status === 'fulfilled') {
      results.push(...amazonResults.value);
    }
    if (walmartResults.status === 'fulfilled') {
      results.push(...walmartResults.value);
    }
    if (ebayResults.status === 'fulfilled') {
      results.push(...ebayResults.value);
    }

    // Sort by relevance/rating
    return results
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, params.limit || 20);
  }

  // Get trending products (high sales, good ratings)
  async getTrendingProducts(category?: string, limit: number = 10): Promise<ProductResult[]> {
    const trendingQueries = [
      'trending products 2025',
      'best sellers',
      'top rated',
      'popular items',
    ];

    const allResults: ProductResult[] = [];

    for (const query of trendingQueries.slice(0, 2)) {
      try {
        const results = await this.searchAmazon({
          query: category ? `${category} ${query}` : query,
          sort_by: 'sales',
          limit: 10,
        });
        allResults.push(...results);
      } catch (err) {
        console.warn(`Failed to search for ${query}:`, err);
      }
    }

    // Filter for products with good metrics
    return allResults
      .filter(p => (p.rating || 0) >= 4.0 && p.in_stock)
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
      .slice(0, limit);
  }

  // Analyze product profitability
  async analyzeProductProfitability(product: ProductResult): Promise<{
    profitability: 'high' | 'medium' | 'low';
    estimated_margin: number;
    recommendation: string;
    risks: string[];
  }> {
    // Simple heuristic-based analysis
    const margin = product.price ? (product.price * 0.4) : 0; // Assume 40% margin
    
    let profitability: 'high' | 'medium' | 'low' = 'medium';
    let recommendation: string;
    const risks: string[] = [];

    if ((product.rating || 0) >= 4.5 && (product.sales_count || 0) > 1000) {
      profitability = 'high';
      recommendation = 'High demand with excellent ratings. Strong candidate for import.';
    } else if ((product.rating || 0) >= 4.0 && (product.sales_count || 0) > 500) {
      profitability = 'medium';
      recommendation = 'Good metrics but monitor competition. Consider testing with small batch.';
    } else {
      profitability = 'low';
      recommendation = 'Lower demand or ratings. Proceed with caution.';
      risks.push('Low sales volume or ratings may indicate poor market fit');
    }

    if (!product.in_stock) {
      risks.push('Product currently out of stock');
    }

    if ((product.shipping?.cost || 0) > product.price * 0.3) {
      risks.push('High shipping costs may reduce profit margins');
    }

    return {
      profitability,
      estimated_margin: margin,
      recommendation,
      risks,
    };
  }

  private formatAmazonResults(results: any[]): ProductResult[] {
    return results.map(r => ({
      id: r.asin || r.id || `amz_${Date.now()}`,
      title: r.title || 'Unknown Product',
      description: r.description,
      price: parseFloat(r.price) || 0,
      currency: r.currency || 'USD',
      image_url: r.image_url || r.thumbnail,
      rating: parseFloat(r.rating) || 0,
      reviews_count: parseInt(r.reviews_count) || 0,
      sales_count: parseInt(r.sales_count) || 0,
      source: 'amazon' as const,
      product_url: r.product_url || r.url || `https://amazon.com/dp/${r.asin}`,
      in_stock: r.in_stock !== false,
      shipping: r.shipping,
    }));
  }

  private formatWalmartResults(results: any[]): ProductResult[] {
    return results.map(r => ({
      id: r.walmart_id || r.id || `wm_${Date.now()}`,
      title: r.title || 'Unknown Product',
      description: r.description,
      price: parseFloat(r.price) || 0,
      currency: r.currency || 'USD',
      image_url: r.image_url || r.thumbnail,
      rating: parseFloat(r.rating) || 0,
      reviews_count: parseInt(r.reviews_count) || 0,
      sales_count: parseInt(r.sales_count) || 0,
      source: 'walmart' as const,
      product_url: r.product_url || r.url,
      in_stock: r.in_stock !== false,
      shipping: r.shipping,
    }));
  }

  private formatEbayResults(results: any[]): ProductResult[] {
    return results.map(r => ({
      id: r.ebay_id || r.id || `ebay_${Date.now()}`,
      title: r.title || 'Unknown Product',
      description: r.description,
      price: parseFloat(r.price) || 0,
      currency: r.currency || 'USD',
      image_url: r.image_url || r.thumbnail,
      rating: parseFloat(r.rating) || 0,
      reviews_count: parseInt(r.reviews_count) || 0,
      sales_count: parseInt(r.sales_count) || 0,
      source: 'ebay' as const,
      product_url: r.product_url || r.url,
      in_stock: r.in_stock !== false,
      shipping: r.shipping,
    }));
  }
}

export const openWebNinjaService = new OpenWebNinjaService();
