-- ShoppDropp Supabase Schema

-- Enable RLS
alter table auth.users enable row level security;

-- Users table (extends auth.users)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'payg' check (plan in ('payg', 'growth', 'agency')),
  status text default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Stores table
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  name text not null,
  url text not null,
  platform text default 'shopify',
  worker_id uuid,
  status text default 'pending' check (status in ('pending', 'provisioning', 'active', 'error')),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- API Credentials table (encrypted)
create table public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade not null,
  type text not null check (type in ('shopify', 'meta_ads', 'autods')),
  encrypted_data text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(store_id, type)
);

-- Workers table
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  store_id uuid references public.stores(id) on delete set null,
  status text default 'idle' check (status in ('idle', 'assigned', 'running', 'error')),
  container_id text,
  ip_address text,
  last_heartbeat timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Tasks table
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade not null,
  type text not null check (type in ('product_research', 'catalog_sync', 'price_optimization', 'meta_ads_sync', 'inventory_sync')),
  status text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  payload jsonb default '{}',
  result jsonb,
  error text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Policies

-- Users: only view own record
alter table public.users enable row level security;
create policy "Users can only view own record"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can only update own record"
  on public.users for update
  using (auth.uid() = id);

-- Stores: users can CRUD own stores
alter table public.stores enable row level security;
create policy "Users can CRUD own stores"
  on public.stores for all
  using (auth.uid() = user_id);

-- API Credentials: users can CRUD credentials for own stores
alter table public.api_credentials enable row level security;
create policy "Users can CRUD credentials for own stores"
  on public.api_credentials for all
  using (
    exists (
      select 1 from public.stores
      where stores.id = api_credentials.store_id
      and stores.user_id = auth.uid()
    )
  );

-- Workers: users can view own workers
alter table public.workers enable row level security;
create policy "Users can view own workers"
  on public.workers for select
  using (auth.uid() = user_id);

-- Tasks: users can view tasks for own workers
alter table public.tasks enable row level security;
create policy "Users can view tasks for own workers"
  on public.tasks for select
  using (
    exists (
      select 1 from public.workers
      where workers.id = tasks.worker_id
      and workers.user_id = auth.uid()
    )
  );

-- Functions

-- Update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger users_updated_at before update on public.users
  for each row execute function update_updated_at_column();

create trigger stores_updated_at before update on public.stores
  for each row execute function update_updated_at_column();

create trigger api_credentials_updated_at before update on public.api_credentials
  for each row execute function update_updated_at_column();

create trigger workers_updated_at before update on public.workers
  for each row execute function update_updated_at_column();

create trigger tasks_updated_at before update on public.tasks
  for each row execute function update_updated_at_column();

-- Indexes
create index idx_stores_user_id on public.stores(user_id);
create index idx_stores_worker_id on public.stores(worker_id);
create index idx_api_credentials_store_id on public.api_credentials(store_id);
create index idx_workers_user_id on public.workers(user_id);
create index idx_workers_store_id on public.workers(store_id);
create index idx_tasks_worker_id on public.tasks(worker_id);