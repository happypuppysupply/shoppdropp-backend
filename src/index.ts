import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { db } from './db/supabase';

// Routes
import authRoutes from './routes/auth';
import storeRoutes from './routes/stores';
import aiRoutes from './routes/ai';
import aiChatRoutes from './routes/ai-chat';
import userRoutes from './routes/user';
import stripeRoutes from './routes/stripe';
import workerRoutes from './routes/workers';
import vpsRoutes from './routes/vps';
import vpsSimpleRoutes from './routes/vps-simple';
import vpsDebugRoutes from './routes/vps-debug';
import vpsTestRoutes from './routes/vps-test';
import hetznerTypesRoutes from './routes/hetzner-types';
import debugRoutes from './routes/debug';

// Services
import { WorkerManager } from './services/workerManager';
import { initHetznerService } from './services/hetznerService';
import { getWorkerCommandQueue } from './services/workerCommands';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const workerManager = new WorkerManager();

// Middleware
app.use(cors());
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
app.use('/api/vps', vpsRoutes);
app.use('/api/vps-simple', vpsSimpleRoutes);
app.use('/api/vps-debug', vpsDebugRoutes);
app.use('/api/vps-test', vpsTestRoutes);
app.use('/api/hetzner', hetznerTypesRoutes);
app.use('/api/debug', debugRoutes);

// Initialize Hetzner service if token is available
if (process.env.HETZNER_API_TOKEN) {
  initHetznerService(process.env.HETZNER_API_TOKEN);
  console.log('☁️ Hetzner service initialized');
} else {
  console.warn('⚠️ HETZNER_API_TOKEN not set - VPS provisioning disabled');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket handling for workers
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
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
server.listen(config.port, () => {
  console.log(`🚀 ShoppDropp Backend running on port ${config.port}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);
  console.log(`🖥️  VPS Provisioning: ${process.env.HETZNER_API_TOKEN ? 'Enabled' : 'Disabled'}`);
  console.log(`🔐 SSH Key: ${process.env.SSH_PRIVATE_KEY ? 'Configured' : 'Not configured'}`);
});