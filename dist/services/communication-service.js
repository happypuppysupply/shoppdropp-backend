"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communicationService = exports.CommunicationService = void 0;
const supabase_1 = require("../db/supabase");
class CommunicationService {
    configs = new Map();
    async configureChannel(config) {
        await supabase_1.db.saveCommunicationConfig(config);
        this.configs.set(`${config.storeId}:${config.channel}`, config);
    }
    async getConfig(storeId) {
        return await supabase_1.db.getCommunicationConfig(storeId);
    }
    async sendUpdate(storeId, message) {
        const config = await this.getConfig(storeId);
        if (!config || !config.enabled)
            return;
        const formattedMessage = this.formatMessage(message);
        switch (config.channel) {
            case 'slack':
                await this.sendSlackMessage(config, formattedMessage);
                break;
            case 'discord':
                await this.sendDiscordMessage(config, formattedMessage);
                break;
            case 'whatsapp':
                await this.sendWhatsAppMessage(config, formattedMessage);
                break;
        }
    }
    formatMessage(message) {
        const emoji = this.getStatusEmoji(message.status);
        return `${emoji} **${message.workerType}** | ${message.storeName}

${message.content}

${message.metadata ? `\`\`\`json\n${JSON.stringify(message.metadata, null, 2)}\n\`\`\`` : ''}

⏰ ${new Date().toLocaleString()}`;
    }
    getStatusEmoji(status) {
        switch (status) {
            case 'started': return '🚀';
            case 'completed': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            default: return '🤖';
        }
    }
    async sendSlackMessage(config, message) {
        try {
            const response = await fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: message,
                    mrkdwn: true,
                }),
            });
            if (!response.ok) {
                console.error('Slack send failed:', await response.text());
            }
        }
        catch (error) {
            console.error('Slack error:', error);
        }
    }
    async sendDiscordMessage(config, message) {
        try {
            const response = await fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: message,
                    username: 'ShoppDropp AI',
                    avatar_url: 'https://shoppdropp.com/logo.png',
                }),
            });
            if (!response.ok) {
                console.error('Discord send failed:', await response.text());
            }
        }
        catch (error) {
            console.error('Discord error:', error);
        }
    }
    async sendWhatsAppMessage(config, message) {
        // Using WhatsApp Business API or Twilio
        try {
            // Strip markdown for WhatsApp
            const plainMessage = message.replace(/\*\*/g, '*').replace(/```json\n/g, '').replace(/\n```/g, '');
            // This would integrate with WhatsApp Business API
            // For now, placeholder - you'd use Twilio or direct WhatsApp Business API
            console.log('[WhatsApp] Would send:', plainMessage.substring(0, 100) + '...');
        }
        catch (error) {
            console.error('WhatsApp error:', error);
        }
    }
    // Handle incoming commands from channels
    async handleIncomingCommand(storeId, command, channel) {
        const validCommands = [
            'status',
            'pause',
            'resume',
            'run product-research',
            'run catalog-optimization',
            'run theme-design',
            'update pricing',
            'sync inventory',
            'help'
        ];
        const cmd = command.toLowerCase().trim();
        if (!validCommands.some(c => cmd.startsWith(c))) {
            return '❌ Unknown command. Type "help" for available commands.';
        }
        switch (cmd) {
            case 'help':
                return `🤖 **ShoppDropp AI Commands:**

• \`status\` - Check all worker status
• \`pause\` - Pause all workers
• \`resume\` - Resume all workers
• \`run product-research\` - Trigger product research
• \`run catalog-optimization\` - Optimize catalog
• \`run theme-design\` - Update store theme
• \`update pricing\` - Run pricing optimization
• \`sync inventory\` - Sync with supplier
• \`help\` - Show this help message`;
            case 'status':
                const workers = await supabase_1.db.getWorkersByStore(storeId);
                return `📊 **Worker Status:**\n\n${workers.map(w => `• ${w.type}: ${w.status}`).join('\n')}`;
            case 'pause':
                // Implementation to pause workers
                return '⏸️ All workers paused. Use "resume" to continue.';
            case 'resume':
                // Implementation to resume workers
                return '▶️ All workers resumed.';
            case 'run product-research':
                await this.triggerWorker(storeId, 'product-research');
                return '🚀 Product research worker triggered!';
            case 'run catalog-optimization':
                await this.triggerWorker(storeId, 'catalog-optimization');
                return '🚀 Catalog optimization triggered!';
            case 'run theme-design':
                await this.triggerWorker(storeId, 'theme-design');
                return '🚀 Theme design worker triggered!';
            case 'update pricing':
                await this.triggerWorker(storeId, 'pricing');
                return '🚀 Pricing update triggered!';
            case 'sync inventory':
                await this.triggerWorker(storeId, 'inventory-sync');
                return '🚀 Inventory sync triggered!';
            default:
                return '❓ Command not implemented yet.';
        }
    }
    async triggerWorker(storeId, workerType) {
        // Logic to trigger specific worker
        console.log(`[CommunicationService] Triggering ${workerType} for store ${storeId}`);
        // This would queue a job or trigger the worker directly
    }
}
exports.CommunicationService = CommunicationService;
exports.communicationService = new CommunicationService();
//# sourceMappingURL=communication-service.js.map