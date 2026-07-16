import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';
import { createVPSProvisioner } from '../services/vpsProvisioner';

const router = Router();

// Retry provisioning for an existing worker
router.post('/retry/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    console.log(`[Retry] Retrying provisioning for worker: ${workerId}`);

    const worker = await db.getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    if (worker.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Update worker status back to provisioning
    await db.updateWorker(workerId, { status: 'provisioning' });

    // Start provisioning
    const provisioner = createVPSProvisioner();
    
    // Get AI config
    const aiConfig = await db.getAIConfig(user.id);
    const envVars: Record<string, string> = {};
    if (aiConfig) {
      envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
      envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
      envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
    }

    // Start async provisioning
    (async () => {
      try {
        console.log('[Retry] Starting provisionVPS...');
        const result = await provisioner.provisionVPS({
          workerId,
          storeId: worker.store_id!,
          userId: user.id,
          envVars,
        });
        console.log('[Retry] Provisioning result:', result);
        if (result.status === 'failed') {
          console.error('[Retry] Provisioning failed:', result.error);
          await db.updateWorker(workerId, { status: 'error' });
        } else {
          console.log(`[Retry] Provisioning complete: ${result.ipAddress}`);
        }
      } catch (error: any) {
        console.error('[Retry] CRITICAL ERROR:', error);
        await db.updateWorker(workerId, { status: 'error' });
      }
    })();

    res.json({
      success: true,
      message: 'Retrying VPS provisioning',
      workerId,
    });

  } catch (error: any) {
    console.error('Retry error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
