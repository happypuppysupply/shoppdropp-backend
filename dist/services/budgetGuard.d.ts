/**
 * OpenRouter Budget Guard Service
 * Enforces weekly spending limits with threshold alerts
 */
export interface BudgetConfig {
    weeklyLimitUsd: number;
    weeklySpentUsd: number;
    weekStartedAt: string;
    hardStopAt: number;
    alertThresholds: number[];
    maxRequestCostUsd: number;
    estimateBuffer: number;
    lastAlertedAt?: Record<string, string>;
}
/**
 * Get or create budget configuration for a user
 */
export declare function getBudgetConfig(userId: string): Promise<BudgetConfig | null>;
/**
 * Save budget configuration
 */
export declare function setBudgetConfig(userId: string, config: Partial<BudgetConfig>): Promise<BudgetConfig>;
/**
 * Check if week has passed and reset if needed
 */
export declare function checkAndResetWeek(config: BudgetConfig): BudgetConfig;
/**
 * Fetch OpenRouter account balance
 */
export declare function fetchOpenRouterBalance(apiKey: string): Promise<number>;
/**
 * Estimate cost of a request
 */
export declare function estimateRequestCost(model: string, estimatedInputTokens?: number, estimatedOutputTokens?: number): number;
/**
 * Check if a request should be allowed
 */
export interface GuardResult {
    allowed: boolean;
    reason?: string;
    remaining?: number;
    suggestion?: string;
    resetsAt?: Date;
    estimatedCost?: number;
    projectedSpend?: number;
    percentageUsed?: number;
}
export declare function canMakeRequest(userId: string, model: string, apiKey: string, estimatedInputTokens?: number, estimatedOutputTokens?: number): Promise<GuardResult>;
/**
 * Track actual spend after a request completes
 */
export declare function trackSpend(userId: string, actualCost: number, model: string): Promise<{
    newTotal: number;
    thresholdCrossed?: number;
}>;
/**
 * Get budget status for display
 */
export declare function getBudgetStatus(userId: string, apiKey?: string): Promise<{
    configured: boolean;
    weeklyLimit: number;
    weeklySpent: number;
    percentageUsed: number;
    remaining: number;
    resetsAt: Date;
    accountBalance?: number;
    hardStopAt: number;
} | null>;
/**
 * Format budget alert message
 */
export declare function formatBudgetAlert(threshold: number, spent: number, limit: number, resetsAt: Date): string;
//# sourceMappingURL=budgetGuard.d.ts.map