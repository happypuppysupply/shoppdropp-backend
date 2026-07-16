import { Router, Request, Response } from 'express';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Synchronous test - waits for full provisioning
router.post('/sync-provision', async (req: Request, res: Response) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('=== SYNC PROVISION TEST ===');
    
    const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
    const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
    const workerId = uuidv4();
    
    // Create worker
    log(`Creating worker: ${workerId}`);
    await db.createWorker({
      id: workerId,
      user_id: userId,
      store_id: storeId,
      status: 'provisioning',
    });
    
    // Create provisioner
    log('Creating provisioner...');
    const provisioner = createVPSProvisioner();
    
    // Get AI config
    const aiConfig = await db.getAIConfig(userId);
    const envVars: Record<string, string> = {};
    if (aiConfig) {
      envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
      envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
      envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
    }
    
    // Provision synchronously
    log('Starting provisionVPS (this may take 2-3 minutes)...');
    const result = await provisioner.provisionVPS({
      workerId,
      storeId,
      userId,
      envVars,
    });
    
    log(`Provisioning result: ${JSON.stringify(result)}`);
    
    res.json({
      success: result.status === 'success',
      workerId,
      result,
      logs,
    });

  } catch (error: any) {
    log(`CRITICAL ERROR: ${error.message}`);
    log(`Stack: ${error.stack}`);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      logs,
    });
  }
});

export default router;
