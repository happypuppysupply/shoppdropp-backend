-- Add use_platform_ai column to ai_configs table
-- This allows users to use the platform's OpenRouter API key instead of their own

ALTER TABLE ai_configs
ADD COLUMN IF NOT EXISTS use_platform_ai BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN ai_configs.use_platform_ai IS 'When true, uses platform OPENROUTER_API_KEY instead of user-provided api_key_encrypted';

-- Update existing rows to infer use_platform_ai from data
-- If provider is openrouter and api_key_encrypted is null/empty, set use_platform_ai = true
UPDATE ai_configs
SET use_platform_ai = TRUE
WHERE provider = 'openrouter' 
  AND (api_key_encrypted IS NULL OR api_key_encrypted = '');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_configs_use_platform_ai 
ON ai_configs(use_platform_ai) 
WHERE use_platform_ai = TRUE;
