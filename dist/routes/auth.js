"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const supabase_1 = require("../db/supabase");
const auth_1 = require("../middleware/auth");
const stripe_1 = __importDefault(require("stripe"));
const config_1 = require("../config");
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(config_1.config.stripe.secretKey, { apiVersion: '2024-06-20' });
// Register
router.post('/register', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { email, plan = 'payg' } = req.body;
        // Check if user exists
        const existingUser = await supabase_1.db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        // Create Stripe customer
        const customer = await stripe.customers.create({ email });
        // Create user
        const user = await supabase_1.db.createUser({
            email,
            stripe_customer_id: customer.id,
            plan,
            status: 'active',
        });
        const token = (0, auth_1.generateToken)(user.id);
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                plan: user.plan,
                status: user.status,
            },
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});
// Login (simple version - in production use proper password hashing)
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
], async (req, res) => {
    try {
        const { email } = req.body;
        const user = await supabase_1.db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = (0, auth_1.generateToken)(user.id);
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                plan: user.plan,
                status: user.status,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map