// Direct store creation script
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://tdokcqkdtwzhjvdkspls.supabase.co';
const SUPABASE_KEY = 'sb_secret_x6lrusDKJ6R5w_FGt-wzBw_PwKkpRyh';

// Hardcoded user ID from auth.users
const USER_ID = '4917a55a-59c3-4d41-af49-b95c678b63d1';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function createStore() {
  console.log('🚀 Creating Happy Puppy Supply store...\n');

  try {
    // Load secrets
    const loadSecret = (name) => {
      try {
        return fs.readFileSync(path.join(__dirname, '../../.secrets', name), 'utf8').trim();
      } catch (e) { return ''; }
    };

    const cjToken = loadSecret('cj_dropshipping_token');
    const githubToken = loadSecret('github_token_new');
    const vercelToken = loadSecret('vercel_token_new');
    const openrouterKey = loadSecret('openrouter_api_key');

    console.log('API Keys loaded: ✅\n');

    // Create store
    const storeId = uuidv4();
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .insert({
        id: storeId,
        user_id: USER_ID,
        name: 'Happy Puppy Supply',
      })
      .select()
      .single();

    if (storeErr) {
      console.error('❌ Store error:', storeErr);
      return;
    }

    console.log(`✅ Store: ${store.name} (${store.id})`);

    // Add CJ Dropshipping
    if (cjToken) {
      await supabase.from('api_credentials').insert({
        id: uuidv4(),
        store_id: storeId,
        type: 'cj_dropshipping',
        encrypted_data: JSON.stringify({ token: cjToken }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('✅ CJ Dropshipping');
    }

    // Add AI config
    if (openrouterKey) {
      await supabase.from('ai_configs').insert({
        id: uuidv4(),
        user_id: USER_ID,
        provider: 'openrouter',
        model: 'moonshotai/kimi-k2.5',
        api_key_encrypted: openrouterKey, // Should be encrypted in production
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('✅ OpenRouter AI');
    }

    // Add user credentials
    if (githubToken) {
      await supabase.from('user_credentials').insert({
        id: uuidv4(),
        user_id: USER_ID,
        type: 'github',
        encrypted_data: JSON.stringify({ token: githubToken }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('✅ GitHub');
    }

    if (vercelToken) {
      await supabase.from('user_credentials').insert({
        id: uuidv4(),
        user_id: USER_ID,
        type: 'vercel',
        encrypted_data: JSON.stringify({ token: vercelToken }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('✅ Vercel');
    }

    // Create worker
    const workerId = uuidv4();
    await supabase.from('workers').insert({
      id: workerId,
      user_id: USER_ID,
      store_id: storeId,
      status: 'configured',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update store with worker
    await supabase.from('stores').update({ worker_id: workerId }).eq('id', storeId);

    console.log(`✅ Worker: ${workerId}`);

    console.log('\n🎉 Happy Puppy Supply store created successfully!');
    console.log(`\nStore ID: ${storeId}`);
    console.log(`Worker ID: ${workerId}`);
    console.log('\n⏳ Shopify Admin token still needed to activate full automation');

  } catch (err) {
    console.error('❌ Error:', err);
  }
}

createStore();
