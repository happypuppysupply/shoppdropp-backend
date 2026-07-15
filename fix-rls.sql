-- Fix RLS policies for stores table

-- Enable RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own stores" ON public.stores;
DROP POLICY IF EXISTS "Users can insert their own stores" ON public.stores;
DROP POLICY IF EXISTS "Users can update their own stores" ON public.stores;
DROP POLICY IF EXISTS "Users can delete their own stores" ON public.stores;

-- Create policies
CREATE POLICY "Users can view their own stores" 
    ON public.stores FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stores" 
    ON public.stores FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stores" 
    ON public.stores FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stores" 
    ON public.stores FOR DELETE 
    USING (auth.uid() = user_id);

-- Also fix store_credentials table
ALTER TABLE public.store_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their store credentials" ON public.store_credentials;
DROP POLICY IF EXISTS "Users can insert their store credentials" ON public.store_credentials;

CREATE POLICY "Users can view their store credentials" 
    ON public.store_credentials FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM public.stores 
        WHERE stores.id = store_credentials.store_id 
        AND stores.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert their store credentials" 
    ON public.store_credentials FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.stores 
        WHERE stores.id = store_credentials.store_id 
        AND stores.user_id = auth.uid()
    ));

-- Fix user_credentials table
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "Users can insert their own credentials" ON public.user_credentials;

CREATE POLICY "Users can view their own credentials" 
    ON public.user_credentials FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials" 
    ON public.user_credentials FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Fix ai_configs table
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their AI config" ON public.ai_configs;
DROP POLICY IF EXISTS "Users can insert their AI config" ON public.ai_configs;

CREATE POLICY "Users can view their AI config" 
    ON public.ai_configs FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their AI config" 
    ON public.ai_configs FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.stores TO anon, authenticated;
GRANT ALL ON public.store_credentials TO anon, authenticated;
GRANT ALL ON public.user_credentials TO anon, authenticated;
GRANT ALL ON public.ai_configs TO anon, authenticated;

-- Fix sequence permissions (for auto-generated IDs)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
