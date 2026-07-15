-- Create ALL missing tables for ShoppDropp

-- 1. API Credentials table (for store-level creds like Shopify, CJ, AutoDS)
CREATE TABLE IF NOT EXISTS public.api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('shopify', 'meta_ads', 'autods', 'cj_dropshipping', 'rapidapi')),
  encrypted_data text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(store_id, type)
);

-- 2. User Credentials table (GitHub, Vercel)
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('github', 'vercel')),
  encrypted_data text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, type)
);

-- 3. AI Configs table
CREATE TABLE IF NOT EXISTS public.ai_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'openrouter', 'anthropic', 'google', 'mistral')),
  model text NOT NULL,
  api_key_encrypted text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id)
);

-- 4. Workers table
CREATE TABLE IF NOT EXISTS public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid,
  status text DEFAULT 'idle' CHECK (status IN ('idle', 'assigned', 'provisioning', 'configuring', 'running', 'error')),
  container_id text,
  ip_address text,
  hetzner_server_id text,
  hetzner_server_type text,
  ssh_key_fingerprint text,
  openclaw_version text,
  last_heartbeat timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can CRUD credentials for own stores"
  ON public.api_credentials FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = api_credentials.store_id
    AND stores.user_id = auth.uid()
  ));

CREATE POLICY "Users can CRUD own credentials"
  ON public.user_credentials FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can CRUD own AI config"
  ON public.ai_configs FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own workers"
  ON public.workers FOR ALL
  USING (user_id = auth.uid());

-- Add Happy Puppy credentials
DO $$
DECLARE
  hp_store_id uuid;
  user_id uuid := '4917a55a-59c3-4d41-af49-b95c678b63d1';
BEGIN
  -- Get Happy Puppy store ID
  SELECT id INTO hp_store_id FROM public.stores WHERE name = 'Happy Puppy Supply';
  
  IF hp_store_id IS NULL THEN
    RAISE NOTICE 'Happy Puppy store not found';
    RETURN;
  END IF;
  
  -- Add CJ Dropshipping
  INSERT INTO public.api_credentials (store_id, type, encrypted_data)
  VALUES (hp_store_id, 'cj_dropshipping', '{"token": "CJ5604…63ad"}')
  ON CONFLICT (store_id, type) DO UPDATE SET encrypted_data = '{"token": "CJ5604…63ad"}';
  
  -- Add GitHub
  INSERT INTO public.user_credentials (user_id, type, encrypted_data)
  VALUES (user_id, 'github', '{"token": "***"}')
  ON CONFLICT (user_id, type) DO UPDATE SET encrypted_data = '{"token": "***"}';
  
  -- Add Vercel  
  INSERT INTO public.user_credentials (user_id, type, encrypted_data)
  VALUES (user_id, 'vercel', '{"token": "***"}')
  ON CONFLICT (user_id, type) DO UPDATE SET encrypted_data = '{"token": "***"}';
  
  -- Add OpenRouter AI
  INSERT INTO public.ai_configs (user_id, provider, model, api_key_encrypted)
  VALUES (user_id, 'openrouter', 'moonshotai/kimi-k2.5', 'sk-or-…4dd6')
  ON CONFLICT (user_id) DO UPDATE SET 
    provider = 'openrouter', 
    model = 'moonshotai/kimi-k2.5',
    api_key_encrypted = 'sk-or-…4dd6';
    
  -- Add worker for Happy Puppy
  INSERT INTO public.workers (id, user_id, store_id, status)
  SELECT 'a4841dfd-4ab3-40bc-aaad-4e3b8e941363', user_id, hp_store_id, 'configured'
  WHERE NOT EXISTS (SELECT 1 FROM public.workers WHERE id = 'a4841dfd-4ab3-40bc-aaad-4e3b8e941363');
  
  RAISE NOTICE 'Happy Puppy credentials added successfully!';
END $$;

-- Verify
SELECT 'Stores' as table_name, count(*) as count FROM public.stores
UNION ALL
SELECT 'API Creds', count(*) FROM public.api_credentials
UNION ALL
SELECT 'User Creds', count(*) FROM public.user_credentials
UNION ALL
SELECT 'AI Configs', count(*) FROM public.ai_configs
UNION ALL
SELECT 'Workers', count(*) FROM public.workers;
