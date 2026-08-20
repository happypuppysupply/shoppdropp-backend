-- Add current_question_index to store_configs for tracking onboarding progress
ALTER TABLE public.store_configs 
ADD COLUMN IF NOT EXISTS current_question_index INTEGER DEFAULT 0;

-- Add onboarding_answers as JSONB for storing all answers
ALTER TABLE public.store_configs 
ADD COLUMN IF NOT EXISTS onboarding_answers JSONB DEFAULT '{}'::jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_store_configs_question_index 
ON public.store_configs(current_question_index);
