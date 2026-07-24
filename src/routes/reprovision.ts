import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { VPSProvisionerFixed } from '../services/vpsProvisionerFixed';
import { HetznerService } from '../services/hetznerService';
import { db } from '../db/supabase';

const router = Router();

/**
 * POST /api/workers/:workerId/reprovision
 * Reprovision VPS with correct SSH key and deploy real worker
 */
router.post('/:workerId/reprovision', authenticate, async (req, res) => {
  try {
    const { workerId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get worker details
    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== userId) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // Destroy old server if exists
    if (worker.hetzner_server_id) {
      console.log(`[Reprovision] Destroying old server ${worker.hetzner_server_id}...`);
      try {
        const hetzner = new HetznerService(process.env.HETZNER_API_TOKEN || '');
        await hetzner.deleteServer(parseInt(worker.hetzner_server_id));
        console.log(`[Reprovision] Old server destroyed`);
      } catch (err: any) {
        console.warn(`[Reprovision] Failed to destroy old server: ${err.message}`);
      }
    }

    // Provision new VPS with correct SSH key
    console.log(`[Reprovision] Provisioning new VPS for worker ${workerId}...`);
    const hetzner = new HetznerService(process.env.HETZNER_API_TOKEN || '');
    const provisioner = new VPSProvisionerFixed(hetzner);
    
    const result = await provisioner.provisionVPS({
      workerId: worker.id,
      storeId: worker.store_id,
      userId: worker.user_id,
      envVars: {},
    });

    if (result.status === 'success') {
      res.json({
        success: true,
        message: 'VPS reprovisioned with real worker',
        server_id: result.serverId,
        ip_address: result.ipAddress,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Provisioning failed',
      });
    }

  } catch (err: any) {
    console.error('Reprovision error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
