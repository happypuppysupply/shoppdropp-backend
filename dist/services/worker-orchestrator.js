"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerOrchestrator = exports.WorkerOrchestrator = void 0;
const supabase_1 = require("../db/supabase");
const hetznerService_1 = require("./hetznerService");
// Multi-worker orchestrator - 1 VPS, multiple task workers
class WorkerOrchestrator {
    activeStores = new Map();
    // Provision 1 VPS per store with multiple workers
    async provisionStoreWorkers(storeId, userId) {
        console.log(`[WorkerOrchestrator] Provisioning workers for store ${storeId}`);
        // 1. Provision single VPS
        const serverName = `shoppdropp-${storeId.slice(0, 8)}`;
        const server = await hetznerService_1.hetznerService.createServer({
            name: serverName,
            serverType: 'cax11',
            location: 'nbg1',
            image: 'ubuntu-22.04',
        });
        console.log(`[WorkerOrchestrator] VPS provisioned: ${server.id} at ${server.publicNet.ipv4.ip}`);
        // 2. Create worker records for each task type (including theme/design)
        const taskTypes = [
            'product-research',
            'catalog-optimization',
            'meta-ads',
            'pricing',
            'inventory-sync',
            'order-fulfillment',
            'analytics',
            'theme-design' // NEW: Shopify theme and design worker
        ];
        const workers = [];
        for (const type of taskTypes) {
            const worker = await supabase_1.db.createWorker({
                user_id: userId,
                store_id: storeId,
                status: 'idle',
                hetzner_server_id: server.id.toString(),
            });
            workers.push({
                id: worker.id,
                type,
                status: 'idle',
            });
        }
        const storeWorkers = {
            storeId,
            vpsId: server.id,
            vpsIp: server.publicNet.ipv4.ip,
            workers,
        };
        this.activeStores.set(storeId, storeWorkers);
        // 3. Deploy all workers to the VPS
        await this.deployWorkersToVPS(storeWorkers);
        return storeWorkers;
    }
    async deployWorkersToVPS(storeWorkers) {
        console.log(`[WorkerOrchestrator] Deploying ${storeWorkers.workers.length} workers to VPS ${storeWorkers.vpsIp}`);
        // SSH into VPS and deploy Docker containers for each worker
        // This runs all workers on the same VPS
        const deploymentScript = `
#!/bin/bash
set -e

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
fi

# Create docker-compose for all workers
cat > /opt/shoppdropp/docker-compose.yml << 'COMPOSE'
version: '3.8'
services:
  product-research:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=product-research
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  catalog-optimization:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=catalog-optimization
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  meta-ads:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=meta-ads
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  pricing:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=pricing
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  inventory-sync:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=inventory-sync
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  order-fulfillment:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=order-fulfillment
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  analytics:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=analytics
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    
  theme-design:
    image: shoppdropp/worker:latest
    environment:
      - WORKER_TYPE=theme-design
      - STORE_ID=${storeWorkers.storeId}
      - API_URL=https://api.shoppdropp.com
    restart: unless-stopped
    volumes:
      - /opt/shoppdropp/themes:/app/themes
COMPOSE

# Start all workers
cd /opt/shoppdropp && docker-compose up -d

echo "All workers deployed successfully"
`;
        // Execute deployment via SSH (simplified)
        console.log(`[WorkerOrchestrator] Deployment script ready for VPS ${storeWorkers.vpsIp}`);
        // In production, this would SSH and execute the script
        // For now, mark workers as running
        for (const worker of storeWorkers.workers) {
            await supabase_1.db.updateWorker(worker.id, { status: 'running' });
            worker.status = 'running';
        }
    }
    // Stop all workers for a store
    async stopStoreWorkers(storeId) {
        const storeWorkers = this.activeStores.get(storeId);
        if (!storeWorkers) {
            console.log(`[WorkerOrchestrator] No active workers for store ${storeId}`);
            return;
        }
        console.log(`[WorkerOrchestrator] Stopping workers for store ${storeId}`);
        // Stop the VPS
        await hetznerService_1.hetznerService.deleteServer(storeWorkers.vpsId);
        // Update worker status in DB
        for (const worker of storeWorkers.workers) {
            await supabase_1.db.updateWorker(worker.id, { status: 'stopped' });
        }
        this.activeStores.delete(storeId);
        console.log(`[WorkerOrchestrator] All workers stopped for store ${storeId}`);
    }
    // Get status of all workers for a store
    getStoreStatus(storeId) {
        return this.activeStores.get(storeId);
    }
}
exports.WorkerOrchestrator = WorkerOrchestrator;
exports.workerOrchestrator = new WorkerOrchestrator();
//# sourceMappingURL=worker-orchestrator.js.map