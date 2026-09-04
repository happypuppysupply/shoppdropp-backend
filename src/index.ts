import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config';
import { db, supabase } from './db/supabase';
import jwt from 'jsonwebtoken';

// Routes
import authRoutes from './routes/auth';
import storeRoutes from './routes/stores';
import aiRoutes from './routes/ai';
import aiChatRoutes from './routes/ai-chat';
import userRoutes from './routes/user';
import stripeRoutes from './routes/stripe';
import workerRoutes from './routes/workers';
import workerTasksRoutes from './routes/worker-tasks';
import reprovisionRoutes from './routes/reprovision';
import vpsRoutes from './routes/vps';
import vpsSimpleRoutes from './routes/vps-simple';
import vpsDebugRoutes from './routes/vps-debug';
import vpsTestRoutes from './routes/vps-test';
import vpsRetryRoutes from './routes/vps-retry';
import vpsSyncTestRoutes from './routes/vps-sync-test';
import vpsDebugProvisionRoutes from './routes/vps-debug-provision';
import hetznerTypesRoutes from './routes/hetzner-types';
import debugRoutes from './routes/debug';
import openWebNinjaRoutes from './routes/openwebninja';
import storeConfigRoutes from './routes/store-config';
import setupRoutes from './routes/setup';
import wsProxyRoutes, { handleWsProxy } from './routes/ws-proxy';
import budgetRoutes from './routes/budget';
import provisionStatusRoutes from './routes/provision-status';
import onboardingRoutes from './routes/onboarding';
import credentialsRoutes from './routes/credentials';
import workflowRoutes from './routes/workflow';
import creditsRoutes from './routes/credits';
import apifyRoutes from './routes/apify';
import apifyDiscoveryRoutes from './routes/apify-discovery';
import researchRoutes from './routes/research';
import { setupResearchWebSocket } from './routes/research-ws';

// Services
import { WorkerManager } from './services/workerManager';
import { initHetznerService } from './services/hetznerService';
import { getWorkerCommandQueue } from './services/workerCommands';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const workerManager = new WorkerManager();

