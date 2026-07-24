import { HetznerService } from '../src/services/hetznerService';

async function cleanupHetzner() {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    console.error('HETZNER_API_TOKEN not set');
    process.exit(1);
  }

  const hetzner = new HetznerService(token);

  console.log('🔍 Fetching all Hetzner servers...');
  
  try {
    // Get all servers
    const servers = await hetzner.listServers();
    console.log(`Found ${servers.length} servers`);

    if (servers.length === 0) {
      console.log('✅ No servers to clean up');
      return;
    }

    // Delete each server
    for (const server of servers) {
      console.log(`\n🗑️  Deleting server ${server.id} (${server.name})...`);
      try {
        await hetzner.deleteServer(server.id);
        console.log(`✅ Deleted server ${server.id}`);
        // Wait a bit between deletions
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.error(`❌ Failed to delete server ${server.id}:`, err.message);
      }
    }

    console.log('\n✅ Cleanup complete!');
    
    // Verify
    const remaining = await hetzner.listServers();
    console.log(`Remaining servers: ${remaining.length}`);
    
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

cleanupHetzner();
