import { Router, Request, Response } from 'express';
import WebSocket from 'ws';
import { db } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

// Map to store active proxy connections
const proxyConnections = new Map<string, WebSocket>();

/**
 * HTTP endpoint to handle WebSocket upgrade
 * This is called by the main server when a WS connection comes in
 */
export async function handleWsProxy(ws: WebSocket, req: Request) {
  // Parse URL to get workerId
  const url = req.url || '';
  const match = url.match(/\/ws\/worker\/([^\/\?]+)/);
  const workerId = match ? match[1] : null;
  
  // Get user from auth (passed through from main server)
  const userId = (req as any).user?.id;

  console.log(`[WS-Proxy] Connection request for worker ${workerId}`);

  if (!workerId) {
    console.log(`[WS-Proxy] No workerId in URL: ${url}`);
    ws.close(1008, 'Worker ID required');
    return;
  }

  try {
    // Verify worker exists and belongs to user
    const worker = await db.getWorkerById(workerId);
    if (!worker || worker.user_id !== userId) {
      console.log(`[WS-Proxy] Worker not found or unauthorized`);
      ws.send(JSON.stringify({ type: 'error', message: 'Worker not found or unauthorized' }));
      ws.close(1008, 'Unauthorized');
      return;
    }

    if (!worker.ip_address) {
      console.log(`[WS-Proxy] Worker has no IP address`);
      ws.send(JSON.stringify({ type: 'error', message: 'Worker has no IP address' }));
      ws.close(1011, 'No IP address');
      return;
    }

    // Connect to VPS OpenClaw Gateway
    const vpsWsUrl = `ws://${worker.ip_address}:8080/ws`;
    console.log(`[WS-Proxy] Connecting to VPS at ${vpsWsUrl}`);

    const vpsWs = new WebSocket(vpsWsUrl, {
      handshakeTimeout: 10000,
    });

    // Store connection
    proxyConnections.set(workerId, vpsWs);

    // Forward messages from VPS to frontend
    vpsWs.on('message', (data: WebSocket.Data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data.toString());
      }
    });

    // Forward messages from frontend to VPS
    ws.on('message', (data: WebSocket.Data) => {
      if (vpsWs.readyState === vpsWs.OPEN) {
        vpsWs.send(data.toString());
      }
    });

    // Handle VPS connection open
    vpsWs.on('open', () => {
      console.log(`[WS-Proxy] Connected to VPS for worker ${workerId}`);
      ws.send(JSON.stringify({ 
        type: 'system', 
        message: 'Connected to OpenClaw Gateway on VPS',
        worker_id: workerId
      }));
    });

    // Handle VPS errors
    vpsWs.on('error', (error: Error) => {
      console.error(`[WS-Proxy] VPS connection error:`, error.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Failed to connect to VPS: ' + error.message 
        }));
      }
    });

    // Handle VPS close
    vpsWs.on('close', (code: number, reason: Buffer) => {
      console.log(`[WS-Proxy] VPS connection closed: ${code}`);
      proxyConnections.delete(workerId);
      if (ws.readyState === ws.OPEN) {
        ws.close(code, reason);
      }
    });

    // Handle frontend close
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[WS-Proxy] Frontend disconnected: ${code}`);
      proxyConnections.delete(workerId);
      if (vpsWs.readyState === vpsWs.OPEN) {
        vpsWs.close();
      }
    });

    // Handle frontend errors
    ws.on('error', (error: Error) => {
      console.error(`[WS-Proxy] Frontend error:`, error);
    });

  } catch (error: any) {
    console.error(`[WS-Proxy] Error:`, error);
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
    ws.close(1011, 'Internal error');
  }
}

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    active_connections: proxyConnections.size,
    timestamp: new Date().toISOString() 
  });
});

export default router;
