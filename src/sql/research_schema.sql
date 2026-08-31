-- Research & Import Schema

-- Research runs table
CREATE TABLE public.research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  
  -- Cache identification
  cache_key text UNIQUE, -- hash of category+subcategory+productCount+priceRange
  cache_hit boolean DEFAULT false, -- true if we served from cache instead of Apify
  
  -- Onboarding data that drove this research
  category text NOT NULL,
  subcategory text NOT NULL,
  product_count integer NOT NULL,
  price_range jsonb, -- {min: 10, max: 50}
  target_audience text,
  brand_name text,
  
  -- Research status
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cached')),
  
  -- Activities log (like OpenClaw's activity stream)
  activities jsonb DEFAULT '[]'::jsonb,
  
  -- Results
  products jsonb DEFAULT '[]'::jsonb, -- array of found products
  products_found integer DEFAULT 0,
  products_verified integer DEFAULT 0, -- products that passed CJ check
  
  -- Cost tracking
  total_cost decimal(10,4) DEFAULT 0,
  estimated_cost decimal(10,4),
  
  -- Timing
  start_time timestamp with time zone DEFAULT timezone('utc'::text, now()),
  end_time timestamp with time zone,
  duration_seconds integer, -- calculated on completion
  
  -- Actors used
  actors_used jsonb DEFAULT '[]'::jsonb, -- list of which Apify actors were run
  
  -- Metadata
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Create index for fast cache lookups
CREATE INDEX idx_research_runs_cache_key ON public.research_runs(cache_key);
CREATE INDEX idx_research_runs_user_store ON public.research_runs(user_id, store_id);
CREATE INDEX idx_research_runs_category ON public.research_runs(category, subcategory);
CREATE INDEX idx_research_runs_status ON public.research_runs(status);
CREATE INDEX idx_research_runs_created ON public.research_runs(created_at DESC);

-- Research cache table (for reusing recent research)
-- This is the main cost-saving mechanism
CREATE TABLE public.research_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  
  -- The cache criteria
  category text NOT NULL,
  subcategory text NOT NULL,
  product_count integer NOT NULL,
  price_range jsonb,
  target_audience text,
  
  -- Cached results
  products jsonb NOT NULL, -- full product array
  products_count integer NOT NULL,
  
  -- Actors that were originally used
  actors_used jsonb DEFAULT '[]'::jsonb,
  
  -- Expiration
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  expires_at timestamp with time zone NOT NULL, -- typically 30 days
  
  -- Usage tracking
  times_used integer DEFAULT 0,
  last_used_at timestamp with time zone,
  
  -- Estimated savings
  cost_saved decimal(10,4) DEFAULT 0 -- how much $ saved by using cache
);

-- Create indexes for cache
CREATE INDEX idx_research_cache_key ON public.research_cache(cache_key);
CREATE INDEX idx_research_cache_expires ON public.research_cache(expires_at);
CREATE INDEX idx_research_cache_category ON public.research_cache(category, subcategory);

-- Product cache table (individual products cached)
-- For checking if a specific product has been researched before
CREATE TABLE public.product_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product identification
  name_hash text UNIQUE NOT NULL, -- md5 hash of normalized product name
  name text NOT NULL,
  category text NOT NULL,
  
  -- Cached data
  source_platforms jsonb DEFAULT '[]'::jsonb, -- ['tiktok', 'reddit', 'amazon']
  cj_data jsonb, -- CJ supplier info
  amazon_data jsonb, -- Amazon competitor data
  social_data jsonb, -- TikTok/Instagram/YouTube mentions
  
  -- Categorization
  product_type text, -- electronics, fashion, home, etc.
  estimated_markup decimal(5,2), -- percentage
  
  -- Cache lifecycle
  first_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  last_researched_at timestamp with time zone,
  times_researched integer DEFAULT 1,
  expires_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_product_cache_name_hash ON public.product_cache(name_hash);
CREATE INDEX idx_product_cache_category ON public.product_cache(category);
CREATE INDEX idx_product_cache_expires ON public.product_cache(expires_at);

-- Product imports table (track what was imported to Shopify)
CREATE TABLE public.product_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES public.research_runs(id) ON DELETE SET NULL,
  
  -- Import details
  total_products integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  skipped_count integer DEFAULT 0, -- already in store
  
  -- Detailed results per product
  results jsonb DEFAULT '[]'::jsonb, -- [{productId, shopifyProductId, success, error}]
  
  -- Import source
  imported_from text DEFAULT 'research', -- research, manual, cj_direct
  
  -- Timing
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  duration_seconds integer
);

CREATE INDEX idx_product_imports_user_store ON public.product_imports(user_id, store_id);
CREATE INDEX idx_product_imports_research ON public.product_imports(research_run_id);

