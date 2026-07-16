import { NodeSSH } from 'node-ssh';
import { HetznerService, HetznerServerConfig } from './hetznerService';
import { db } from '../db/supabase';
import { v4 as uuidv4 } from 'uuid';

export interface VPSConfig {
  workerId: string;
  storeId: string;
  userId: string;
  envVars: Record<string, string>;
}

export interface ProvisioningResult {
  serverId: number;
  ipAddress: string;
  rootPassword?: string;
  status: 'success' | 'failed';
  error?: string;
}

export class VPSProvisioner {
  private hetzner: HetznerService;
  private sshPrivateKey: string;

  constructor(hetznerService: HetznerService, sshPrivateKey: string, sshPublicKey?: string) {
    this.hetzner = hetznerService;
    this.sshPrivateKey = sshPrivateKey;
    this.sshPublicKey = sshPublicKey || '';
  }

  private sshPublicKey: string;

  async provisionVPS(config: VPSConfig): Promise<ProvisioningResult> {
    const serverName = `shoppdropp-worker-${config.workerId.slice(0, 8)}`;
    
    try {
      // Step 1: Create Hetzner server
      await this.logStep(config.workerId, 1, 'Initialize VPS', 10, 'Creating server instance on Hetzner...');
      console.log(`[VPS] Step 1: Creating server ${serverName}...`);
      
      const serverConfig: HetznerServerConfig = {
        name: serverName,
        server_type: 'cpx12', // 1 vCPU x86, 2GB RAM, 40GB NVMe
        image: 'ubuntu-22.04',
        location: 'nbg1',
        labels: {
          worker_id: config.workerId,
          store_id: config.storeId,
          user_id: config.userId,
        },
      };

      // Use existing 'render' SSH key from Hetzner (ID: 115169010)
      // This ensures the key matches our private key
      const sshKeyId = 115169010;
      console.log(`[VPS] Using existing SSH key: ${sshKeyId}`);

      console.log(`[VPS] Calling hetzner.createServer...`);
      const server = await this.hetzner.createServer(serverConfig, sshKeyId);
      console.log(`[VPS] Server created: ${server.id}, waiting for ready...`);
      
      await this.logStep(config.workerId, 1, 'Initialize VPS', 50, `Server ${server.id} created, waiting for initialization...`);

      // Step 2: Wait for server to be ready
      const readyServer = await this.hetzner.waitForServerReady(server.id, 120000);
      console.log(`[VPS] Server ready: ${readyServer.public_net.ipv4.ip}`);
      
      await this.logStep(config.workerId, 1, 'Initialize VPS', 100, `Server ready at ${readyServer.public_net.ipv4.ip}`);

      // Step 3: Update worker record with server info
      await db.updateWorker(config.workerId, {
        hetzner_server_id: server.id.toString(),
        status: 'configuring',
      });

      // Step 4: Wait for SSH to be available (needs ~60-90 seconds for SSH to be ready)
      console.log(`[VPS] Waiting for SSH to be available (90 seconds)...`);
      await this.logStep(config.workerId, 1, 'Initialize VPS', 90, 'Waiting for SSH service to start...');
      await new Promise(resolve => setTimeout(resolve, 90000));

      // Step 5: Install OpenClaw via SSH
      console.log(`[VPS] Installing OpenClaw...`);
      await this.installOpenClaw(readyServer.public_net.ipv4.ip, config);
      console.log(`[VPS] OpenClaw installed successfully`);

      // Step 6: Update worker status
      await db.updateWorker(config.workerId, {
        status: 'running',
      });

      return {
        serverId: server.id,
        ipAddress: readyServer.public_net.ipv4.ip,
        status: 'success',
      };

    } catch (error: any) {
      console.error(`[VPS] Provisioning failed for worker ${config.workerId}:`, error);
      console.error(`[VPS] Error message:`, error.message);
      console.error(`[VPS] Error stack:`, error.stack);
      
      // Update worker status to error
      try {
        await db.updateWorker(config.workerId, {
          status: 'error',
        });
        console.log(`[VPS] Worker ${config.workerId} status updated to error`);
      } catch (dbError) {
        console.error(`[VPS] Failed to update worker status:`, dbError);
      }

      return {
        serverId: 0,
        ipAddress: '',
        status: 'failed',
        error: error.message,
      };
    }
  }

