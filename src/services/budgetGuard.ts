/**
 * OpenRouter Budget Guard Service
 * Enforces weekly spending limits with threshold alerts
 */

import axios from 'axios';
import { db } from '../db/supabase';

// Budget configuration type
export interface BudgetConfig {
  weeklyLimitUsd: number;
  weeklySpentUsd: number;
  weekStartedAt: string; // ISO date
  hardStopAt: number; // 0.95 = 95%
  alertThresholds: number[]; // [0.5, 0.75, 0.9, 0.95]
  maxRequestCostUsd: number;
  estimateBuffer: number; // 1.2 = 20% buffer
  lastAlertedAt?: Record<string, string>; // Track last alert per threshold
}

// Default configuration
const DEFAULT_CONFIG: BudgetConfig = {
  weeklyLimitUsd: 60,
  weeklySpentUsd: 0,
  weekStartedAt: new Date().toISOString().split('T')[0],
  hardStopAt: 0.95,
  alertThresholds: [0.5, 0.75, 0.9, 0.95],
  maxRequestCostUsd: 5,
  estimateBuffer: 1.2,
};

// Model pricing cache (per 1K tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'moonshotai/kimi-k2.5': { input: 0.002, output: 0.008 },
  'moonshotai/kimi-k2.6': { input: 0.003, output: 0.012 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3.5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'openai/gpt-4o': { input: 0.005, output: 0.015 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'meta-llama/llama-3.1-405b': { input: 0.005, output: 0.01 },
  'google/gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
  'google/gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
};

// In-memory cache for account balance
let cachedBalance: { balance: number; fetchedAt: number } | null = null;
const BALANCE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get or create budget configuration for a user
 */
export async function getBudgetConfig(userId: string): Promise<BudgetConfig | null> {
  try {
    const config = await db.getBudgetConfig(userId);
    if (config) {
      return {
        ...DEFAULT_CONFIG,
        ...config,
        alertThresholds: config.alert_thresholds || DEFAULT_CONFIG.alertThresholds,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching budget config:', error);
    return null;
  }
}

/**
 * Save budget configuration
 */
export async function setBudgetConfig(
  userId: string,
  config: Partial<BudgetConfig>
): Promise<BudgetConfig> {
  const fullConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  await db.saveBudgetConfig(userId, fullConfig);
  return fullConfig;
}

/**
 * Check if week has passed and reset if needed
 */
export function checkAndResetWeek(config: BudgetConfig): BudgetConfig {
  const weekStart = new Date(config.weekStartedAt);
  const now = new Date();
  const daysSinceStart = (now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceStart >= 7) {
    // Reset for new week
    return {
      ...config,
      weeklySpentUsd: 0,
      weekStartedAt: now.toISOString().split('T')[0],
      lastAlertedAt: {},
    };
  }
  return config;
}

/**
 * Fetch OpenRouter account balance
 */
export async function fetchOpenRouterBalance(apiKey: string): Promise<number> {
  // Check cache first
  if (cachedBalance && Date.now() - cachedBalance.fetchedAt < BALANCE_CACHE_TTL_MS) {
    return cachedBalance.balance;
  }

  try {
    const response = await axios.get('https://openrouter.ai/api/v1/credits', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const balance = response.data?.data?.available_credits || 0;
    cachedBalance = { balance, fetchedAt: Date.now() };
    return balance;
  } catch (error: any) {
    console.error('Failed to fetch OpenRouter balance:', error.message);
    // Return cached balance if available, otherwise 0
    return cachedBalance?.balance || 0;
  }
}

/**
 * Estimate cost of a request
 */
export function estimateRequestCost(
  model: string,
  estimatedInputTokens: number = 1000,
  estimatedOutputTokens: number = 1000
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['moonshotai/kimi-k2.5'];
  const inputCost = (estimatedInputTokens / 1000) * pricing.input;
  const outputCost = (estimatedOutputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

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

export async function canMakeRequest(
  userId: string,
  model: string,
  apiKey: string,
  estimatedInputTokens: number = 1000,
  estimatedOutputTokens: number = 1000
): Promise<GuardResult> {
  // Get budget config
  let config = await getBudgetConfig(userId);
  
  // If no config, allow request (budget guard is opt-in)
  if (!config) {
    return { allowed: true };
  }

  // Check for week reset
  config = checkAndResetWeek(config);

  // Estimate request cost
  const estimatedCost = estimateRequestCost(model, estimatedInputTokens, estimatedOutputTokens);
  const bufferedCost = estimatedCost * config.estimateBuffer;

  // Check single request limit
  if (bufferedCost > config.maxRequestCostUsd) {
    return {
      allowed: false,
      reason: `Request exceeds max single-request cost ($${config.maxRequestCostUsd})`,
      estimatedCost: bufferedCost,
      suggestion: 'Break into smaller requests or increase maxRequestCostUsd',
    };
  }

  // Check weekly budget
  const projectedSpend = config.weeklySpentUsd + bufferedCost;
  const limitWithBuffer = config.weeklyLimitUsd * config.hardStopAt;

  if (projectedSpend > limitWithBuffer) {
    const remaining = limitWithBuffer - config.weeklySpentUsd;
    const weekStart = new Date(config.weekStartedAt);
    const resetsAt = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      allowed: false,
      reason: `Weekly budget nearly exhausted ($${config.weeklySpentUsd.toFixed(2)} / $${config.weeklyLimitUsd})`,
      remaining,
      suggestion: 'Wait for next week or increase weeklyLimitUsd',
      resetsAt,
      estimatedCost: bufferedCost,
      projectedSpend,
      percentageUsed: (config.weeklySpentUsd / config.weeklyLimitUsd) * 100,
    };
  }

  // Check account balance
  const accountBalance = await fetchOpenRouterBalance(apiKey);
  if (bufferedCost > accountBalance) {
    return {
      allowed: false,
      reason: 'Insufficient OpenRouter account balance',
      remaining: accountBalance,
      suggestion: 'Add credits at openrouter.ai/keys',
      estimatedCost: bufferedCost,
    };
  }

  // Request is allowed
  return {
    allowed: true,
    estimatedCost: bufferedCost,
    projectedSpend,
    percentageUsed: (projectedSpend / config.weeklyLimitUsd) * 100,
  };
}

/**
 * Track actual spend after a request completes
 */
export async function trackSpend(
  userId: string,
  actualCost: number,
  model: string
): Promise<{ newTotal: number; thresholdCrossed?: number }> {
  const config = await getBudgetConfig(userId);
  if (!config) return { newTotal: 0 };

  const newTotal = config.weeklySpentUsd + actualCost;
  await db.updateBudgetSpend(userId, newTotal);

  // Check if any threshold was crossed
  const oldPercentage = config.weeklySpentUsd / config.weeklyLimitUsd;
  const newPercentage = newTotal / config.weeklyLimitUsd;

  for (const threshold of config.alertThresholds) {
    if (oldPercentage < threshold && newPercentage >= threshold) {
      return { newTotal, thresholdCrossed: threshold };
    }
  }

  return { newTotal };
}

/**
 * Get budget status for display
 */
export async function getBudgetStatus(
  userId: string,
  apiKey?: string
): Promise<{
  configured: boolean;
  weeklyLimit: number;
  weeklySpent: number;
  percentageUsed: number;
  remaining: number;
  resetsAt: Date;
  accountBalance?: number;
  hardStopAt: number;
} | null> {
  const config = await getBudgetConfig(userId);
  if (!config) return null;

  const checkedConfig = checkAndResetWeek(config);
  const percentageUsed = (checkedConfig.weeklySpentUsd / checkedConfig.weeklyLimitUsd) * 100;
  const remaining = checkedConfig.weeklyLimitUsd - checkedConfig.weeklySpentUsd;
  const weekStart = new Date(checkedConfig.weekStartedAt);
  const resetsAt = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  let accountBalance: number | undefined;
  if (apiKey) {
    accountBalance = await fetchOpenRouterBalance(apiKey);
  }

  return {
    configured: true,
    weeklyLimit: checkedConfig.weeklyLimitUsd,
    weeklySpent: checkedConfig.weeklySpentUsd,
    percentageUsed,
    remaining,
    resetsAt,
    accountBalance,
    hardStopAt: checkedConfig.hardStopAt,
  };
}

/**
 * Format budget alert message
 */
export function formatBudgetAlert(
  threshold: number,
  spent: number,
  limit: number,
  resetsAt: Date
): string {
  const percentage = Math.round((spent / limit) * 100);
  const remaining = limit - spent;
  
  const messages: Record<number, string> = {
    0.5: 'Halfway through your weekly budget. Spending on track.',
    0.75: 'Three-quarters used. Consider pacing your requests.',
    0.9: '⚠️ Approaching limit! Only essential requests recommended.',
    0.95: '🛑 HARD STOP - Weekly budget exhausted. No further requests until reset.',
  };

  return `
💰 Budget Alert: ${percentage}% of weekly limit used

Spent: $${spent.toFixed(2)} / $${limit.toFixed(2)} (${percentage}%)
Remaining: $${remaining.toFixed(2)}
Resets: ${resetsAt.toLocaleDateString()}

${messages[threshold] || 'Budget threshold crossed.'}
  `.trim();
}
