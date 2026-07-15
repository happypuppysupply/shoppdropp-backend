// Fix missing schema tables
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://tdokcqkdtwzhjvdkspls.supabase.co', '***');

async function fixSchema() {
  console.log('🔧 Fixing schema...');
  
  // Create users table if not exists
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS public.users (
      id uuid references auth.users on delete cascade primary key,
      email text unique not null,
      stripe_customer_id text,
      stripe_subscription_id text,
      plan text default 'payg' check (plan in ('payg', 'growth', 'agency')),
      status text default 'active' check (status in ('active', 'inactive', 'suspended')),
      created_at timestamp with time zone default timezone('utc'::text, now()),
      updated_at timestamp with time zone default timezone('utc'::text, now())
    );
  `;
  
  const { error: usersErr } = await supabase.rpc('exec_sql', { sql: createUsersTable });
  if (usersErr) {
    console.log('Users table error:', usersErr.message);
    // Try alternative: direct insert
    try {
      await supabase.from('users').insert({
        id: '4917a55a-59c3-4d41-af49-b95c678b63d1',
        email: 'lendsquid@gmail.com',
        plan: 'payg',
        status: 'active',
      });
      console.log('✅ User record created');
    } catch (e) {
      console.log('Insert error:', e.message);
    }
  } else {
    console.log('✅ Users table created');
  }
  
  // Insert the user
  console.log('Done!');
}

// Use raw SQL approach instead
async function directFix() {
  const USER_ID = '4917a55a-59c3-4d41-af49-b95c678b63d1';
  
  try {
    // Try inserting user directly - this will fail if table doesn't exist
    const { error } = await supabase.from('users').insert({
      id: USER_ID,
      email: 'lendsquid@gmail.com',
      plan: 'payg',
      status: 'active',
    });
    
    if (error) {
      console.log('❌ Could not create user:', error.message);
      console.log('');
      console.log('The schema needs to be applied. Run this SQL in Supabase:');
      console.log('');
      console.log(`
-- Create users table
CREATE TABLE public.users (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'payg',
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Insert user
INSERT INTO public.users (id, email, plan, status) 
VALUES ('${USER_ID}', 'lendsquid@gmail.com', 'payg', 'active');

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only view own record" 
  ON public.users FOR SELECT 
  USING (auth.uid() = id);
      `);
    } else {
      console.log('✅ User record created');
    }
  } catch (e) {
    console.error(e);
  }
}

directFix();
