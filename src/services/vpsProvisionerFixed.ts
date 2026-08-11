import { NodeSSH } from 'node-ssh';
import { HetznerService, HetznerServerConfig } from './hetznerService';
import { db } from '../db/supabase';
import { loadSSHKeys } from './sshKeyHelper';
import { installOpenClawGateway, verifyGatewayHealth } from './openclawInstaller';

export interface VPSConfig {
  workerId: string;
  storeId: string;
  userId: string;
  envVars: Record<string, string>;
}

export interface ProvisioningResult {
  serverId: number;
  ipAddress: string;
  status: 'success' | 'failed';
  error?: string;
}

// DEPRECATED: Use the reprovision route instead
// This file kept for backward compatibility
export class VPSProvisionerFixed {
  private hetzner: HetznerService;

  constructor(hetznerService: HetznerService) {
    this.hetzner = hetznerService;
  }

  async provisionVPS(config: VPSConfig): Promise<ProvisioningResult> {
    const serverName = `shoppdropp-worker-${config.workerId.slice(0, 8)}`;
    const keys = loadSSHKeys();
    
    try {
      console.log(`[VPS] Creating server ${serverName} with proper SSH key...`);

      // Step 1: Upload SSH key to Hetzner
      const sshKeyId = await this.ensureSSHKey(keys.publicKey);
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

      // Step 6: SSH Connect
      console.log(`[VPS] Connecting via SSH...`);
      const ssh = new NodeSSH();
      let connected = false;
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await ssh.connect({
            host: ipAddress,
            username: 'root',
            privateKey: keys.privateKey,
            readyTimeout: 30000,
          });
          connected = true;
          console.log(`[SSH] Connected on attempt ${attempt}`);
          break;
        } catch (err: any) {
          console.log(`[SSH] Attempt ${attempt} failed: ${err.message}`);
          if (attempt < 5) {
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
      }
      
      if (!connected) {
        throw new Error('Failed to connect via SSH after 5 attempts');
      }

      // Step 7: Deploy OpenClaw Gateway using the function
      console.log(`[VPS] Deploying OpenClaw Gateway...`);
      const installResult = await installOpenClawGateway(ssh, ipAddress, {
        userId: config.userId,
        workerId: config.workerId,
        storeId: config.storeId
      });

      ssh.dispose();
      
      if (!installResult.success) {
        throw new Error(`OpenClaw installation failed: ${installResult.error}`);
      }
      
      console.log(`[VPS] OpenClaw Gateway installed successfully`);

      // Step 8: Verify health
      console.log(`[VPS] Verifying Gateway health...`);
      const isHealthy = await verifyGatewayHealth(ipAddress, 10);
      
      if (!isHealthy) {
        throw new Error('OpenClaw Gateway health check failed');
      }

      // Step 9: Update status
      await db.updateWorker(config.workerId, {
        status: 'running',
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

  private async ensureSSHKey(publicKey: string): Promise<number> {
    try {
      const keys = await this.hetzner.listSSHKeys();
      const existingKey = keys.find((k: any) => k.name === 'shoppdropp-render-rsa') || 
                         keys.find((k: any) => k.name === 'shoppdropp-render-fixed');
      
      if (existingKey) {
        console.log(`[VPS] Found existing SSH key: ${existingKey.id} (${existingKey.name})`);
        return existingKey.id;
      }

      console.log(`[VPS] Creating new SSH key with RSA public key...`);
      const newKey = await this.hetzner.createSSHKey('shoppdropp-render-rsa', publicKey);
      console.log(`[VPS] Created SSH key: ${newKey.id}`);
      return newKey.id;
    } catch (err: any) {
      console.error(`[VPS] SSH key error:`, err.message);
      throw err;
    }
  }
}
