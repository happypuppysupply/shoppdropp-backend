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
export declare class WorkerCommandQueue {
    private commands;
    private subscribers;
    createCommand(workerId: string, type: WorkerCommand['type'], payload: any): Promise<WorkerCommand>;
    getPendingCommands(workerId: string): WorkerCommand[];
    updateCommand(commandId: string, updates: Partial<WorkerCommand>): Promise<WorkerCommand | null>;
    completeCommand(commandId: string, result: any): Promise<void>;
    failCommand(commandId: string, error: string): Promise<void>;
    subscribe(workerId: string, callback: Function): void;
    unsubscribe(workerId: string, callback: Function): void;
    private notifySubscribers;
    getCommand(commandId: string): WorkerCommand | undefined;
    getWorkerCommands(workerId: string): WorkerCommand[];
}
export declare function getWorkerCommandQueue(): WorkerCommandQueue;
export declare const WORKER_TASKS: {
    PRODUCT_RESEARCH: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
    CATALOG_SYNC: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
    PRICE_OPTIMIZATION: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
    INVENTORY_CHECK: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
    META_ADS_CREATE: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
    CONTENT_GENERATION: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
    PERFORMANCE_REPORT: {
        name: string;
        description: string;
        params: string[];
        duration_estimate: string;
    };
};
export declare function getTaskDefinition(taskName: string): {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | {
    name: string;
    description: string;
    params: string[];
    duration_estimate: string;
} | undefined;
//# sourceMappingURL=workerCommands.d.ts.map