import { logger } from "@elizaos/core";
import { z } from "zod";
import { browserClickAction } from "./actions/click.js";
import { browserExtractAction } from "./actions/extract.js";
import { browserNavigateAction } from "./actions/navigate.js";
import { browserScreenshotAction } from "./actions/screenshot.js";
import { browserSelectAction } from "./actions/select.js";
import { browserTypeAction } from "./actions/type.js";
import { browserStateProvider } from "./providers/browser-state.js";
import { BrowserService, Session } from "./services/browser-service.js";
import { BrowserProcessManager } from "./services/process-manager.js";
import { BrowserWebSocketClient } from "./services/websocket-client.js";
export * from "./types.js";
export * from "./utils/index.js";
export { BrowserService, Session, BrowserWebSocketClient, BrowserProcessManager, };
export { browserNavigateAction, browserClickAction, browserTypeAction, browserSelectAction, browserExtractAction, browserScreenshotAction, };
const configSchema = z.object({
    BROWSERBASE_API_KEY: z.string().optional(),
    BROWSERBASE_PROJECT_ID: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().optional(),
    OLLAMA_MODEL: z.string().optional(),
    BROWSER_HEADLESS: z
        .string()
        .transform((val) => val === "true")
        .optional()
        .default(true),
    CAPSOLVER_API_KEY: z.string().optional(),
    BROWSER_SERVER_PORT: z.string().optional().default("3456"),
});
// CLI self-registration - importing this module triggers CLI command registration.
// Wrapped in a dynamic import so the plugin still loads when @elizaos/plugin-cli
// is unavailable (e.g. when consumed outside the monorepo).
import("./cli/index.js").catch(() => {
    // plugin-cli not available — skip CLI registration silently
});
export const browserPlugin = {
    name: "plugin-browser",
    description: "Browser automation plugin",
    config: {
        BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY ?? null,
        BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID ?? null,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? null,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null,
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? null,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? null,
        BROWSER_HEADLESS: process.env.BROWSER_HEADLESS ?? "true",
        CAPSOLVER_API_KEY: process.env.CAPSOLVER_API_KEY ?? null,
        BROWSER_SERVER_PORT: process.env.BROWSER_SERVER_PORT ?? "3456",
    },
    async init(config, _runtime) {
        logger.info("Initializing browser automation plugin");
        try {
            const validatedConfig = await configSchema.parseAsync(config);
            for (const [key, value] of Object.entries(validatedConfig)) {
                if (value !== undefined && value !== null) {
                    process.env[key] = String(value);
                }
            }
            // Auto-enable browser actions when the plugin is loaded.
            // The plugin being present in the runtime means the user toggled it on.
            process.env.ENABLE_BROWSER = "true";
            process.env.BROWSER_ENABLED = "true";
            logger.info("Browser plugin initialized successfully");
        }
        catch (error) {
            if (error && typeof error === "object" && "issues" in error) {
                const zodError = error;
                if (Array.isArray(zodError.issues)) {
                    const errorMessages = zodError.issues
                        .map((e) => e.message)
                        .join(", ");
                    throw new Error(`Invalid plugin configuration: ${errorMessages}`);
                }
            }
            throw error;
        }
    },
    services: [BrowserService],
    actions: [
        browserNavigateAction,
        browserClickAction,
        browserTypeAction,
        browserSelectAction,
        browserExtractAction,
        browserScreenshotAction,
    ],
    providers: [browserStateProvider],
};
export default browserPlugin;
//# sourceMappingURL=index.js.map