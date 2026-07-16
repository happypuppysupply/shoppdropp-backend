import axios, { AxiosInstance } from 'axios';

export interface HetznerServerConfig {
  name: string;
  server_type: string; // 'cx21', 'cx31', etc
  image: string; // 'ubuntu-22.04'
  location?: string; // 'nbg1', 'fsn1', 'hel1', 'ash'
  ssh_keys?: string[];
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

  // Create a new server
  async createServer(config: HetznerServerConfig): Promise<HetznerServer> {
    console.log('[Hetzner] Creating server:', config.name, 'type:', config.server_type, 'location:', config.location);
    try {
      console.log('[Hetzner] Sending POST /servers...');
      const response = await this.client.post('/servers', {
        name: config.name,
        server_type: config.server_type,
        image: config.image,
        location: config.location || 'fsn1',
        ssh_keys: config.ssh_keys,
        labels: {
          ...config.labels,
          'app': 'shoppdropp',
          'managed_by': 'shoppdropp-backend',
        },
      });
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
      console.error('Hetzner get server error:', error.response?.data || error.message);
      throw new Error(`Failed to get server: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // List all servers
  async listServers(): Promise<HetznerServer[]> {
    try {
      const response = await this.client.get('/servers');
      return response.data.servers || [];
    } catch (error: any) {
      console.error('Hetzner list servers error:', error.response?.data || error.message);
      throw new Error(`Failed to list servers: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Delete a server
  async deleteServer(serverId: number): Promise<void> {
    try {
      await this.client.delete(`/servers/${serverId}`);
    } catch (error: any) {
      console.error('Hetzner delete server error:', error.response?.data || error.message);
      throw new Error(`Failed to delete server: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Power operations
  async powerOn(serverId: number): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/actions/poweron`);
    } catch (error: any) {
      console.error('Hetzner power on error:', error.response?.data || error.message);
      throw new Error(`Failed to power on: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async powerOff(serverId: number): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/actions/poweroff`);
    } catch (error: any) {
      console.error('Hetzner power off error:', error.response?.data || error.message);
      throw new Error(`Failed to power off: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async reboot(serverId: number): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/actions/reboot`);
    } catch (error: any) {
      console.error('Hetzner reboot error:', error.response?.data || error.message);
      throw new Error(`Failed to reboot: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Get metrics
  async getServerMetrics(serverId: number, type: 'cpu' | 'disk' | 'network', start: string, end: string): Promise<any> {
    try {
      const response = await this.client.get(`/servers/${serverId}/metrics`, {
        params: {
          type,
          start,
          end,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('Hetzner metrics error:', error.response?.data || error.message);
      throw new Error(`Failed to get metrics: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // SSH Key management
  async listSSHKeys(): Promise<SSHKey[]> {
    try {
      const response = await this.client.get('/ssh_keys');
      return response.data.ssh_keys;
    } catch (error: any) {
      console.error('Hetzner list SSH keys error:', error.response?.data || error.message);
      throw new Error(`Failed to list SSH keys: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createSSHKey(name: string, publicKey: string): Promise<SSHKey> {
    try {
      const response = await this.client.post('/ssh_keys', {
        name,
        public_key: publicKey,
      });
      return response.data.ssh_key;
    } catch (error: any) {
      console.error('Hetzner create SSH key error:', error.response?.data || error.message);
      throw new Error(`Failed to create SSH key: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Wait for server to be ready
  async waitForServerReady(serverId: number, timeout: number = 120000): Promise<HetznerServer> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const server = await this.getServer(serverId);
      
      if (server.status === 'running') {
        return server;
      }
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`Timeout waiting for server ${serverId} to be ready`);
  }

  // Get available server types
  async listServerTypes(): Promise<any[]> {
    try {
      const response = await this.client.get('/server_types');
      return response.data.server_types;
    } catch (error: any) {
      console.error('Hetzner list server types error:', error.response?.data || error.message);
      throw new Error(`Failed to list server types: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Get available locations
  async listLocations(): Promise<any[]> {
    try {
      const response = await this.client.get('/locations');
      return response.data.locations;
    } catch (error: any) {
      console.error('Hetzner list locations error:', error.response?.data || error.message);
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

export function initHetznerService(token: string): HetznerService {
  hetznerService = new HetznerService(token);
  return hetznerService;
}
