"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Save GitHub credentials
router.post('/github', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { token, username } = req.body;
        await supabase_1.db.saveUserCredential(user.id, 'github', {
            token,
            username,
        });
        res.json({ success: true, connected: true, username });
    }
    catch (error) {
        console.error('GitHub save error:', error);
        res.status(500).json({ error: 'Failed to save GitHub credentials' });
    }
});
// Get GitHub credentials (without token)
router.get('/github', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const cred = await supabase_1.db.getUserCredential(user.id, 'github');
        if (!cred) {
            return res.json({ connected: false });
        }
        res.json({
            connected: true,
            username: cred.data?.username,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch GitHub credentials' });
    }
});
// Save Vercel credentials
router.post('/vercel', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { token, team_id } = req.body;
        await supabase_1.db.saveUserCredential(user.id, 'vercel', {
            token,
            team_id,
        });
        res.json({ success: true, connected: true });
    }
    catch (error) {
        console.error('Vercel save error:', error);
        res.status(500).json({ error: 'Failed to save Vercel credentials' });
    }
});
// Get Vercel credentials (without token)
router.get('/vercel', auth_1.authenticate, async (req, res) => {
    try {
        const user = req.user;
        const cred = await supabase_1.db.getUserCredential(user.id, 'vercel');
        if (!cred) {
            return res.json({ connected: false });
        }
        res.json({
            connected: true,
            has_team: !!cred.data?.team_id,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch Vercel credentials' });
    }
});
exports.default = router;
//# sourceMappingURL=user.js.map