export declare class BrowserProcessManager {
    private serverPort;
    private process;
    private isRunning;
    private binaryPath;
    constructor(serverPort?: number);
    private getBinaryName;
    private findBinary;
    /**
     * Probe the port for an existing stagehand-server.
     * Returns `true` if a WebSocket server is already listening and responds.
     */
    private probeExistingServer;
    /**
     * Kill whatever process is listening on `this.serverPort`.
     * Uses `lsof` on Unix / `netstat` on Windows.  Best-effort.
     */
    private freePort;
    start(): Promise<void>;
    stop(): Promise<void>;
    isServerRunning(): boolean;
    getServerUrl(): string;
}
//# sourceMappingURL=process-manager.d.ts.map