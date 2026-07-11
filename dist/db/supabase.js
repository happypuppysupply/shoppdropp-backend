"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.Database = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
const supabase = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceKey);
class Database {
    // Users
    async getUserById(id) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw error;
        return data;
    }
    async getUserByEmail(email) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        if (error)
            return null;
        return data;
    }
    async createUser(user) {
        const { data, error } = await supabase
            .from('users')
            .insert(user)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateUser(id, updates) {
        const { data, error } = await supabase
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
        const { data, error } = await supabase
            .from('stores')
            .select('*')
            .eq('user_id', userId);
        if (error)
            throw error;
        return data || [];
    }
    async getStoreById(id) {
        const { data, error } = await supabase
            .from('stores')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            return null;
        return data;
    }
    async createStore(store) {
        const { data, error } = await supabase
            .from('stores')
            .insert(store)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateStore(id, updates) {
        const { data, error } = await supabase
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
        const { data, error } = await supabase
            .from('api_credentials')
            .select('*')
            .eq('store_id', storeId);
        if (error)
            throw error;
        return data || [];
    }
    async upsertCredentials(creds) {
        const { data, error } = await supabase
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
        const { data, error } = await supabase
            .from('workers')
            .select('*')
            .eq('user_id', userId);
        if (error)
            throw error;
        return data || [];
    }
    async getWorkerById(id) {
        const { data, error } = await supabase
            .from('workers')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            return null;
        return data;
    }
    async createWorker(worker) {
        const { data, error } = await supabase
            .from('workers')
            .insert(worker)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateWorker(id, updates) {
        const { data, error } = await supabase
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
        const { data, error } = await supabase
            .from('tasks')
            .insert(task)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateTask(id, updates) {
        const { data, error } = await supabase
            .from('tasks')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    // Helper for Stripe webhooks
    async getUserByStripeCustomerId(customerId) {
        const { data, error } = await supabase
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