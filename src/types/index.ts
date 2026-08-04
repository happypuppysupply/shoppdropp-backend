export interface User {
  id: string;
  email: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan: 'payg' | 'growth' | 'agency';
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  user_id: string;
  name: string;
  url: string;
  platform: 'shopify';
  worker_id?: string;
  status: 'pending' | 'provisioning' | 'active' | 'error';
  // Store configuration fields
  config_niche?: string;
  config_target_market?: string;
  config_product_types?: string[];
  config_ad_budget?: number;
  config_ai_budget?: number;
  config_goals?: string[];
  config_updated_at?: string;
  hetzner_server_id?: string | null;
  ip_address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiCredentials {
  id: string;
  store_id: string;
  type: 'shopify' | 'meta_ads' | 'autods' | 'cj_dropshipping' | 'rapidapi';
  encrypted_data: string;
  // OpenWebNinja fields
  service_type?: string;
  api_key?: string;
  created_at: string;
  updated_at: string;
}

export interface Worker {
  id: string;
  user_id: string;
  store_id?: string | null;
  status: 'idle' | 'assigned' | 'provisioning' | 'configuring' | 'running' | 'error' | 'failed';
  container_id?: string | null;
  ip_address?: string | null;
  hetzner_server_id?: string | null;
  hetzner_server_type?: string | null;
  ssh_key_fingerprint?: string | null;
  openclaw_version?: string | null;
  last_heartbeat?: string;
  // Provisioning progress tracking
  provisioning_step?: number | null;
  provisioning_step_name?: string | null;
  provisioning_progress?: number | null;
  provisioning_logs?: string | null;
  server_ip?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  worker_id: string;
  type: 'product_research' | 'catalog_sync' | 'price_optimization' | 'meta_ads_sync' | 'inventory_sync';
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkerCommand {
  type: 'start' | 'stop' | 'restart' | 'execute_task';
  task?: Task;
  config?: Record<string, unknown>;
}