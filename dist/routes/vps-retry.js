"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const vpsProvisioner_1 = require("../services/vpsProvisioner");
const router = (0, express_1.Router)();
// Retry provisioning for an existing worker
router.post('/retry/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        console.log(`[Retry] Retrying provisioning for worker: ${workerId}`);
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        if (worker.user_id !== user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Update worker status back to provisioning
        await supabase_1.db.updateWorker(workerId, { status: 'provisioning' });
        // Start provisioning
        const provisioner = (0, vpsProvisioner_1.createVPSProvisioner)();
        // Get AI config
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        const envVars = {};
        if (aiConfig) {
            envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
            envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
            envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
        }
        // Start async provisioning
        (async () => {
            try {
                console.log('[Retry] Starting provisionVPS...');
                const result = await provisioner.provisionVPS({
                    workerId,
                    storeId: worker.store_id,
                    userId: user.id,
                    envVars,
                });
                console.log('[Retry] Provisioning result:', result);
                if (result.status === 'failed') {
                    console.error('[Retry] Provisioning failed:', result.error);
                    await supabase_1.db.updateWorker(workerId, { status: 'error' });
                }
                else {
                    console.log(`[Retry] Provisioning complete: ${result.ipAddress}`);
                }
            }
            catch (error) {
                console.error('[Retry] CRITICAL ERROR:', error);
                await supabase_1.db.updateWorker(workerId, { status: 'error' });
            }
        })();
        res.json({
            success: true,
            message: 'Retrying VPS provisioning',
            workerId,
        });
    }
    catch (error) {
        console.error('Retry error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=vps-retry.js.map