-- Fix workers table status constraint to match code
-- The code uses: provisioning, configuring, running, error, idle, assigned

-- Drop the existing constraint
ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_status_check;

-- Add new constraint with all valid statuses
ALTER TABLE public.workers ADD CONSTRAINT workers_status_check 
  CHECK (status IN ('idle', 'assigned', 'provisioning', 'configuring', 'running', 'error'));

-- Also fix stores table if needed
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_status_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_status_check 
  CHECK (status IN ('pending', 'provisioning', 'active', 'error'));
