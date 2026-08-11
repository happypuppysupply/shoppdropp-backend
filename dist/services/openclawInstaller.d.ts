export declare class OpenClawInstaller {
    private sshPrivateKey;
    constructor();
    installOpenClaw(ipAddress: string, config: {
        workerId: string;
        storeId: string;
        userId: string;
        openrouterApiKey: string;
        supabaseUrl: string;
        supabaseKey: string;
    }): Promise<void>;
    private createGatewayServer;
    private runCommand;
    private writeFile;
}
//# sourceMappingURL=openclawInstaller.d.ts.map