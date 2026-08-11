"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const vpsProvisioner_1 = require("../services/vpsProvisioner");
const hetznerService_1 = require("../services/hetznerService");
const supabase_1 = require("../db/supabase");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Get or create VPS provisioner
function getProvisioner() {
    return (0, vpsProvisioner_1.createVPSProvisioner)();
}
// Provision a new VPS for a worker
router.post('/provision/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        const { envVars = {} } = req.body;
        // Verify worker belongs to user
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // Get store credentials to include in env
        if (!worker.store_id) {
            return res.status(400).json({ error: 'Worker has no store assigned' });
        }
        const store = await supabase_1.db.getStoreById(worker.store_id);
        if (!store) {
            return res.status(404).json({ error: 'Store not found' });
        }
        // Get API credentials for the store
        const credentials = await supabase_1.db.getCredentialsByStore(store.id);
        const storeEnvVars = {};
        for (const cred of credentials) {
            try {
                const data = JSON.parse(cred.encrypted_data);
                switch (cred.type) {
                    case 'shopify':
                        storeEnvVars.SHOPIFY_STORE_URL = store.shopify_store_url || store.url || '';
                        storeEnvVars.SHOPIFY_ACCESS_TOKEN = data.access_token || '';
                        break;
                    case 'cj_dropshipping':
                        storeEnvVars.CJ_DROPSHIPPING_API_KEY = data.api_key || '';
                        storeEnvVars.CJ_DROPSHIPPING_EMAIL = data.email || '';
                        break;
                    case 'meta_ads':
                        storeEnvVars.META_ADS_ACCESS_TOKEN = data.access_token || '';
                        storeEnvVars.META_ADS_ACCOUNT_ID = data.account_id || '';
                        break;
                }
            }
            catch (e) {
                console.warn(`Failed to parse credentials for ${cred.type}`);
            }
        }
        // Get AI config
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        if (aiConfig) {
            storeEnvVars.AI_PROVIDER = aiConfig.provider;
            storeEnvVars.AI_MODEL = aiConfig.model;
            storeEnvVars.AI_API_KEY = aiConfig.api_key_encrypted; // This should be decrypted
        }
        // Merge all env vars
        const mergedEnvVars = {
            ...storeEnvVars,
            ...envVars,
        };
        // Start provisioning
        const provisioner = getProvisioner();
        // Update worker status
        await supabase_1.db.updateWorker(workerId, { status: 'provisioning' });
        // Start async provisioning
        provisioner.provisionVPS({
            workerId,
            storeId: store.id,
            userId: user.id,
            envVars: mergedEnvVars,
        }).then(result => {
            if (result.status === 'failed') {
                console.error(`[VPS] Provisioning failed for worker ${workerId}:`, result.error);
            }
            else {
                console.log(`[VPS] Provisioning complete for worker ${workerId}: ${result.ipAddress}`);
            }
        }).catch(error => {
            console.error(`[VPS] Unexpected error provisioning worker ${workerId}:`, error);
        });
        // Return immediately - provisioning happens async
        res.json({
            success: true,
            message: 'VPS provisioning started',
            workerId,
            status: 'provisioning',
        });
    }
    catch (error) {
        console.error('VPS provision error:', error);
        res.status(500).json({ error: error.message || 'Failed to provision VPS' });
    }
});
// Get VPS status
router.get('/status/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        // If no Hetzner server ID, return basic status
        if (!worker.hetzner_server_id) {
            return res.json({
                workerId,
                status: worker.status,
                provisioned: false,
            });
        }
        // Get fresh data from Hetzner
        const hetzner = (0, hetznerService_1.getHetznerService)();
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
// Get VPS metrics
router.get('/metrics/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        if (!worker.hetzner_server_id) {
            return res.status(400).json({ error: 'VPS not provisioned' });
        }
        const provisioner = getProvisioner();
        const metrics = await provisioner.getServerMetrics(parseInt(worker.hetzner_server_id));
        res.json(metrics);
    }
    catch (error) {
        console.error('VPS metrics error:', error);
        res.status(500).json({ error: error.message || 'Failed to get metrics' });
    }
});
// Reboot VPS
router.post('/reboot/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        if (!worker.hetzner_server_id) {
            return res.status(400).json({ error: 'VPS not provisioned' });
        }
        const provisioner = getProvisioner();
        await provisioner.rebootVPS(parseInt(worker.hetzner_server_id));
        res.json({ success: true, message: 'VPS reboot initiated' });
    }
    catch (error) {
        console.error('VPS reboot error:', error);
        res.status(500).json({ error: error.message || 'Failed to reboot VPS' });
    }
});
// Destroy VPS
router.delete('/:workerId', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { workerId } = req.params;
        const worker = await supabase_1.db.getWorkerById(workerId);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        if (!worker.hetzner_server_id) {
            return res.status(400).json({ error: 'VPS not provisioned' });
        }
        const provisioner = getProvisioner();
        await provisioner.destroyVPS(parseInt(worker.hetzner_server_id), workerId);
        res.json({ success: true, message: 'VPS destroyed' });
    }
    catch (error) {
        console.error('VPS destroy error:', error);
        res.status(500).json({ error: error.message || 'Failed to destroy VPS' });
    }
});
// List available server types
router.get('/server-types', auth_1.authenticate, async (req, res) => {
    try {
        const hetzner = (0, hetznerService_1.getHetznerService)();
        const types = await hetzner.listServerTypes();
        // Filter to shared types (cx11, cx21, cx31, etc)
        const sharedTypes = types.filter((t) => t.name.startsWith('cx'));
        res.json(sharedTypes.map((t) => ({
            name: t.name,
            description: t.description,
            cores: t.cores,
            memory: t.memory,
            disk: t.disk,
            prices: t.prices,
        })));
    }
    catch (error) {
        console.error('Server types error:', error);
        res.status(500).json({ error: error.message || 'Failed to get server types' });
    }
});
// List available locations
router.get('/locations', auth_1.authenticate, async (req, res) => {
    try {
        const hetzner = (0, hetznerService_1.getHetznerService)();
        const locations = await hetzner.listLocations();
        res.json(locations.map((l) => ({
            name: l.name,
            description: l.description,
            city: l.city,
            country: l.country,
        })));
    }
    catch (error) {
        console.error('Locations error:', error);
        res.status(500).json({ error: error.message || 'Failed to get locations' });
    }
});
// Create worker and provision VPS in one call
router.post('/create-and-provision', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { storeId } = req.body;
        // Get user's store
        const stores = await supabase_1.db.getStoresByUser(user.id);
        const store = storeId
            ? stores.find(s => s.id === storeId)
            : stores[0];
        if (!store) {
            return res.status(404).json({ error: 'No store found' });
        }
        // Create a new worker
        const workerId = (0, uuid_1.v4)();
        await supabase_1.db.createWorker({
            id: workerId,
            user_id: user.id,
            store_id: store.id,
            status: 'provisioning',
        });
        // Update store with worker_id
        await supabase_1.db.updateStore(store.id, { worker_id: workerId });
        // Start provisioning
        const provisioner = getProvisioner();
        // Get credentials
        const credentials = await supabase_1.db.getCredentialsByStore(store.id);
        const storeEnvVars = {};
        for (const cred of credentials) {
            try {
                const data = JSON.parse(cred.encrypted_data);
                switch (cred.type) {
                    case 'shopify':
                        storeEnvVars.SHOPIFY_STORE_URL = store.url || '';
                        storeEnvVars.SHOPIFY_ACCESS_TOKEN = data.access_token || '';
                        break;
                    case 'cj_dropshipping':
                        storeEnvVars.CJ_DROPSHIPPING_API_KEY = data.api_key || '';
                        break;
                    case 'meta_ads':
                        storeEnvVars.META_ADS_ACCESS_TOKEN = data.access_token || '';
                        storeEnvVars.META_ADS_ACCOUNT_ID = data.account_id || '';
                        break;
                }
            }
            catch (e) {
                console.warn(`Failed to parse credentials for ${cred.type}`);
            }
        }
        // Get AI config
        const aiConfig = await supabase_1.db.getAIConfig(user.id);
        if (aiConfig) {
            storeEnvVars.AI_PROVIDER = aiConfig.provider;
            storeEnvVars.AI_MODEL = aiConfig.model;
            storeEnvVars.AI_API_KEY = aiConfig.api_key_encrypted;
        }
        // Start async provisioning
        provisioner.provisionVPS({
            workerId,
            storeId: store.id,
            userId: user.id,
            envVars: storeEnvVars,
        }).then(result => {
            if (result.status === 'failed') {
                console.error(`[VPS] Provisioning failed:`, result.error);
                supabase_1.db.updateWorker(workerId, { status: 'error' });
            }
            else {
                console.log(`[VPS] Provisioning complete: ${result.ipAddress}`);
            }
        }).catch(error => {
            console.error(`[VPS] Unexpected error:`, error);
            supabase_1.db.updateWorker(workerId, { status: 'error' });
        });
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
        res.status(500).json({ error: error.message || 'Failed to create worker and provision VPS' });
    }
});
exports.default = router;
//# sourceMappingURL=vps.js.map