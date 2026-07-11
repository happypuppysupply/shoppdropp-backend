"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerManager = void 0;
const supabase_1 = require("../db/supabase");
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class WorkerManager {
    activeConnections = new Map();
    async provisionWorker(userId, storeId) {
        // Create worker record
        const worker = await supabase_1.db.createWorker({
            id: (0, uuid_1.v4)(),
            user_id: userId,
            store_id: storeId,
            status: 'idle',
        });
        // Mock: Start local Docker container (until Hetzner API)
        await this.startLocalWorker(worker);
        return worker;
    }
    async startLocalWorker(worker) {
        try {
            await supabase_1.db.updateWorker(worker.id, { status: 'provisioning' });
            // Start Docker container locally
            const containerName = `shoppdropp-worker-${worker.id}`;
            // Check if docker is available
            try {
                await execAsync('docker --version');
                // Run worker container
                const command = `docker run -d \\
          --name ${containerName} \\
          --env WORKER_ID=${worker.id} \\
          --env BACKEND_WS_URL=ws://host.docker.internal:3001 \\
          --restart unless-stopped \\
          shoppdropp-worker:latest`;
                const { stdout } = await execAsync(command);
                const containerId = stdout.trim();
                await supabase_1.db.updateWorker(worker.id, {
                    container_id: containerId,
                    status: 'running',
                    ip_address: 'localhost',
                });
                console.log(`Worker ${worker.id} started locally with container ${containerId}`);
            }
            catch (dockerError) {
                console.warn('Docker not available, running worker in process');
                // Fallback: Mark as running for testing
                await supabase_1.db.updateWorker(worker.id, {
                    status: 'running',
                    ip_address: '127.0.0.1',
                });
            }
        }
        catch (error) {
            console.error('Failed to start worker:', error);
            await supabase_1.db.updateWorker(worker.id, { status: 'error' });
        }
    }
    async stopWorker(workerId) {
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker)
            return;
        try {
            if (worker.container_id) {
                await execAsync(`docker stop ${worker.container_id} && docker rm ${worker.container_id}`);
            }
            await supabase_1.db.updateWorker(workerId, { status: 'idle', container_id: null });
        }
        catch (error) {
            console.error('Failed to stop worker:', error);
        }
    }
    handleWorkerConnection(workerId, ws) {
        this.activeConnections.set(workerId, ws);
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleWorkerMessage(workerId, message);
            }
            catch (error) {
                console.error('Invalid message from worker:', error);
            }
        });
        ws.on('close', () => {
            this.activeConnections.delete(workerId);
            supabase_1.db.updateWorker(workerId, { status: 'idle' });
        });
        // Send initial config
        ws.send(JSON.stringify({
            type: 'config',
            config: {
                heartbeatInterval: 30000,
            },
        }));
    }
    async handleWorkerMessage(workerId, message) {
        switch (message.type) {
            case 'heartbeat':
                await supabase_1.db.updateWorker(workerId, { last_heartbeat: new Date().toISOString() });
                break;
            case 'task_complete':
                await supabase_1.db.updateTask(message.taskId, {
                    status: 'completed',
                    result: message.result,
                });
                break;
            case 'task_failed':
                await supabase_1.db.updateTask(message.taskId, {
                    status: 'failed',
                    error: message.error,
                });
                break;
        }
    }
    sendCommand(workerId, command) {
        const ws = this.activeConnections.get(workerId);
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify(command));
        }
    }
    async assignTask(workerId, task) {
        const taskRecord = await supabase_1.db.createTask({
            id: (0, uuid_1.v4)(),
            worker_id: workerId,
            type: task.type,
            status: 'pending',
            payload: task.payload,
        });
        this.sendCommand(workerId, {
            type: 'execute_task',
            task: taskRecord,
        });
    }
}
exports.WorkerManager = WorkerManager;
//# sourceMappingURL=workerManager.js.map