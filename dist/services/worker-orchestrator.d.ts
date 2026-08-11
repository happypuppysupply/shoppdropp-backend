interface TaskWorker {
    id: string;
    type: string;
    status: 'idle' | 'running' | 'error';
    lastRun?: Date;
}
interface StoreWorkers {
    storeId: string;
    vpsId: number;
    vpsIp: string;
    workers: TaskWorker[];
}
export declare class WorkerOrchestrator {
    private activeStores;
    provisionStoreWorkers(storeId: string, userId: string): Promise<StoreWorkers>;
    private deployWorkersToVPS;
    stopStoreWorkers(storeId: string): Promise<void>;
    getStoreStatus(storeId: string): StoreWorkers | undefined;
}
export declare const workerOrchestrator: WorkerOrchestrator;
export {};
//# sourceMappingURL=worker-orchestrator.d.ts.map