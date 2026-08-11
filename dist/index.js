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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const ws_1 = require("ws");
const config_1 = require("./config");
const supabase_1 = require("./db/supabase");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const stores_1 = __importDefault(require("./routes/stores"));
const ai_1 = __importDefault(require("./routes/ai"));
const ai_chat_1 = __importDefault(require("./routes/ai-chat"));
const user_1 = __importDefault(require("./routes/user"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const workers_1 = __importDefault(require("./routes/workers"));
const worker_tasks_1 = __importDefault(require("./routes/worker-tasks"));
const reprovision_1 = __importDefault(require("./routes/reprovision"));
const vps_1 = __importDefault(require("./routes/vps"));
const vps_simple_1 = __importDefault(require("./routes/vps-simple"));
const vps_debug_1 = __importDefault(require("./routes/vps-debug"));
const vps_test_1 = __importDefault(require("./routes/vps-test"));
const vps_retry_1 = __importDefault(require("./routes/vps-retry"));
const vps_sync_test_1 = __importDefault(require("./routes/vps-sync-test"));
const vps_debug_provision_1 = __importDefault(require("./routes/vps-debug-provision"));
const hetzner_types_1 = __importDefault(require("./routes/hetzner-types"));
const debug_1 = __importDefault(require("./routes/debug"));
const openwebninja_1 = __importDefault(require("./routes/openwebninja"));
const store_config_1 = __importDefault(require("./routes/store-config"));
const setup_1 = __importDefault(require("./routes/setup"));
const ws_proxy_1 = __importStar(require("./routes/ws-proxy"));
// Services
const workerManager_1 = require("./services/workerManager");
const hetznerService_1 = require("./services/hetznerService");
const workerCommands_1 = require("./services/workerCommands");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
const workerManager = new workerManager_1.WorkerManager();
// Middleware - CORS for lendsquid.ai and other allowed origins
app.use((0, cors_1.default)({
    origin: [
        'https://lendsquid.ai',
        'https://www.lendsquid.ai',
        'https://shoppdropp-blueprint.vercel.app',
        'https://shoppdropp-api.onrender.com',
        'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json());
// Raw body for Stripe webhooks
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }));
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/stores', stores_1.default);
app.use('/api/ai', ai_1.default);
app.use('/api/ai-chat', ai_chat_1.default);
app.use('/api/user', user_1.default);
app.use('/api/stripe', stripe_1.default);
app.use('/api/workers', workers_1.default);
app.use('/api/workers', worker_tasks_1.default);
app.use('/api/workers', reprovision_1.default);
app.use('/api/vps', vps_1.default);
app.use('/api/vps-simple', vps_simple_1.default);
app.use('/api/vps-debug', vps_debug_1.default);
app.use('/api/vps-test', vps_test_1.default);
app.use('/api/vps-retry', vps_retry_1.default);
app.use('/api/vps-sync-test', vps_sync_test_1.default);
app.use('/api/vps-debug', vps_debug_provision_1.default);
app.use('/api/hetzner', hetzner_types_1.default);
app.use('/api/debug', debug_1.default);
app.use('/api/openwebninja', openwebninja_1.default);
app.use('/api/store-config', store_config_1.default);
app.use('/api/setup', setup_1.default);
app.use('/ws', ws_proxy_1.default);
// Initialize Hetzner service if token is available
if (process.env.HETZNER_API_TOKEN) {
    (0, hetznerService_1.initHetznerService)();
    console.log('☁️ Hetzner service initialized');
}
else {
    console.warn('⚠️ HETZNER_API_TOKEN not set - VPS provisioning disabled');
}
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// WebSocket upgrade handling for /ws/worker/* paths
server.on('upgrade', async (request, socket, head) => {
    const url = request.url || '';
    console.log(`[WS-Upgrade] Upgrade request for ${url}`);
    // Only handle /ws/worker/* paths for proxy
    if (url.startsWith('/ws/worker/')) {
        console.log(`[WS-Upgrade] Handling worker proxy for ${url}`);
        try {
            // Extract and verify JWT token from query params
            let token = null;
            try {
                const urlObj = new URL(url, 'http://localhost');
                token = urlObj.searchParams.get('token');
                console.log(`[WS-Upgrade] Token from query: ${token ? 'present' : 'missing'}`);
            }
            catch (e) {
                console.log('[WS-Upgrade] Failed to parse URL');
            }
            if (!token && request.headers['authorization']) {
                token = request.headers['authorization'].replace('Bearer ', '');
                console.log('[WS-Upgrade] Token from header');
            }
            if (!token) {
                console.log('[WS-Upgrade] No token provided - rejecting');
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            // Verify JWT
            let userId;
            try {
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || config_1.config.jwt.secret);
                userId = decoded.userId || decoded.sub;
                console.log(`[WS-Upgrade] JWT verified for user: ${userId}`);
            }
            catch (err) {
                console.log('[WS-Upgrade] Invalid token:', err);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            // Create WebSocket and attach user
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.user = { id: userId };
                ws.req = { url, user: { id: userId } };
                console.log('[WS-Upgrade] Calling handleWsProxy');
                (0, ws_proxy_1.handleWsProxy)(ws, ws.req);
            });
        }
        catch (error) {
            console.error('[WS-Upgrade] Error:', error);
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
        }
        return;
    }
    // Let the default WSS handle other /ws paths
    console.log('[WS-Upgrade] Using default WSS handler');
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
// WebSocket handling for workers (on /ws path)
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const workerId = url.searchParams.get('workerId');
    if (!workerId) {
        ws.close(1008, 'Worker ID required');
        return;
    }
    console.log(`Worker ${workerId} connected`);
    workerManager.handleWorkerConnection(workerId, ws);
    // Send any pending commands to the worker
    const commandQueue = (0, workerCommands_1.getWorkerCommandQueue)();
    const pendingCommands = commandQueue.getPendingCommands(workerId);
    if (pendingCommands.length > 0) {
        console.log(`Sending ${pendingCommands.length} pending commands to worker ${workerId}`);
        pendingCommands.forEach(cmd => {
            if (ws.readyState === 1) { // WebSocket.OPEN
                ws.send(JSON.stringify({
                    type: 'command',
                    command: cmd,
                }));
                commandQueue.updateCommand(cmd.id, { status: 'running', started_at: new Date().toISOString() });
            }
        });
    }
    // Subscribe to new commands for this worker
    const commandHandler = (command) => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'command',
                command,
            }));
            commandQueue.updateCommand(command.id, { status: 'running', started_at: new Date().toISOString() });
        }
    };
    commandQueue.subscribe(workerId, commandHandler);
    // Handle messages from worker
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'command_result') {
                const { command_id, result, error } = message;
                if (error) {
                    await commandQueue.failCommand(command_id, error);
                    console.error(`Command ${command_id} failed:`, error);
                }
                else {
                    await commandQueue.completeCommand(command_id, result);
                    console.log(`Command ${command_id} completed:`, result);
                }
            }
            if (message.type === 'heartbeat') {
                // Update worker last_heartbeat
                await supabase_1.db.updateWorker(workerId, { last_heartbeat: new Date().toISOString() });
            }
            if (message.type === 'task_progress') {
                // Update task progress
                console.log(`Task ${message.task_id} progress: ${message.progress}%`);
            }
        }
        catch (e) {
            console.error('Error handling worker message:', e);
        }
    });
    // Cleanup on disconnect
    ws.on('close', () => {
        commandQueue.unsubscribe(workerId, commandHandler);
        console.log(`Worker ${workerId} disconnected`);
    });
});
// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
// Start server
server.listen(config_1.config.port, '0.0.0.0', () => {
    console.log(`🚀 ShoppDropp Backend running on port ${config_1.config.port}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`🔧 Environment: ${config_1.config.nodeEnv}`);
    console.log(`🖥️  VPS Provisioning: ${process.env.HETZNER_API_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`🔐 SSH Key: ${process.env.SSH_PRIVATE_KEY ? 'Configured' : 'Not configured'}`);
});
//# sourceMappingURL=index.js.map