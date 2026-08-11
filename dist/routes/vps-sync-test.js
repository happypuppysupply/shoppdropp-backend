"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const vpsProvisioner_1 = require("../services/vpsProvisioner");
const supabase_1 = require("../db/supabase");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Synchronous test - waits for full provisioning
router.post('/sync-provision', async (req, res) => {
    const logs = [];
    const log = (msg) => {
        console.log(msg);
        logs.push(msg);
    };
    try {
        log('=== SYNC PROVISION TEST ===');
        const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
        const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
        const workerId = (0, uuid_1.v4)();
        // Create worker
        log(`Creating worker: ${workerId}`);
        await supabase_1.db.createWorker({
            id: workerId,
            user_id: userId,
            store_id: storeId,
            status: 'provisioning',
        });
        // Create provisioner
        log('Creating provisioner...');
        const provisioner = (0, vpsProvisioner_1.createVPSProvisioner)();
        // Get AI config
        const aiConfig = await supabase_1.db.getAIConfig(userId);
        const envVars = {};
        if (aiConfig) {
            envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
            envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
            envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
        }
        // Provision synchronously
        log('Starting provisionVPS (this may take 2-3 minutes)...');
        const result = await provisioner.provisionVPS({
            workerId,
            storeId,
            userId,
            envVars,
        });
        log(`Provisioning result: ${JSON.stringify(result)}`);
        res.json({
            success: result.status === 'success',
            workerId,
            result,
            logs,
        });
    }
    catch (error) {
        log(`CRITICAL ERROR: ${error.message}`);
        log(`Stack: ${error.stack}`);
        res.status(500).json({
            error: error.message,
            stack: error.stack,
            logs,
        });
    }
});
exports.default = router;
//# sourceMappingURL=vps-sync-test.js.map