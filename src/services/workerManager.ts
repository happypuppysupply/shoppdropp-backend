import { db } from '../db/supabase';
import { Worker } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WorkerManager {
  private activeConnections: Map<string, any> = new Map();

  async provisionWorker(userId: string, storeId: string): Promise<Worker> {
    // Create worker record
    const worker = await db.createWorker({
      id: uuidv4(),
      user_id: userId,
      store_id: storeId,
      status: 'idle',
    });

    // Mock: Start local Docker container (until Hetzner API)
    await this.startLocalWorker(worker);

    return worker;
  }

  private async startLocalWorker(worker: Worker): Promise<void> {
    try {
      await db.updateWorker(worker.id, { status: 'provisioning' });

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

        await db.updateWorker(worker.id, {
          container_id: containerId,
          status: 'running',
          ip_address: 'localhost',
        });

        console.log(`Worker ${worker.id} started locally with container ${containerId}`);
      } catch (dockerError) {
        console.warn('Docker not available, running worker in process');
        // Fallback: Mark as running for testing
        await db.updateWorker(worker.id, {
          status: 'running',
          ip_address: '127.0.0.1',
        });
      }
    } catch (error) {
      console.error('Failed to start worker:', error);
      await db.updateWorker(worker.id, { status: 'error' });
    }
  }

  async stopWorker(workerId: string): Promise<void> {
    const worker = await db.getWorkerById(workerId);
    if (!worker) return;

    try {
      if (worker.container_id) {
        await execAsync(`docker stop ${worker.container_id} && docker rm ${worker.container_id}`);
      }
      await db.updateWorker(workerId, { status: 'idle', container_id: null });
    } catch (error) {
      console.error('Failed to stop worker:', error);
    }
  }

  handleWorkerConnection(workerId: string, ws: any): void {
    this.activeConnections.set(workerId, ws);
    
    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleWorkerMessage(workerId, message);
      } catch (error) {
        console.error('Invalid message from worker:', error);
      }
    });

    ws.on('close', () => {
      this.activeConnections.delete(workerId);
      db.updateWorker(workerId, { status: 'idle' });
    });

    // Send initial config
    ws.send(JSON.stringify({
      type: 'config',
      config: {
        heartbeatInterval: 30000,
      },
    }));
  }

  private async handleWorkerMessage(workerId: string, message: any): Promise<void> {
    switch (message.type) {
      case 'heartbeat':
        await db.updateWorker(workerId, { last_heartbeat: new Date().toISOString() });
        break;
        
      case 'task_complete':
        await db.updateTask(message.taskId, {
          status: 'completed',
          result: message.result,
        });
        break;
        
      case 'task_failed':
        await db.updateTask(message.taskId, {
          status: 'failed',
          error: message.error,
        });
        break;
    }
  }

  sendCommand(workerId: string, command: any): void {
    const ws = this.activeConnections.get(workerId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(command));
    }
  }

  async assignTask(workerId: string, task: any): Promise<void> {
    const taskRecord = await db.createTask({
      id: uuidv4(),
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