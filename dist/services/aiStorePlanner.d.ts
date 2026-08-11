import { StoreScanResult } from './storeScanner';
import { ShopScore } from './shopScorer';
export interface AIStorePlan {
    scanResult: StoreScanResult;
    shopScore: ShopScore;
    analysis: {
        niche: string;
        targetAudience: string;
        competitiveAdvantages: string[];
        improvementOpportunities: string[];
        estimatedTraffic: string;
        contentGaps: string[];
    };
    designRecommendations: {
        style: string;
        colorPalette: {
            primary: string;
            secondary: string;
            accent: string;
            background: string;
        };
        typography: string;
        layout: string;
        mood: string;
    };
    productStrategy: {
        recommendedNiches: string[];
        priceRange: {
            min: number;
            max: number;
            currency: string;
        };
        sourcingStrategy: string;
        winningProducts: AIProductRecommendation[];
        collections: AICollectionPlan[];
    };
    marketingPlan: {
        adChannels: string[];
        contentStrategy: string;
        emailFlows: string[];
        viralHooks: string[];
    };
    technicalRequirements: {
        requiredApps: string[];
        integrations: string[];
        customFeatures: string[];
    };
    implementationPlan: {
        phases: ImplementationPhase[];
        timeline: string;
        estimatedCost: string;
    };
}
export interface AIProductRecommendation {
    name: string;
    description: string;
    whyItWins: string;
    targetPrice: number;
    supplierCost: number;
    profitMargin: number;
    searchKeywords: string[];
    cjProductIds?: string[];
    images?: string[];
}
export interface AICollectionPlan {
    name: string;
    description: string;
    productCount: number;
    theme: string;
    seoKeywords: string[];
}
export interface ImplementationPhase {
    name: string;
    duration: string;
    tasks: string[];
    deliverables: string[];
}
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
export declare class AIStorePlanner {
    private openRouterKey;
    private cjApiKey?;
    constructor(openRouterKey: string, cjApiKey?: string);
    /**
     * Generate a marketing plan for lead generation
     * This is NOT a deployment plan - it's a sales tool
     */
    generatePlan(url: string): Promise<AIStorePlan>;
    private analyzeWithAI;
    private buildAnalysisPrompt;
    private generateFallbackAnalysis;
    private generateDesignRecommendations;
    private researchProducts;
    private mapNicheToCategory;
    private generateAIProductRecommendations;
    private generateCollections;
    private generateMarketingPlan;
    private determineTechnicalRequirements;
    private createImplementationPlan;
    generateViralContent(storeUrl: string, plan: AIStorePlan): {
        headline: string;
        subheadline: string;
        cta: string;
        socialProof: string;
    };
}
export declare const createAIStorePlanner: (openRouterKey: string, cjApiKey?: string) => AIStorePlanner;
//# sourceMappingURL=aiStorePlanner.d.ts.map