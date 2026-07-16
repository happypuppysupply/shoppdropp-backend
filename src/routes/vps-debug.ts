import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';
import { HetznerService } from '../services/hetznerService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Debug: Test Hetzner API directly
router.post('/test-hetzner', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const token = process.env.HETZNER_API_TOKEN;
    
    console.log('[DEBUG] Testing Hetzner API...');
    console.log('[DEBUG] Token exists:', !!token);
    console.log('[DEBUG] Token length:', token?.length);
    
    if (!token) {
      return res.status(500).json({ error: 'HETZNER_API_TOKEN not set' });
    }
    
    const hetzner = new HetznerService(token);
    
    // Test 1: List existing servers
    console.log('[DEBUG] Listing servers...');
    const serversRes = await hetzner.listServers();
    console.log('[DEBUG] Existing servers:', serversRes.length);
    
    // Test 2: Try to create a small server
    const testName = `test-${uuidv4().slice(0, 8)}`;
    console.log('[DEBUG] Creating test server:', testName);
    
    try {
      const server = await hetzner.createServer({
        name: testName,
        server_type: 'cx21',
        image: 'ubuntu-22.04',
        location: 'nbg1',
        labels: { test: 'true', user_id: user.id }
      });
      
      console.log('[DEBUG] Server created:', server.id);
      
      // Delete it immediately
      console.log('[DEBUG] Deleting test server...');
      await hetzner.deleteServer(server.id);
      console.log('[DEBUG] Test server deleted');
      
      return res.json({
        success: true,
        message: 'Hetzner API is working!',
        existingServers: serversRes.length,
        testServerCreated: server.id,
        testServerDeleted: true
      });
      
    } catch (createError: any) {
      console.error('[DEBUG] Create server failed:', createError.message);
      return res.status(500).json({
        error: 'Failed to create server',
        details: createError.message,
        existingServers: serversRes.length
      });
    }
    
  } catch (error: any) {
    console.error('[DEBUG] Unexpected error:', error);
    res.status(500).json({
      error: 'Debug test failed',
      details: error.message,
      stack: error.stack
    });
  }
});

// Debug: Check worker status
router.get('/worker-status/:workerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { workerId } = req.params;
    
    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== user.id) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    res.json({
      worker: {
        id: worker.id,
        status: worker.status,
        store_id: worker.store_id,
        hetzner_server_id: worker.hetzner_server_id,
        ip_address: worker.ip_address,
        created_at: worker.created_at,
        updated_at: worker.updated_at
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
