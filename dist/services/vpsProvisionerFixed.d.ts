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
export declare class VPSProvisionerFixed {
    private hetzner;
    private sshPrivateKey;
    private sshPublicKey;
    constructor(hetznerService: HetznerService);
    provisionVPS(config: VPSConfig): Promise<ProvisioningResult>;
    private ensureSSHKey;
    private deployRealWorker;
    private runCommand;
}
//# sourceMappingURL=vpsProvisionerFixed.d.ts.map