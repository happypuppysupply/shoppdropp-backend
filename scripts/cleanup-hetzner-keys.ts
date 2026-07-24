import { HetznerService } from '../src/services/hetznerService';

async function cleanupHetznerKeys() {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    console.error('HETZNER_API_TOKEN not set');
    process.exit(1);
  }

  const hetzner = new HetznerService(token);

  console.log('🔍 Fetching all Hetzner SSH keys...');
  
  try {
    // Get all SSH keys
    const keys = await hetzner.listSSHKeys();
    console.log(`Found ${keys.length} SSH keys`);

    if (keys.length === 0) {
      console.log('✅ No SSH keys to clean up');
      return;
    }

    // Delete each key
    for (const key of keys) {
      console.log(`\n🗑️  Deleting SSH key ${key.id} (${key.name})...`);
      try {
        await hetzner.deleteSSHKey(key.id);
        console.log(`✅ Deleted SSH key ${key.id}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        console.error(`❌ Failed to delete SSH key ${key.id}:`, err.message);
      }
    }

    console.log('\n✅ SSH key cleanup complete!');
    
    // Verify
    const remaining = await hetzner.listSSHKeys();
    console.log(`Remaining SSH keys: ${remaining.length}`);
    
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

cleanupHetznerKeys();
