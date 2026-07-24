#!/usr/bin/env tsx
/**
 * Sync Worker IPs from Hetzner
 * Fetches IP addresses for workers that have hetzner_server_id but null ip_address
 */

import { createClient } from '@supabase/supabase-js';
import { HetznerService } from '../src/services/hetznerService';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function syncWorkerIPs() {
  console.log('🔍 Fetching workers with missing IP addresses...\n');

  // Get workers with hetzner_server_id but no ip_address
  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, hetzner_server_id, ip_address, status')
    .not('hetzner_server_id', 'is', null)
    .is('ip_address', null);

  if (error) {
    console.error('❌ Failed to fetch workers:', error.message);
    process.exit(1);
  }

  if (!workers || workers.length === 0) {
    console.log('✅ All workers already have IP addresses. Nothing to sync.');
    return;
  }

  console.log(`Found ${workers.length} workers needing IP sync:\n`);

  const hetzner = new HetznerService(process.env.HETZNER_API_TOKEN!);
  let updated = 0;
  let failed = 0;

  for (const worker of workers) {
    try {
      console.log(`Worker ${worker.id.slice(0, 8)}... | Server ${worker.hetzner_server_id} | Status: ${worker.status}`);

      const serverId = parseInt(worker.hetzner_server_id!, 10);
      if (isNaN(serverId)) {
        console.log(`  ⚠️ Invalid server ID: ${worker.hetzner_server_id}`);
        failed++;
        continue;
      }

      const server = await hetzner.getServer(serverId);
      const ip = server.public_net.ipv4.ip;

      // Update worker record
      const { error: updateError } = await supabase
        .from('workers')
        .update({ ip_address: ip })
        .eq('id', worker.id);

      if (updateError) {
        console.log(`  ❌ Update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✅ Updated with IP: ${ip}`);
        updated++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (err: any) {
      console.log(`  ❌ Hetzner fetch failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Sync complete: ${updated} updated, ${failed} failed`);
}

syncWorkerIPs().catch(console.error);
