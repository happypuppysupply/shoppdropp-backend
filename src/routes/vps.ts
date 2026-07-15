import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { createVPSProvisioner, VPSProvisioner } from '../services/vpsProvisioner';
import { getHetznerService } from '../services/hetznerService';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get or create VPS provisioner
function getProvisioner(): VPSProvisioner {
  return createVPSProvisioner();
}

// Provision a new VPS for a worker
router.post('/provision/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;
    const { envVars = {} } = req.body;

    // Verify worker belongs to user
    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // Get store credentials to include in env
    if (!worker.store_id) {
      return res.status(400).json({ error: 'Worker has no store assigned' });
    }
    const store = await db.getStoreById(worker.store_id);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Get API credentials for the store
    const credentials = await db.getCredentialsByStore(store.id);
    const storeEnvVars: Record<string, string> = {};

    for (const cred of credentials) {
      try {
        const data = JSON.parse(cred.encrypted_data);
        switch (cred.type) {
          case 'shopify':
            storeEnvVars.SHOPIFY_STORE_URL = (store as any).shopify_store_url || (store as any).url || '';
            storeEnvVars.SHOPIFY_ACCESS_TOKEN = data.access_token || '';
            break;
          case 'cj_dropshipping':
            storeEnvVars.CJ_DROPSHIPPING_API_KEY = data.api_key || '';
            storeEnvVars.CJ_DROPSHIPPING_EMAIL = data.email || '';
            break;
          case 'meta_ads':
            storeEnvVars.META_ADS_ACCESS_TOKEN = data.access_token || '';
            storeEnvVars.META_ADS_ACCOUNT_ID = data.account_id || '';
            break;
        }
      } catch (e) {
        console.warn(`Failed to parse credentials for ${cred.type}`);
      }
    }

    // Get AI config
    const aiConfig = await db.getAIConfig(user.id);
    if (aiConfig) {
      storeEnvVars.AI_PROVIDER = aiConfig.provider;
      storeEnvVars.AI_MODEL = aiConfig.model;
      storeEnvVars.AI_API_KEY = aiConfig.api_key_encrypted; // This should be decrypted
    }

    // Merge all env vars
    const mergedEnvVars = {
      ...storeEnvVars,
      ...envVars,
    };

    // Start provisioning
    const provisioner = getProvisioner();
    
    // Update worker status
    await db.updateWorker(workerId, { status: 'provisioning' });

    // Start async provisioning
    provisioner.provisionVPS({
      workerId,
      storeId: store.id,
      userId: user.id,
      envVars: mergedEnvVars,
    }).then(result => {
      if (result.status === 'failed') {
        console.error(`[VPS] Provisioning failed for worker ${workerId}:`, result.error);
      } else {
        console.log(`[VPS] Provisioning complete for worker ${workerId}: ${result.ipAddress}`);
      }
    }).catch(error => {
      console.error(`[VPS] Unexpected error provisioning worker ${workerId}:`, error);
    });

    // Return immediately - provisioning happens async
    res.json({
      success: true,
      message: 'VPS provisioning started',
      workerId,
      status: 'provisioning',
    });

  } catch (error: any) {
    console.error('VPS provision error:', error);
    res.status(500).json({ error: error.message || 'Failed to provision VPS' });
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
    const hetzner = getHetznerService();
    const server = await hetzner.getServer(parseInt(worker.hetzner_server_id!));

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

// Get VPS metrics
router.get('/metrics/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    if (!worker.hetzner_server_id) {
      return res.status(400).json({ error: 'VPS not provisioned' });
    }

    const provisioner = getProvisioner();
    const metrics = await provisioner.getServerMetrics(parseInt(worker.hetzner_server_id!));

    res.json(metrics);

  } catch (error: any) {
    console.error('VPS metrics error:', error);
    res.status(500).json({ error: error.message || 'Failed to get metrics' });
  }
});

// Reboot VPS
router.post('/reboot/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    if (!worker.hetzner_server_id) {
      return res.status(400).json({ error: 'VPS not provisioned' });
    }

    const provisioner = getProvisioner();
    await provisioner.rebootVPS(parseInt(worker.hetzner_server_id!));

    res.json({ success: true, message: 'VPS reboot initiated' });

  } catch (error: any) {
    console.error('VPS reboot error:', error);
    res.status(500).json({ error: error.message || 'Failed to reboot VPS' });
  }
});

// Destroy VPS
router.delete('/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;

    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    if (!worker.hetzner_server_id) {
      return res.status(400).json({ error: 'VPS not provisioned' });
    }

    const provisioner = getProvisioner();
    await provisioner.destroyVPS(parseInt(worker.hetzner_server_id!), workerId);

    res.json({ success: true, message: 'VPS destroyed' });

  } catch (error: any) {
    console.error('VPS destroy error:', error);
    res.status(500).json({ error: error.message || 'Failed to destroy VPS' });
  }
});

// List available server types
router.get('/server-types', authenticate, async (req: Request, res: Response) => {
  try {
    const hetzner = getHetznerService();
    const types = await hetzner.listServerTypes();
    
    // Filter to shared types (cx11, cx21, cx31, etc)
    const sharedTypes = types.filter((t: any) => t.name.startsWith('cx'));
    
    res.json(sharedTypes.map((t: any) => ({
      name: t.name,
      description: t.description,
      cores: t.cores,
      memory: t.memory,
      disk: t.disk,
      prices: t.prices,
    })));

  } catch (error: any) {
    console.error('Server types error:', error);
    res.status(500).json({ error: error.message || 'Failed to get server types' });
  }
});

// List available locations
router.get('/locations', authenticate, async (req: Request, res: Response) => {
  try {
    const hetzner = getHetznerService();
    const locations = await hetzner.listLocations();
    
    res.json(locations.map((l: any) => ({
      name: l.name,
      description: l.description,
      city: l.city,
      country: l.country,
    })));

  } catch (error: any) {
    console.error('Locations error:', error);
    res.status(500).json({ error: error.message || 'Failed to get locations' });
  }
});

export default router;
