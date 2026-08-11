import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { HetznerService } from '../services/hetznerService';
import { loadSSHKeys } from '../services/sshKeyHelper';
import { NodeSSH } from 'node-ssh';
import { installOpenClawGateway, verifyGatewayHealth } from '../services/openclawInstaller';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Track active provisions
const activeProvisions = new Map<string, {
  status: 'running' | 'completed' | 'failed';
  logs: string[];
  result?: any;
  error?: string;
}>();

/**
 * POST /api/workers/:workerId/reprovision
 * Reprovision VPS with correct SSH key and deploy real OpenClaw Gateway
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

    // Reset worker status
    await db.updateWorker(workerId, {
      status: 'provisioning',
      hetzner_server_id: null,
      ip_address: null,
    });

    // Start provision in background
    runProvision(workerId, userId, worker.store_id || '');

    res.json({
      success: true,
      message: 'VPS reprovisioning started',
      workerId: workerId,
    });

  } catch (err: any) {
    console.error('Reprovision error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Run provision in background
async function runProvision(workerId: string, userId: string, storeId: string) {
  const logs: string[] = [];
  const logStep = async (stepNumber: number, stepName: string, progress: number, message: string) => {
    const line = `[${new Date().toISOString()}] Step ${stepNumber}: ${stepName} - ${progress}% - ${message}`;
    console.log(`[Provision ${workerId.slice(0, 8)}] ${line}`);
    logs.push(line);
    
    // Persist to database
    try {
      await db.supabase.from('worker_logs').insert({
        id: uuidv4(),
        worker_id: workerId,
        step_number: stepNumber,
        step_name: stepName,
        progress,
        message,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to persist log:', e);
    }
  };
  
  activeProvisions.set(workerId, { status: 'running', logs });
  
  const hetznerToken = process.env.HETZNER_API_TOKEN;
  if (!hetznerToken) {
    throw new Error('HETZNER_API_TOKEN not configured');
  }
  
  const hetzner = new HetznerService(hetznerToken);
  const keys = loadSSHKeys();
  const serverName = `shoppdropp-worker-${workerId.slice(0, 8)}`;
  
  try {
    await logStep(1, 'Initialize Provisioning', 10, 'Starting VPS provisioning...');
    
    // Step 1: Check for and delete existing server with same name
    await logStep(1, 'Destroy Old VPS', 20, 'Checking for existing servers...');
    try {
      const existingServers = await hetzner.listServers();
      const existingServer = existingServers.find(s => s.name === serverName);
      if (existingServer) {
        await logStep(1, 'Destroy Old VPS', 40, `Deleting existing server ${existingServer.id}...`);
        await hetzner.deleteServer(existingServer.id);
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (e: any) {
      console.log('No existing server or error:', e.message);
    }
    await logStep(1, 'Destroy Old VPS', 100, 'Cleanup complete');
    
    // Step 2: Upload SSH key to Hetzner
    await logStep(2, 'Upload SSH Key', 30, 'Ensuring SSH key is uploaded...');
    const sshKeys = await hetzner.listSSHKeys();
    let sshKeyId: number;
    
    const existingKey = sshKeys.find(k => k.name === 'shoppdropp-render-rsa') || 
                       sshKeys.find(k => k.name === 'shoppdropp-render');
    
    if (existingKey) {
      sshKeyId = existingKey.id;
      await logStep(2, 'Upload SSH Key', 80, `Using existing key: ${existingKey.name}`);
    } else {
      const newKey = await hetzner.createSSHKey('shoppdropp-render-rsa', keys.publicKey);
      sshKeyId = newKey.id;
      await logStep(2, 'Upload SSH Key', 80, `Created new key: ${newKey.id}`);
    }
    await logStep(2, 'Upload SSH Key', 100, 'SSH key ready');
    
    // Step 3: Create Hetzner server
    await logStep(3, 'Create Hetzner Server', 20, 'Creating server instance...');
    const server = await hetzner.createServer({
      name: serverName,
      server_type: 'cpx12',
      image: 'ubuntu-22.04',
      location: 'nbg1',
      labels: { worker_id: workerId, store_id: storeId, user_id: userId }
    }, sshKeyId);
    await logStep(3, 'Create Hetzner Server', 100, `Server ${server.id} created`);
    
    // Step 4: Wait for server to be ready
    await logStep(4, 'Wait for Server Ready', 30, 'Waiting for server to be running...');
    const readyServer = await hetzner.waitForServerReady(server.id, 180000);
    const ipAddress = readyServer.public_net.ipv4.ip;
    await logStep(4, 'Wait for Server Ready', 100, `Server ready at ${ipAddress}`);
    
    // Update worker record with server info
    await db.updateWorker(workerId, {
      hetzner_server_id: server.id.toString(),
      ip_address: ipAddress,
      status: 'configuring',
    });
    
    // Step 5: Wait for SSH to be available
    await logStep(5, 'Connect via SSH', 10, 'Waiting for SSH service (90s)...');
    await new Promise(r => setTimeout(r, 90000));
    
    // Step 6: SSH Connect and Install OpenClaw
    await logStep(5, 'Connect via SSH', 40, 'Connecting via SSH...');
    const ssh = new NodeSSH();
    let connected = false;
    
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await logStep(5, 'Connect via SSH', 50 + attempt * 8, `SSH attempt ${attempt}/5...`);
        await ssh.connect({
          host: ipAddress,
          username: 'root',
          privateKey: keys.privateKey,
          readyTimeout: 30000,
        });
        connected = true;
        await logStep(5, 'Connect via SSH', 100, `SSH connected on attempt ${attempt}`);
        break;
      } catch (err: any) {
        console.log(`SSH attempt ${attempt} failed:`, err.message);
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, 30000));
        }
      }
    }
    
    if (!connected) {
      throw new Error('Failed to connect via SSH after 5 attempts');
    }
    
    // Step 7: Install OpenClaw Gateway
    await logStep(6, 'Install OpenClaw', 20, 'Installing OpenClaw Gateway...');
    const installResult = await installOpenClawGateway(ssh, ipAddress, {
      userId,
      workerId,
      storeId
    });
    
    if (!installResult.success) {
      throw new Error(`OpenClaw installation failed: ${installResult.error}`);
    }
    await logStep(6, 'Install OpenClaw', 100, 'OpenClaw Gateway installed');
    
    // Step 8: Verify Gateway Health
    await logStep(7, 'Health Check', 50, 'Verifying OpenClaw Gateway...');
    const isHealthy = await verifyGatewayHealth(ipAddress, 15);
    
    if (!isHealthy) {
      throw new Error('OpenClaw Gateway health check failed');
    }
    await logStep(7, 'Health Check', 100, 'Gateway is healthy');
    
    // Step 9: Mark as running
    await logStep(8, 'Ready', 100, 'VPS worker is ready');
    await db.updateWorker(workerId, { status: 'running' });
    
    // Update store
    await db.updateStore(storeId, {
      hetzner_server_id: server.id.toString(),
      ip_address: ipAddress,
    });
    
    activeProvisions.set(workerId, {
      status: 'completed',
      logs,
      result: { serverId: server.id, ipAddress, gatewayUrl: `http://${ipAddress}:3001` }
    });
    
    console.log(`[Provision ${workerId.slice(0, 8)}] === PROVISION COMPLETE ===`);
    
  } catch (error: any) {
    console.error(`[Provision ${workerId.slice(0, 8)}] CRITICAL ERROR:`, error);
    
    await logStep(99, 'Error', 0, `Provisioning failed: ${error.message}`);
    
    activeProvisions.set(workerId, {
      status: 'failed',
      logs,
      error: error.message,
    });
    
    try {
      await db.updateWorker(workerId, { status: 'error' });
    } catch (e) {
      console.error('Failed to update worker status:', e);
    }
  }
}

export default router;
