-- Activity logs table for persistent workflow logging
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'success', 'error', 'warning', 'running')),
    task TEXT,
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast queries by user/store
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_store_id ON public.activity_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_worker_id ON public.activity_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- RLS policies
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own logs
CREATE POLICY activity_logs_select_policy ON public.activity_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own logs
CREATE POLICY activity_logs_insert_policy ON public.activity_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own logs (for cleanup)
CREATE POLICY activity_logs_delete_policy ON public.activity_logs
    FOR DELETE USING (auth.uid() = user_id);
