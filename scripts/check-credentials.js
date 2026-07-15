const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://tdokcqkdtwzhjvdkspls.supabase.co', '***');

async function check() {
  console.log('Checking Happy Puppy credentials...\n');
  
  // Get store
  const { data: stores, error: storeErr } = await supabase
    .from('stores')
    .select('*');
    
  if (storeErr) {
    console.log('Store error:', storeErr);
    return;
  }
  
  console.log('Stores found:', stores?.length || 0);
  stores?.forEach(s => console.log('  -', s.id, s.name));
  
  const happyPuppy = stores?.find(s => s.name === 'Happy Puppy Supply');
  if (!happyPuppy) {
    console.log('\n❌ Happy Puppy store not found');
    return;
  }
  
  console.log('\n✅ Happy Puppy ID:', happyPuppy.id);
  
  // Check api_credentials
  const { data: creds } = await supabase
    .from('api_credentials')
    .select('*')
    .eq('store_id', happyPuppy.id);
    
  console.log('\nAPI Credentials:', creds?.length || 0);
  creds?.forEach(c => console.log('  -', c.type));
  
  // Check user credentials
  const { data: userCreds } = await supabase
    .from('user_credentials')
    .select('*');
    
  console.log('\nUser Credentials:', userCreds?.length || 0);
  userCreds?.forEach(c => console.log('  -', c.type, 'for user', c.user_id));
  
  // Check AI configs
  const { data: aiConfigs } = await supabase
    .from('ai_configs')
    .select('*');
    
  console.log('\nAI Configs:', aiConfigs?.length || 0);
  aiConfigs?.forEach(a => console.log('  -', a.provider, a.model));
}

check();
