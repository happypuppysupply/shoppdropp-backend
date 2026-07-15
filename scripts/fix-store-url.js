const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tdokcqkdtwzhjvdkspls.supabase.co';
const SUPABASE_KEY = 'eyJhbG…-4-Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fix() {
  console.log('Fixing Happy Puppy store URL...');
  
  const { data, error } = await supabase
    .from('stores')
    .update({ url: 'https://happypuppysupply.myshopify.com' })
    .eq('name', 'Happy Puppy Supply');
    
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('✅ Store URL updated');
    console.log('Data:', data);
  }
}

fix();
