export interface WorkerCommand {
  id: string;
  type: 'provision' | 'destroy' | 'reboot' | 'status' | 'run_task' | 'cancel_task';
  worker_id: string;
  payload: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  result?: any;
  error?: string;
}

export interface TaskMessage {
  task_id: string;
  task_type: string;
  params: any;
  priority: 'low' | 'normal' | 'high';
}

export class WorkerCommandQueue {
  private commands: Map<string, WorkerCommand> = new Map();
  private subscribers: Map<string, Function[]> = new Map();

  // Create a new command for a worker
  async createCommand(workerId: string, type: WorkerCommand['type'], payload: any): Promise<WorkerCommand> {
    const command: WorkerCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      worker_id: workerId,
      payload,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    this.commands.set(command.id, command);

    // Notify subscribers
    this.notifySubscribers(workerId, command);

    return command;
  }

  // Get pending commands for a worker
  getPendingCommands(workerId: string): WorkerCommand[] {
    return Array.from(this.commands.values())
      .filter(cmd => cmd.worker_id === workerId && cmd.status === 'pending')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  // Update command status
  async updateCommand(commandId: string, updates: Partial<WorkerCommand>): Promise<WorkerCommand | null> {
    const command = this.commands.get(commandId);
    if (!command) return null;

    Object.assign(command, updates);
    this.commands.set(commandId, command);

    return command;
  }

  // Mark command as completed
  async completeCommand(commandId: string, result: any): Promise<void> {
    await this.updateCommand(commandId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result,
    });
  }

  // Mark command as failed
  async failCommand(commandId: string, error: string): Promise<void> {
    await this.updateCommand(commandId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error,
    });
  }

  // Subscribe to commands for a worker
  subscribe(workerId: string, callback: Function): void {
    if (!this.subscribers.has(workerId)) {
      this.subscribers.set(workerId, []);
    }
    this.subscribers.get(workerId)!.push(callback);
  }

  // Unsubscribe from commands
  unsubscribe(workerId: string, callback: Function): void {
    const subs = this.subscribers.get(workerId);
    if (subs) {
      const index = subs.indexOf(callback);
      if (index > -1) {
        subs.splice(index, 1);
      }
    }
  }

  // Notify subscribers of new command
  private notifySubscribers(workerId: string, command: WorkerCommand): void {
    const subs = this.subscribers.get(workerId);
    if (subs) {
      subs.forEach(callback => {
        try {
          callback(command);
        } catch (e) {
          console.error('Error notifying subscriber:', e);
        }
      });
    }
  }

  // Get command by ID
  getCommand(commandId: string): WorkerCommand | undefined {
    return this.commands.get(commandId);
  }

  // Get all commands for a worker
  getWorkerCommands(workerId: string): WorkerCommand[] {
    return Array.from(this.commands.values()).filter(cmd => cmd.worker_id === workerId);
  }
}

// Singleton instance
let commandQueue: WorkerCommandQueue | null = null;

export function getWorkerCommandQueue(): WorkerCommandQueue {
  if (!commandQueue) {
    commandQueue = new WorkerCommandQueue();
  }
  return commandQueue;
}

// Task definitions for the worker
export const WORKER_TASKS = {
  PRODUCT_RESEARCH: {
    name: 'product_research',
    description: 'Research trending products and competitors',
    params: ['niche', 'price_range', 'competitor_count'],
    duration_estimate: '5-10 minutes',
  },
  CATALOG_SYNC: {
    name: 'catalog_sync',
    description: 'Sync products with CJ Dropshipping or AutoDS',
    params: ['supplier', 'category_filter'],
    duration_estimate: '2-5 minutes',
  },
  PRICE_OPTIMIZATION: {
    name: 'price_optimization',
    description: 'Analyze competitor prices and adjust store pricing',
    params: ['margin_threshold', 'competitor_limit'],
    duration_estimate: '3-5 minutes',
  },
  INVENTORY_CHECK: {
    name: 'inventory_check',
    description: 'Check and update inventory levels from suppliers',
    params: ['sync_mode'], // 'full' or 'incremental'
    duration_estimate: '2-3 minutes',
  },
  META_ADS_CREATE: {
    name: 'meta_ads_create',
    description: 'Create Meta Ads campaigns',
    params: ['budget', 'targeting', 'creative_type'],
    duration_estimate: '5-10 minutes',
  },
  CONTENT_GENERATION: {
    name: 'content_generation',
    description: 'Generate blog posts, emails, and social media content',
    params: ['content_type', 'topic', 'tone'],
    duration_estimate: '2-5 minutes',
  },
  PERFORMANCE_REPORT: {
    name: 'performance_report',
    description: 'Generate weekly performance report',
    params: ['date_range', 'metrics'],
    duration_estimate: '1-3 minutes',
  },
};

export function getTaskDefinition(taskName: string) {
  return Object.values(WORKER_TASKS).find(t => t.name === taskName);
}
