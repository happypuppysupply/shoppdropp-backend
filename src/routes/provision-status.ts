import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db, supabase } from '../db/supabase';

const router = Router();

/**
 * GET /api/provision/status/:workerId
 * Get provisioning progress for a worker
 */
router.get('/status/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    // Get worker
    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // Get provisioning logs
    const { data: logs, error } = await supabase
      .from('worker_logs')
      .select('*')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Determine overall status
    let status = worker.status;
    let progress = 0;
    let currentStep = '';
    let steps: any[] = [];

    if (logs && logs.length > 0) {
      steps = logs.map(log => ({
        step: log.step_number,
        name: log.step_name,
        progress: log.progress_percent,
        message: log.message,
        timestamp: log.created_at,
      }));

      // Get latest step
      const latest = steps[steps.length - 1];
      progress = latest.progress;
      currentStep = latest.name;
    }

    // Calculate overall progress based on status
    if (status === 'running') {
      progress = 100;
    } else if (status === 'error') {
      progress = progress || 0;
    }

    res.json({
      workerId,
      status,
      progress,
      currentStep,
      steps,
      serverIp: worker.ip_address,
      serverId: worker.hetzner_server_id,
      gatewayUrl: worker.ip_address ? `http://${worker.ip_address}:3001` : null,
    });

  } catch (error: any) {
    console.error('Provision status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/provision/:workerId/complete
 * Mark provisioning as complete (called after WebSocket test)
 */
router.post('/:workerId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // Update worker status to running
    await db.updateWorker(workerId, {
      status: 'running',
      updated_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Provisioning completed successfully',
      workerId,
      gatewayUrl: worker.ip_address ? `http://${worker.ip_address}:3001` : null,
    });

  } catch (error: any) {
    console.error('Complete provision error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
