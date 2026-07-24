-- Product research results table
CREATE TABLE IF NOT EXISTS public.product_research_results (
    id TEXT PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    products_found INTEGER NOT NULL DEFAULT 0,
    products_imported INTEGER NOT NULL DEFAULT 0,
    top_products JSONB,
    analysis JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_research_store_id ON public.product_research_results(store_id);
CREATE INDEX IF NOT EXISTS idx_research_user_id ON public.product_research_results(user_id);
CREATE INDEX IF NOT EXISTS idx_research_status ON public.product_research_results(status);
CREATE INDEX IF NOT EXISTS idx_research_created_at ON public.product_research_results(created_at DESC);

-- RLS
ALTER TABLE public.product_research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_select_policy ON public.product_research_results
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY research_insert_policy ON public.product_research_results
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY research_update_policy ON public.product_research_results
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY research_delete_policy ON public.product_research_results
    FOR DELETE USING (auth.uid() = user_id);
