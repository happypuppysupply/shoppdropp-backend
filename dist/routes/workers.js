"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Get all workers for user
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const workers = await supabase_1.db.getWorkersByUser(user.id);
        res.json(workers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch workers' });
    }
});
// Get worker status
router.get('/:id/status', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const worker = await supabase_1.db.getWorkerById(req.params.id);
        if (!worker || worker.user_id !== user.id) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        res.json({
            id: worker.id,
            status: worker.status,
            store_id: worker.store_id,
            last_heartbeat: worker.last_heartbeat,
            created_at: worker.created_at,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch worker status' });
    }
});
exports.default = router;
//# sourceMappingURL=workers.js.map