-- Add onboarding_step column if it doesn't exist (for backward compatibility)
ALTER TABLE public.store_configs 
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;

-- Sync onboarding_step with current_question_index for existing records
UPDATE public.store_configs 
SET onboarding_step = COALESCE(current_question_index + 1, 1)
WHERE onboarding_step IS NULL OR onboarding_step = 1;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_store_configs_onboarding_step 
ON public.store_configs(onboarding_step);
