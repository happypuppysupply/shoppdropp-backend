"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HetznerService = void 0;
exports.getHetznerService = getHetznerService;
exports.initHetznerService = initHetznerService;
const axios_1 = __importDefault(require("axios"));
class HetznerService {
    client;
    apiToken;
    constructor(apiToken) {
        this.apiToken = apiToken;
        this.client = axios_1.default.create({
            baseURL: 'https://api.hetzner.cloud/v1',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
        });
    }
    // Upload or get existing SSH key
    async uploadSSHKey(name, publicKey) {
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
        }
        catch (error) {
            console.error('[Hetzner] SSH key upload error:', error.response?.data || error.message);
            throw new Error(`Failed to upload SSH key: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // List all SSH keys
    async listSSHKeys() {
        try {
            const response = await this.client.get('/ssh_keys');
            return response.data.ssh_keys || [];
        }
        catch (error) {
            console.error('[Hetzner] List SSH keys error:', error.response?.data || error.message);
            return [];
        }
    }
    // Create SSH key
    async createSSHKey(name, publicKey) {
        try {
            console.log('[Hetzner] Creating SSH key:', name);
            const response = await this.client.post('/ssh_keys', {
                name,
                public_key: publicKey,
            });
            console.log('[Hetzner] SSH key created:', response.data.ssh_key?.id);
            return response.data.ssh_key;
        }
        catch (error) {
            console.error('[Hetzner] Create SSH key error:', error.response?.data || error.message);
            throw new Error(`Failed to create SSH key: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // Delete SSH key
    async deleteSSHKey(keyId) {
        try {
            console.log('[Hetzner] Deleting SSH key:', keyId);
            await this.client.delete(`/ssh_keys/${keyId}`);
            console.log('[Hetzner] SSH key deleted:', keyId);
        }
        catch (error) {
            console.error('[Hetzner] Delete SSH key error:', error.response?.data || error.message);
            throw new Error(`Failed to delete SSH key: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // Get key fingerprint
    async getKeyFingerprint(publicKey) {
        const parts = publicKey.trim().split(' ');
        if (parts.length >= 2) {
            return parts[1].substring(0, 16);
        }
        return '';
    }
    // Create a new server
    async createServer(config, sshKeyId) {
        console.log('[Hetzner] Creating server:', config.name, 'type:', config.server_type, 'location:', config.location);
        try {
            console.log('[Hetzner] Sending POST /servers...');
            const requestBody = {
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
                console.log('[Hetzner] Adding SSH key ID:', sshKeyId, 'to request');
            }
            else {
                console.log('[Hetzner] WARNING: No SSH key ID provided!');
            }
            const response = await this.client.post('/servers', requestBody);
            console.log('[Hetzner] Server created successfully:', response.data.server?.id);
            return response.data.server;
        }
        catch (error) {
            console.error('[Hetzner] Create server error:', error.response?.status, error.response?.data || error.message);
            throw new Error(`Failed to create server: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // Get server details
    async getServer(serverId) {
        try {
            console.log(`[Hetzner] Getting server ${serverId}...`);
            const response = await this.client.get(`/servers/${serverId}`);
            console.log(`[Hetzner] Got server: ${response.data.server?.id}, status: ${response.data.server?.status}`);
            return response.data.server;
        }
        catch (error) {
            console.error(`[Hetzner] Get server ${serverId} error:`, error.response?.status, error.response?.data || error.message);
            throw new Error(`Failed to get server ${serverId}: ${error.response?.data?.error?.message || error.message || 'Unknown error'}`);
        }
    }
    // Delete a server
    async deleteServer(serverId) {
        try {
            await this.client.delete(`/servers/${serverId}`);
        }
        catch (error) {
            console.error('[Hetzner] Delete server error:', error.response?.data || error.message);
            throw new Error(`Failed to delete server: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // Power operations
    async powerOn(serverId) {
        try {
            await this.client.post(`/servers/${serverId}/actions/poweron`);
        }
        catch (error) {
            console.error('[Hetzner] Power on error:', error.response?.data || error.message);
            throw new Error(`Failed to power on: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    async powerOff(serverId) {
        try {
            await this.client.post(`/servers/${serverId}/actions/poweroff`);
        }
        catch (error) {
            console.error('[Hetzner] Power off error:', error.response?.data || error.message);
            throw new Error(`Failed to power off: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    async reboot(serverId) {
        try {
            await this.client.post(`/servers/${serverId}/actions/reboot`);
        }
        catch (error) {
            console.error('[Hetzner] Reboot error:', error.response?.data || error.message);
            throw new Error(`Failed to reboot: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // Wait for server to be ready
    async waitForServerReady(serverId, timeoutMs = 120000) {
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
    async getServerMetrics(serverId, type, start, end) {
        try {
            const response = await this.client.get(`/servers/${serverId}/metrics`, {
                params: { type, start, end },
            });
            return response.data.metrics;
        }
        catch (error) {
            console.error('[Hetzner] Metrics error:', error.response?.data || error.message);
            throw new Error(`Failed to get metrics: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // List all servers
    async listServers() {
        try {
            const response = await this.client.get('/servers');
            return response.data.servers || [];
        }
        catch (error) {
            console.error('[Hetzner] List servers error:', error.response?.data || error.message);
            throw new Error(`Failed to list servers: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // List available server types
    async listServerTypes() {
        try {
            const response = await this.client.get('/server_types');
            return response.data.server_types;
        }
        catch (error) {
            console.error('[Hetzner] List server types error:', error.response?.data || error.message);
            throw new Error(`Failed to list server types: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    // Get available locations
    async listLocations() {
        try {
            const response = await this.client.get('/locations');
            return response.data.locations;
        }
        catch (error) {
            console.error('[Hetzner] List locations error:', error.response?.data || error.message);
            throw new Error(`Failed to list locations: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}
exports.HetznerService = HetznerService;
// Singleton instance
let hetznerService = null;
function getHetznerService() {
    if (!hetznerService) {
        const token = process.env.HETZNER_API_TOKEN;
        if (!token) {
            throw new Error('HETZNER_API_TOKEN not configured');
        }
        hetznerService = new HetznerService(token);
    }
    return hetznerService;
}
function initHetznerService() {
    const token = process.env.HETZNER_API_TOKEN;
    if (token) {
        hetznerService = new HetznerService(token);
        console.log('Hetzner service initialized');
    }
    else {
        console.warn('HETZNER_API_TOKEN not set, Hetzner service not initialized');
    }
}
//# sourceMappingURL=hetznerService.js.map