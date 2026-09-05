import { WebSocket } from 'ws';
import { researchPipeline } from '../services/researchPipeline';

interface ResearchWSClient {
  userId: string;
  storeId: string;
  currentRunId?: string;
  ws: WebSocket;
}

const clients = new Map<string, ResearchWSClient>();

export function setupResearchWebSocket(wss: any) {
  // Handle incoming research WebSocket connections (emitted from index.ts)
  wss.on('research-connection', (ws: WebSocket, request: any) => {
    console.log('[Research-WS] New research connection');
    
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Parse query params for user authentication
    const userId = url.searchParams.get('userId');
    const storeId = url.searchParams.get('storeId');
    const runId = url.searchParams.get('runId');
    
    if (!userId || !storeId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'userId and storeId required',
      }));
      ws.close();
      return;
    }
    
    // Register client
    const client: ResearchWSClient = {
      userId,
      storeId,
      currentRunId: runId || undefined,
      ws,
    };
    clients.set(clientId, client);
    
    console.log(`[Research-WS] Client ${clientId} registered for user ${userId}, store ${storeId}`);
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to research stream',
    }));
    
    // If runId provided, subscribe to that run's activities
    if (runId) {
      subscribeToRun(client, runId);
    }
    
    // Listen for messages from client
    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        handleClientMessage(client, clientId, message);
      } catch (err) {
        console.error('[Research-WS] Invalid message:', data);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      console.log(`[Research-WS] Client ${clientId} disconnected`);
      clients.delete(clientId);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`[Research-WS] Client ${clientId} error:`, error);
      clients.delete(clientId);
    });
  });
  
  // Subscribe to pipeline events globally
  researchPipeline.on('activity', ({ runId, activity }) => {
    broadcastActivity(runId, activity);
  });
  
  researchPipeline.on('complete', (run) => {
    broadcastComplete(run);
  });
  
  researchPipeline.on('error', ({ runId, error }) => {
    broadcastError(runId, error);
  });
}

function handleClientMessage(client: ResearchWSClient, clientId: string, message: any) {
  console.log('[Research-WS] Received:', message.type);
  
  switch (message.type) {
    case 'subscribe':
      // Subscribe to a research run
      if (message.runId) {
        subscribeToRun(client, message.runId);
      }
      break;
      
    case 'start_research':
      // Start a new research run
      handleStartResearch(client, message.context);
      break;
      
    case 'get_activities':
      // Get all activities for a run
      if (message.runId) {
        const activities = researchPipeline.getActivities(message.runId);
        client.ws.send(JSON.stringify({
          type: 'activities',
          runId: message.runId,
          activities,
        }));
      }
      break;
      
    default:
      console.log('[Research-WS] Unknown message type:', message.type);
  }
}

async function subscribeToRun(client: ResearchWSClient, runId: string) {
  client.currentRunId = runId;
  
  const run = researchPipeline.getRun(runId);
  
  if (!run) {
    client.ws.send(JSON.stringify({
      type: 'error',
      runId,
      message: 'Research run not found',
    }));
    return;
  }
  
  client.ws.send(JSON.stringify({
    type: 'subscribed',
    runId,
    status: run.status,
    message: `Subscribed to research run ${runId}`,
  }));
  
  // Send existing activities
  if (run.activities.length > 0) {
    client.ws.send(JSON.stringify({
      type: 'activities',
      runId,
      activities: run.activities,
    }));
  }
}

async function handleStartResearch(client: ResearchWSClient, context: any) {
  try {
    const researchContext = {
      userId: client.userId,
      storeId: client.storeId,
      onboardingData: context,
    };
    
    const runId = await researchPipeline.startResearch(researchContext);
    
    // Subscribe client to new run
    subscribeToRun(client, runId);
    
    // Acknowledge start
    client.ws.send(JSON.stringify({
      type: 'research_started',
      runId,
      message: 'Research started successfully',
    }));
    
  } catch (error: any) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to start research: ' + error.message,
    }));
  }
}

function broadcastActivity(runId: string, activity: any) {
  const message = JSON.stringify({
    type: 'activity',
    runId,
    activity,
    timestamp: new Date().toISOString(),
  });
  
  // Send to all clients subscribed to this run
  clients.forEach((client) => {
    if (client.currentRunId === runId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

function broadcastComplete(run: any) {
  const message = JSON.stringify({
    type: 'research_complete',
    runId: run.id,
    result: {
      productsFound: run.productsFound,
      productsVerified: run.productsVerified,
      totalCost: run.totalCost,
      results: run.results,
    },
  });
  
  clients.forEach((client) => {
    if (client.currentRunId === run.id && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

function broadcastError(runId: string, error: string) {
  const message = JSON.stringify({
    type: 'research_error',
    runId,
    error,
  });
  
  clients.forEach((client) => {
    if (client.currentRunId === runId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

// Express route handlers for starting research via HTTP
export const researchRoutes = {
  async startResearch(req: any, res: any) {
    try {
      const { userId, storeId, onboardingData } = req.body;
      
      if (!userId || !storeId || !onboardingData) {
        return res.status(400).json({
          error: 'userId, storeId, and onboardingData required',
        });
      }
      
      const runId = await researchPipeline.startResearch({
        userId,
        storeId,
        onboardingData,
      });
      
      res.json({
        success: true,
        runId,
        message: 'Research started',
      });
      
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to start research',
        message: error.message,
      });
    }
  },
  
  async getResearchStatus(req: any, res: any) {
    try {
      const { runId } = req.params;
      
      const run = researchPipeline.getRun(runId);
      
      if (!run) {
        return res.status(404).json({ error: 'Research run not found' });
      }
      
      res.json({
        success: true,
        run: {
          id: run.id,
          status: run.status,
          activities: run.activities,
          productsFound: run.productsFound,
          productsVerified: run.productsVerified,
          totalCost: run.totalCost,
          startTime: run.startTime,
          endTime: run.endTime,
          results: run.results,
        },
      });
      
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get research status',
        message: error.message,
      });
    }
  },
  
  async getActivities(req: any, res: any) {
    try {
      const { runId } = req.params;
      const activities = researchPipeline.getActivities(runId);
      
      res.json({
        success: true,
        runId,
        activities,
      });
      
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get activities',
        message: error.message,
      });
    }
  },
};
