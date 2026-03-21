import { logger, Service, ServiceType, } from "@elizaos/core";
import { BrowserProcessManager } from "./process-manager.js";
import { BrowserWebSocketClient } from "./websocket-client.js";
export class Session {
    id;
    createdAt;
    constructor(id, createdAt = new Date()) {
        this.id = id;
        this.createdAt = createdAt;
    }
}
export class BrowserService extends Service {
    static serviceType = ServiceType.BROWSER;
    capabilityDescription = "Browser automation service";
    sessions = new Map();
    currentSessionId = null;
    processManager;
    client;
    isInitialized = false;
    /** Whether this service is operating in sandbox remote mode. */
    sandboxMode = false;
    constructor(runtime) {
        super(runtime);
        if (!runtime) {
            throw new Error("BrowserService requires a runtime");
        }
        this.runtime = runtime;
        // Detect sandbox mode from runtime
        this.sandboxMode = Boolean(runtime.sandboxMode);
        const portSetting = runtime.getSetting("BROWSER_SERVER_PORT");
        const port = typeof portSetting === "string" ? parseInt(portSetting, 10) : 3456;
        // In sandbox mode, connect to remote endpoint instead of local process
        if (this.sandboxMode) {
            const remoteWsUrl = runtime.getSetting("SANDBOX_BROWSER_WS_URL") ??
                `ws://localhost:${port}`;
            this.processManager = new BrowserProcessManager(port);
            this.client = new BrowserWebSocketClient(remoteWsUrl);
            logger.info(`Browser service: sandbox mode, remote endpoint: ${remoteWsUrl}`);
        }
        else {
            this.processManager = new BrowserProcessManager(port);
            this.client = new BrowserWebSocketClient(`ws://localhost:${port}`);
        }
    }
    static async start(runtime) {
        logger.info("Starting browser automation service");
        try {
            const service = new BrowserService(runtime);
            // In sandbox mode, do NOT start a local browser server process
            if (service.sandboxMode) {
                logger.info("Browser service: sandbox mode — skipping local server spawn");
                logger.info("Connecting to remote browser server...");
                try {
                    await service.initialize();
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.warn(`Remote browser not reachable: ${errorMessage}`);
                    logger.warn("Browser plugin will be in degraded state");
                }
                return service;
            }
            logger.info("Starting browser server process...");
            let serverStarted = false;
            try {
                await service.processManager.start();
                serverStarted = true;
                logger.info("Browser server started successfully");
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to start browser server: ${errorMessage}`);
                logger.warn("Browser plugin will be available but automation will not work");
                logger.warn("To fix this, run: cd packages/plugin-browser && npm run build");
            }
            // Only attempt WebSocket initialization if the server actually started.
            // Otherwise we'd retry processManager.start() inside initialize() and
            // throw again, which crashes service registration.
            if (serverStarted) {
                logger.info("Initializing WebSocket client...");
                await service.initialize();
            }
            return service;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to start browser service: ${errorMessage}`);
            throw error;
        }
    }
    static async stopRuntime(runtime) {
        logger.info("Stopping browser automation service");
        const service = runtime.getService(BrowserService.serviceType);
        if (!service) {
            throw new Error("Browser service not found");
        }
        await service.stop();
    }
    async stop() {
        logger.info("Cleaning up browser sessions");
        for (const sessionId of this.sessions.keys()) {
            await this.destroySession(sessionId);
        }
        this.client.disconnect();
        await this.processManager.stop();
        this.isInitialized = false;
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            if (!this.processManager.isServerRunning()) {
                logger.warn("Browser server is not running, attempting to start...");
                try {
                    await this.processManager.start();
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
                catch (startError) {
                    const msg = startError instanceof Error
                        ? startError.message
                        : String(startError);
                    logger.error(`Failed to initialize browser service: ${msg}`);
                    // Don't throw — allow the service to exist in a degraded state
                    // so other plugins can still function.
                    return;
                }
            }
            logger.info("Connecting to browser server...");
            await this.client.connect();
            await this.waitForReady();
            this.isInitialized = true;
            logger.info("Browser service initialized successfully");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to initialize browser service: ${errorMessage}`);
            throw error;
        }
    }
    async createSession(sessionId) {
        if (!this.isInitialized) {
            throw new Error("Browser service not initialized");
        }
        const response = await this.client.sendMessage("createSession", {});
        const serverSessionId = response.data
            ?.sessionId;
        if (!serverSessionId) {
            throw new Error("Failed to create session on server");
        }
        const session = new Session(serverSessionId);
        this.sessions.set(sessionId, session);
        this.currentSessionId = sessionId;
        return session;
    }
    async getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    async getCurrentSession() {
        if (!this.currentSessionId) {
            return undefined;
        }
        return this.sessions.get(this.currentSessionId);
    }
    async getOrCreateSession() {
        const currentSession = await this.getCurrentSession();
        if (currentSession) {
            return currentSession;
        }
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        return this.createSession(sessionId);
    }
    async destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await this.client.sendMessage("destroySession", {
                sessionId: session.id,
            });
            this.sessions.delete(sessionId);
            if (this.currentSessionId === sessionId) {
                this.currentSessionId = null;
            }
        }
    }
    getClient() {
        if (!this.isInitialized) {
            throw new Error("Browser service not initialized");
        }
        return this.client;
    }
    async waitForReady(maxAttempts = 60, delayMs = 3000) {
        logger.info("Waiting for browser server to be ready...");
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const isHealthy = await this.client.health();
                if (isHealthy) {
                    logger.info("Browser server is ready");
                    return;
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.debug(`Health check attempt ${attempt}/${maxAttempts} failed: ${errorMessage}`);
            }
            if (attempt < maxAttempts) {
                logger.info(`Server not ready yet, retrying in ${delayMs / 1000}s... (attempt ${attempt}/${maxAttempts})`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
        throw new Error(`Browser server did not become ready after ${maxAttempts} attempts`);
    }
}
//# sourceMappingURL=browser-service.js.map