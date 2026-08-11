export interface ViralTool {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: 'lead-capture' | 'engagement' | 'viral' | 'utility' | 'seo' | 'content';
    emailCapture: boolean;
    viralSharing: boolean;
    seoValue: 'high' | 'medium' | 'low';
    integration: string[];
    estimatedLeadsPerMonth: number;
    setupTimeMinutes: number;
    workerType?: string;
}
export interface ViralGrowthConfig {
    storeId: string;
    selectedTools: string[];
    emailProvider: 'klaviyo' | 'mailchimp' | 'shopify' | 'sendgrid';
    emailProviderApiKey?: string;
    listId?: string;
    upsellEnabled: boolean;
    bundleApp: 'bundler' | 'bundle-products' | 'shopify-bundles';
    branding: {
        primaryColor: string;
        logo?: string;
        customDomain?: string;
    };
}
export interface AIRecommendation {
    id: string;
    type: 'viral-tool' | 'content-strategy' | 'worker-task' | 'seo-opportunity';
    title: string;
    description: string;
    icon: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    estimatedMonthlyValue: number;
    relatedWorkers: string[];
    reason: string;
}
export declare class ViralGrowthEngine {
    private viralTools;
    private workerConfig;
    getAvailableTools(industry?: string): ViralTool[];
    generateRecommendations(scanData: any): AIRecommendation[];
    calculateWorkerOrganization(selectedToolIds: string[]): {
        workers: Array<{
            id: string;
            name: string;
            description: string;
            priority: number;
            tasks: string[];
            active: boolean;
        }>;
        totalTasks: number;
        estimatedSetupHours: number;
    };
    estimateLeadPotential(tools: string[]): Promise<{
        monthlyLeads: number;
        yearlyLeads: number;
        projectedRevenue: number;
        setupTimeHours: number;
        seoValue: string;
        explanation: string;
    }>;
    generateToolCode(toolId: string, config: ViralGrowthConfig): {
        files: Record<string, string>;
        migrations: string[];
        klaviyoFlows: string[];
        deploymentSteps: string[];
    };
    private getMigrationsForTool;
    private getFlowsForTool;
    generateEmailSequence(toolId: string, config: ViralGrowthConfig): {
        welcome: string;
        followUp: string[];
        upsell: string;
    };
}
export declare const viralGrowthEngine: ViralGrowthEngine;
//# sourceMappingURL=viralGrowthEngine.d.ts.map