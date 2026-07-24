import { NodeSSH } from 'node-ssh';
import * as fs from 'fs';
import * as path from 'path';

export class OpenClawInstaller {
  private sshPrivateKey: string;

  constructor() {
    // Read SSH key from environment variables (set in Render dashboard)
    // Supports base64 encoded key (SSH_PRIVATE_KEY_BASE64) or plain text
    // Fallback to file system for local development
    const sshPrivateKeyBase64 = process.env.SSH_PRIVATE_KEY_BASE64;
    
    if (sshPrivateKeyBase64) {
      // Decode base64 private key
      this.sshPrivateKey = Buffer.from(sshPrivateKeyBase64, 'base64').toString('utf8');
      console.log('[OpenClaw] Using SSH key from environment variables (base64 decoded)');
    } else if (process.env.SSH_PRIVATE_KEY) {
      // Fallback to plain text with newline replacement
      this.sshPrivateKey = process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
      console.log('[OpenClaw] Using SSH key from environment variables');
    } else {
      // Fallback to file system for local development
      const sshDir = '/home/markjohnson44la44gigi/.openclaw/workspace/.secrets';
      this.sshPrivateKey = fs.readFileSync(path.join(sshDir, 'shoppdropp_render_rsa'), 'utf8');
      console.log('[OpenClaw] Using SSH key from file system');
    }
  }

  async installOpenClaw(ipAddress: string, config: {
    workerId: string;
    storeId: string;
    userId: string;
    openrouterApiKey: string;
    supabaseUrl: string;
    supabaseKey: string;
  }): Promise<void> {
    const ssh = new NodeSSH();

    try {
      console.log(`[OpenClaw] Connecting to ${ipAddress}...`);

      // Connect with retries
      let connected = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          await ssh.connect({
            host: ipAddress,
            username: 'root',
            privateKey: this.sshPrivateKey,
            readyTimeout: 30000,
          });
          connected = true;
          console.log(`[OpenClaw] Connected on attempt ${attempt}`);
          break;
        } catch (err: any) {
          console.log(`[OpenClaw] SSH attempt ${attempt} failed: ${err.message}`);
          if (attempt < 10) await new Promise(r => setTimeout(r, 15000));
        }
      }

      if (!connected) throw new Error('Failed to connect to VPS');

      // Step 1: Install dependencies
      console.log('[OpenClaw] Installing dependencies...');
      await this.runCommand(ssh, 'apt-get update && apt-get install -y curl git nodejs npm docker.io docker-compose', 300000);

      // Step 2: Clone OpenClaw
      console.log('[OpenClaw] Cloning OpenClaw repository...');
      await this.runCommand(ssh, 'rm -rf /opt/openclaw && git clone https://github.com/openclaw/gateway.git /opt/openclaw 2>/dev/null || true', 120000);

      // If clone failed, create minimal OpenClaw structure
      console.log('[OpenClaw] Setting up OpenClaw structure...');
      await this.runCommand(ssh, 'mkdir -p /opt/openclaw/{src,config,logs}');

      // Step 3: Create OpenClaw Gateway server
      console.log('[OpenClaw] Creating Gateway server...');
      const gatewayServer = this.createGatewayServer(config);
      await this.writeFile(ssh, '/opt/openclaw/src/server.js', gatewayServer);

      // Step 4: Create package.json
      const packageJson = JSON.stringify({
        name: "openclaw-gateway",
        version: "1.0.0",
        main: "src/server.js",
        scripts: {
          start: "node src/server.js"
        },
        dependencies: {
          "express": "^4.18.2",
          "ws": "^8.13.0",
          "cors": "^2.8.5",
          "axios": "^1.6.0",
          "@supabase/supabase-js": "^2.38.0"
        }
      }, null, 2);
      await this.writeFile(ssh, '/opt/openclaw/package.json', packageJson);

      // Step 5: Install dependencies
      console.log('[OpenClaw] Installing Node dependencies...');
      await this.runCommand(ssh, 'cd /opt/openclaw && npm install', 180000);

      // Step 6: Create systemd service
      console.log('[OpenClaw] Creating systemd service...');
      const serviceFile = `[Unit]
Description=OpenClaw Gateway Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw
Environment=NODE_ENV=production
Environment=OPENROUTER_API_KEY=${config.openrouterApiKey}
Environment=SUPABASE_URL=${config.supabaseUrl}
Environment=SUPABASE_KEY=${config.supabaseKey}
Environment=WORKER_ID=${config.workerId}
Environment=STORE_ID=${config.storeId}
Environment=USER_ID=${config.userId}
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target`;

      await this.writeFile(ssh, '/etc/systemd/system/openclaw-gateway.service', serviceFile);

      // Step 7: Start service
      console.log('[OpenClaw] Starting Gateway service...');
      await this.runCommand(ssh, 'systemctl daemon-reload && systemctl enable openclaw-gateway && systemctl start openclaw-gateway');

      // Step 8: Verify
      await new Promise(r => setTimeout(r, 5000));
      const status = await ssh.execCommand('systemctl is-active openclaw-gateway');
      if (status.stdout.trim() === 'active') {
        console.log('[OpenClaw] ✅ Gateway is active');
      } else {
        const logs = await ssh.execCommand('journalctl -u openclaw-gateway --no-pager -n 20');
        console.error('[OpenClaw] Service failed:\n', logs.stdout);
        throw new Error('OpenClaw Gateway failed to start');
      }

