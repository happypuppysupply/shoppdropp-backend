"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Ensure store exists for user
router.post('/ensure-store', async (req, res) => {
    try {
        const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
        const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
        // Check if store exists
        let store = await supabase_1.db.getStoreById(storeId);
        if (!store) {
            // Create the store
            store = await supabase_1.db.createStore({
                id: storeId,
                user_id: userId,
                name: 'Happy Puppy Supply',
                url: 'https://happypuppysupply.com',
                platform: 'shopify',
                status: 'active',
            });
            console.log('[Setup] Created store:', store.id);
        }
        else {
            console.log('[Setup] Store already exists:', store.id);
        }
        res.json({
            success: true,
            store: {
                id: store.id,
                name: store.name,
                url: store.url,
                status: store.status,
                worker_id: store.worker_id,
            }
        });
    }
    catch (error) {
        console.error('[Setup] Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=setup.js.map