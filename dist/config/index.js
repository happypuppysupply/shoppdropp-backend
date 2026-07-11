"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
exports.config = {
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: process.env.NODE_ENV || 'development',
    supabase: {
        url: process.env.SUPABASE_URL || '',
        serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        prices: {
            payg: process.env.STRIPE_PRICE_PAYG || '',
            growth: process.env.STRIPE_PRICE_GROWTH || '',
            agency: process.env.STRIPE_PRICE_AGENCY || '',
        },
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'change-this-secret',
    },
    worker: {
        image: process.env.WORKER_IMAGE || 'shoppdropp-worker:latest',
    },
};
if (!exports.config.supabase.url || !exports.config.supabase.serviceKey) {
    console.warn('Warning: Supabase credentials not configured');
}
if (!exports.config.stripe.secretKey) {
    console.warn('Warning: Stripe secret key not configured');
}
//# sourceMappingURL=index.js.map