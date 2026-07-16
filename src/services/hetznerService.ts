import axios, { AxiosInstance } from 'axios';

export interface HetznerServerConfig {
  name: string;
  server_type: string;
  image: string;
  location?: string;
  labels?: Record<string, string>;
}

export interface HetznerServer {
  id: number;
  name: string;
  status: 'running' | 'initializing' | 'starting' | 'stopping' | 'off' | 'deleting' | 'migrating' | 'rebuilding';
  server_type: {
    name: string;
    cores: number;
    memory: number;
    disk: number;
  };
  public_net: {
    ipv4: {
      ip: string;
    };
  };
  private_net: any[];
  created: string;
  labels: Record<string, string>;
}

export interface SSHKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

export class HetznerService {
  private client: AxiosInstance;
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    this.client = axios.create({
      baseURL: 'https://api.hetzner.cloud/v1',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Upload or get existing SSH key
  async uploadSSHKey(name: string, publicKey: string): Promise<number> {
    try {
      const keys = await this.listSSHKeys();
      
      // First try to find by name
      const byName = keys.find(k => k.name === name);
      if (byName) {
        console.log(`[Hetzner] Using existing SSH key by name: ${byName.id}`);
        return byName.id;
      }
      
      // Then try by fingerprint (first 50 chars of key body)
      const keyBody = publicKey.trim().split(' ')[1] || '';
      const byFingerprint = keys.find(k => k.public_key.includes(keyBody.substring(0, 50)));
      if (byFingerprint) {
        console.log(`[Hetzner] Using existing SSH key by fingerprint: ${byFingerprint.id}`);
        return byFingerprint.id;
      }

      console.log(`[Hetzner] Uploading new SSH key: ${name}`);
      const response = await this.client.post('/ssh_keys', {
        name,
        public_key: publicKey,
      });
      console.log(`[Hetzner] SSH key uploaded: ${response.data.ssh_key.id}`);
      return response.data.ssh_key.id;
    } catch (error: any) {
      console.error('[Hetzner] SSH key upload error:', error.response?.data || error.message);
      throw new Error(`Failed to upload SSH key: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // List all SSH keys
  async listSSHKeys(): Promise<SSHKey[]> {
    try {
      const response = await this.client.get('/ssh_keys');
      return response.data.ssh_keys || [];
    } catch (error: any) {
      console.error('[Hetzner] List SSH keys error:', error.response?.data || error.message);
      return [];
    }
  }

  // Get key fingerprint
  private async getKeyFingerprint(publicKey: string): Promise<string> {
    const parts = publicKey.trim().split(' ');
    if (parts.length >= 2) {
      return parts[1].substring(0, 16);
    }
    return '';
  }

  // Create a new server
  async createServer(config: HetznerServerConfig, sshKeyId?: number): Promise<HetznerServer> {
    console.log('[Hetzner] Creating server:', config.name, 'type:', config.server_type, 'location:', config.location);
    try {
      console.log('[Hetzner] Sending POST /servers...');
      const requestBody: any = {
        name: config.name,
        server_type: config.server_type,
        image: config.image,
        location: config.location || 'nbg1',
        labels: {
          ...config.labels,
          'app': 'shoppdropp',
          'managed_by': 'shoppdropp-backend',
        },
      };
      
      if (sshKeyId) {
        requestBody.ssh_keys = [sshKeyId];
      }

      const response = await this.client.post('/servers', requestBody);
      console.log('[Hetzner] Server created successfully:', response.data.server?.id);
      return response.data.server;
    } catch (error: any) {
      console.error('[Hetzner] Create server error:', error.response?.status, error.response?.data || error.message);
      throw new Error(`Failed to create server: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Get server details
  async getServer(serverId: number): Promise<HetznerServer> {
    try {
      const response = await this.client.get(`/servers/${serverId}`);
      return response.data.server;
    } catch (error: any) {
      console.error('[Hetzner] Get server error:', error.response?.data || error.message);
      throw new Error(`Failed to get server: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Delete a server
  async deleteServer(serverId: number): Promise<void> {
    try {
      await this.client.delete(`/servers/${serverId}`);
    } catch (error: any) {
      console.error('[Hetzner] Delete server error:', error.response?.data || error.message);
      throw new Error(`Failed to delete server: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Power operations
  async powerOn(serverId: number): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/actions/poweron`);
    } catch (error: any) {
      console.error('[Hetzner] Power on error:', error.response?.data || error.message);
      throw new Error(`Failed to power on: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async powerOff(serverId: number): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/actions/poweroff`);
    } catch (error: any) {
      console.error('[Hetzner] Power off error:', error.response?.data || error.message);
      throw new Error(`Failed to power off: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async reboot(serverId: number): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/actions/reboot`);
    } catch (error: any) {
      console.error('[Hetzner] Reboot error:', error.response?.data || error.message);
      throw new Error(`Failed to reboot: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Wait for server to be ready
  async waitForServerReady(serverId: number, timeoutMs: number = 120000): Promise<HetznerServer> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const server = await this.getServer(serverId);
      
      if (server.status === 'running') {
        return server;
      }
      
      if (['off', 'deleting'].includes(server.status)) {
        throw new Error(`Server entered unexpected state: ${server.status}`);
      }
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`Timeout waiting for server ${serverId} to be ready`);
  }

  // Get metrics
  async getServerMetrics(serverId: number, type: 'cpu' | 'disk' | 'network', start: string, end: string): Promise<any> {
    try {
      const response = await this.client.get(`/servers/${serverId}/metrics`, {
        params: { type, start, end },
      });
      return response.data.metrics;
    } catch (error: any) {
      console.error('[Hetzner] Metrics error:', error.response?.data || error.message);
      throw new Error(`Failed to get metrics: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // List all servers
  async listServers(): Promise<HetznerServer[]> {
    try {
      const response = await this.client.get('/servers');
      return response.data.servers || [];
    } catch (error: any) {
      console.error('[Hetzner] List servers error:', error.response?.data || error.message);
      throw new Error(`Failed to list servers: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // List available server types
  async listServerTypes(): Promise<any[]> {
    try {
      const response = await this.client.get('/server_types');
      return response.data.server_types;
    } catch (error: any) {
      console.error('[Hetzner] List server types error:', error.response?.data || error.message);
      throw new Error(`Failed to list server types: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Get available locations
  async listLocations(): Promise<any[]> {
    try {
      const response = await this.client.get('/locations');
      return response.data.locations;
    } catch (error: any) {
      console.error('[Hetzner] List locations error:', error.response?.data || error.message);
      throw new Error(`Failed to list locations: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// Singleton instance
let hetznerService: HetznerService | null = null;

export function getHetznerService(): HetznerService {
  if (!hetznerService) {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) {
      throw new Error('HETZNER_API_TOKEN not configured');
    }
    hetznerService = new HetznerService(token);
  }
  return hetznerService;
}

export function initHetznerService(): void {
  const token = process.env.HETZNER_API_TOKEN;
  if (token) {
    hetznerService = new HetznerService(token);
    console.log('Hetzner service initialized');
  } else {
    console.warn('HETZNER_API_TOKEN not set, Hetzner service not initialized');
  }
}
