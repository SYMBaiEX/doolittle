import { type IAgentRuntime, Service } from "@elizaos/core";
import type { BrowserSession } from "../types.js";
import { BrowserWebSocketClient } from "./websocket-client.js";
export declare class Session implements BrowserSession {
    id: string;
    createdAt: Date;
    constructor(id: string, createdAt?: Date);
}
export declare class BrowserService extends Service {
    static serviceType: "browser";
    capabilityDescription: string;
    private sessions;
    private currentSessionId;
    private processManager;
    private client;
    private isInitialized;
    /** Whether this service is operating in sandbox remote mode. */
    private sandboxMode;
    constructor(runtime?: IAgentRuntime);
    static start(runtime: IAgentRuntime): Promise<BrowserService>;
    static stopRuntime(runtime: IAgentRuntime): Promise<void>;
    stop(): Promise<void>;
    initialize(): Promise<void>;
    createSession(sessionId: string): Promise<Session>;
    getSession(sessionId: string): Promise<Session | undefined>;
    getCurrentSession(): Promise<Session | undefined>;
    getOrCreateSession(): Promise<Session>;
    destroySession(sessionId: string): Promise<void>;
    getClient(): BrowserWebSocketClient;
    private waitForReady;
}
//# sourceMappingURL=browser-service.d.ts.map