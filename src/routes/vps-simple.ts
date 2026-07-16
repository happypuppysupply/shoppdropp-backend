import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Simple create worker and provision
router.post('/create-and-provision', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    console.log('Create and provision called by user:', user.id);

    // Get user's stores
    const stores = await db.getStoresByUser(user.id);
    console.log('Found stores:', stores.length);
    
    if (stores.length === 0) {
      return res.status(404).json({ error: 'No store found. Create a store first.' });
    }
    
    const store = stores[0];
    console.log('Using store:', store.id, store.name);

    // Check if store already has a worker by querying workers table
    const workers = await db.getWorkersByUser(user.id);
    const existingWorker = workers.find(w => w.store_id === store.id);
    if (existingWorker && existingWorker.status !== 'error') {
      console.log('Store already has worker:', existingWorker.id);
      return res.json({
        success: true,
        message: 'Worker already exists',
        workerId: existingWorker.id,
        status: existingWorker.status,
      });
    }

    // Create a new worker with store_id
    const workerId = uuidv4();
    console.log('Creating worker:', workerId);
    
    await db.createWorker({
      id: workerId,
      user_id: user.id,
      store_id: store.id,
      status: 'provisioning',
    });
    
    console.log('Worker created, starting provisioning...');

    // Start provisioning
    let provisioner;
    try {
      provisioner = createVPSProvisioner();
    } catch (initError: any) {
      console.error('[VPS] Failed to initialize provisioner:', initError.message);
      await db.updateWorker(workerId, { status: 'error' });
      return res.status(500).json({ 
        error: 'Failed to initialize VPS provisioner', 
        details: initError.message 
      });
    }
    
    // Get AI config for the env vars
    const aiConfig = await db.getAIConfig(user.id);
    const envVars: Record<string, string> = {};
    
    if (aiConfig) {
      envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
      envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
      envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
    }

    // Start async provisioning with proper error handling
    (async () => {
      try {
        console.log('[VPS] Starting provisionVPS with config:', { workerId, storeId: store.id, userId: user.id });
        const result = await provisioner.provisionVPS({
          workerId,
          storeId: store.id,
          userId: user.id,
          envVars,
        });
        console.log('[VPS] Provisioning result:', result);
        if (result.status === 'failed') {
          console.error('[VPS] Provisioning failed:', result.error);
          await db.updateWorker(workerId, { status: 'error' });
        } else {
          console.log(`[VPS] Provisioning complete: ${result.ipAddress}`);
        }
      } catch (error: any) {
        console.error('[VPS] CRITICAL ERROR in provisionVPS:', error);
        console.error('[VPS] Error message:', error.message);
        console.error('[VPS] Error stack:', error.stack);
        try {
          await db.updateWorker(workerId, { status: 'error' });
        } catch (dbError) {
          console.error('[VPS] Failed to update worker status:', dbError);
        }
      }
    })();

    console.log('Returning success response');
    res.json({
      success: true,
      message: 'Worker created and VPS provisioning started',
      workerId,
      storeId: store.id,
      status: 'provisioning',
    });

  } catch (error: any) {
    console.error('Create and provision error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create worker and provision VPS',
      details: error.stack || 'No stack trace'
    });
  }
});

// Get VPS status
router.get('/status/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // If no Hetzner server ID, return basic status
    if (!worker.hetzner_server_id) {
      return res.json({
        workerId,
        status: worker.status,
        provisioned: false,
      });
    }

    // Get fresh data from Hetzner
    const { getHetznerService } = await import('../services/hetznerService');
    const hetzner = getHetznerService();
    const server = await hetzner.getServer(parseInt(worker.hetzner_server_id));

    res.json({
      workerId,
      status: worker.status,
      provisioned: true,
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
        type: server.server_type.name,
        cores: server.server_type.cores,
        memory: server.server_type.memory,
        disk: server.server_type.disk,
        ip: server.public_net.ipv4.ip,
        created: server.created,
      },
    });
  } catch (error: any) {
    console.error('VPS status error:', error);
    res.status(500).json({ error: error.message || 'Failed to get VPS status' });
  }
});

export default router;
