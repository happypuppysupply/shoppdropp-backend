"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.Database = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
exports.supabase = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceKey);
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
            .update({ ...updates, updated_at: new Date().toISOString() })
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
    async getWorkersByUser(userId) {
        const { data, error } = await exports.supabase
            .from('workers')
            .select('*')
            .eq('user_id', userId);
        if (error)
            throw error;
        return data || [];
    }
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
            .update({ ...updates, updated_at: new Date().toISOString() })
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
}
exports.Database = Database;
exports.db = new Database();
//# sourceMappingURL=supabase.js.map