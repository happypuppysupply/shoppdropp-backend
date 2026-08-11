import { HetznerService } from './hetznerService';
export interface VPSConfig {
    workerId: string;
    storeId: string;
    userId: string;
    envVars: Record<string, string>;
}
export interface ProvisioningResult {
    serverId: number;
    ipAddress: string;
    rootPassword?: string;
    status: 'success' | 'failed';
    error?: string;
}
export declare class VPSProvisioner {
    private hetzner;
    private sshPrivateKey;
    constructor(hetznerService: HetznerService, sshPrivateKey: string, sshPublicKey?: string);
    private sshPublicKey;
    provisionVPS(config: VPSConfig): Promise<ProvisioningResult>;
    private logStep;
    /**
     * Retrieve logs for a specific worker
     */
    getWorkerLogs(workerId: string, limit?: number): Promise<Array<{
        id: string;
        worker_id: string;
        step_number: number;
        step_name: string;
        progress: number;
        message: string;
        created_at: string;
    }>>;
    /**
     * Get the latest log entry for a worker
     */
    getLatestWorkerLog(workerId: string): Promise<{
        id: string;
        worker_id: string;
        step_number: number;
        step_name: string;
        progress: number;
        message: string;
        created_at: string;
    } | null>;
    /**
     * Clear logs for a specific worker (useful when reprovisioning)
     */
    clearWorkerLogs(workerId: string): Promise<void>;
    private installOpenClaw;
    private ensureSSHKey;
    private runCommand;
    private buildEnvFile;
    private buildSystemdService;
    destroyVPS(serverId: number, workerId: string): Promise<void>;
    rebootVPS(serverId: number): Promise<void>;
    getServerMetrics(serverId: number): Promise<any>;
}
export declare function createVPSProvisioner(): VPSProvisioner;
//# sourceMappingURL=vpsProvisioner.d.ts.map