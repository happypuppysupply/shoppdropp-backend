"use strict";
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
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const stores_1 = __importDefault(require("./routes/stores"));
const ai_1 = __importDefault(require("./routes/ai"));
const ai_chat_1 = __importDefault(require("./routes/ai-chat"));
const user_1 = __importDefault(require("./routes/user"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const workers_1 = __importDefault(require("./routes/workers"));
const vps_1 = __importDefault(require("./routes/vps"));
const debug_1 = __importDefault(require("./routes/debug"));
// Services
const workerManager_1 = require("./services/workerManager");
const hetznerService_1 = require("./services/hetznerService");
const workerCommands_1 = require("./services/workerCommands");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
const workerManager = new workerManager_1.WorkerManager();
// Middleware
app.use((0, cors_1.default)());
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
app.use('/api/vps', vps_1.default);
app.use('/api/debug', debug_1.default);
// Initialize Hetzner service if token is available
if (process.env.HETZNER_API_TOKEN) {
    (0, hetznerService_1.initHetznerService)(process.env.HETZNER_API_TOKEN);
    console.log('☁️ Hetzner service initialized');
}
else {
    console.warn('⚠️ HETZNER_API_TOKEN not set - VPS provisioning disabled');
}
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// WebSocket handling for workers
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
server.listen(config_1.config.port, () => {
    console.log(`🚀 ShoppDropp Backend running on port ${config_1.config.port}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`🔧 Environment: ${config_1.config.nodeEnv}`);
    console.log(`🖥️  VPS Provisioning: ${process.env.HETZNER_API_TOKEN ? 'Enabled' : 'Disabled'}`);
    console.log(`🔐 SSH Key: ${process.env.SSH_PRIVATE_KEY ? 'Configured' : 'Not configured'}`);
});
//# sourceMappingURL=index.js.map