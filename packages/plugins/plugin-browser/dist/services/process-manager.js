import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@elizaos/core";
import WebSocket from "ws";
export class BrowserProcessManager {
    serverPort;
    process = null;
    isRunning = false;
    binaryPath = null;
    constructor(serverPort = 3456) {
        this.serverPort = serverPort;
        this.binaryPath = this.findBinary();
    }
    getBinaryName() {
        const platformName = platform();
        const arch = process.arch;
        const ext = platformName === "win32" ? ".exe" : "";
        return {
            primary: `browser-server-${platformName}-${arch}${ext}`,
            fallback: `browser-server-${platformName}${ext}`,
        };
    }
    findBinary() {
        const moduleDir = dirname(fileURLToPath(import.meta.url));
        const isDocker = process.env.DOCKER_CONTAINER === "true" || existsSync("/.dockerenv");
        const binaryNames = this.getBinaryName();
        const possiblePaths = [
            ...(isDocker
                ? [
                    "/usr/local/bin/browser-server",
                    "/usr/local/bin/browser-server-linux",
                    "/app/browser-server",
                    `/app/binaries/${binaryNames.primary}`,
                    `/app/binaries/${binaryNames.fallback}`,
                ]
                : []),
            ...(!isDocker ? [join(moduleDir, "../server/dist/index.js")] : []),
            join(moduleDir, "../server/binaries", binaryNames.primary),
            join(moduleDir, "../server/binaries", binaryNames.fallback),
            join(moduleDir, "../../../browser-server", binaryNames.primary),
            join(moduleDir, "../../../browser-server", binaryNames.fallback),
            join(moduleDir, "../../.bin", "browser-server"),
            join(moduleDir, "../server/dist/index.js"),
            ...(isDocker
                ? [
                    "/app/packages/plugin-browser/server/dist/index.js",
                    "/app/browser-server/dist/index.js",
                ]
                : []),
        ];
        for (const p of possiblePaths) {
            if (existsSync(p)) {
                logger.info(`Found browser server at: ${p}`);
                return p;
            }
        }
        const srcPath = join(moduleDir, "../server/src/index.ts");
        if (existsSync(srcPath)) {
            logger.warn("No compiled binary found, will try to run from source with tsx");
            return srcPath;
        }
        logger.error("Could not find browser server binary or source files");
        logger.error(`Searched paths: ${possiblePaths.join(", ")}`);
        return null;
    }
    // ---------------------------------------------------------------------------
    // Port management
    // ---------------------------------------------------------------------------
    /**
     * Probe the port for an existing stagehand-server.
     * Returns `true` if a WebSocket server is already listening and responds.
     */
    probeExistingServer() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                conn.close();
                resolve(false);
            }, 2_000);
            const conn = new WebSocket(`ws://localhost:${this.serverPort}`);
            conn.on("message", (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    // The stagehand-server sends { type: "connected", ... } on connect.
                    if (msg.type === "connected") {
                        clearTimeout(timeout);
                        conn.close();
                        resolve(true);
                        return;
                    }
                }
                catch {
                    // Not valid JSON — not our server.
                }
                clearTimeout(timeout);
                conn.close();
                resolve(false);
            });
            conn.on("open", () => {
                // Connection opened — wait for the "connected" message (handled above).
                // If no message arrives within the timeout, we'll resolve(false).
            });
            conn.on("error", () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }
    /**
     * Kill whatever process is listening on `this.serverPort`.
     * Uses `lsof` on Unix / `netstat` on Windows.  Best-effort.
     */
    async freePort() {
        const port = this.serverPort;
        try {
            if (process.platform === "win32") {
                // netstat → find PID → taskkill
                const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
                const pid = out.trim().split(/\s+/).pop();
                if (pid && /^\d+$/.test(pid)) {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
                }
            }
            else {
                execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: "ignore" });
            }
            // Give the OS a moment to release the port.
            await new Promise((r) => setTimeout(r, 500));
            logger.info(`Freed port ${port}`);
        }
        catch {
            // Nothing on the port, or kill failed — either way it's fine.
        }
    }
    // ---------------------------------------------------------------------------
    // Start / stop
    // ---------------------------------------------------------------------------
    async start() {
        if (this.isRunning) {
            logger.warn("Browser server is already running");
            return;
        }
        // ── 1. Check for an existing stagehand-server on the port ──────────────
        if (await this.probeExistingServer()) {
            logger.info(`Reusing existing browser server on port ${this.serverPort}`);
            this.isRunning = true;
            return;
        }
        // ── 2. Something else is on the port — try to free it ──────────────────
        await this.freePort();
        // ── 3. Spawn a new server ──────────────────────────────────────────────
        if (!this.binaryPath) {
            throw new Error("Browser server binary not found - please ensure server is built");
        }
        const binaryPath = this.binaryPath;
        return new Promise((resolve, reject) => {
            let settled = false;
            const startupTimeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    if (this.process)
                        this.process.kill("SIGTERM");
                    reject(new Error("Browser server startup timed out after 30s"));
                }
            }, 30_000);
            const ok = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(startupTimeout);
                    resolve();
                }
            };
            const fail = (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(startupTimeout);
                    reject(err);
                }
            };
            // Pass through the parent env as-is; only override port + NODE_ENV.
            const env = {
                ...process.env,
                BROWSER_SERVER_PORT: this.serverPort.toString(),
                NODE_ENV: process.env.NODE_ENV ?? "production",
            };
            const isBinary = !binaryPath.endsWith(".js") && !binaryPath.endsWith(".ts");
            const isTypeScript = binaryPath.endsWith(".ts");
            if (isBinary) {
                this.process = spawn(binaryPath, [], { env });
            }
            else if (isTypeScript) {
                try {
                    const tsxPath = require.resolve("tsx/cli", {
                        paths: [process.cwd()],
                    });
                    this.process = spawn("node", [tsxPath, binaryPath], { env });
                }
                catch {
                    logger.warn("tsx not found, falling back to node --import tsx");
                    this.process = spawn("node", ["--import", "tsx", binaryPath], {
                        env,
                    });
                }
            }
            else {
                this.process = spawn("node", [binaryPath], { env });
            }
            this.process.stdout?.on("data", (data) => {
                const message = data.toString().trim();
                logger.debug(`[BrowserServer] ${message}`);
                if (message.includes("listening on port")) {
                    this.isRunning = true;
                    ok();
                }
            });
            this.process.stderr?.on("data", (data) => {
                const text = data.toString().trim();
                if (text.includes("Error") ||
                    text.includes("EADDRINUSE") ||
                    text.includes("FATAL")) {
                    logger.error(`[BrowserServer] ${text}`);
                }
                else {
                    logger.debug(`[BrowserServer stderr] ${text}`);
                }
            });
            this.process.on("error", (error) => {
                logger.error(`Failed to start browser server: ${error.message}`);
                this.isRunning = false;
                fail(error);
            });
            this.process.on("exit", (code) => {
                this.isRunning = false;
                if (code !== 0 && code !== null) {
                    logger.warn(`Browser server exited with code ${code}`);
                    fail(new Error(`Browser server exited with code ${code}`));
                }
                else {
                    logger.info("Browser server stopped");
                }
            });
        });
    }
    async stop() {
        if (!this.process || !this.isRunning) {
            return;
        }
        return new Promise((resolve) => {
            this.process?.on("exit", () => {
                this.isRunning = false;
                resolve();
            });
            this.process?.kill("SIGTERM");
            setTimeout(() => {
                if (this.isRunning && this.process) {
                    this.process.kill("SIGKILL");
                }
            }, 5000);
        });
    }
    isServerRunning() {
        return this.isRunning;
    }
    getServerUrl() {
        return `ws://localhost:${this.serverPort}`;
    }
}
//# sourceMappingURL=process-manager.js.map