  private async logStep(workerId: string, stepNumber: number, stepName: string, progress: number, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Step ${stepNumber}: ${stepName} - ${progress}% - ${message}`;
    
    // Store progress in a simple format that the frontend can parse
    // Using the existing metadata field or we can parse from logs
    console.log(`[VPS] ${logEntry}`);
  }

  private async installOpenClaw(ipAddress: string, config: VPSConfig): Promise<void> {
    const ssh = new NodeSSH();
    
    try {
      console.log(`[SSH] Connecting to ${ipAddress}...`);
      await this.logStep(config.workerId, 2, 'Install Dependencies', 10, 'Connecting via SSH...');
      
      // Connect via SSH (with host key check disabled for cloud instances)
      await ssh.connect({
        host: ipAddress,
        username: 'root',
        privateKey: this.sshPrivateKey,
        readyTimeout: 60000,
        tryKeyboard: false,
        keepaliveInterval: 5000,
      });

      console.log(`[SSH] Connected to ${ipAddress}`);
      await this.logStep(config.workerId, 2, 'Install Dependencies', 20, 'Connected, updating system packages...');

      // Step 1: Update system and install dependencies
      console.log(`[SSH] Step 1/9: Updating system (this takes 2-3 minutes)...`);
      await this.runCommand(ssh, 'apt-get update', 300000);
      await this.logStep(config.workerId, 2, 'Install Dependencies', 40, 'System updated, upgrading packages...');
      
      console.log(`[SSH] Step 1a: Upgrading packages...`);
      await this.runCommand(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q', 300000);
      await this.logStep(config.workerId, 2, 'Install Dependencies', 60, 'Packages upgraded, installing tools...');
      
      console.log(`[SSH] Step 1b: Installing tools...`);
      await this.runCommand(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get install -y -q curl wget git unzip jq', 180000);
      await this.logStep(config.workerId, 2, 'Install Dependencies', 80, 'Tools installed, installing Node.js...');

      // Step 2: Install Node.js 20
      console.log(`[SSH] Step 2/9: Installing Node.js...`);
      await this.runCommand(ssh, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', 180000);
      console.log(`[SSH] Step 2a: Installing nodejs package...`);
      await this.runCommand(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs', 180000);
      
      // Verify Node.js
      const nodeCheck = await ssh.execCommand('node --version');
      console.log(`[SSH] Node.js version: ${nodeCheck.stdout.trim()}`);
      await this.logStep(config.workerId, 2, 'Install Dependencies', 100, `Node.js ${nodeCheck.stdout.trim()} installed`);

      // Step 3: Create openclaw user
      await this.logStep(config.workerId, 3, 'Configure SSH', 30, 'Creating openclaw user...');
      console.log(`[SSH] Step 3/9: Creating openclaw user...`);
      await this.runCommand(ssh, 'useradd -m -s /bin/bash openclaw || true');
      await this.runCommand(ssh, 'usermod -aG sudo openclaw');
      await this.logStep(config.workerId, 3, 'Configure SSH', 100, 'User created and configured');

      // Step 4: Create app directory
      await this.logStep(config.workerId, 4, 'Install OpenClaw', 20, 'Creating app directory...');
      console.log(`[SSH] Step 4/9: Creating app directory...`);
      await this.runCommand(ssh, 'mkdir -p /opt/openclaw');
      await this.runCommand(ssh, 'chown openclaw:openclaw /opt/openclaw');

      // Step 5: Create OpenClaw worker script
      console.log(`[SSH] Step 5/9: Creating OpenClaw worker script...`);
      await this.logStep(config.workerId, 4, 'Install OpenClaw', 60, 'Creating worker script...');
      
      const workerScript = `#!/bin/bash
# OpenClaw Worker - ShoppDropp VPS Worker
set -e

echo "========================================"
echo "OpenClaw Worker Started"
echo "Worker ID: \${WORKER_ID:-unknown}"
echo "Store ID: \${STORE_ID:-unknown}"
echo "AI Provider: \${AI_PROVIDER:-openrouter}"
echo "========================================"

# Log environment info
env | grep -E '^(WORKER|STORE|AI|CJ|VERCEL|GITHUB)' | sed 's/^/ENV: /'

# Keep worker running with heartbeat
while true; do
    echo "[$(date -Iseconds)] Worker heartbeat - Ready for tasks from store \${STORE_ID}"
    sleep 30
done`;

      // Write script using echo to avoid heredoc issues
      await this.runCommand(ssh, `echo '${workerScript.replace(/'/g, "'\"'\"'")}' > /opt/openclaw/openclaw`);
      await this.runCommand(ssh, 'chmod +x /opt/openclaw/openclaw');
      await this.runCommand(ssh, 'chown openclaw:openclaw /opt/openclaw/openclaw');
      console.log(`[SSH] OpenClaw worker script created`);

      // Step 6: Create .env file with all configuration
      console.log(`[SSH] Step 6/9: Configuring environment...`);
      const envContent = this.buildEnvFile(config);
      
      // Write env file line by line to handle special characters
      const envLines = envContent.split('\n').filter(line => line.trim());
      for (const line of envLines) {
        await this.runCommand(ssh, `echo '${line.replace(/'/g, "'\"'\"'")}' >> /opt/openclaw/.env`);
      }
      await this.runCommand(ssh, 'chown openclaw:openclaw /opt/openclaw/.env');
      await this.runCommand(ssh, 'chmod 600 /opt/openclaw/.env');
      await this.logStep(config.workerId, 5, 'Configure Environment', 100, 'Environment configured');

      // Step 7: Create systemd service
      await this.logStep(config.workerId, 6, 'Start Services', 30, 'Creating systemd service...');
      console.log(`[SSH] Step 7/9: Creating systemd service...`);
      const serviceContent = this.buildSystemdService();
      const serviceLines = serviceContent.split('\n');
      for (const line of serviceLines) {
        await this.runCommand(ssh, `echo '${line.replace(/'/g, "'\"'\"'")}' >> /etc/systemd/system/openclaw.service`);
      }

      // Step 8: Start OpenClaw service
      await this.logStep(config.workerId, 6, 'Start Services', 60, 'Starting OpenClaw service...');
      console.log(`[SSH] Step 8/9: Starting OpenClaw service...`);
      await this.runCommand(ssh, 'systemctl daemon-reload', 60000);
      await this.runCommand(ssh, 'systemctl enable openclaw', 30000);
      await this.runCommand(ssh, 'systemctl start openclaw', 60000);

      // Step 9: Verify service is running
      await this.logStep(config.workerId, 7, 'Health Check', 50, 'Verifying service is operational...');
      console.log(`[SSH] Step 9/9: Verifying service...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check service status multiple times
      let isActive = false;
      for (let i = 0; i < 3; i++) {
        const statusResult = await ssh.execCommand('systemctl is-active openclaw');
        if (statusResult.stdout.trim() === 'active') {
          isActive = true;
          break;
        }
        console.log(`[SSH] Service check ${i + 1}/3: not active yet, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      if (!isActive) {
        const logs = await ssh.execCommand('journalctl -u openclaw --no-pager -n 50');
        console.error(`[SSH] Service failed to start. Logs:\n${logs.stdout}`);
        throw new Error(`OpenClaw service failed to start. Check logs.`);
      }

      await this.logStep(config.workerId, 7, 'Health Check', 100, 'Service is active and healthy');
      await this.logStep(config.workerId, 8, 'Ready', 100, 'VPS worker is ready for tasks');
      console.log(`[SSH] ✅ OpenClaw service is active`);

    } finally {
      ssh.dispose();
    }
  }

  private async runCommand(ssh: NodeSSH, command: string, timeoutMs: number = 120000): Promise<void> {
    console.log(`[SSH] Running: ${command.substring(0, 80)}...`);
    const result = await ssh.execCommand(command, { execOptions: { timeout: timeoutMs } });
    if (result.code !== 0) {
      console.error(`[SSH] Command failed with code ${result.code}: ${command}`);
      console.error(`[SSH] stderr: ${result.stderr}`);
      console.error(`[SSH] stdout: ${result.stdout}`);
      throw new Error(`Command failed (code ${result.code}): ${result.stderr || 'No error message'}`);
    }
    console.log(`[SSH] Command succeeded`);
  }

  private buildEnvFile(config: VPSConfig): string {
    const envVars = {
      // Core
      NODE_ENV: 'production',
      WORKER_ID: config.workerId,
      STORE_ID: config.storeId,
      USER_ID: config.userId,
      
      // Backend connection
      BACKEND_WS_URL: process.env.BACKEND_WS_URL || 'wss://shoppdropp-api.onrender.com',
      BACKEND_API_URL: process.env.BACKEND_API_URL || 'https://shoppdropp-api.onrender.com',
      
      // Worker config
      WORKER_HEARTBEAT_INTERVAL: '30000',
      WORKER_MAX_CONCURRENT_TASKS: '3',
      
      // Logging
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      
      // User-provided env vars
      ...config.envVars,
    };

    return Object.entries(envVars)
      .map(([key, value]) => `${key}="${value}"`)
      .join('\n');
  }

  private buildSystemdService(): string {
    return `[Unit]
Description=OpenClaw Worker Agent
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/opt/openclaw
EnvironmentFile=/opt/openclaw/.env
ExecStart=/opt/openclaw/openclaw
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;
  }

  async destroyVPS(serverId: number, workerId: string): Promise<void> {
    try {
      console.log(`[VPS] Destroying server ${serverId}...`);
      await this.hetzner.deleteServer(serverId);
      
      // Update worker record
      await db.updateWorker(workerId, {
        hetzner_server_id: null,
        ip_address: null,
        status: 'idle',
      });
      
      console.log(`[VPS] Server ${serverId} destroyed`);
    } catch (error: any) {
      console.error(`[VPS] Failed to destroy server:`, error);
      throw error;
    }
  }

  async rebootVPS(serverId: number): Promise<void> {
    await this.hetzner.reboot(serverId);
  }

  async getServerMetrics(serverId: number): Promise<any> {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 3600000).toISOString(); // Last hour
    
    const [cpuMetrics, diskMetrics] = await Promise.all([
      this.hetzner.getServerMetrics(serverId, 'cpu', start, end),
      this.hetzner.getServerMetrics(serverId, 'disk', start, end),
    ]);

    return {
      cpu: cpuMetrics,
      disk: diskMetrics,
    };
  }
}

// Factory function
export function createVPSProvisioner(): VPSProvisioner {
  const hetznerToken = process.env.HETZNER_API_TOKEN;
  const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
  const sshPublicKey = process.env.SSH_PUBLIC_KEY;

  if (!hetznerToken) {
    throw new Error('HETZNER_API_TOKEN not configured');
  }
  if (!sshPrivateKey) {
    throw new Error('SSH_PRIVATE_KEY not configured');
  }

  const hetznerService = new HetznerService(hetznerToken);
  return new VPSProvisioner(hetznerService, sshPrivateKey, sshPublicKey);
}
