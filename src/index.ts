import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config';

// Routes
import authRoutes from './routes/auth';
import storeRoutes from './routes/stores';
import stripeRoutes from './routes/stripe';
import workerRoutes from './routes/workers';

// Services
import { WorkerManager } from './services/workerManager';

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
app.use('/api/stripe', stripeRoutes);
app.use('/api/workers', workerRoutes);

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
});