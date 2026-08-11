"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const communication_service_1 = require("../services/communication-service");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Configure communication channel (Slack, Discord, WhatsApp)
router.post('/configure', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId, channel, webhookUrl, apiToken, channelId } = req.body;
        if (!storeId || !channel || !webhookUrl) {
            return res.status(400).json({
                error: 'Missing required fields: storeId, channel, webhookUrl'
            });
        }
        if (!['slack', 'discord', 'whatsapp'].includes(channel)) {
            return res.status(400).json({
                error: 'Invalid channel. Must be: slack, discord, or whatsapp'
            });
        }
        // Verify store belongs to user
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Store not found or access denied' });
        }
        // Save configuration
        await communication_service_1.communicationService.configureChannel({
            userId: user.id,
            storeId,
            channel,
            webhookUrl,
            apiToken,
            channelId,
            enabled: true,
        });
        // Send test message
        await communication_service_1.communicationService.sendUpdate(storeId, {
            workerType: 'System',
            storeName: store.name,
            status: 'info',
            content: `✅ Communication channel configured!\n\nYou'll receive updates here when workers complete tasks or need attention.\n\nType "help" for available commands.`,
            timestamp: new Date(),
        });
        res.json({
            success: true,
            message: `${channel} integration configured successfully`,
            storeId,
            channel,
        });
    }
    catch (error) {
        console.error('[Communication] Configure error:', error);
        res.status(500).json({ error: 'Failed to configure communication channel' });
    }
});
// Get communication config for store
router.get('/config/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const config = await communication_service_1.communicationService.getConfig(storeId);
        if (!config) {
            return res.json({ configured: false });
        }
        // Don't expose sensitive data
        res.json({
            configured: true,
            channel: config.channel,
            enabled: config.enabled,
            webhookUrl: config.webhookUrl.replace(/\/\/[^@]+@/, '//***@'), // Hide credentials
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Test communication channel
router.post('/test', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.body;
        const store = await supabase_1.db.getStoreById(storeId);
        if (!store || store.user_id !== user.id) {
            return res.status(403).json({ error: 'Store not found or access denied' });
        }
        // Send test message
        await communication_service_1.communicationService.sendUpdate(storeId, {
            workerType: 'System',
            storeName: store.name,
            status: 'info',
            content: '🧪 This is a test message from ShoppDropp!\n\nYour communication channel is working correctly.',
            timestamp: new Date(),
        });
        res.json({ success: true, message: 'Test message sent' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Incoming webhook handler (for Slack/Discord slash commands)
router.post('/webhook/:storeId', async (req, res) => {
    try {
        const { storeId } = req.params;
        const { command, text, user_name, channel_name } = req.body;
        console.log(`[Communication] Incoming command from ${user_name}: ${text}`);
        // Handle the command
        const response = await communication_service_1.communicationService.handleIncomingCommand(storeId, text || command, channel_name || 'direct');
        // Send response back
        res.json({
            response_type: 'ephemeral',
            text: response,
        });
    }
    catch (error) {
        console.error('[Communication] Webhook error:', error);
        res.json({
            response_type: 'ephemeral',
            text: '❌ Error processing command. Please try again.',
        });
    }
});
// Toggle communication on/off
router.patch('/toggle/:storeId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.params;
        const { enabled } = req.body;
        const config = await communication_service_1.communicationService.getConfig(storeId);
        if (!config) {
            return res.status(404).json({ error: 'Communication not configured' });
        }
        await communication_service_1.communicationService.configureChannel({
            ...config,
            enabled,
        });
        res.json({ success: true, enabled });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=communication.js.map