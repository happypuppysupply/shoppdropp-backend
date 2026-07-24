-- Worker commands table for task queueing
CREATE TABLE IF NOT EXISTS public.worker_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('provision', 'destroy', 'reboot', 'status', 'run_task', 'cancel_task')),
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB,
    error TEXT
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_worker_commands_worker_id ON public.worker_commands(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_commands_user_id ON public.worker_commands(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_commands_status ON public.worker_commands(status);
CREATE INDEX IF NOT EXISTS idx_worker_commands_created_at ON public.worker_commands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_commands_worker_status ON public.worker_commands(worker_id, status);

-- RLS policies
ALTER TABLE public.worker_commands ENABLE ROW LEVEL SECURITY;

-- Users can only see their own commands
CREATE POLICY worker_commands_select_policy ON public.worker_commands
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own commands
CREATE POLICY worker_commands_insert_policy ON public.worker_commands
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own commands (for marking complete/failed)
CREATE POLICY worker_commands_update_policy ON public.worker_commands
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own commands (for cleanup)
CREATE POLICY worker_commands_delete_policy ON public.worker_commands
    FOR DELETE USING (auth.uid() = user_id);
