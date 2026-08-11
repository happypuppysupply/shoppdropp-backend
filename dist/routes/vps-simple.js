"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const vpsProvisioner_1 = require("../services/vpsProvisioner");
const supabase_1 = require("../db/supabase");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Simple create worker and provision
router.post('/create-and-provision', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        console.log('Create and provision called by user:', user.id);
        // Get user's stores
        const stores = await supabase_1.db.getStoresByUser(user.id);
        console.log('Found stores:', stores.length);
        if (stores.length === 0) {
            return res.status(404).json({ error: 'No store found. Create a store first.' });
        }
        const store = stores[0];
        console.log('Using store:', store.id, store.name);
        // Check if store already has a worker by querying workers table
        const workers = await supabase_1.db.getWorkersByUser(user.id);
        const existingWorker = workers.find(w => w.store_id === store.id);
        if (existingWorker && existingWorker.status !== 'error') {
            console.log('Store already has worker:', existingWorker.id);
            return res.json({
                success: true,
                message: 'Worker already exists',
                workerId: existingWorker.id,
                status: existingWorker.status,
            });
        }
        // Create a new worker with store_id
        const workerId = (0, uuid_1.v4)();
        console.log('Creating worker:', workerId);
        await supabase_1.db.createWorker({
            id: workerId,
            user_id: user.id,
            store_id: store.id,
            status: 'provisioning',
        });
        console.log('Worker created, starting provisioning...');
        // Start provisioning
        let provisioner;
        try {
            provisioner = (0, vpsProvisioner_1.createVPSProvisioner)();
        }
        catch (initError) {
            console.error('[VPS] Failed to initialize provisioner:', initError.message);
            await supabase_1.db.updateWorker(workerId, { status: 'error' });
            return res.status(500).json({
                error: 'Failed to initialize VPS provisioner',
                details: initError.message
            });
        }
        // Get AI config for the env vars
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        const envVars = {};
        if (aiConfig) {
            envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
            envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
            envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
        }
        // Start async provisioning with proper error handling
        (async () => {
            try {
                console.log('[VPS] Starting provisionVPS with config:', { workerId, storeId: store.id, userId: user.id });
                const result = await provisioner.provisionVPS({
                    workerId,
                    storeId: store.id,
                    userId: user.id,
                    envVars,
                });
                console.log('[VPS] Provisioning result:', result);
                if (result.status === 'failed') {
                    console.error('[VPS] Provisioning failed:', result.error);
                    await supabase_1.db.updateWorker(workerId, { status: 'error' });
                }
                else {
                    console.log(`[VPS] Provisioning complete: ${result.ipAddress}`);
                }
            }
            catch (error) {
                console.error('[VPS] CRITICAL ERROR in provisionVPS:', error);
                console.error('[VPS] Error message:', error.message);
                console.error('[VPS] Error stack:', error.stack);
                try {
                    await supabase_1.db.updateWorker(workerId, { status: 'error' });
                }
                catch (dbError) {
                    console.error('[VPS] Failed to update worker status:', dbError);
                }
            }
        })();
        console.log('Returning success response');
        res.json({
            success: true,
            message: 'Worker created and VPS provisioning started',
            workerId,
            storeId: store.id,
            status: 'provisioning',
        });
    }
    catch (error) {
        console.error('Create and provision error:', error);
        res.status(500).json({
            error: error.message || 'Failed to create worker and provision VPS',
            details: error.stack || 'No stack trace'
        });
    }
});
// Get VPS status
router.get('/status/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        console.log(`[VPS Status] Looking up worker: ${workerId}, user: ${user.id}`);
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker) {
            console.log(`[VPS Status] Worker not found in DB: ${workerId}`);
            return res.status(404).json({ error: 'Worker not found' });
        }
        if (worker.user_id !== user.id) {
            console.log(`[VPS Status] User mismatch. Worker user: ${worker.user_id}, Request user: ${user.id}`);
            return res.status(404).json({ error: 'Worker not found' });
        }
        console.log(`[VPS Status] Worker found: ${workerId}, status: ${worker.status}, hetzner_id: ${worker.hetzner_server_id || 'none'}`);
        // If no Hetzner server ID, return basic status (worker exists but VPS not provisioned yet)
        if (!worker.hetzner_server_id) {
            console.log(`[VPS Status] Worker has no Hetzner server yet, returning basic status`);
            return res.json({
                workerId,
                status: worker.status,
                provisioned: false,
            });
        }
        // Get fresh data from Hetzner
        const { getHetznerService } = await Promise.resolve().then(() => __importStar(require('../services/hetznerService')));
        const hetzner = getHetznerService();
        const server = await hetzner.getServer(parseInt(worker.hetzner_server_id));
        res.json({
            workerId,
            status: worker.status,
            provisioned: true,
            server: {
                id: server.id,
                name: server.name,
                status: server.status,
                type: server.server_type.name,
                cores: server.server_type.cores,
                memory: server.server_type.memory,
                disk: server.server_type.disk,
                ip: server.public_net.ipv4.ip,
                created: server.created,
            },
        });
    }
    catch (error) {
        console.error('VPS status error:', error);
        res.status(500).json({ error: error.message || 'Failed to get VPS status' });
    }
});
exports.default = router;
//# sourceMappingURL=vps-simple.js.map