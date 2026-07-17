const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tdokcqkdtwzhjvdkspls.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkb2tjcWtkdHd6aGp2ZGtzcGxzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDA4MjE0NywiZXhwIjoyMDQ5NjU4MTQ3fQ.Sv0S8w9KqyaKf0UcRKeH4fI0HNFLHm2aNFD2D3dB1lQ'
);

async function createStore() {
  const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
  const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
  
  // Check if store exists
  const { data: existing } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single();
    
  if (existing) {
    console.log('Store already exists:', existing);
    return;
  }
  
  // Create the store
  const { data, error } = await supabase
    .from('stores')
    .insert({
      id: storeId,
      user_id: userId,
      name: 'Happy Puppy Supply',
      url: 'https://happypuppysupply.com',
      platform: 'shopify',
      status: 'active',
      worker_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
    
  if (error) {
    console.error('Error creating store:', error);
  } else {
    console.log('Store created successfully:', data);
  }
}

createStore();