-- Research cost tracking per user
CREATE TABLE public.research_cost_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  
  date date NOT NULL DEFAULT CURRENT_DATE,
  month text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  
  -- Costs
  api_cost_usd decimal(10,4) DEFAULT 0, -- actual Apify costs
  compute_cost_usd decimal(10,4) DEFAULT 0, -- any compute costs
  
  -- Savings from cache
  cache_hits integer DEFAULT 0,
  cache_savings_usd decimal(10,4) DEFAULT 0,
  
  -- Totals
  total_runs integer DEFAULT 0,
  total_products_found integer DEFAULT 0,
  
  UNIQUE(user_id, date)
);

-- Popular research criteria (for pre-warming cache)
CREATE TABLE public.popular_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  criteria jsonb NOT NULL, -- full criteria object
  request_count integer DEFAULT 1,
  last_requested_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  -- Precompute if popular enough
  should_precompute boolean DEFAULT false,
  precomputed_at timestamp with time zone,
  
  UNIQUE(criteria)
);

-- RLS Policies

-- Users can only see their own research
ALTER TABLE public.research_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own research runs"
  ON public.research_runs FOR ALL
  USING (auth.uid() = user_id);

-- Cache is global but read-only for users
ALTER TABLE public.research_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read cache"
  ON public.research_cache FOR SELECT
  USING (true);

-- Users can only see their own imports
ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own imports"
  ON public.product_imports FOR ALL
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER research_runs_updated_at BEFORE UPDATE ON public.research_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate cache key from onboarding data
CREATE OR REPLACE FUNCTION generate_research_cache_key(
  p_category text,
  p_subcategory text,
  p_product_count integer,
  p_price_min decimal,
  p_price_max decimal,
  p_target_audience text DEFAULT NULL
) RETURNS text AS $$
BEGIN
  -- Create a consistent hash key from the criteria
  -- We round price ranges to make cache hits more likely
  RETURN encode(
    digest(
      lower(trim(p_category)) || '|' ||
      lower(trim(p_subcategory)) || '|' ||
      p_product_count::text || '|' ||
      round(p_price_min / 5) * 5 || '|' || 
      round(p_price_max / 5) * 5 || '|' ||
      COALESCE(lower(trim(p_target_audience)), ''),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if cache is valid
CREATE OR REPLACE FUNCTION is_cache_valid(
  p_cache_key text
) RETURNS boolean AS $$
DECLARE
  v_expires_at timestamp with time zone;
BEGIN
  SELECT expires_at INTO v_expires_at
  FROM public.research_cache
  WHERE cache_key = p_cache_key;
  
  RETURN v_expires_at IS NOT NULL AND v_expires_at > timezone('utc'::text, now());
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get cached research
CREATE OR REPLACE FUNCTION get_cached_research(
  p_cache_key text
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Update usage stats
  UPDATE public.research_cache
  SET 
    times_used = times_used + 1,
    last_used_at = timezone('utc'::text, now())
  WHERE cache_key = p_cache_key;
  
  -- Return products
  SELECT to_jsonb(t)
  INTO v_result
  FROM (
    SELECT 
      products,
      products_count,
      actors_used,
      calculate_cost_saved(cache_key) as estimated_savings
    FROM public.research_cache
    WHERE cache_key = p_cache_key
  ) t;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Helper function to calculate savings
CREATE OR REPLACE FUNCTION calculate_cost_saved(
  p_cache_key text
) RETURNS decimal AS $$
DECLARE
  v_actors_cost decimal := 0;
BEGIN
  SELECT COALESCE(
    (SELECT sum(CASE 
      WHEN jsonb_array_elements->>'actor' = 'tiktok' THEN 0.05
      WHEN jsonb_array_elements->>'actor' = 'reddit' THEN 0.08
      WHEN jsonb_array_elements->>'actor' = 'amazon' THEN 0.10
      ELSE 0.05
    END)
    FROM research_cache, jsonb_array_elements(actors_used)
    WHERE cache_key = p_cache_key),
    0.25  -- default estimate
  ) INTO v_actors_cost;
  
  RETURN v_actors_cost;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments on tables
COMMENT ON TABLE public.research_runs IS 'Tracks all research activities with streaming activity logs';
COMMENT ON TABLE public.research_cache IS 'Cache of completed research results to avoid re-running Apify actors';
COMMENT ON TABLE public.product_cache IS 'Individual product cache for checking if product has been researched';
COMMENT ON COLUMN public.research_runs.cache_key IS 'Hash of the research criteria - used for cache lookups';
COMMENT ON COLUMN public.research_runs.cache_hit IS 'True if we served from cache instead of calling Apify';

-- Insert some indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_research_cache_times_used 
  ON public.research_cache(times_used DESC) 
  WHERE expires_at > timezone('utc'::text, now());
