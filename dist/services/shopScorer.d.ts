import { StoreScanResult } from './storeScanner';
import { AIStorePlan } from './aiStorePlanner';
export interface ShopScore {
    overall: number;
    grade: string;
    breakdown: {
        design: ScoreCategory;
        products: ScoreCategory;
        seo: ScoreCategory;
        performance: ScoreCategory;
        conversion: ScoreCategory;
        social: ScoreCategory;
    };
    metrics: ShopMetrics;
    benchmarks: Benchmarks;
    recommendations: PriorityRecommendation[];
    competitiveAnalysis: CompetitiveScore;
}
export interface ScoreCategory {
    score: number;
    maxScore: number;
    grade: string;
    label: string;
    details: string[];
    issues: string[];
    improvements: string[];
}
export interface ShopMetrics {
    totalProducts: number;
    totalCollections: number;
    totalPages: number;
    customPages: number;
    appsInstalled: number;
    avgProductPrice: number;
    priceRange: {
        min: number;
        max: number;
    };
    hasBlog: boolean;
    hasReviews: boolean;
    hasEmailCapture: boolean;
    hasSocialProof: boolean;
    loadTimeEstimate: string;
    mobileOptimized: boolean;
    hasSSL: boolean;
    pageDepth: number;
    navigationItems: number;
}
export interface Benchmarks {
    industryAverage: number;
    topPerformer: number;
    percentile: number;
    vsCompetitors: string;
}
export interface PriorityRecommendation {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    impact: string;
    effort: 'quick' | 'medium' | 'large';
    potentialLift: string;
}
export interface CompetitiveScore {
    yourScore: number;
    competitorAvg: number;
    ranking: number;
    advantages: string[];
    gaps: string[];
}
export declare class ShopScorer {
    calculateScore(scanResult: StoreScanResult, plan: AIStorePlan): ShopScore;
    private extractMetrics;
    private scoreDesign;
    private scoreProducts;
    private scoreSEO;
    private scorePerformance;
    private scoreConversion;
    private scoreSocial;
    private getGrade;
    private estimateLoadTime;
    private calculateBenchmarks;
    private generateRecommendations;
    private categoryToRecommendations;
}
export declare const createShopScorer: () => ShopScorer;
//# sourceMappingURL=shopScorer.d.ts.map