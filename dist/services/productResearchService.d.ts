interface ResearchConfig {
    store_id: string;
    user_id: string;
    category?: string;
    min_price?: number;
    max_price?: number;
    keywords?: string[];
}
interface ResearchResult {
    id: string;
    store_id: string;
    user_id: string;
    query: string;
    products_found: number;
    products_imported: number;
    top_products: any[];
    analysis: {
        trending_categories: string[];
        price_range: {
            min: number;
            max: number;
            avg: number;
        };
        avg_rating: number;
        recommendations: string[];
    };
    created_at: string;
    status: 'running' | 'completed' | 'failed';
}
export declare class ProductResearchService {
    startResearch(config: ResearchConfig): Promise<ResearchResult>;
    private performResearch;
    private extractCategories;
    private generateRecommendations;
    private saveResearchResult;
    private updateResearchResult;
    private updateResearchStatus;
    getResearchHistory(storeId: string, limit?: number): Promise<ResearchResult[]>;
}
export declare const productResearchService: ProductResearchService;
export {};
//# sourceMappingURL=productResearchService.d.ts.map