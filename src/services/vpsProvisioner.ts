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

      // Upload SSH key to Hetzner if we have a public key
      let sshKeyId: number | undefined;
      if (this.sshPublicKey) {
        console.log(`[VPS] Uploading SSH key to Hetzner...`);
        sshKeyId = await this.hetzner.uploadSSHKey(`shoppdropp-${config.workerId.slice(0, 8)}`, this.sshPublicKey);
      }

      console.log(`[VPS] Calling hetzner.createServer...`);
      const server = await this.hetzner.createServer(serverConfig, sshKeyId);
      console.log(`[VPS] Server created: ${server.id}, waiting for ready...`);

      // Step 2: Wait for server to be ready
      const readyServer = await this.hetzner.waitForServerReady(server.id, 120000);
      console.log(`[VPS] Server ready: ${readyServer.public_net.ipv4.ip}`);

      // Step 3: Update worker record with server info
      // Note: Only update status and hetzner_server_id (ip_address column missing)
      await db.updateWorker(config.workerId, {
        hetzner_server_id: server.id.toString(),
        status: 'configuring',
      });

      // Step 4: Wait a bit more for SSH to be available
      console.log(`[VPS] Waiting for SSH...`);
      await new Promise(resolve => setTimeout(resolve, 30000));

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

  private async installOpenClaw(ipAddress: string, config: VPSConfig): Promise<void> {
    const ssh = new NodeSSH();
    
    try {
      // Connect via SSH
      await ssh.connect({
        host: ipAddress,
        username: 'root',
        privateKey: this.sshPrivateKey,
        readyTimeout: 60000,
      });

      console.log(`[SSH] Connected to ${ipAddress}`);

      // Step 1: Update system and install dependencies
      console.log(`[SSH] Step 1/9: Updating system...`);
      await this.runCommand(ssh, 'apt-get update && apt-get upgrade -y');
      console.log(`[SSH] Step 1a: Installing tools...`);
      await this.runCommand(ssh, 'apt-get install -y curl wget git unzip jq');

      // Step 2: Install Node.js 20
      console.log(`[SSH] Step 2/9: Installing Node.js...`);
      await this.runCommand(ssh, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
      console.log(`[SSH] Step 2a: Installing nodejs package...`);
      await this.runCommand(ssh, 'apt-get install -y nodejs');

      // Step 3: Create openclaw user
      console.log(`[SSH] Step 3/9: Creating openclaw user...`);
      await this.runCommand(ssh, 'useradd -m -s /bin/bash openclaw || true');
      await this.runCommand(ssh, 'usermod -aG sudo openclaw');

      // Step 4: Create app directory
      console.log(`[SSH] Step 4/9: Creating app directory...`);
      await this.runCommand(ssh, 'mkdir -p /opt/openclaw');
      await this.runCommand(ssh, 'chown openclaw:openclaw /opt/openclaw');

      // Step 5: Download and install OpenClaw
      console.log(`[SSH] Step 5/9: Downloading OpenClaw...`);
      const openclawVersion = process.env.OPENCLAW_VERSION || 'latest';
      const downloadUrl = openclawVersion === 'latest' 
        ? 'https://github.com/openclaw/openclaw/releases/latest/download/openclaw-linux-x64.tar.gz'
        : `https://github.com/openclaw/openclaw/releases/download/${openclawVersion}/openclaw-linux-x64.tar.gz`;
      
      console.log(`[SSH] Downloading from: ${downloadUrl}`);
      await this.runCommand(ssh, `cd /opt/openclaw && curl -L -o openclaw.tar.gz "${downloadUrl}"`);
      console.log(`[SSH] Extracting OpenClaw...`);
      await this.runCommand(ssh, 'cd /opt/openclaw && tar -xzf openclaw.tar.gz && rm openclaw.tar.gz');
      await this.runCommand(ssh, 'chmod +x /opt/openclaw/openclaw');

      // Step 6: Create .env file with all configuration
      console.log(`[SSH] Step 6/9: Configuring environment...`);
      const envContent = this.buildEnvFile(config);
      await this.runCommand(ssh, `cat > /opt/openclaw/.env << 'EOF'
${envContent}
EOF`);

      // Step 7: Create systemd service
      console.log(`[SSH] Step 7/9: Creating systemd service...`);
      const serviceContent = this.buildSystemdService();
      await this.runCommand(ssh, `cat > /etc/systemd/system/openclaw.service << 'EOF'
${serviceContent}
EOF`);

      // Step 8: Start OpenClaw service
      console.log(`[SSH] Step 8/9: Starting OpenClaw service...`);
      await this.runCommand(ssh, 'systemctl daemon-reload');
      await this.runCommand(ssh, 'systemctl enable openclaw');
      await this.runCommand(ssh, 'systemctl start openclaw');

      // Step 9: Verify service is running
      console.log(`[SSH] Step 9/9: Verifying service...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      const statusResult = await ssh.execCommand('systemctl is-active openclaw');
      
      if (statusResult.stdout.trim() !== 'active') {
        const logs = await ssh.execCommand('journalctl -u openclaw --no-pager -n 50');
        throw new Error(`OpenClaw service failed to start. Logs: ${logs.stdout}`);
      }

      console.log(`[SSH] OpenClaw service is active`);

    } finally {
      ssh.dispose();
    }
  }

  private async runCommand(ssh: NodeSSH, command: string): Promise<void> {
    const result = await ssh.execCommand(command);
    if (result.code !== 0) {
      throw new Error(`Command failed: ${command}\nError: ${result.stderr}`);
    }
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
ExecStart=/opt/openclaw/openclay
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
