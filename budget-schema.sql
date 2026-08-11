-- Budget Guard Schema for OpenRouter Credit Management
-- Run this to add budget tracking tables to your Supabase database

-- Budget configuration table
CREATE TABLE IF NOT EXISTS budget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core budget settings
  weekly_limit_usd DECIMAL(10, 2) NOT NULL DEFAULT 60.00,
  weekly_spent_usd DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
  week_started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Behavior settings
  hard_stop_at DECIMAL(3, 2) NOT NULL DEFAULT 0.95,
  alert_thresholds JSONB NOT NULL DEFAULT '[0.5, 0.75, 0.9, 0.95]',
  max_request_cost_usd DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  estimate_buffer DECIMAL(3, 2) NOT NULL DEFAULT 1.20,
  
  -- Alert tracking
  last_alerted_at JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Each user can only have one budget config
  CONSTRAINT unique_user_budget UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE budget_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own budget config"
  ON budget_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budget config"
  ON budget_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budget config"
  ON budget_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budget config"
  ON budget_configs FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_budget_configs_user_id ON budget_configs(user_id);

-- Budget usage log (optional - for detailed tracking)
CREATE TABLE IF NOT EXISTS budget_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Request details
  model VARCHAR(255) NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd DECIMAL(10, 6) NOT NULL,
  
  -- Context
  request_type VARCHAR(50), -- 'chat', 'image', 'task', etc.
  worker_id UUID REFERENCES workers(id),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on usage logs
ALTER TABLE budget_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage logs"
  ON budget_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_budget_usage_logs_user_id ON budget_usage_logs(user_id);
CREATE INDEX idx_budget_usage_logs_created_at ON budget_usage_logs(created_at);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for budget_configs
DROP TRIGGER IF EXISTS update_budget_configs_updated_at ON budget_configs;
CREATE TRIGGER update_budget_configs_updated_at
  BEFORE UPDATE ON budget_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to reset weekly budget (can be called by cron)
CREATE OR REPLACE FUNCTION reset_weekly_budgets()
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER := 0;
BEGIN
  UPDATE budget_configs
  SET 
    weekly_spent_usd = 0,
    week_started_at = CURRENT_DATE,
    last_alerted_at = '{}',
    updated_at = NOW()
  WHERE week_started_at < CURRENT_DATE - INTERVAL '7 days';
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE budget_configs IS 'Stores weekly budget limits and spending for OpenRouter API usage';
COMMENT ON TABLE budget_usage_logs IS 'Detailed log of each API request cost for analytics';
COMMENT ON COLUMN budget_configs.hard_stop_at IS 'Percentage of budget at which to block requests (0.95 = 95%)';
COMMENT ON COLUMN budget_configs.estimate_buffer IS 'Multiplier for cost estimates (1.2 = 20% buffer)';
