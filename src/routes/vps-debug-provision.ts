import { Router, Request, Response } from 'express';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';
import { HetznerService } from '../services/hetznerService';
import { loadSSHKeys } from '../services/sshKeyHelper';
import { NodeSSH } from 'node-ssh';
import { installOpenClawGateway, verifyGatewayHealth } from '../services/openclawInstaller';

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

// Get worker logs from database
router.get('/worker-logs/:workerId', async (req: Request, res: Response) => {
  try {
    const { workerId } = req.params;
    
    // Get worker from DB
    const worker = await db.getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Get logs from database
    const dbLogs = await db.getWorkerLogs(workerId);
    
    // Get active provision logs if available
    const provision = activeProvisions.get(workerId);
    
    res.json({
      workerId: worker.id,
      status: worker.status,
      logs: dbLogs || [],
      activeLogs: provision?.logs || [],
      error: provision?.error || worker.error_message,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Retry provisioning from failed step
router.post('/retry-provision/:workerId', async (req: Request, res: Response) => {
  try {
    const { workerId } = req.params;
    const { fromStep } = req.body;
    
    // Get worker from DB
    const worker = await db.getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Can only retry from failed or error status
    if (worker.status !== 'failed' && worker.status !== 'error') {
      return res.status(400).json({ 
        error: `Cannot retry worker with status '${worker.status}'. Must be 'failed' or 'error'.` 
      });
    }
    
    // Clear old error logs from active provisions
    activeProvisions.delete(workerId);
    
    // Clear error logs from database
    await db.clearWorkerLogs(workerId);
    
    // Reset worker status to 'provisioning'
    await db.updateWorker(workerId, { 
      status: 'provisioning',
      error_message: null,
    });
    
    // Restart provision in background (don't await)
    runProvision(workerId, worker.user_id, worker.store_id || '', { fromStep });
    
    // Return immediately
    return res.json({
      success: true,
      workerId,
      fromStep,
      message: 'Provisioning retry started. Poll /api/vps-debug/provision-status/:workerId for updates.',
    });
  } catch (error: any) {
    console.error('Error retrying provision:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Run provision in background
async function runProvision(workerId: string, userId: string, storeId: string, options?: { fromStep?: string }) {
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
  
  if (options?.fromStep) {
    await logStep(0, 'Retry', 0, `=== RETRY FROM STEP: ${options.fromStep} ===`);
  }
  
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
