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
    
    // Step 3: Install OpenClaw globally via npm
    console.log('[OpenClaw] Installing OpenClaw CLI...');
    await ssh.execCommand('npm install -g openclaw');
    
    // Step 4: Create OpenClaw workspace
    console.log('[OpenClaw] Setting up workspace...');
    await ssh.execCommand('mkdir -p /opt/openclaw-workspace && cd /opt/openclaw-workspace && openclaw init --yes');
    
    // Step 5: Create configuration file (answers the setup questions automatically)
    console.log('[OpenClaw] Creating configuration...');
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
    
    // Step 6: Create bootstrap script that starts OpenClaw
    console.log('[OpenClaw] Creating bootstrap script...');
    const bootstrapScript = `#!/bin/bash
export OPENCLAW_WORKSPACE=/opt/openclaw-workspace
export OPENCLAW_PORT=3001
export OPENCLAW_HOST=0.0.0.0
cd /opt/openclaw-workspace
exec openclaw gateway --port 3001 --host 0.0.0.0
`;
    
    await ssh.execCommand(`cat > /opt/openclaw-workspace/start.sh << 'EOF'
${bootstrapScript}
EOF`);
    await ssh.execCommand('chmod +x /opt/openclaw-workspace/start.sh');
    
    // Step 7: Create systemd service
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
    
    // Step 8: Start the service
    console.log('[OpenClaw] Starting OpenClaw service...');
    await ssh.execCommand('systemctl daemon-reload && systemctl enable openclaw-gateway && systemctl start openclaw-gateway');
    
    // Step 9: Wait for OpenClaw to initialize
    console.log('[OpenClaw] Waiting for initialization...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 10: Verify health
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