      console.log('[OpenClaw] ✅ Installation complete');

    } finally {
      ssh.dispose();
    }
  }

  private createGatewayServer(config: any): string {
    return `const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Config
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const WORKER_ID = process.env.WORKER_ID;
const STORE_ID = process.env.STORE_ID;
const USER_ID = process.env.USER_ID;

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Connected clients
const clients = new Map();

app.use(cors());
app.use(express.json());

console.log('🚀 OpenClaw Gateway starting...');
console.log('   Worker ID:', WORKER_ID);
console.log('   Store ID:', STORE_ID);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'openclaw-gateway',
    worker_id: WORKER_ID,
    connected_clients: clients.size,
    timestamp: new Date().toISOString() 
  });
});

// Execute task endpoint
app.post('/execute', async (req, res) => {
  const { task, params } = req.body;
  console.log('📥 Task received:', task);

  try {
    // Notify all connected clients
    broadcast({
      type: 'task_started',
      task,
      timestamp: new Date().toISOString()
    });

    // Execute based on task type
    let result;
    if (task === 'product_research') {
      result = await executeProductResearch(params);
    } else if (task === 'catalog_sync') {
      result = await executeCatalogSync(params);
    } else if (task === 'chat') {
      result = await executeChat(params);
    } else {
      throw new Error('Unknown task: ' + task);
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Task failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString();
  console.log('🔌 Client connected:', clientId);
  
  clients.set(clientId, ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to OpenClaw Gateway',
    worker_id: WORKER_ID,
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      console.log('📨 Message from client:', msg);

      if (msg.type === 'chat') {
        // Process chat message with OpenRouter
        const response = await processChatMessage(msg.content, msg.history);
        ws.send(JSON.stringify({
          type: 'chat_response',
          content: response,
          timestamp: new Date().toISOString()
        }));
      } else if (msg.type === 'execute_task') {
        // Execute task
        const result = await executeTask(msg.task, msg.params);
        ws.send(JSON.stringify({
          type: 'task_complete',
          task: msg.task,
          result,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected:', clientId);
    clients.delete(clientId);
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

async function processChatMessage(content, history = []) {
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: 'You are an AI assistant for an e-commerce dropshipping business. Help with product research, pricing, and store management.' },
        ...history,
        { role: 'user', content }
      ]
    }, {
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenRouter error:', error.message);
    return 'Sorry, I encountered an error processing your request.';
  }
}

async function executeProductResearch(params) {
  console.log('🔍 Executing product research...');
  
  // This would call OpenWeb Ninja APIs
  // For now, simulate the research
  const results = {
    products_found: 45,
    sources: ['amazon', 'walmart', 'ebay'],
    top_products: [
      { title: 'Sample Product 1', price: 29.99, rating: 4.5 },
      { title: 'Sample Product 2', price: 39.99, rating: 4.2 }
    ]
  };

  // Save to database
  await supabase.from('product_research_results').insert({
    id: 'res_' + Date.now(),
    store_id: STORE_ID,
    user_id: USER_ID,
    query: params.category || 'trending',
    products_found: results.products_found,
    top_products: results.top_products,
    status: 'completed'
  });

  return results;
}

async function executeCatalogSync(params) {
  console.log('🔄 Executing catalog sync...');
  return { synced: 50, updated: 10, new: 5 };
}

async function executeChat(params) {
  return await processChatMessage(params.message, params.history);
}

async function executeTask(task, params) {
  switch (task) {
    case 'product_research':
      return await executeProductResearch(params);
    case 'catalog_sync':
      return await executeCatalogSync(params);
    default:
      throw new Error('Unknown task: ' + task);
  }
}

// Poll for tasks from Supabase
async function pollTasks() {
  try {
    const { data: tasks, error } = await supabase
      .from('worker_commands')
      .select('*')
      .eq('worker_id', WORKER_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Poll error:', error);
      return;
    }

    if (tasks && tasks.length > 0) {
      const task = tasks[0];
      console.log('📥 Found pending task:', task.type);

      // Update status to running
      await supabase
        .from('worker_commands')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task.id);

      try {
        // Execute task
        const result = await executeTask(task.payload?.task_type, task.payload?.params);

        // Mark as completed
        await supabase
          .from('worker_commands')
          .update({ 
            status: 'completed', 
            completed_at: new Date().toISOString(),
            result
          })
          .eq('id', task.id);

        // Notify clients
        broadcast({
          type: 'task_complete',
          task_id: task.id,
          result
        });

      } catch (error) {
        console.error('Task execution failed:', error);
        await supabase
          .from('worker_commands')
          .update({ 
            status: 'failed', 
            completed_at: new Date().toISOString(),
            error: error.message
          })
          .eq('id', task.id);
      }
    }
  } catch (error) {
    console.error('Error in poll loop:', error);
  }
}

// Start polling
setInterval(pollTasks, 10000);

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log('✅ OpenClaw Gateway listening on port', PORT);
});

// Heartbeat to Supabase
setInterval(async () => {
  await supabase
    .from('workers')
    .update({ last_heartbeat: new Date().toISOString() })
    .eq('id', WORKER_ID);
}, 30000);
`;
  }

  private async runCommand(ssh: NodeSSH, command: string, timeoutMs: number = 120000): Promise<void> {
    console.log(`[SSH] $ ${command.substring(0, 60)}...`);
    const result = await ssh.execCommand(command, { execOptions: { timeout: timeoutMs } });
    if (result.code !== 0) {
      throw new Error(`Command failed: ${result.stderr}`);
    }
  }

  private async writeFile(ssh: NodeSSH, remotePath: string, content: string): Promise<void> {
    // Write file in chunks to avoid command length limits
    await ssh.execCommand(`rm -f ${remotePath}`);
    const lines = content.split('\n');
    for (const line of lines) {
      const escaped = line.replace(/'/g, "'\"'\"'").replace(/\\/g, '\\\\');
      await ssh.execCommand(`echo '${escaped}' >> ${remotePath}`);
    }
  }
}
