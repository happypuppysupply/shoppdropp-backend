-- Create memory entries table for AI training/context
CREATE TABLE IF NOT EXISTS public.memory_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.memory_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own memory entries"
  ON public.memory_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory entries"
  ON public.memory_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory entries"
  ON public.memory_entries FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_memory_entries_user_store 
ON public.memory_entries(user_id, store_id);

CREATE INDEX IF NOT EXISTS idx_memory_entries_type 
ON public.memory_entries(type);
