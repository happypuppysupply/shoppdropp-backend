-- Add missing is_active column to api_credentials
ALTER TABLE api_credentials ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add research_complete flag to store_configs
ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS research_complete boolean DEFAULT false;
ALTER TABLE store_configs ADD COLUMN IF NOT EXISTS research_results jsonb DEFAULT '{}'::jsonb;
