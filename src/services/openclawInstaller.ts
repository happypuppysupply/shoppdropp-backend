/**
 * OpenClaw Gateway Installer for VPS
 * Creates a functional gateway that can communicate with ShoppDropp backend
 */

import { NodeSSH } from 'node-ssh';

export interface OpenClawInstallResult {
  success: boolean;
  gatewayUrl: string;
  error?: string;
}

export async function installOpenClawGateway(
  ssh: NodeSSH,
  ipAddress: string,
  config: {
    userId: string;
    workerId: string;
    storeId?: string;
  }
): Promise<OpenClawInstallResult> {
  const gatewayUrl = `http://${ipAddress}:3001`;
  
  try {
    console.log('[OpenClaw] Starting installation...');
    
    // Step 1: Update system and install Node.js
    console.log('[OpenClaw] Installing Node.js 20...');
    await ssh.execCommand('apt-get update -qq && apt-get install -y -qq curl git');
    await ssh.execCommand('curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y -qq nodejs');
    
    // Step 2: Create workspace
    await ssh.execCommand('mkdir -p /opt/openclaw-workspace');
    
    // Step 3: Create the Gateway server code
    console.log('[OpenClaw] Creating Gateway server...');
    const gatewayCode = createGatewayServer(config);
    await ssh.execCommand(`cat > /opt/openclaw-workspace/gateway.js << 'ENDOFFILE'
${gatewayCode}
ENDOFFILE`);
    
    // Step 4: Create package.json
    const packageJson = {
      name: "openclaw-gateway",
      version: "1.0.0",
      description: "OpenClaw Gateway Server",
      main: "gateway.js",
      scripts: { start: "node gateway.js" },
      dependencies: {
        "ws": "^8.14.2",
        "express": "^4.18.2",
        "cors": "^2.8.5"
      }
    };
    await ssh.execCommand(`cat > /opt/openclaw-workspace/package.json << 'EOF'
${JSON.stringify(packageJson, null, 2)}
EOF`);
    
    // Step 5: Install dependencies
    console.log('[OpenClaw] Installing npm packages...');
    await ssh.execCommand('cd /opt/openclaw-workspace && npm install --production');
    
    // Step 6: Create systemd service
    const systemdService = `[Unit]
Description=OpenClaw Agent Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-workspace
ExecStart=/usr/bin/node /opt/openclaw-workspace/gateway.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target`;

    await ssh.execCommand(`cat > /etc/systemd/system/openclaw-gateway.service << 'EOF'
${systemdService}
EOF`);
    
    // Step 7: Start the service
    console.log('[OpenClaw] Starting service...');
    await ssh.execCommand('systemctl daemon-reload && systemctl enable openclaw-gateway && systemctl start openclaw-gateway');
    
    // Step 8: Wait and verify
    console.log('[OpenClaw] Verifying...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const isHealthy = await verifyGatewayHealth(ipAddress, 10);
    
    if (!isHealthy) {
      const logs = await ssh.execCommand('journalctl -u openclaw-gateway --no-pager -n 20');
      console.error('[OpenClaw] Logs:', logs.stdout);
      throw new Error('Gateway failed to start');
    }
    
    console.log('[OpenClaw] ✅ Gateway running at', gatewayUrl);
    return { success: true, gatewayUrl };
    
  } catch (error: any) {
    console.error('[OpenClaw] Failed:', error);
    return { success: false, gatewayUrl, error: error.message };
  }
}

function createGatewayServer(config: { userId: string; workerId: string; storeId?: string }): string {
  return `
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    type: 'openclaw-gateway',
    workerId: '${config.workerId}',
    timestamp: new Date().toISOString()
  });
});

// API endpoints for worker tasks
app.post('/api/task', (req, res) => {
  console.log('[Task] Received:', req.body.type);
  res.json({ status: 'accepted', taskId: uuidv4() });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Connected clients
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  console.log('[WS] Client connected:', clientId);
  
  clients.set(clientId, { ws, connectedAt: new Date() });
  
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    workerId: '${config.workerId}',
    message: 'Connected to OpenClaw Gateway'
  }));
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      console.log('[WS] Received:', msg.type);
      
      // Echo back
      ws.send(JSON.stringify({
        type: 'response',
        received: msg,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });
  
  ws.on('close', () => clients.delete(clientId));
  ws.on('error', (err) => { console.error('[WS] Error:', err); clients.delete(clientId); });
});

// Heartbeat
setInterval(() => {
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
    }
  });
}, 30000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('[Gateway] OpenClaw Gateway running on port', PORT);
});
`;
}

export async function verifyGatewayHealth(ipAddress: string, retries: number = 10): Promise<boolean> {
  const gatewayUrl = `http://${ipAddress}:3001/health`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(gatewayUrl, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          console.log('[OpenClaw] ✅ Health check passed');
          return true;
        }
      }
    } catch (error) {
      // Retry
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  return false;
}
