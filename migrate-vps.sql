-- Migration: Add VPS columns to existing workers table
-- Run this after create-full-schema.sql if workers table already exists

-- Add new columns to workers table (if not exists)
DO $$ 
BEGIN
  -- Add hetzner_server_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='workers' AND column_name='hetzner_server_id') THEN
    ALTER TABLE public.workers ADD COLUMN hetzner_server_id text;
  END IF;

  -- Add hetzner_server_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='workers' AND column_name='hetzner_server_type') THEN
    ALTER TABLE public.workers ADD COLUMN hetzner_server_type text;
  END IF;

  -- Add ssh_key_fingerprint
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='workers' AND column_name='ssh_key_fingerprint') THEN
    ALTER TABLE public.workers ADD COLUMN ssh_key_fingerprint text;
  END IF;

  -- Add openclaw_version
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='workers' AND column_name='openclaw_version') THEN
    ALTER TABLE public.workers ADD COLUMN openclaw_version text;
  END IF;

  -- Update status check constraint
  ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_status_check;
  ALTER TABLE public.workers ADD CONSTRAINT workers_status_check 
    CHECK (status IN ('idle', 'assigned', 'provisioning', 'configuring', 'running', 'error'));

END $$;

-- Update api_credentials type constraint
ALTER TABLE public.api_credentials DROP CONSTRAINT IF EXISTS api_credentials_type_check;
ALTER TABLE public.api_credentials ADD CONSTRAINT api_credentials_type_check 
  CHECK (type IN ('shopify', 'meta_ads', 'autods', 'cj_dropshipping', 'rapidapi'));

-- Verify migration
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'workers' 
ORDER BY ordinal_position;
