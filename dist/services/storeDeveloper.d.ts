export interface StoreDevelopmentConfig {
    storeId: string;
    userId: string;
    storeName: string;
    shopifyDomain: string;
    shopifyToken: string;
    githubToken: string;
    vercelToken: string;
    cjApiKey: string;
    metaAccessToken?: string;
    metaAdAccountId?: string;
    supabaseUrl: string;
    supabaseKey: string;
}
export interface DevelopmentTask {
    id: string;
    type: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    progress: number;
    message: string;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
}
export declare class StoreDeveloper {
    private tasks;
    private config?;
    developStore(config: StoreDevelopmentConfig): Promise<void>;
    private setupInfrastructure;
    private setupDatabase;
    private connectShopify;
    private researchAndImportProducts;
    private buildTheme;
    private deployThemeToShopify;
    private createLandingPages;
    private setupMetaAds;
    private setupCommunication;
    private deployWorkers;
    private launchStore;
    private runTask;
    getTasks(): DevelopmentTask[];
    private generateThemeLayout;
    private generateHomePage;
    private generateProductPage;
    private generateCollectionPage;
    private generateCartPage;
    private generateThemeCSS;
    private generateThemeJS;
    private generateSettingsSchema;
    private generateHeader;
    private generateFooter;
    private generateHeroSection;
    private generateProductGrid;
    private generateLandingPage;
    private generateLandingCSS;
    /**
     * Deploy a viral growth tool
     * Creates GitHub repo, Supabase tables, and deploys to Vercel
     */
    deployViralTool(storeId: string, toolId: string, code: {
        files: Record<string, string>;
        supabaseMigrations: string[];
        klaviyoFlows: string[];
        deploymentSteps: string[];
    }): Promise<{
        url: string;
        repo: string;
    }>;
}
export declare const storeDeveloper: StoreDeveloper;
//# sourceMappingURL=storeDeveloper.d.ts.map