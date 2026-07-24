import { NodeSSH } from 'node-ssh';
import { HetznerService, HetznerServerConfig } from './hetznerService';
import { db, supabase } from '../db/supabase';
import { OpenClawInstaller } from './openclawInstaller';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

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

export class VPSProvisionerFixed {
  private hetzner: HetznerService;
  private sshPrivateKey: string;
  private sshPublicKey: string;

  constructor(hetznerService: HetznerService) {
    this.hetzner = hetznerService;
    
    // Read SSH keys from environment variables (set in Render dashboard)
    // Supports: SSH_PRIVATE_KEY (with newlines), SSH_PUBLIC_KEY
    // Fallback to file system for local development
    const sshPrivateKeyFromEnv = process.env.SSH_PRIVATE_KEY;
    const sshPublicKeyFromEnv = process.env.SSH_PUBLIC_KEY;
    
    if (sshPrivateKeyFromEnv && sshPublicKeyFromEnv) {
      // Use keys from environment (properly handle newlines)
      this.sshPrivateKey = sshPrivateKeyFromEnv.replace(/\\n/g, '\n');
      this.sshPublicKey = sshPublicKeyFromEnv;
      console.log('[VPS] Using SSH keys from environment variables');
    } else {
      // Fallback to file system - use ED25519 key that matches Hetzner
      const sshDir = '/home/markjohnson44la44gigi/.openclaw/workspace/.secrets';
      this.sshPrivateKey = fs.readFileSync(path.join(sshDir, 'shoppdropp_render_ed25519'), 'utf8');
      this.sshPublicKey = fs.readFileSync(path.join(sshDir, 'shoppdropp_render_key.pub'), 'utf8');
      console.log('[VPS] Using SSH keys from file system (ED25519)');
    }
  }

  async provisionVPS(config: VPSConfig): Promise<ProvisioningResult> {
    const serverName = `shoppdropp-worker-${config.workerId.slice(0, 8)}`;
    
    try {
      console.log(`[VPS] Creating server ${serverName} with proper SSH key...`);

      // Step 1: Upload SSH key to Hetzner (or use existing)
      const sshKeyId = await this.ensureSSHKey();
      console.log(`[VPS] Using SSH key ID: ${sshKeyId}`);

      // Step 2: Create Hetzner server
      const serverConfig: HetznerServerConfig = {
        name: serverName,
        server_type: 'cpx12',
        image: 'ubuntu-22.04',
        location: 'nbg1',
        labels: {
          worker_id: config.workerId,
          store_id: config.storeId,
          user_id: config.userId,
        },
      };

      const server = await this.hetzner.createServer(serverConfig, sshKeyId);
      console.log(`[VPS] Server created: ${server.id}`);

      // Step 3: Wait for server to be ready
      const readyServer = await this.hetzner.waitForServerReady(server.id, 120000);
      const ipAddress = readyServer.public_net.ipv4.ip;
      console.log(`[VPS] Server ready at ${ipAddress}`);

      // Step 4: Update worker record
      await db.updateWorker(config.workerId, {
        hetzner_server_id: server.id.toString(),
        ip_address: ipAddress,
        status: 'configuring',
      });

      // Step 5: Wait for SSH
      console.log(`[VPS] Waiting 90 seconds for SSH...`);
      await new Promise(resolve => setTimeout(resolve, 90000));

      // Step 6: Deploy REAL OpenClaw Gateway
      console.log(`[VPS] Deploying REAL OpenClaw Gateway...`);
      const openclawInstaller = new OpenClawInstaller();
      await openclawInstaller.installOpenClaw(ipAddress, {
        workerId: config.workerId,
        storeId: config.storeId,
        userId: config.userId,
        openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseKey: process.env.SUPABASE_SERVICE_KEY || ''
      });

      // Step 7: Update status
      await db.updateWorker(config.workerId, {
        status: 'active',
      });

      return {
        serverId: server.id,
        ipAddress: ipAddress,
        status: 'success',
      };

    } catch (error: any) {
      console.error(`[VPS] Provisioning failed:`, error.message);
      await db.updateWorker(config.workerId, { status: 'error' });
      return {
        serverId: 0,
        ipAddress: '',
        status: 'failed',
        error: error.message,
      };
    }
  }

  private async ensureSSHKey(): Promise<number> {
    try {
      // Try to find existing key
      const keys = await this.hetzner.listSSHKeys();
      const existingKey = keys.find((k: any) => k.name === 'shoppdropp-render-fixed');
      
      if (existingKey) {
        console.log(`[VPS] Found existing SSH key: ${existingKey.id}`);
        return existingKey.id;
      }

      // Create new key
      console.log(`[VPS] Creating new SSH key...`);
      const newKey = await this.hetzner.createSSHKey(
        'shoppdropp-render-fixed',
        this.sshPublicKey
      );
      console.log(`[VPS] Created SSH key: ${newKey.id}`);
      return newKey.id;
    } catch (err: any) {
      console.error(`[VPS] SSH key error:`, err.message);
      throw err;
    }
  }

