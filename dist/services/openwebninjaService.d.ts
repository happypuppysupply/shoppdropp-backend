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
export declare class OpenWebNinjaService {
    private apiKey;
    private baseUrl;
    constructor();
    searchAmazon(params: SearchParams): Promise<ProductResult[]>;
    searchWalmart(params: SearchParams): Promise<ProductResult[]>;
    searchEbay(params: SearchParams): Promise<ProductResult[]>;
    multiSourceSearch(params: SearchParams): Promise<ProductResult[]>;
    getTrendingProducts(category?: string, limit?: number): Promise<ProductResult[]>;
    analyzeProductProfitability(product: ProductResult): Promise<{
        profitability: 'high' | 'medium' | 'low';
        estimated_margin: number;
        recommendation: string;
        risks: string[];
    }>;
    private formatAmazonResults;
    private formatWalmartResults;
    private formatEbayResults;
}
export declare const openWebNinjaService: OpenWebNinjaService;
export {};
//# sourceMappingURL=openwebninjaService.d.ts.map