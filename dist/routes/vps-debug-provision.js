"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const vpsProvisioner_1 = require("../services/vpsProvisioner");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Track active provisions (in-memory, per-instance)
const activeProvisions = new Map();
// Debug: Start async provision
router.post('/debug-provision', async (req, res) => {
    try {
        const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
        const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
        const workerId = (0, uuid_1.v4)();
        // Check env vars
        const hetznerToken = process.env.HETZNER_API_TOKEN;
        const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
        if (!hetznerToken || !sshPrivateKey) {
            return res.status(500).json({
                error: 'Missing env vars: HETZNER_API_TOKEN or SSH_PRIVATE_KEY'
            });
        }
        // Create worker record
        await supabase_1.db.createWorker({
            id: workerId,
            user_id: userId,
            store_id: storeId,
            status: 'provisioning',
        });
        // Link worker to store so dashboard can find it
        await supabase_1.db.updateStore(storeId, { worker_id: workerId });
        // Start provision in background (don't await)
        runProvision(workerId, userId, storeId);
        // Return immediately with worker ID
        return res.json({
            success: true,
            workerId,
            message: 'Provisioning started. Poll /api/vps-debug/provision-status/:workerId for updates.',
        });
    }
    catch (error) {
        console.error('Error starting provision:', error);
        res.status(500).json({
            error: error.message,
            stack: error.stack,
        });
    }
});
// Get provision status
router.get('/provision-status/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;
        // Get worker from DB
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // Get active provision logs if available
        const provision = activeProvisions.get(workerId);
        res.json({
            workerId: worker.id,
            status: worker.status,
            hetznerServerId: worker.hetzner_server_id,
            createdAt: worker.created_at,
            logs: provision?.logs || [],
            error: provision?.error,
            result: provision?.result,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get worker logs from database
router.get('/worker-logs/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;
        // Get worker from DB
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // Get logs from database
        const dbLogs = await supabase_1.db.getWorkerLogs(workerId);
        // Get active provision logs if available
        const provision = activeProvisions.get(workerId);
        res.json({
            workerId: worker.id,
            status: worker.status,
            logs: dbLogs || [],
            activeLogs: provision?.logs || [],
            error: provision?.error || worker.error_message,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Retry provisioning from failed step
router.post('/retry-provision/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;
        const { fromStep } = req.body;
        // Get worker from DB
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // Can only retry from failed or error status
        if (worker.status !== 'failed' && worker.status !== 'error') {
            return res.status(400).json({
                error: `Cannot retry worker with status '${worker.status}'. Must be 'failed' or 'error'.`
            });
        }
        // Clear old error logs from active provisions
        activeProvisions.delete(workerId);
        // Clear error logs from database
        await supabase_1.db.clearWorkerLogs(workerId);
        // Reset worker status to 'provisioning'
        await supabase_1.db.updateWorker(workerId, {
            status: 'provisioning',
            error_message: null,
        });
        // Restart provision in background (don't await)
        runProvision(workerId, worker.user_id, worker.store_id || '', { fromStep });
        // Return immediately
        return res.json({
            success: true,
            workerId,
            fromStep,
            message: 'Provisioning retry started. Poll /api/vps-debug/provision-status/:workerId for updates.',
        });
    }
    catch (error) {
        console.error('Error retrying provision:', error);
        res.status(500).json({
            error: error.message,
            stack: error.stack,
        });
    }
});
// Run provision in background
async function runProvision(workerId, userId, storeId, options) {
    const logs = [];
    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        console.log(`[Provision ${workerId.slice(0, 8)}] ${msg}`);
        logs.push(line);
    };
    activeProvisions.set(workerId, { status: 'running', logs });
    if (options?.fromStep) {
        log(`=== RETRY FROM STEP: ${options.fromStep} ===`);
    }
    try {
        log('=== PROVISION START ===');
        const provisioner = (0, vpsProvisioner_1.createVPSProvisioner)();
        // Get AI config
        let aiConfig;
        try {
            aiConfig = await supabase_1.db.getAIConfig(userId);
            log(`AI config: ${aiConfig ? aiConfig.provider : 'not found'}`);
        }
        catch (e) {
            log(`Warning: Could not load AI config: ${e.message}`);
        }
        const envVars = {};
        if (aiConfig) {
            envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
            envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
            envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
        }
        log('Starting VPS provision...');
        const result = await provisioner.provisionVPS({
            workerId,
            storeId,
            userId,
            envVars,
        });
        log(`Provision result: ${JSON.stringify(result)}`);
        if (result.status === 'failed') {
            activeProvisions.set(workerId, {
                status: 'failed',
                logs,
                error: result.error,
            });
        }
        else {
            activeProvisions.set(workerId, {
                status: 'completed',
                logs,
                result,
            });
            // Update store with server info
            try {
                await supabase_1.db.updateStore(storeId, {
                    hetzner_server_id: result.serverId.toString(),
                    ip_address: result.ipAddress,
                });
                log(`Store ${storeId} updated with server info`);
            }
            catch (e) {
                log(`Warning: Failed to update store with server info: ${e.message}`);
            }
        }
        log('=== PROVISION COMPLETE ===');
    }
    catch (error) {
        log(`CRITICAL ERROR: ${error.message}`);
        log(`Stack: ${error.stack}`);
        activeProvisions.set(workerId, {
            status: 'failed',
            logs,
            error: error.message,
        });
        // Update worker status to error
        try {
            await supabase_1.db.updateWorker(workerId, { status: 'error' });
        }
        catch (e) {
            log(`Failed to update worker status: ${e}`);
        }
    }
}
exports.default = router;
//# sourceMappingURL=vps-debug-provision.js.map