  private async deployRealWorker(ipAddress: string, config: VPSConfig): Promise<void> {
    const ssh = new NodeSSH();
    
    try {
      console.log(`[SSH] Connecting to ${ipAddress}...`);
      
      // Retry SSH connection
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
          console.log(`[SSH] Connected on attempt ${attempt}`);
          break;
        } catch (err: any) {
          console.log(`[SSH] Attempt ${attempt} failed: ${err.message}`);
          if (attempt < 10) {
            await new Promise(resolve => setTimeout(resolve, 15000));
          }
        }
      }

      if (!connected) {
        throw new Error('Failed to connect after 10 attempts');
      }

      // Install Node.js 20
      console.log(`[SSH] Installing Node.js...`);
      await this.runCommand(ssh, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', 180000);
      await this.runCommand(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs', 180000);

      // Create directory
      console.log(`[SSH] Creating worker directory...`);
      await this.runCommand(ssh, 'mkdir -p /opt/shoppdropp-worker');

      // Create package.json
      console.log(`[SSH] Creating package.json...`);
      const packageJson = {
        name: "shoppdropp-worker",
        version: "1.0.0",
        dependencies: {
          "@supabase/supabase-js": "^2.49.1",
          "axios": "^1.8.4"
        }
      };
      await this.runCommand(ssh, `echo '${JSON.stringify(packageJson)}' > /opt/shoppdropp-worker/package.json`);

      // Install dependencies
      console.log(`[SSH] Installing dependencies...`);
      await this.runCommand(ssh, 'cd /opt/shoppdropp-worker && npm install', 180000);

      // Copy real worker script
      console.log(`[SSH] Deploying worker script...`);
      const workerScript = fs.readFileSync('/home/markjohnson44la44gigi/.openclaw/workspace/shoppdropp-worker/real-worker.ts', 'utf8');
      
      // Write script in chunks
      const lines = workerScript.split('\n');
      for (const line of lines) {
        await this.runCommand(ssh, `echo '${line.replace(/'/g, "'\"'\"'")}' >> /opt/shoppdropp-worker/worker.js`);
      }

      // Create .env file
      console.log(`[SSH] Creating environment file...`);
      const envContent = `SUPABASE_URL=https://tdokcqkdtwzhjvdkspls.supabase.co
SUPABASE_SERVICE_KEY=***
WORKER_ID=${config.workerId}
STORE_ID=${config.storeId}
OPENWEBNINJA_API_KEY=ak_y2u…5pcq
OPENROUTER_API_KEY=***`;
      
      for (const line of envContent.split('\n')) {
        await this.runCommand(ssh, `echo '${line.replace(/'/g, "'\"'\"'")}' >> /opt/shoppdropp-worker/.env`);
      }

      // Create systemd service
      console.log(`[SSH] Creating systemd service...`);
      const serviceContent = `[Unit]
Description=ShoppDropp Real Worker
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/shoppdropp-worker
Environment=NODE_ENV=production
EnvironmentFile=/opt/shoppdropp-worker/.env
ExecStart=/usr/bin/node worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`;

      for (const line of serviceContent.split('\n')) {
        await this.runCommand(ssh, `echo '${line.replace(/'/g, "'\"'\"'")}' >> /etc/systemd/system/shoppdropp-worker.service`);
      }

      // Start service
      console.log(`[SSH] Starting worker service...`);
      await this.runCommand(ssh, 'systemctl daemon-reload');
      await this.runCommand(ssh, 'systemctl enable shoppdropp-worker');
      await this.runCommand(ssh, 'systemctl start shoppdropp-worker');

      // Verify
      await new Promise(resolve => setTimeout(resolve, 5000));
      const status = await ssh.execCommand('systemctl is-active shoppdropp-worker');
      if (status.stdout.trim() === 'active') {
        console.log(`[SSH] ✅ Worker service is active`);
      } else {
        const logs = await ssh.execCommand('journalctl -u shoppdropp-worker --no-pager -n 20');
        console.error(`[SSH] Service failed to start:\n${logs.stdout}`);
        throw new Error('Worker service failed to start');
      }

    } finally {
      ssh.dispose();
    }
  }

  private async runCommand(ssh: NodeSSH, command: string, timeoutMs: number = 120000): Promise<void> {
    console.log(`[SSH] $ ${command.substring(0, 60)}...`);
    const result = await ssh.execCommand(command, { execOptions: { timeout: timeoutMs } });
    if (result.code !== 0) {
      throw new Error(`Command failed: ${result.stderr}`);
    }
  }
}
