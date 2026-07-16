import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { User, Store, ApiCredentials, Worker, Task } from '../types';

export const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

export class Database {
  // Users
  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    if (error) return null;
    return data;
  }

  async createUser(user: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(user)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Stores
  async getStoresByUser(userId: string): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  }

  async getStoreById(id: string): Promise<Store | null> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  }

  async createStore(store: Partial<Store>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .insert(store)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateStore(id: string, updates: Partial<Store>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // API Credentials
  async getCredentialsByStore(storeId: string): Promise<ApiCredentials[]> {
    const { data, error } = await supabase
      .from('api_credentials')
      .select('*')
      .eq('store_id', storeId);
    if (error) throw error;
    return data || [];
  }

  async upsertCredentials(creds: Partial<ApiCredentials>): Promise<ApiCredentials> {
    const { data, error } = await supabase
      .from('api_credentials')
      .upsert(creds)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Workers
  async getWorkerById(id: string): Promise<Worker | null> {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  }

  async getWorkersByUser(userId: string): Promise<Worker[]> {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async createWorker(worker: Partial<Worker>): Promise<Worker> {
    const { data, error } = await supabase
      .from('workers')
      .insert(worker)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateWorker(id: string, updates: Partial<Worker>): Promise<Worker> {
    const { data, error } = await supabase
      .from('workers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Tasks
  async createTask(task: Partial<Task>): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const { data, error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // AI Configuration
  async saveAIConfig(userId: string, config: { provider: string; model: string; apiKey: string }): Promise<any> {
    const { data, error } = await supabase
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
    if (error) throw error;
    return data;
  }

  async getAIConfig(userId: string): Promise<any> {
    const { data, error } = await supabase
      .from('ai_configs')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return data;
  }

  // User Credentials (GitHub, Vercel, etc.)
  async saveUserCredential(userId: string, type: string, data: any): Promise<any> {
    const { data: result, error } = await supabase
      .from('user_credentials')
      .upsert({
        user_id: userId,
        type,
        encrypted_data: JSON.stringify(data),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return result;
  }

  async getUserCredential(userId: string, type: string): Promise<any> {
    const { data, error } = await supabase
      .from('user_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .single();
    if (error) return null;
    return {
      ...data,
      data: JSON.parse(data.encrypted_data || '{}'),
    };
  }

  // Helper for Stripe webhooks
  async getUserByStripeCustomerId(customerId: string): Promise<{ data: User | null; error: any }> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .single();
    return { data, error };
  }
}

export const db = new Database();