"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const uuid_1 = require("uuid");
const workerManager_1 = require("../services/workerManager");
const router = (0, express_1.Router)();
const workerManager = new workerManager_1.WorkerManager();
// Get all stores for user
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const stores = await supabase_1.db.getStoresByUser(req.user.id);
        res.json(stores);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch stores' });
    }
});
// Create store
router.post('/', auth_1.authenticate, [
    (0, express_validator_1.body)('name').trim().notEmpty(),
    (0, express_validator_1.body)('url').isURL(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { name, url } = req.body;
        const store = await supabase_1.db.createStore({
            id: (0, uuid_1.v4)(),
            user_id: req.user.id,
            name,
            url,
            platform: 'shopify',
            status: 'pending',
        });
        // Provision worker (mock for now)
        await workerManager.provisionWorker(req.user.id, store.id);
        res.json(store);
    }
    catch (error) {
        console.error('Create store error:', error);
        res.status(500).json({ error: 'Failed to create store' });
    }
});
// Get store by ID
router.get('/:id', auth_1.authenticate, [
    (0, express_validator_1.param)('id').isUUID(),
], async (req, res) => {
    try {
        const store = await supabase_1.db.getStoreById(req.params.id);
        if (!store || store.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Store not found' });
        }
        res.json(store);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch store' });
    }
});
// Save API credentials
router.post('/:id/credentials', auth_1.authenticate, [
    (0, express_validator_1.param)('id').isUUID(),
    (0, express_validator_1.body)('type').isIn(['shopify', 'meta_ads', 'autods']),
    (0, express_validator_1.body)('credentials').isObject(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { type, credentials } = req.body;
        const store = await supabase_1.db.getStoreById(req.params.id);
        if (!store || store.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Store not found' });
        }
        // In production, encrypt these credentials
        const encryptedData = JSON.stringify(credentials);
        await supabase_1.db.upsertCredentials({
            id: (0, uuid_1.v4)(),
            store_id: store.id,
            type,
            encrypted_data: encryptedData,
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save credentials' });
    }
});
// Get credentials for store
router.get('/:id/credentials', auth_1.authenticate, [
    (0, express_validator_1.param)('id').isUUID(),
], async (req, res) => {
    try {
        const store = await supabase_1.db.getStoreById(req.params.id);
        if (!store || store.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Store not found' });
        }
        const creds = await supabase_1.db.getCredentialsByStore(store.id);
        // Return types only, not actual credentials (for security)
        res.json(creds.map(c => ({ type: c.type, hasCredentials: true })));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch credentials' });
    }
});
exports.default = router;
//# sourceMappingURL=stores.js.map