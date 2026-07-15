-- Fix Happy Puppy Store Visibility
-- Run this SQL in your Supabase SQL Editor

-- 1. Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.users (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'payg' check (plan in ('payg', 'growth', 'agency')),
  status text default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create other missing tables
CREATE TABLE IF NOT EXISTS public.workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  store_id uuid references public.stores(id) on delete set null,
  status text default 'idle',
  container_id text,
  ip_address text,
  last_heartbeat timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  type text not null,
  encrypted_data text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(store_id, type)
);

CREATE TABLE IF NOT EXISTS public.ai_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  api_key_encrypted text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS public.user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  encrypted_data text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, type)
);

-- 3. Insert user record (the missing link!)
INSERT INTO public.users (id, email, plan, status)
VALUES ('4917a55a-59c3-4d41-af49-b95c678b63d1', 'lendsquid@gmail.com', 'payg', 'active')
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policy
CREATE POLICY IF NOT EXISTS "Users can only view own record" 
  ON public.users FOR SELECT 
  USING (auth.uid() = id);

-- 6. Update store to ensure it has proper foreign key (add constraint)
-- First verify the store exists
SELECT * FROM public.stores WHERE name = 'Happy Puppy Supply';

-- 7. Add foreign key constraint to stores (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_user_id_fkey'
  ) THEN
    ALTER TABLE public.stores 
    ADD CONSTRAINT stores_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 8. Enable RLS on stores if not already
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policy for stores
CREATE POLICY IF NOT EXISTS "Users can CRUD own stores" 
  ON public.stores FOR ALL 
  USING (auth.uid() = user_id);

-- 10. Move the worker record from script to proper table
-- First check if worker exists
SELECT * FROM public.workers WHERE store_id IN (
  SELECT id FROM public.stores WHERE name = 'Happy Puppy Supply'
);

-- Update workers table RLS
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users can view own workers" 
  ON public.workers FOR SELECT 
  USING (auth.uid() = user_id);

-- 11. Update API credentials RLS
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users can CRUD credentials for own stores" 
  ON public.api_credentials FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = api_credentials.store_id
      AND stores.user_id = auth.uid()
    )
  );

-- 12. Verify everything
SELECT 'Users:' as table_name, count(*) FROM public.users
UNION ALL
SELECT 'Stores:', count(*) FROM public.stores
UNION ALL
SELECT 'Workers:', count(*) FROM public.workers
UNION ALL
SELECT 'API Creds:', count(*) FROM public.api_credentials;
