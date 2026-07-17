import { Router, Request, Response } from 'express';
import { db } from '../db/supabase';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Track active provisions (in-memory, per-instance)
const activeProvisions = new Map<string, {
  status: 'running' | 'completed' | 'failed';
  logs: string[];
  result?: any;
  error?: string;
}>();

// Debug: Start async provision
router.post('/debug-provision', async (req: Request, res: Response) => {
  try {
    const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
    const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
    const workerId = uuidv4();
    
    // Check env vars
    const hetznerToken = process.env.HETZNER_API_TOKEN;
    const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
    
    if (!hetznerToken || !sshPrivateKey) {
      return res.status(500).json({ 
        error: 'Missing env vars: HETZNER_API_TOKEN or SSH_PRIVATE_KEY' 
      });
    }

    // Create worker record
    await db.createWorker({
      id: workerId,
      user_id: userId,
      store_id: storeId,
      status: 'provisioning',
    });

    // Link worker to store so dashboard can find it
    await db.updateStore(storeId, { worker_id: workerId });

    // Start provision in background (don't await)
    runProvision(workerId, userId, storeId);

    // Return immediately with worker ID
    return res.json({
      success: true,
      workerId,
      message: 'Provisioning started. Poll /api/vps-debug/provision-status/:workerId for updates.',
    });

  } catch (error: any) {
    console.error('Error starting provision:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Get provision status
router.get('/provision-status/:workerId', async (req: Request, res: Response) => {
  try {
    const { workerId } = req.params;
    
    // Get worker from DB
    const worker = await db.getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Get active provision logs if available
    const provision = activeProvisions.get(workerId);
    
    res.json({
      workerId: worker.id,
      status: worker.status,
      hetznerServerId: worker.hetzner_server_id,
      createdAt: worker.created_at,
      logs: provision?.logs || [],
      error: provision?.error,
      result: provision?.result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run provision in background
async function runProvision(workerId: string, userId: string, storeId: string) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(`[Provision ${workerId.slice(0, 8)}] ${msg}`);
    logs.push(line);
  };
  
  activeProvisions.set(workerId, { status: 'running', logs });
  
  try {
    log('=== PROVISION START ===');
    
    const provisioner = createVPSProvisioner();
    
    // Get AI config
    let aiConfig;
    try {
      aiConfig = await db.getAIConfig(userId);
      log(`AI config: ${aiConfig ? aiConfig.provider : 'not found'}`);
    } catch (e: any) {
      log(`Warning: Could not load AI config: ${e.message}`);
    }
    
    const envVars: Record<string, string> = {};
    if (aiConfig) {
      envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
      envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
      envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
    }
    
    log('Starting VPS provision...');
    const result = await provisioner.provisionVPS({
      workerId,
      storeId,
      userId,
      envVars,
    });
    
    log(`Provision result: ${JSON.stringify(result)}`);
    
    if (result.status === 'failed') {
      activeProvisions.set(workerId, {
        status: 'failed',
        logs,
        error: result.error,
      });
    } else {
      activeProvisions.set(workerId, {
        status: 'completed',
        logs,
        result,
      });
      
      // Update store with server info
      try {
        await db.updateStore(storeId, {
          hetzner_server_id: result.serverId.toString(),
          ip_address: result.ipAddress,
        });
        log(`Store ${storeId} updated with server info`);
      } catch (e: any) {
        log(`Warning: Failed to update store with server info: ${e.message}`);
      }
    }
    
    log('=== PROVISION COMPLETE ===');
    
  } catch (error: any) {
    log(`CRITICAL ERROR: ${error.message}`);
    log(`Stack: ${error.stack}`);
    
    activeProvisions.set(workerId, {
      status: 'failed',
      logs,
      error: error.message,
    });
    
    // Update worker status to error
    try {
      await db.updateWorker(workerId, { status: 'error' });
    } catch (e) {
      log(`Failed to update worker status: ${e}`);
    }
  }
}

export default router;
