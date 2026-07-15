const { createClient } = require('@supabase/supabase-js');

// Load from environment
const SUPABASE_URL = 'https://tdokcqkdtwzhjvdkspls.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('Checking credentials...\n');
  
  const { data: stores } = await supabase.from('stores').select('*');
  console.log('Stores:', stores?.length || 0);
  stores?.forEach(s => console.log('  -', s.name));
}

check();
