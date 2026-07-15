// Script to create Happy Puppy Supply store with all API credentials
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/db/supabase';

// Configuration
const HAPPY_PUPPY_CONFIG = {
  // Store info
  storeName: 'Happy Puppy Supply',
  storeUrl: 'https://happypuppysupply.myshopify.com',
  platform: 'shopify',
  
  // Load from environment or secrets
  cjToken: process.env.CJ_DROPSHIPPING_TOKEN || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  vercelToken: process.env.VERCEL_TOKEN || '',
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  
  // User ID (will need to find or create)
  userId: process.env.USER_ID || '',
};

async function createHappyPuppyStore() {
  console.log('🚀 Creating Happy Puppy Supply store...\n');

  try {
    // Step 1: Get or find a user (using existing demo user or create one)
    let userId = HAPPY_PUPPY_CONFIG.userId;
    
    if (!userId) {
      // Find existing user from demo
      const { data: users, error: userError } = await db.supabase
        .from('users')
        .select('*')
        .limit(1);
      
      if (userError) {
        console.error('❌ Error finding user:', userError);
        return;
      }
      
      if (users && users.length > 0) {
        userId = users[0].id;
        console.log(`✅ Found user: ${users[0].email} (${userId})`);
      } else {
        console.error('❌ No users found in database');
        return;
      }
    }

    // Step 2: Create the store
    const storeId = uuidv4();
    const { data: store, error: storeError } = await db.supabase
      .from('stores')
      .insert({
        id: storeId,
        user_id: userId,
        name: HAPPY_PUPPY_CONFIG.storeName,
        url: HAPPY_PUPPY_CONFIG.storeUrl,
        platform: HAPPY_PUPPY_CONFIG.platform,
        status: 'active',
        worker_id: null, // Will be set after worker creation
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (storeError) {
      console.error('❌ Error creating store:', storeError);
      return;
    }

    console.log(`✅ Store created: ${store.name} (${store.id})`);

    // Step 3: Add CJ Dropshipping credentials
    if (HAPPY_PUPPY_CONFIG.cjToken) {
      const cjCredId = uuidv4();
      await db.supabase
        .from('api_credentials')
        .insert({
          id: cjCredId,
          store_id: storeId,
          type: 'cj_dropshipping',
          encrypted_data: JSON.stringify({
            token: HAPPY_PUPPY_CONFIG.cjToken,
            name: 'CJ Dropshipping Primary',
          }),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      console.log('✅ CJ Dropshipping credentials added');
    }

    // Step 4: Add AI Provider config (OpenRouter - user level)
    if (HAPPY_PUPPY_CONFIG.openrouterKey) {
      await db.supabase
        .from('ai_configs')
        .upsert({
          user_id: userId,
          provider: 'openrouter',
          model: 'moonshotai/kimi-k2.5',
          api_key: HAPPY_PUPPY_CONFIG.openrouterKey,
          updated_at: new Date().toISOString(),
        });
      console.log('✅ OpenRouter AI config added');
    }

    // Step 5: Add GitHub credentials (user level)
    if (HAPPY_PUPPY_CONFIG.githubToken) {
      await db.supabase
        .from('user_credentials')
        .upsert({
          user_id: userId,
          type: 'github',
          encrypted_data: JSON.stringify({
            token: HAPPY_PUPPY_CONFIG.githubToken,
          }),
          updated_at: new Date().toISOString(),
        });
      console.log('✅ GitHub credentials added');
    }

    // Step 6: Add Vercel credentials (user level)
    if (HAPPY_PUPPY_CONFIG.vercelToken) {
      await db.supabase
        .from('user_credentials')
        .upsert({
          user_id: userId,
          type: 'vercel',
          encrypted_data: JSON.stringify({
            token: HAPPY_PUPPY_CONFIG.vercelToken,
          }),
          updated_at: new Date().toISOString(),
        });
      console.log('✅ Vercel credentials added');
    }

    // Step 7: Create worker for the store
    const workerId = uuidv4();
    await db.supabase
      .from('workers')
      .insert({
        id: workerId,
        user_id: userId,
        store_id: storeId,
        status: 'pending', // Will be 'active' when provisioned
        config: JSON.stringify({
          vps_type: 'docker', // or 'hetzner' for production
          region: 'us-east',
          plan: 'payg',
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    
    // Update store with worker ID
    await db.supabase
      .from('stores')
      .update({ worker_id: workerId })
      .eq('id', storeId);
    
    console.log(`✅ Worker created: ${workerId}`);

    console.log('\n🎉 Happy Puppy Supply store setup complete!');
    console.log('\nStore Details:');
    console.log(`  - ID: ${storeId}`);
    console.log(`  - Name: ${HAPPY_PUPPY_CONFIG.storeName}`);
    console.log(`  - URL: ${HAPPY_PUPPY_CONFIG.storeUrl}`);
    console.log(`  - Worker: ${workerId}`);
    console.log(`  - Status: active ( Shopify token pending)`);
    console.log('\nNext Steps:');
    console.log('  1. Add Shopify Admin API token when ready');
    console.log('  2. Provision worker ( ./manage-workers.sh start )');
    console.log('  3. Test CJ Dropshipping product sync');
    console.log('  4. Activate AI automation');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  createHappyPuppyStore();
}

export { createHappyPuppyStore };
