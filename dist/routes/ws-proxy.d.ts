import { Request } from 'express';
import WebSocket from 'ws';
declare const router: import("express-serve-static-core").Router;
/**
 * HTTP endpoint to handle WebSocket upgrade
 * This is called by the main server when a WS connection comes in
 */
export declare function handleWsProxy(ws: WebSocket, req: Request): Promise<void>;
export default router;
//# sourceMappingURL=ws-proxy.d.ts.map