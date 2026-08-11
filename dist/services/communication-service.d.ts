export interface CommunicationConfig {
    userId: string;
    storeId: string;
    channel: 'slack' | 'whatsapp' | 'discord';
    webhookUrl: string;
    apiToken?: string;
    channelId?: string;
    enabled: boolean;
}
export declare class CommunicationService {
    private configs;
    configureChannel(config: CommunicationConfig): Promise<void>;
    getConfig(storeId: string): Promise<CommunicationConfig | null>;
    sendUpdate(storeId: string, message: WorkerUpdateMessage): Promise<void>;
    private formatMessage;
    private getStatusEmoji;
    private sendSlackMessage;
    private sendDiscordMessage;
    private sendWhatsAppMessage;
    handleIncomingCommand(storeId: string, command: string, channel: string): Promise<string>;
    private triggerWorker;
}
export interface WorkerUpdateMessage {
    workerType: string;
    storeName: string;
    status: 'started' | 'completed' | 'error' | 'warning' | 'info';
    content: string;
    metadata?: any;
    timestamp: Date;
}
export declare const communicationService: CommunicationService;
//# sourceMappingURL=communication-service.d.ts.map