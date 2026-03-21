import type { NavigationResult, WebSocketResponse } from "../types.js";
export declare class BrowserWebSocketClient {
    private serverUrl;
    private ws;
    private messageHandlers;
    private connected;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor(serverUrl: string);
    connect(): Promise<void>;
    private rawDataToString;
    private attemptReconnect;
    sendMessage(type: string, data: Record<string, unknown>): Promise<WebSocketResponse>;
    disconnect(): void;
    isConnected(): boolean;
    navigate(sessionId: string, url: string): Promise<NavigationResult>;
    getState(sessionId: string): Promise<{
        url: string;
        title: string;
        sessionId: string;
        createdAt: Date;
    }>;
    goBack(sessionId: string): Promise<NavigationResult>;
    goForward(sessionId: string): Promise<NavigationResult>;
    refresh(sessionId: string): Promise<NavigationResult>;
    click(sessionId: string, description: string): Promise<WebSocketResponse>;
    type(sessionId: string, text: string, field: string): Promise<WebSocketResponse>;
    select(sessionId: string, option: string, dropdown: string): Promise<WebSocketResponse>;
    extract(sessionId: string, instruction: string): Promise<WebSocketResponse>;
    screenshot(sessionId: string): Promise<WebSocketResponse>;
    solveCaptcha(sessionId: string): Promise<WebSocketResponse>;
    health(): Promise<boolean>;
}
//# sourceMappingURL=websocket-client.d.ts.map