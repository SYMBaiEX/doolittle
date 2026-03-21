import { logger } from "@elizaos/core";
import WebSocket from "ws";
export class BrowserWebSocketClient {
    serverUrl;
    ws = null;
    messageHandlers = new Map();
    connected = false;
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectDelay = 1000;
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
    }
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);
                this.ws.on("open", () => {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    logger.info(`[Browser] Connected to server at ${this.serverUrl}`);
                    resolve();
                });
                this.ws.on("message", (data) => {
                    try {
                        const messageText = this.rawDataToString(data);
                        const message = JSON.parse(messageText);
                        if (message.requestId &&
                            this.messageHandlers.has(message.requestId)) {
                            const handler = this.messageHandlers.get(message.requestId);
                            this.messageHandlers.delete(message.requestId);
                            handler?.(message);
                        }
                        if (message.type === "connected") {
                            logger.info(`[Browser] Server connected: ${JSON.stringify(message)}`);
                        }
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        logger.error(`[Browser] Error parsing message: ${errorMessage}`);
                    }
                });
                this.ws.on("error", (error) => {
                    logger.error(`[Browser] WebSocket error: ${error.message}`);
                    if (!this.connected) {
                        reject(error);
                    }
                });
                this.ws.on("close", () => {
                    this.connected = false;
                    logger.info("[Browser] Disconnected from server");
                    if (this.ws && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptReconnect();
                    }
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    rawDataToString(data) {
        if (typeof data === "string") {
            return data;
        }
        if (Buffer.isBuffer(data)) {
            return data.toString("utf8");
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data).toString("utf8");
        }
        if (Array.isArray(data)) {
            return Buffer.concat(data).toString("utf8");
        }
        return String(data);
    }
    async attemptReconnect() {
        this.reconnectAttempts++;
        logger.info(`[Browser] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
        await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));
        try {
            await this.connect();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[Browser] Reconnection failed: ${errorMessage}`);
        }
    }
    async sendMessage(type, data) {
        if (!this.ws || !this.connected) {
            throw new Error("Not connected to browser server");
        }
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const message = {
            type,
            requestId,
            ...data,
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.messageHandlers.delete(requestId);
                reject(new Error(`Request timeout for ${type}`));
            }, 30000);
            this.messageHandlers.set(requestId, (response) => {
                clearTimeout(timeout);
                if (response.type === "error") {
                    reject(new Error(response.error ?? "Unknown error"));
                }
                else {
                    resolve(response);
                }
            });
            this.ws?.send(JSON.stringify(message));
            logger.debug(`[Browser] Sent message: ${type} (${requestId})`);
        });
    }
    disconnect() {
        this.reconnectAttempts = this.maxReconnectAttempts;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        logger.info("[Browser] Client disconnected");
    }
    isConnected() {
        return this.connected;
    }
    async navigate(sessionId, url) {
        const response = await this.sendMessage("navigate", {
            sessionId,
            data: { url },
        });
        const data = response.data;
        return {
            success: Boolean(data?.success),
            url: String(data?.url ?? url),
            title: String(data?.title ?? ""),
        };
    }
    async getState(sessionId) {
        const response = await this.sendMessage("getState", { sessionId });
        const data = response.data;
        return {
            url: String(data?.url ?? ""),
            title: String(data?.title ?? ""),
            sessionId,
            createdAt: new Date(),
        };
    }
    async goBack(sessionId) {
        const response = await this.sendMessage("goBack", { sessionId });
        const data = response.data;
        return {
            success: Boolean(data?.success ?? true),
            url: String(data?.url ?? ""),
            title: String(data?.title ?? ""),
        };
    }
    async goForward(sessionId) {
        const response = await this.sendMessage("goForward", { sessionId });
        const data = response.data;
        return {
            success: Boolean(data?.success ?? true),
            url: String(data?.url ?? ""),
            title: String(data?.title ?? ""),
        };
    }
    async refresh(sessionId) {
        const response = await this.sendMessage("refresh", { sessionId });
        const data = response.data;
        return {
            success: Boolean(data?.success ?? true),
            url: String(data?.url ?? ""),
            title: String(data?.title ?? ""),
        };
    }
    async click(sessionId, description) {
        return await this.sendMessage("click", {
            sessionId,
            data: { description },
        });
    }
    async type(sessionId, text, field) {
        return await this.sendMessage("type", {
            sessionId,
            data: { text, field },
        });
    }
    async select(sessionId, option, dropdown) {
        return await this.sendMessage("select", {
            sessionId,
            data: { option, dropdown },
        });
    }
    async extract(sessionId, instruction) {
        return await this.sendMessage("extract", {
            sessionId,
            data: { instruction },
        });
    }
    async screenshot(sessionId) {
        return await this.sendMessage("screenshot", { sessionId });
    }
    async solveCaptcha(sessionId) {
        return await this.sendMessage("solveCaptcha", { sessionId });
    }
    async health() {
        try {
            const response = await this.sendMessage("health", {});
            return (response.type === "health" &&
                response.data?.status === "ok");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[Browser] Health check failed: ${errorMessage}`);
            return false;
        }
    }
}
//# sourceMappingURL=websocket-client.js.map