"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.Database = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
// Create Supabase client with schema cache disabled to avoid stale column errors
exports.supabase = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceKey, {
    db: {
        schema: 'public'
    }
});
class Database {
    // Users
    async getUserById(id) {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw error;
        return data;
    }
    async getUserByEmail(email) {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        if (error)
            return null;
        return data;
    }
    async createUser(user) {
        const { data, error } = await exports.supabase
            .from('users')
            .insert(user)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateUser(id, updates) {
        const { data, error } = await exports.supabase
            .from('users')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    // Stores
    async getStoresByUser(userId) {
        const { data, error } = await exports.supabase
            .from('stores')
            .select('*')
            .eq('user_id', userId);
        if (error)
            throw error;
        return data || [];
    }
    async getStoreById(id) {
        const { data, error } = await exports.supabase
            .from('stores')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            return null;
        return data;
    }
    async createStore(store) {
        const { data, error } = await exports.supabase
            .from('stores')
            .insert(store)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateStore(id, updates) {
        const { data, error } = await exports.supabase
            .from('stores')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    // API Credentials
    async getCredentialsByStore(storeId) {
        const { data, error } = await exports.supabase
            .from('api_credentials')
            .select('*')
            .eq('store_id', storeId);
        if (error)
            throw error;
        return data || [];
    }
    async upsertCredentials(creds) {
        const { data, error } = await exports.supabase
            .from('api_credentials')
            .upsert(creds)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    // Workers
    async getWorkerById(id) {
        const { data, error } = await exports.supabase
            .from('workers')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            return null;
        return data;
    }
    async getWorkersByUser(userId) {
        const { data, error } = await exports.supabase
            .from('workers')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data || [];
    }
    async createWorker(worker) {
        const { data, error } = await exports.supabase
            .from('workers')
            .insert(worker)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateWorker(id, updates) {
        const { data, error } = await exports.supabase
            .from('workers')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    // Tasks
    async createTask(task) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .insert(task)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateTask(id, updates) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    // AI Configuration
    async saveAIConfig(userId, config) {
        const { data, error } = await exports.supabase
            .from('ai_configs')
            .upsert({
            user_id: userId,
            provider: config.provider,
            model: config.model,
            api_key_encrypted: config.apiKey, // TODO: Add actual encryption
            updated_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async getAIConfig(userId) {
        const { data, error } = await exports.supabase
            .from('ai_configs')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error)
            return null;
        return data;
    }
    // User Credentials (GitHub, Vercel, etc.)
    async saveUserCredential(userId, type, data) {
        const { data: result, error } = await exports.supabase
            .from('user_credentials')
            .upsert({
            user_id: userId,
            type,
            encrypted_data: JSON.stringify(data),
            updated_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error)
            throw error;
        return result;
    }
    async getUserCredential(userId, type) {
        const { data, error } = await exports.supabase
            .from('user_credentials')
            .select('*')
            .eq('user_id', userId)
            .eq('type', type)
            .single();
        if (error)
            return null;
        return {
            ...data,
            data: JSON.parse(data.encrypted_data || '{}'),
        };
    }
    // Helper for Stripe webhooks
    async getUserByStripeCustomerId(customerId) {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('stripe_customer_id', customerId)
            .single();
        return { data, error };
    }
    // Worker logs
    async getWorkerLogs(workerId) {
        const { data, error } = await exports.supabase
            .from('worker_logs')
            .select('*')
            .eq('worker_id', workerId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data || [];
    }
    async clearWorkerLogs(workerId) {
        const { error } = await exports.supabase
            .from('worker_logs')
            .delete()
            .eq('worker_id', workerId);
        if (error)
            throw error;
    }
    // Budget Configuration
    async getBudgetConfig(userId) {
        const { data, error } = await exports.supabase
            .from('budget_configs')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error)
            return null;
        return {
            weeklyLimitUsd: data.weekly_limit_usd,
            weeklySpentUsd: data.weekly_spent_usd,
            weekStartedAt: data.week_started_at,
            hardStopAt: data.hard_stop_at,
            alertThresholds: data.alert_thresholds,
            maxRequestCostUsd: data.max_request_cost_usd,
            estimateBuffer: data.estimate_buffer,
            lastAlertedAt: data.last_alerted_at,
        };
    }
    async saveBudgetConfig(userId, config) {
        const { error } = await exports.supabase
            .from('budget_configs')
            .upsert({
            user_id: userId,
            weekly_limit_usd: config.weeklyLimitUsd,
            weekly_spent_usd: config.weeklySpentUsd,
            week_started_at: config.weekStartedAt,
            hard_stop_at: config.hardStopAt,
            alert_thresholds: config.alertThresholds,
            max_request_cost_usd: config.maxRequestCostUsd,
            estimate_buffer: config.estimateBuffer,
            last_alerted_at: config.lastAlertedAt,
            updated_at: new Date().toISOString(),
        });
        if (error)
            throw error;
    }
    async updateBudgetSpend(userId, newSpend) {
        const { error } = await exports.supabase
            .from('budget_configs')
            .update({
            weekly_spent_usd: newSpend,
            updated_at: new Date().toISOString(),
        })
            .eq('user_id', userId);
        if (error)
            throw error;
    }
}
exports.Database = Database;
exports.db = new Database();
//# sourceMappingURL=supabase.js.map