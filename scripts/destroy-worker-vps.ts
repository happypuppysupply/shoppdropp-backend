import { HetznerService } from '../src/services/hetznerService';
import { db } from '../src/db/supabase';

async function destroyWorkerVPS(workerId: string) {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    console.error('HETZNER_API_TOKEN not set');
    process.exit(1);
  }

  const hetzner = new HetznerService(token);

  try {
    // Get worker details
    const worker = await db.getWorkerById(workerId);
    if (!worker) {
      console.error('Worker not found:', workerId);
      process.exit(1);
    }

    console.log('Worker found:', {
      id: worker.id,
      hetzner_server_id: worker.hetzner_server_id,
      ip_address: worker.ip_address,
      status: worker.status
    });

    // Destroy server if exists
    if (worker.hetzner_server_id) {
      console.log(`\n🗑️  Destroying Hetzner server ${worker.hetzner_server_id}...`);
      try {
        await hetzner.deleteServer(parseInt(worker.hetzner_server_id));
        console.log('✅ Server destroyed');
      } catch (err: any) {
        console.error('❌ Failed to destroy server:', err.message);
      }
    }

    // Update worker status
    await db.updateWorker(workerId, {
      status: 'idle',
      ip_address: null,
      hetzner_server_id: null,
    });
    console.log('✅ Worker record updated');

    console.log('\n✅ Cleanup complete! You can now reprovision.');
    
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

const workerId = process.argv[2] || 'c7ffc636-ed74-4c84-a402-e26fe7ed2a77';
destroyWorkerVPS(workerId);
