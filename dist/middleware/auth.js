"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
const supabase_1 = require("../db/supabase");
// Create Supabase client for token verification
const supabase = config_1.config.supabase.url && config_1.config.supabase.serviceKey
    ? (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceKey)
    : null;
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.substring(7);
        let userId = null;
        // Try 1: Verify as our custom JWT
        try {
            const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
            userId = decoded.userId;
            console.log('Auth: Custom JWT verified, userId:', userId);
        }
        catch (e) {
            // Not our custom JWT, try Supabase
            console.log('Auth: Custom JWT failed, trying Supabase...');
        }
        // Try 2: Verify as Supabase JWT
        if (!userId && supabase) {
            try {
                const { data: { user }, error } = await supabase.auth.getUser(token);
                if (error || !user) {
                    console.log('Auth: Supabase token validation failed:', error?.message);
                }
                else {
                    userId = user.id;
                    console.log('Auth: Supabase JWT verified, userId:', userId);
                }
            }
            catch (e) {
                console.log('Auth: Supabase verification error:', e.message);
            }
        }
        if (!userId) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        // Get or create user in our database
        let user = await supabase_1.db.getUserById(userId);
        if (!user && supabase) {
            // User exists in Supabase but not in our DB - create them
            try {
                const { data: { user: supabaseUser } } = await supabase.auth.getUser(token);
                if (supabaseUser?.email) {
                    console.log('Auth: Creating new user from Supabase:', supabaseUser.email);
                    user = await supabase_1.db.createUser({
                        id: supabaseUser.id,
                        email: supabaseUser.email,
                        plan: 'payg',
                        status: 'active',
                    });
                }
            }
            catch (e) {
                console.log('Auth: Failed to create user from Supabase:', e.message);
            }
        }
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        req.user = user;
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};
exports.authenticate = authenticate;
const generateToken = (userId) => {
    return jsonwebtoken_1.default.sign({ userId }, config_1.config.jwt.secret, { expiresIn: '7d' });
};
exports.generateToken = generateToken;
//# sourceMappingURL=auth.js.map