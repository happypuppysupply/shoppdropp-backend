"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VPSProvisionerFixed = void 0;
const node_ssh_1 = require("node-ssh");
const supabase_1 = require("../db/supabase");
const openclawInstaller_1 = require("./openclawInstaller");
const sshKeyHelper_1 = require("./sshKeyHelper");
const fs = __importStar(require("fs"));
class VPSProvisionerFixed {
    hetzner;
    sshPrivateKey;
    sshPublicKey;
    constructor(hetznerService) {
        this.hetzner = hetznerService;
        // Load SSH keys from env vars or file system
        const keys = (0, sshKeyHelper_1.loadSSHKeys)();
        this.sshPrivateKey = keys.privateKey;
        this.sshPublicKey = keys.publicKey;
        // Validate the key format
        const validation = (0, sshKeyHelper_1.validatePrivateKey)(this.sshPrivateKey);
        if (!validation.valid) {
            throw new Error(`Invalid SSH private key: ${validation.error}`);
        }
        console.log('[VPS] SSH key validation passed');
    }
    async provisionVPS(config) {
        const serverName = `shoppdropp-worker-${config.workerId.slice(0, 8)}`;
        try {
            console.log(`[VPS] Creating server ${serverName} with proper SSH key...`);
            // Step 1: Upload SSH key to Hetzner (or use existing)
            const sshKeyId = await this.ensureSSHKey();
            console.log(`[VPS] Using SSH key ID: ${sshKeyId}`);
            // Step 2: Create Hetzner server
            const serverConfig = {
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
            await supabase_1.db.updateWorker(config.workerId, {
                hetzner_server_id: server.id.toString(),
                ip_address: ipAddress,
                status: 'configuring',
            });
            // Step 5: Wait for SSH
            console.log(`[VPS] Waiting 90 seconds for SSH...`);
            await new Promise(resolve => setTimeout(resolve, 90000));
            // Step 6: Deploy REAL OpenClaw Gateway
            console.log(`[VPS] Deploying REAL OpenClaw Gateway...`);
            try {
                const openclawInstaller = new openclawInstaller_1.OpenClawInstaller();
                await openclawInstaller.installOpenClaw(ipAddress, {
                    workerId: config.workerId,
                    storeId: config.storeId,
                    userId: config.userId,
                    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
                    supabaseUrl: process.env.SUPABASE_URL || '',
                    supabaseKey: process.env.SUPABASE_SERVICE_KEY || ''
                });
                console.log(`[VPS] OpenClaw Gateway installed successfully`);
            }
            catch (installError) {
                console.error(`[VPS] OpenClaw installation failed:`, installError.message);
                // Don't fail the whole provisioning - the server exists
                // The worker will be in 'configuring' status and can be retried
            }
            // Step 7: Update status
            await supabase_1.db.updateWorker(config.workerId, {
                status: 'running',
            });
            return {
                serverId: server.id,
                ipAddress: ipAddress,
                status: 'success',
            };
        }
        catch (error) {
            console.error(`[VPS] Provisioning failed:`, error.message);
            await supabase_1.db.updateWorker(config.workerId, { status: 'error' });
            return {
                serverId: 0,
                ipAddress: '',
                status: 'failed',
                error: error.message,
            };
        }
    }
    async ensureSSHKey() {
        try {
            // Try to find existing key (prefer RSA key)
            const keys = await this.hetzner.listSSHKeys();
            const existingKey = keys.find((k) => k.name === 'shoppdropp-render-rsa') ||
                keys.find((k) => k.name === 'shoppdropp-render-fixed');
            if (existingKey) {
                console.log(`[VPS] Found existing SSH key: ${existingKey.id} (${existingKey.name})`);
                return existingKey.id;
            }
            // Create new key
            console.log(`[VPS] Creating new SSH key with RSA public key...`);
            const newKey = await this.hetzner.createSSHKey('shoppdropp-render-rsa', this.sshPublicKey);
            console.log(`[VPS] Created SSH key: ${newKey.id}`);
            return newKey.id;
        }
        catch (err) {
            console.error(`[VPS] SSH key error:`, err.message);
            throw err;
        }
    }
    async deployRealWorker(ipAddress, config) {
        const ssh = new node_ssh_1.NodeSSH();
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
                }
                catch (err) {
                    console.log(`[SSH] Attempt ${attempt} failed: ${err.message}`);
                    if (attempt < 10) {
                        await new Promise(resolve => setTimeout(resolve, 15000));
                    }
                }
            }
            if (!connected) {
                throw new Error('Failed to connect after 10 attempts');
            }
            // Install Node.js 22
            console.log(`[SSH] Installing Node.js...`);
            await this.runCommand(ssh, 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -', 180000);
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
            }
            else {
                const logs = await ssh.execCommand('journalctl -u shoppdropp-worker --no-pager -n 20');
                console.error(`[SSH] Service failed to start:\n${logs.stdout}`);
                throw new Error('Worker service failed to start');
            }
        }
        finally {
            ssh.dispose();
        }
    }
    async runCommand(ssh, command, timeoutMs = 120000) {
        console.log(`[SSH] $ ${command.substring(0, 60)}...`);
        const result = await ssh.execCommand(command, { execOptions: { timeout: timeoutMs } });
        if (result.code !== 0) {
            throw new Error(`Command failed: ${result.stderr}`);
        }
    }
}
exports.VPSProvisionerFixed = VPSProvisionerFixed;
//# sourceMappingURL=vpsProvisionerFixed.js.map