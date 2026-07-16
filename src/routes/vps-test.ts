import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { HetznerService } from '../services/hetznerService';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Public test: Provision a worker directly
router.post('/provision-worker', async (req: Request, res: Response) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('=== Starting Direct Worker Provisioning Test ===');
    
    const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
    const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
    
    // Check env vars
    const hetznerToken = process.env.HETZNER_API_TOKEN;
    const sshKey = process.env.SSH_PRIVATE_KEY;
    log(`HETZNER_API_TOKEN: ${hetznerToken ? 'set (' + hetznerToken.length + ' chars)' : 'NOT SET'}`);
    log(`SSH_PRIVATE_KEY: ${sshKey ? 'set (' + sshKey.length + ' chars)' : 'NOT SET'}`);
    
    if (!hetznerToken || !sshKey) {
      return res.status(500).json({ error: 'Missing env vars', logs });
    }

    // Create provisioner
    log('Creating VPS provisioner...');
    let provisioner;
    try {
      provisioner = createVPSProvisioner();
      log('Provisioner created successfully');
    } catch (e: any) {
      log(`Provisioner init failed: ${e.message}`);
      return res.status(500).json({ error: 'Provisioner init failed', details: e.message, logs });
    }

    // Create worker
    const workerId = uuidv4();
    log(`Creating worker: ${workerId}`);
    await db.createWorker({
      id: workerId,
      user_id: userId,
      store_id: storeId,
      status: 'provisioning',
    });
    log('Worker created in DB');

    // Get AI config
    const aiConfig = await db.getAIConfig(userId);
    const envVars: Record<string, string> = {};
    if (aiConfig) {
      envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
      envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
      envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
      log(`AI config loaded: ${aiConfig.provider}`);
    }

    // Start provisioning (don't await - run async)
    log('Starting async provisioning...');
    provisioner.provisionVPS({
      workerId,
      storeId,
      userId,
      envVars,
    }).then((result: any) => {
      log(`Provisioning complete: ${JSON.stringify(result)}`);
    }).catch((error: any) => {
      log(`Provisioning error: ${error.message}`);
      db.updateWorker(workerId, { status: 'error' }).catch(() => {});
    });

    log('Returning response (provisioning continues in background)');
    res.json({ success: true, workerId, message: 'Provisioning started', logs });

  } catch (error: any) {
    log(`CRITICAL ERROR: ${error.message}`);
    res.status(500).json({ error: error.message, logs });
  }
});

// Public health/test endpoint
router.get('/hetzner-health', async (req: Request, res: Response) => {
  try {
    const hetznerToken = process.env.HETZNER_API_TOKEN;
    
    if (!hetznerToken) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'HETZNER_API_TOKEN not configured' 
      });
    }
    
    const hetzner = new HetznerService(hetznerToken);
    const servers = await hetzner.listServers();
    
    res.json({
      status: 'ok',
      message: 'Hetzner API is working',
      serverCount: servers.length
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      fullError: error.toString()
    });
  }
});

// Public test: Try to create a server
router.post('/create-test-server', async (req: Request, res: Response) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('Starting test server creation...');
    
    const hetznerToken = process.env.HETZNER_API_TOKEN;
    if (!hetznerToken) {
      return res.status(500).json({ error: 'HETZNER_API_TOKEN not set', logs });
    }

    log('Creating HetznerService...');
    const hetzner = new HetznerService(hetznerToken);

    const testName = `debug-${Date.now()}`;
    log(`Creating server: ${testName}...`);
    
    const server = await hetzner.createServer({
      name: testName,
      server_type: 'cpx12',
      image: 'ubuntu-22.04',
      labels: { debug: 'true' }
    });

    log(`Server created! ID: ${server.id}`);
    log(`Server status: ${server.status}`);
    log(`Server IP: ${server.public_net?.ipv4?.ip || 'pending'}`);

    // Delete immediately
    log('Deleting test server...');
    await hetzner.deleteServer(server.id);
    log('Server deleted.');

    res.json({ success: true, logs });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    res.status(500).json({ 
      error: error.message, 
      stack: error.stack,
      logs 
    });
  }
});




// Test Hetzner API directly (synchronous, with full error details)
router.post('/test-provision', authenticate, async (req: Request, res: Response) => {
  const logs: string[] = [];
  const addLog = (msg: string) => {
    console.log(msg);
    logs.push(`${new Date().toISOString()}: ${msg}`);
  };

  try {
    const user = (req as any).user;
    addLog(`Starting test provision for user: ${user.id.slice(0, 8)}...`);

    // Check environment
    const hetznerToken = process.env.HETZNER_API_TOKEN;
    const sshKey = process.env.SSH_PRIVATE_KEY;
    
    addLog(`HETZNER_API_TOKEN exists: ${!!hetznerToken}`);
    addLog(`HETZNER_API_TOKEN length: ${hetznerToken?.length}`);
    addLog(`SSH_PRIVATE_KEY exists: ${!!sshKey}`);
    addLog(`SSH_PRIVATE_KEY length: ${sshKey?.length}`);

    if (!hetznerToken) {
      return res.status(500).json({ error: 'HETZNER_API_TOKEN not set', logs });
    }

    // Test 1: Initialize Hetzner service
    addLog('Initializing HetznerService...');
    let hetzner: HetznerService;
    try {
      hetzner = new HetznerService(hetznerToken);
      addLog('HetznerService initialized');
    } catch (e: any) {
      addLog(`HetznerService init failed: ${e.message}`);
      return res.status(500).json({ error: 'Hetzner init failed', details: e.message, logs });
    }

    // Test 2: List servers
    addLog('Listing existing servers...');
    try {
      const servers = await hetzner.listServers();
      addLog(`Found ${servers.length} existing servers`);
    } catch (e: any) {
      addLog(`List servers failed: ${e.message}`);
      return res.status(500).json({ error: 'List servers failed', details: e.message, logs });
    }

    // Test 3: Create a server
    const testName = `test-${uuidv4().slice(0, 8)}`;
    addLog(`Creating test server: ${testName}...`);
    
    let server: any;
    try {
      server = await hetzner.createServer({
        name: testName,
        server_type: 'cpx12',
        image: 'ubuntu-22.04',
        labels: { test: 'true' }
      });
      addLog(`Server created! ID: ${server.id}, Status: ${server.status}`);
    } catch (e: any) {
      addLog(`Create server failed: ${e.message}`);
      return res.status(500).json({ 
        error: 'Create server failed', 
        details: e.message,
        fullError: e.toString(),
        logs 
      });
    }

    // Test 4: Delete the server
    addLog(`Deleting test server ${server.id}...`);
    try {
      await hetzner.deleteServer(server.id);
      addLog('Server deleted successfully');
    } catch (e: any) {
      addLog(`Delete server failed: ${e.message}`);
      // Don't return error here, just log it
    }

    return res.json({
      success: true,
      message: 'All tests passed! Hetzner API is working.',
      logs
    });

  } catch (error: any) {
    addLog(`Unexpected error: ${error.message}`);
    res.status(500).json({
      error: 'Test failed',
      details: error.message,
      stack: error.stack,
      logs
    });
  }
});

export default router;
