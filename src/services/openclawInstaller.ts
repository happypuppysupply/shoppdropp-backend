/**
 * REAL OpenClaw Installer for VPS
 * Clones and configures the actual OpenClaw agent
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
    console.log('[OpenClaw] Starting REAL OpenClaw installation...');
    
    // Step 1: Update system and install dependencies
    console.log('[OpenClaw] Installing system dependencies...');
    await ssh.execCommand('apt-get update && apt-get install -y curl git build-essential python3 python3-pip');
    
    // Step 2: Install Node.js 20 (OpenClaw requires this)
    console.log('[OpenClaw] Installing Node.js 20...');
    await ssh.execCommand('curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs');
    
    const nodeVersion = await ssh.execCommand('node --version');
    console.log('[OpenClaw] Node.js version:', nodeVersion.stdout);
    
    // Step 3: Clone OpenClaw from GitHub (more reliable than npm)
    console.log('[OpenClaw] Cloning OpenClaw from GitHub...');
    await ssh.execCommand('rm -rf /opt/openclaw && git clone https://github.com/openclaw/openclaw.git /opt/openclaw');
    
    // Step 4: Install OpenClaw dependencies
    console.log('[OpenClaw] Installing dependencies...');
    await ssh.execCommand('cd /opt/openclaw && npm install');
    
    // Step 5: Build OpenClaw
    console.log('[OpenClaw] Building OpenClaw...');
    const buildResult = await ssh.execCommand('cd /opt/openclaw && npm run build 2>&1');
    if (buildResult.stderr && buildResult.stderr.includes('error')) {
      console.error('[OpenClaw] Build errors:', buildResult.stderr);
    }
    console.log('[OpenClaw] Build output:', buildResult.stdout.substring(0, 500));
    
    // Step 6: Create OpenClaw workspace
    console.log('[OpenClaw] Setting up workspace...');
    await ssh.execCommand('mkdir -p /opt/openclaw-workspace');
    
    // Step 7: Create configuration file (answers the setup questions automatically)
    console.log('[OpenClaw] Creating configuration...');
    await ssh.execCommand('mkdir -p /opt/openclaw-workspace/.openclaw');
    
    const openclawConfig = {
      workspace: "/opt/openclaw-workspace",
      defaultModel: "openrouter/moonshotai/kimi-k2.5",
      gateway: {
        port: 3001,
        host: "0.0.0.0"
      },
      skills: {
        autoLoad: true,
        enabled: [
          "browser-automation",
          "canvas", 
          "web-search",
          "web-fetch",
          "healthcheck"
        ]
      },
      security: {
        confirmDestructive: false,
        allowRemoteExecution: true
      },
      worker: {
        id: config.workerId,
        userId: config.userId,
        storeId: config.storeId
      }
    };
    
    await ssh.execCommand(`cat > /opt/openclaw-workspace/.openclaw/config.json << 'EOF'
${JSON.stringify(openclawConfig, null, 2)}
EOF`);
    
    // Step 8: Find the correct entry point and create bootstrap script
    console.log('[OpenClaw] Finding entry point...');
    
    // Check what files exist after build
    const findResult = await ssh.execCommand('find /opt/openclaw -name "*.js" -type f | head -20');
    console.log('[OpenClaw] Available JS files:', findResult.stdout);
    
    // Determine the correct entry point
    let entryPoint = '';
    const possiblePaths = [
      '/opt/openclaw/dist/gateway/index.js',
      '/opt/openclaw/dist/gateway/main.js', 
      '/opt/openclaw/dist/index.js',
      '/opt/openclaw/packages/gateway/dist/index.js',
      '/opt/openclaw/packages/gateway/dist/main.js',
      '/opt/openclaw/build/index.js',
    ];
    
    for (const path of possiblePaths) {
      const check = await ssh.execCommand(`test -f ${path} && echo "exists" || echo "not found"`);
      if (check.stdout.trim() === 'exists') {
        entryPoint = path;
        console.log('[OpenClaw] Found entry point:', entryPoint);
        break;
      }
    }
    
    if (!entryPoint) {
      // Fallback: look for any main/dist file
      const findMain = await ssh.execCommand('find /opt/openclaw -name "index.js" -o -name "main.js" | grep -E "(dist|build)" | head -1');
      if (findMain.stdout.trim()) {
        entryPoint = findMain.stdout.trim();
        console.log('[OpenClaw] Using found entry point:', entryPoint);
      } else {
        throw new Error('Could not find OpenClaw entry point after build');
      }
    }
    
    console.log('[OpenClaw] Creating bootstrap script...');
    const bootstrapScript = `#!/bin/bash
export OPENCLAW_WORKSPACE=/opt/openclaw-workspace
export OPENCLAW_PORT=3001
export OPENCLAW_HOST=0.0.0.0
export NODE_ENV=production
cd /opt/openclaw
exec node ${entryPoint} --port 3001 --host 0.0.0.0 --workspace /opt/openclaw-workspace 2>&1 | tee /var/log/openclaw.log
`;
    
    await ssh.execCommand(`cat > /opt/openclaw-workspace/start.sh << 'EOF'
${bootstrapScript}
EOF`);
    await ssh.execCommand('chmod +x /opt/openclaw-workspace/start.sh');
    
    // Step 9: Create systemd service
    console.log('[OpenClaw] Creating systemd service...');
    const systemdService = `[Unit]
Description=OpenClaw Agent Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-workspace
ExecStart=/opt/openclaw-workspace/start.sh
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=OPENCLAW_WORKSPACE=/opt/openclaw-workspace
Environment=OPENCLAW_PORT=3001

[Install]
WantedBy=multi-user.target`;

    await ssh.execCommand(`cat > /etc/systemd/system/openclaw-gateway.service << 'EOF'
${systemdService}
EOF`);
    
    // Step 10: Start the service
    console.log('[OpenClaw] Starting OpenClaw service...');
    await ssh.execCommand('systemctl daemon-reload && systemctl enable openclaw-gateway && systemctl start openclaw-gateway');
    
    // Step 11: Wait for OpenClaw to initialize
    console.log('[OpenClaw] Waiting for initialization...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 12: Verify health
    console.log('[OpenClaw] Verifying installation...');
    const isHealthy = await verifyGatewayHealth(ipAddress, 15);
    
    if (!isHealthy) {
      // Check logs for errors
      const logs = await ssh.execCommand('journalctl -u openclaw-gateway --no-pager -n 50');
      console.error('[OpenClaw] Service logs:', logs.stdout);
      throw new Error('OpenClaw health check failed - check logs above');
    }
    
    console.log('[OpenClaw] ✅ Real OpenClaw installed and running');
    console.log('[OpenClaw] ✅ Gateway URL:', gatewayUrl);
    
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

export async function verifyGatewayHealth(ipAddress: string, retries: number = 15): Promise<boolean> {
  const gatewayUrl = `http://${ipAddress}:3001/health`;
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[OpenClaw] Health check attempt ${i + 1}/${retries}...`);
      
      const response = await fetch(gatewayUrl, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[OpenClaw] Health response:', data);
        if (data.status === 'ok' || data.status === 'healthy') {
          console.log('[OpenClaw] ✅ Health check passed');
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
