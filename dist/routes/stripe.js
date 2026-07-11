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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
const stripe_1 = __importDefault(require("stripe"));
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(config_1.config.stripe.secretKey, { apiVersion: '2024-06-20' });
// Create checkout session
router.post('/checkout', auth_1.authenticate, [
    (0, express_validator_1.body)('plan').isIn(['growth', 'agency']),
], async (req, res) => {
    try {
        const { plan } = req.body;
        const priceId = config_1.config.stripe.prices[plan];
        if (!priceId) {
            return res.status(400).json({ error: 'Invalid plan' });
        }
        const session = await stripe.checkout.sessions.create({
            customer: req.user.stripe_customer_id,
            payment_method_types: ['card'],
            line_items: [{
                    price: priceId,
                    quantity: 1,
                }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/dashboard?success=true`,
            cancel_url: `${req.headers.origin}/dashboard?canceled=true`,
            metadata: { plan },
        });
        res.json({ sessionId: session.id, url: session.url });
    }
    catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});
// Get subscription status
router.get('/subscription', auth_1.authenticate, async (req, res) => {
    try {
        if (!req.user.stripe_subscription_id) {
            return res.json({ plan: req.user.plan, status: 'inactive' });
        }
        const subscription = await stripe.subscriptions.retrieve(req.user.stripe_subscription_id);
        res.json({
            plan: req.user.plan,
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});
// Webhook
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, config_1.config.stripe.webhookSecret);
    }
    catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    // Handle events
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            // Find user by customer ID
            const { data: users, error } = await (await Promise.resolve().then(() => __importStar(require('../db/supabase')))).db.getUserByStripeCustomerId(session.customer);
            if (users && !error) {
                await (await Promise.resolve().then(() => __importStar(require('../db/supabase')))).db.updateUser(users.id, {
                    stripe_subscription_id: session.subscription,
                    plan: session.metadata?.plan || 'growth',
                });
            }
            break;
        }
        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            console.log('Payment failed:', invoice.id);
            break;
        }
        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            // Downgrade to payg
            const { data: users } = await (await Promise.resolve().then(() => __importStar(require('../db/supabase')))).db.getUserByStripeCustomerId(subscription.customer);
            if (users) {
                await (await Promise.resolve().then(() => __importStar(require('../db/supabase')))).db.updateUser(users.id, {
                    stripe_subscription_id: undefined,
                    plan: 'payg',
                });
            }
            break;
        }
    }
    res.json({ received: true });
});
exports.default = router;
//# sourceMappingURL=stripe.js.map