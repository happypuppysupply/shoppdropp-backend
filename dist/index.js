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
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const stores_1 = __importDefault(require("./routes/stores"));
const ai_1 = __importDefault(require("./routes/ai"));
const user_1 = __importDefault(require("./routes/user"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const workers_1 = __importDefault(require("./routes/workers"));
// Services
const workerManager_1 = require("./services/workerManager");
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
app.use('/api/user', user_1.default);
app.use('/api/stripe', stripe_1.default);
app.use('/api/workers', workers_1.default);
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
});
//# sourceMappingURL=index.js.map