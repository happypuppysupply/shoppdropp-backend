export interface HetznerServerConfig {
    name: string;
    server_type: string;
    image: string;
    location?: string;
    labels?: Record<string, string>;
}
export interface HetznerServer {
    id: number;
    name: string;
    status: 'running' | 'initializing' | 'starting' | 'stopping' | 'off' | 'deleting' | 'migrating' | 'rebuilding';
    server_type: {
        name: string;
        cores: number;
        memory: number;
        disk: number;
    };
    public_net: {
        ipv4: {
            ip: string;
        };
    };
    private_net: any[];
    created: string;
    labels: Record<string, string>;
    ssh_keys?: number[];
}
export interface SSHKey {
    id: number;
    name: string;
    fingerprint: string;
    public_key: string;
}
export declare class HetznerService {
    private client;
    private apiToken;
    constructor(apiToken: string);
    uploadSSHKey(name: string, publicKey: string): Promise<number>;
    listSSHKeys(): Promise<SSHKey[]>;
    createSSHKey(name: string, publicKey: string): Promise<SSHKey>;
    deleteSSHKey(keyId: number): Promise<void>;
    private getKeyFingerprint;
    createServer(config: HetznerServerConfig, sshKeyId?: number): Promise<HetznerServer>;
    getServer(serverId: number): Promise<HetznerServer>;
    deleteServer(serverId: number): Promise<void>;
    powerOn(serverId: number): Promise<void>;
    powerOff(serverId: number): Promise<void>;
    reboot(serverId: number): Promise<void>;
    waitForServerReady(serverId: number, timeoutMs?: number): Promise<HetznerServer>;
    getServerMetrics(serverId: number, type: 'cpu' | 'disk' | 'network', start: string, end: string): Promise<any>;
    listServers(): Promise<HetznerServer[]>;
    listServerTypes(): Promise<any[]>;
    listLocations(): Promise<any[]>;
}
export declare function getHetznerService(): HetznerService;
export declare function initHetznerService(): void;
//# sourceMappingURL=hetznerService.d.ts.map