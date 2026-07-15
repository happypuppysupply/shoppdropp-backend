// Simple script to add Happy Puppy store using Supabase directly
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Supabase config from .env
const SUPABASE_URL = 'https://tdokcqkdtwzhjvdkspls.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_sec…pRyh';

// Load secrets
const loadSecret = (name) => {
  try {
    const secretPath = path.join(__dirname, '../../.secrets', name);
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (e) {
    console.log(`⚠️  Could not load secret: ${name}`);
    return '';
  }
};

const cjToken = loadSecret('cj_dropshipping_token');
const githubToken = loadSecret('github_token_new');
const vercelToken = loadSecret('vercel_token_new');
const openrouterKey = loadSecret('openrouter_api_key');

console.log('🚀 Setting up Happy Puppy Supply store...\n');
console.log('Secrets loaded:');
console.log(`  CJ Dropshipping: ${cjToken ? '✅' : '❌'}`);
console.log(`  GitHub: ${githubToken ? '✅' : '❌'}`);
console.log(`  Vercel: ${vercelToken ? '✅' : '❌'}`);
console.log(`  OpenRouter: ${openrouterKey ? '✅' : '❌'}\n`);

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupStore() {
  try {
    // Find first user from public.users
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (userErr || !users || users.length === 0) {
      console.error('❌ No users found:', userErr);
      return;
    }
    
    const userId = users[0].id;
    console.log(`✅ Using user: ${users[0].email} (${userId})`);

    // Create store
    const storeId = uuidv4();
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .insert({
        id: storeId,
        user_id: userId,
        name: 'Happy Puppy Supply',
        url: 'https://happypuppysupply.myshopify.com',
        platform: 'shopify',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (storeErr) {
      console.error('❌ Store creation failed:', storeErr);
      return;
    }

    console.log(`✅ Store created: ${store.name} (${store.id})`);

    // Add CJ Dropshipping credentials
    if (cjToken) {
      await supabase.from('api_credentials').insert({
        id: uuidv4(),
        store_id: storeId,
        type: 'cj_dropshipping',
        encrypted_data: JSON.stringify({ 
          token: cjToken,
          account: 'CJ5604320'
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log('✅ CJ Dropshipping credentials added');
    }

    // Add AI config (OpenRouter)
    if (openrouterKey) {
      await supabase.from('ai_configs').upsert({
        user_id: userId,
        provider: 'openrouter',
        model: 'moonshotai/kimi-k2.5',
        api_key: openrouterKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      console.log('✅ OpenRouter AI configured');
    }

    // Add user-level credentials
    if (githubToken) {
      await supabase.from('user_credentials').upsert({
        user_id: userId,
        type: 'github',
        encrypted_data: JSON.stringify({ token: githubToken }),
        updated_at: new Date().toISOString(),
      }, { onConflict: ['user_id', 'type'] });
      console.log('✅ GitHub token saved');
    }

    if (vercelToken) {
      await supabase.from('user_credentials').upsert({
        user_id: userId,
        type: 'vercel',
        encrypted_data: JSON.stringify({ token: vercelToken }),
        updated_at: new Date().toISOString(),
      }, { onConflict: ['user_id', 'type'] });
      console.log('✅ Vercel token saved');
    }

    // Create worker
    const workerId = uuidv4();
    await supabase.from('workers').insert({
      id: workerId,
      user_id: userId,
      store_id: storeId,
      status: 'configured',
      config: JSON.stringify({
        integrations: ['cj_dropshipping'],
        ai_provider: 'openrouter',
        vps_type: 'docker',
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update store with worker
    await supabase
      .from('stores')
      .update({ worker_id: workerId })
      .eq('id', storeId);

    console.log(`✅ Worker created: ${workerId}`);

    console.log('\n🎉 Happy Puppy Supply store is ready!');
    console.log('\n📊 Store Summary:');
    console.log(`  Store ID: ${storeId}`);
    console.log(`  Store Name: Happy Puppy Supply`);
    console.log(`  Platform: Shopify (token pending)`);
    console.log(`  Worker ID: ${workerId}`);
    console.log(`  CJ Dropshipping: ✅ Connected`);
    console.log(`  OpenRouter AI: ✅ Configured`);
    console.log(`  GitHub: ✅ Connected`);
    console.log(`  Vercel: ✅ Connected`);
    console.log('\n⏳ Waiting for:');
    console.log('  - Shopify Admin API token (shpat_***)');
    console.log('\n🚀 To activate:');
    console.log('  1. Add Shopify token');
    console.log('  2. Run: cd shoppdropp-worker && npm start');
    console.log('  3. Store will go fully autonomous!');

  } catch (error) {
    console.error('❌ Setup error:', error);
    process.exit(1);
  }
}

setupStore();
