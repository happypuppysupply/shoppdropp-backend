"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// Simple no-auth test
router.get('/test', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
// Echo back what auth header was received
router.get('/auth-check', (req, res) => {
    const auth = req.headers.authorization;
    res.json({
        hasAuth: !!auth,
        authHeader: auth ? auth.substring(0, 30) + '...' : null,
        message: auth ? 'Token received' : 'NO TOKEN - Frontend not sending Authorization header'
    });
});
exports.default = router;
//# sourceMappingURL=debug.js.map