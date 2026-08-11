/**
 * OpenClaw Gateway Installer for VPS
 * Installs and configures OpenClaw on Hetzner VPS
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
    
    // Step 1: Update system and install dependencies
    console.log('[OpenClaw] Installing dependencies...');
    await ssh.execCommand('apt-get update && apt-get install -y curl git docker.io docker-compose');
    
    // Step 2: Install Node.js 22
    console.log('[OpenClaw] Installing Node.js...');
    await ssh.execCommand('curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs');
    
    const nodeVersion = await ssh.execCommand('node --version');
    console.log('[OpenClaw] Node.js version:', nodeVersion.stdout);
    
    // Step 3: Setup OpenClaw directory
    console.log('[OpenClaw] Setting up OpenClaw structure...');
    await ssh.execCommand('rm -rf /opt/openclaw && mkdir -p /opt/openclaw/{src,config,logs,workspace}');
    
    // Step 4: Create package.json
    const packageJson = {
      name: "openclaw-gateway",
      version: "1.0.0",
      description: "OpenClaw Gateway Server",
      main: "src/index.js",
      scripts: {
        start: "node src/index.js",
        dev: "nodemon src/index.js"
      },
      dependencies: {
        "ws": "^8.14.2",
        "express": "^4.18.2",
        "cors": "^2.8.5",
        "uuid": "^9.0.1"
      }
    };
    
    await ssh.execCommand(`cat > /opt/openclaw/package.json << 'EOF'
${JSON.stringify(packageJson, null, 2)}
EOF`);
    
    // Step 5: Install npm dependencies
    console.log('[OpenClaw] Installing npm packages...');
    await ssh.execCommand('cd /opt/openclaw && npm install');
    
    // Step 6: Create the Gateway server
    console.log('[OpenClaw] Creating Gateway server...');
    const gatewayCode = createGatewayServerCode(config);
    await ssh.execCommand(`cat > /opt/openclaw/src/index.js << 'ENDOFFILE'
${gatewayCode}
ENDOFFILE`);
    
    // Step 7: Create systemd service
    console.log('[OpenClaw] Creating systemd service...');
    const systemdService = `[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target`;

    await ssh.execCommand(`cat > /etc/systemd/system/openclaw-gateway.service << 'EOF'
${systemdService}
EOF`);
    
    // Step 8: Start the service
    console.log('[OpenClaw] Starting Gateway service...');
    await ssh.execCommand('systemctl daemon-reload && systemctl enable openclaw-gateway && systemctl start openclaw-gateway');
    
    // Step 9: Wait and verify
    console.log('[OpenClaw] Verifying installation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusCheck = await ssh.execCommand('systemctl is-active openclaw-gateway');
    if (statusCheck.stdout.trim() !== 'active') {
      throw new Error('Gateway service failed to start');
    }
    
    console.log('[OpenClaw] ✅ Gateway is active');
    console.log('[OpenClaw] ✅ Installation complete');
    
    return {
      success: true,
      gatewayUrl,
    };
    
  } catch (error: any) {
    console.error('[OpenClaw] Installation failed:', error);
    return {
      success: false,
      gatewayUrl,
      error: error.message,
    };
  }
}

function createGatewayServerCode(config: { userId: string; workerId: string; storeId?: string }): string {
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

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Connected clients
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  console.log('[WS] Client connected:', clientId);
  
  clients.set(clientId, {
    ws,
    connectedAt: new Date(),
    lastPing: new Date(),
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    workerId: '${config.workerId}',
    message: 'Connected to OpenClaw Gateway'
  }));
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('[WS] Received:', message.type);
      
      // Echo back for testing
      ws.send(JSON.stringify({
        type: 'echo',
        received: message,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('[WS] Client disconnected:', clientId);
    clients.delete(clientId);
  });
  
  ws.on('error', (err) => {
    console.error('[WS] Error:', err);
    clients.delete(clientId);
  });
});

// Heartbeat to keep connections alive
setInterval(() => {
  clients.forEach((client, id) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
    }
  });
}, 30000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('[Gateway] OpenClaw Gateway running on port', PORT);
  console.log('[Gateway] Worker ID: ${config.workerId}');
});
`;
}

export async function verifyGatewayHealth(ipAddress: string, retries: number = 10): Promise<boolean> {
  const gatewayUrl = `http://${ipAddress}:3001/health`;
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[OpenClaw] Health check attempt ${i + 1}/${retries}...`);
      
      const response = await fetch(gatewayUrl, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json() as { status?: string; type?: string };
        if (data.status === 'ok' && data.type === 'openclaw-gateway') {
          console.log('[OpenClaw] ✅ Gateway health check passed');
          return true;
        }
      }
    } catch (error) {
      console.log(`[OpenClaw] Health check failed, retrying...`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  return false;
}
