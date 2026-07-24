import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';
import { createVPSProvisioner } from '../services/vpsProvisioner';

const router = Router();

// Get worker for store (returns format expected by frontend)
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const storeId = req.query.store_id as string;
    
    let worker = null;
    let recent_tasks: any[] = [];
    
    // Get all workers for user and filter by store if needed
    const workers = await db.getWorkersByUser(user.id);
    
    if (storeId) {
      // Filter by store_id
      worker = workers.find(w => w.store_id === storeId) || null;
    } else {
      // Get first active worker (running, configuring, or provisioning)
      worker = workers.find(w => ['running', 'configuring', 'provisioning'].includes(w.status)) || workers[0] || null;
    }
    
    // Format worker for frontend
    const formattedWorker = worker ? {
      id: worker.id,
      server_id: worker.hetzner_server_id,
      ip: worker.ip_address,
      status: worker.status === 'running' ? 'active' : worker.status,
      uptime: worker.last_heartbeat ? Math.floor((Date.now() - new Date(worker.last_heartbeat).getTime()) / 1000 / 60) + 'm' : '-',
      cpu_percent: undefined,
      memory_percent: undefined,
      current_task: undefined
    } : null;
    
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({
      worker: formattedWorker,
      recent_tasks: recent_tasks
    });
  } catch (error) {
    console.error('Failed to fetch workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// Create a new worker and provision VPS
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { store_id } = req.body;

    // Create worker record
    const worker = await db.createWorker({
      id: uuidv4(),
      user_id: user.id,
      store_id: store_id || null,
      status: 'provisioning',
    });

    // Provision VPS asynchronously
    const provisioner = createVPSProvisioner();
    provisioner.provisionVPS({
      workerId: worker.id,
      storeId: store_id || '',
      userId: user.id,
      envVars: { STORE_ID: store_id || '', USER_ID: user.id },
    }).then(async (result) => {
      if (result.status === 'success') {
        await db.updateWorker(worker.id, {
          hetzner_server_id: String(result.serverId),
          ip_address: result.ipAddress,
          status: 'running',
        });
      } else {
        await db.updateWorker(worker.id, { status: 'error' });
      }
    }).catch(async (err) => {
      console.error('Worker provisioning failed:', err);
      await db.updateWorker(worker.id, { status: 'error' });
    });

    res.json({
      ...worker,
      message: 'Worker provisioning started. This will take 2-3 minutes.',
    });
  } catch (error: any) {
    console.error('Failed to create worker:', error);
    res.status(500).json({ error: error.message || 'Failed to create worker' });
  }
});

// Get worker status
router.get('/:id/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const worker = await db.getWorkerById(req.params.id);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    res.json({
      id: worker.id,
      status: worker.status,
      store_id: worker.store_id,
      last_heartbeat: worker.last_heartbeat,
      created_at: worker.created_at,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch worker status' });
  }
});

export default router;