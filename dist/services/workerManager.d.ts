import { Worker } from '../types';
export declare class WorkerManager {
    private activeConnections;
    provisionWorker(userId: string, storeId: string): Promise<Worker>;
    private startLocalWorker;
    stopWorker(workerId: string): Promise<void>;
    handleWorkerConnection(workerId: string, ws: any): void;
    private handleWorkerMessage;
    sendCommand(workerId: string, command: any): void;
    assignTask(workerId: string, task: any): Promise<void>;
}
//# sourceMappingURL=workerManager.d.ts.map