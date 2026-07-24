#!/usr/bin/env tsx
/**
 * Cleanup Script: Destroy all Hetzner servers and clean worker records
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const HETZNER_TOKEN = 'IHNzEimEzFAm8WWjf7wK5JBlaFSdzSvI471FhU5hyc3VSnt6dxCdopfF17pu19eE';

const supabase = createClient(
  'https://tdokcqkdtwzhjvdkspls.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkb2tjcWtkdHd6aGp2ZGtzcGxzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzYzOTY2OSwiZXhwIjoyMDk5MjE1NjY5fQ.eMI-s6rz9hVRmQB2UVOESlYTKpGE8SXLGprKpcxcrp0'
);

const hetznerClient = axios.create({
  baseURL: 'https://api.hetzner.cloud/v1',
  headers: {
    'Authorization': `Bearer ${HETZNER_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function cleanup() {
  console.log('🔥 HETZNER CLEANUP INITIATED\n');

  // Step 1: List all servers
  console.log('📋 Listing all Hetzner servers...');
  let servers: any[] = [];
  try {
    const response = await hetznerClient.get('/servers');
    servers = response.data.servers || [];
    console.log(`Found ${servers.length} servers\n`);
    for (const s of servers) {
      console.log(`  - ${s.id}: ${s.name} (${s.status}) - ${s.public_net?.ipv4?.ip || 'no IP'}`);
    }
    console.log('');
  } catch (err: any) {
    console.error('❌ Failed to list servers:', err.response?.data?.error?.message || err.message);
    // Continue anyway to clean up DB
  }

  if (servers.length > 0) {
    console.log('💥 Destroying servers...\n');
    let destroyed = 0;
    let failed = 0;

    for (const server of servers) {
      try {
        console.log(`Server ${server.id} (${server.name}) - destroying...`);
        await hetznerClient.delete(`/servers/${server.id}`);
        console.log(`  ✅ Destroyed`);
        destroyed++;
        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        console.log(`  ❌ Failed: ${err.response?.data?.error?.message || err.message}`);
        failed++;
      }
    }

    console.log(`\n📊 Destroyed: ${destroyed}, Failed: ${failed}\n`);
  } else {
    console.log('No servers to destroy.\n');
  }

  // Step 2: Clear worker_id from stores
  console.log('🔗 Clearing worker_id references from stores...');
  const { error: clearError } = await supabase
    .from('stores')
    .update({ worker_id: null })
    .not('worker_id', 'is', null);

  if (clearError) {
    console.error('❌ Failed to clear worker_id:', clearError.message);
  } else {
    console.log('✅ Cleared worker_id references from stores');
  }

  // Step 3: Delete all worker records
  console.log('\n🗑️  Cleaning worker records...');
  const { data: workers, error: fetchError } = await supabase
    .from('workers')
    .select('id');

  if (fetchError) {
    console.error('❌ Failed to fetch workers:', fetchError.message);
    return;
  }

  console.log(`Found ${workers?.length || 0} worker records`);

  if (workers && workers.length > 0) {
    const { error: deleteError, count } = await supabase
      .from('workers')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error('❌ Failed to delete workers:', deleteError.message);
    } else {
      console.log(`✅ Deleted ${count || workers.length} worker records`);
    }
  }

  // Step 4: Verify
  const { data: remaining, error: verifyError } = await supabase
    .from('workers')
    .select('id');

  if (!verifyError) {
    console.log(`\n📊 Remaining workers: ${remaining?.length || 0}`);
  }

  console.log('\n🎉 Cleanup complete!');
}

cleanup().catch(console.error);