// Middleware - CORS for lendsquid.ai and other allowed origins
app.use(cors({
  origin: [
    'https://lendsquid.ai',
    'https://www.lendsquid.ai',
    'https://shoppdropp-blueprint.vercel.app',
    'https://shoppdropp-api.onrender.com',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Raw body for Stripe webhooks
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/workers', workerTasksRoutes);
app.use('/api/workers', reprovisionRoutes);
app.use('/api/vps', vpsRoutes);
app.use('/api/vps-simple', vpsSimpleRoutes);
app.use('/api/vps-debug', vpsDebugRoutes);
app.use('/api/vps-test', vpsTestRoutes);
app.use('/api/vps-retry', vpsRetryRoutes);
app.use('/api/vps-sync-test', vpsSyncTestRoutes);
app.use('/api/vps-debug', vpsDebugProvisionRoutes);
app.use('/api/hetzner', hetznerTypesRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/openwebninja', openWebNinjaRoutes);
app.use('/api/store-config', storeConfigRoutes);
app.use('/api/setup', setupRoutes);
app.use('/ws', wsProxyRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/provision', provisionStatusRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/apify', apifyRoutes);
app.use('/api/apify', apifyDiscoveryRoutes);
app.use('/api/research', researchRoutes);

// Initialize Hetzner service if token is available
if (process.env.HETZNER_API_TOKEN) {
  initHetznerService();
  console.log('☁️ Hetzner service initialized');
} else {
  console.warn('⚠️ HETZNER_API_TOKEN not set - VPS provisioning disabled');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket upgrade handling for /ws/worker/* paths
server.on('upgrade', async (request, socket, head) => {
  const url = request.url || '';
  console.log(`[WS-Upgrade] Upgrade request for ${url}`);
  
  // Only handle /ws/worker/* paths for proxy
  if (url.startsWith('/ws/ai-chat')) {
    // Import dynamically to avoid circular deps
    const { handleAIChatWebSocket } = await import('./routes/ai-chat-ws');
    
    // Extract token
    let token: string | null = null;
    try {
      const urlObj = new URL(url, 'http://localhost');
      token = urlObj.searchParams.get('token');
    } catch (e) {}
    
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    
    let userId: string | null = null;
    
    // Try custom JWT first
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwt.secret) as any;
      userId = decoded.userId || decoded.sub;
      console.log('[WS-Upgrade] Custom JWT verified for user:', userId);
    } catch (err) {
      // Try Supabase JWT
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
          throw new Error('Supabase auth failed');
        }
        userId = user.id;
        console.log('[WS-Upgrade] Supabase JWT verified for user:', userId);
      } catch (supabaseErr) {
        console.log('[WS-Upgrade] Both JWT verifications failed');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    
    if (userId) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleAIChatWebSocket(ws, userId!);
      });
      return;
    }
  }
  
  if (url.startsWith('/ws/worker/')) {
    console.log(`[WS-Upgrade] Handling worker proxy for ${url}`);
    
    try {
      // Extract and verify JWT token from query params
      let token: string | null = null;
      try {
        const urlObj = new URL(url, 'http://localhost');
        token = urlObj.searchParams.get('token');
        console.log(`[WS-Upgrade] Token from query: ${token ? 'present' : 'missing'}`);
      } catch (e) {
        console.log('[WS-Upgrade] Failed to parse URL');
      }
      
      if (!token && request.headers['authorization']) {
        token = request.headers['authorization'].replace('Bearer ', '');
        console.log('[WS-Upgrade] Token from header');
      }
      
      if (!token) {
        console.log('[WS-Upgrade] No token provided - rejecting');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Verify JWT - support both HS256 (custom) and ES256 (Supabase)
      let userId: string;
      try {
        // Try to verify with custom JWT secret first (HS256)
        const decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwt.secret) as any;
        userId = decoded.userId || decoded.sub;
        console.log(`[WS-Upgrade] Custom JWT verified for user: ${userId}`);
      } catch (err: any) {
        // If that fails, decode without verification to get the user info
        // The worker will verify the token properly
        try {
          const decoded = jwt.decode(token) as any;
          if (decoded && decoded.sub) {
            userId = decoded.sub;
            console.log(`[WS-Upgrade] Supabase JWT decoded for user: ${userId} (passing to worker for verification)`);
          } else {
            throw new Error('Invalid token payload');
          }
        } catch (decodeErr) {
          console.log('[WS-Upgrade] Invalid token:', err.message);
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      // Create WebSocket and attach user
      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as any).user = { id: userId };
        (ws as any).req = { url, user: { id: userId } };
        console.log('[WS-Upgrade] Calling handleWsProxy');
        handleWsProxy(ws, (ws as any).req);
      });
      
    } catch (error) {
      console.error('[WS-Upgrade] Error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
    return;
  }
  
  // Handle research WebSocket connections
  if (url.startsWith('/ws/research')) {
    console.log(`[WS-Upgrade] Handling research WebSocket for ${url}`);
    
    try {
      // Extract token from query params
      let token: string | null = null;
      try {
        const urlObj = new URL(url, 'http://localhost');
        token = urlObj.searchParams.get('token');
      } catch (e) {}
      
      if (!token) {
        console.log('[WS-Upgrade] Research: No token');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      
      // Verify JWT
      let userId: string;
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwt.secret) as any;
        userId = decoded.userId || decoded.sub;
        console.log(`[WS-Upgrade] Research auth verified for user: ${userId}`);
      } catch (err) {
        // Try Supabase token
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        userId = user.id;
      }
      
      // Upgrade connection
      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as any).user = { id: userId };
        // Import and setup research WebSocket
        const { setupResearchWebSocket } = require('./routes/research-ws');
        wss.emit('research-connection', ws, request);
      });
      
    } catch (error) {
      console.error('[WS-Upgrade] Research error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
    return;
  }
  
  // Let the default WSS handle other /ws paths
  console.log('[WS-Upgrade] Using default WSS handler');
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// WebSocket handling for workers (on /ws path)
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  
  // Skip research WebSocket connections - handled by server.on('upgrade')
  if (url.pathname.startsWith('/ws/research')) {
    return;
  }
  
  const workerId = url.searchParams.get('workerId');
  
  if (!workerId) {
    ws.close(1008, 'Worker ID required');
    return;
  }

  console.log(`Worker ${workerId} connected`);
  workerManager.handleWorkerConnection(workerId, ws);

  // Send any pending commands to the worker
  const commandQueue = getWorkerCommandQueue();
  const pendingCommands = commandQueue.getPendingCommands(workerId);
  
  if (pendingCommands.length > 0) {
    console.log(`Sending ${pendingCommands.length} pending commands to worker ${workerId}`);
    pendingCommands.forEach(cmd => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'command',
          command: cmd,
        }));
        commandQueue.updateCommand(cmd.id, { status: 'running', started_at: new Date().toISOString() });
      }
    });
  }

  // Subscribe to new commands for this worker
  const commandHandler = (command: any) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'command',
        command,
      }));
      commandQueue.updateCommand(command.id, { status: 'running', started_at: new Date().toISOString() });
    }
  };
  
  commandQueue.subscribe(workerId, commandHandler);

  // Handle messages from worker
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'command_result') {
        const { command_id, result, error } = message;
        
        if (error) {
          await commandQueue.failCommand(command_id, error);
          console.error(`Command ${command_id} failed:`, error);
        } else {
          await commandQueue.completeCommand(command_id, result);
          console.log(`Command ${command_id} completed:`, result);
        }
      }
      
      if (message.type === 'heartbeat') {
        // Update worker last_heartbeat
        await db.updateWorker(workerId, { last_heartbeat: new Date().toISOString() });
      }
      
      if (message.type === 'task_progress') {
        // Update task progress
        console.log(`Task ${message.task_id} progress: ${message.progress}%`);
      }
    } catch (e) {
      console.error('Error handling worker message:', e);
    }
  });

  // Cleanup on disconnect
  ws.on('close', () => {
    commandQueue.unsubscribe(workerId, commandHandler);
    console.log(`Worker ${workerId} disconnected`);
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 ShoppDropp Backend running on port ${config.port}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);
  console.log(`🖥️  VPS Provisioning: ${process.env.HETZNER_API_TOKEN ? 'Enabled' : 'Disabled'}`);
  console.log(`🔐 SSH Key: ${process.env.SSH_PRIVATE_KEY ? 'Configured' : 'Not configured'}`);
});
