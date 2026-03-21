import type { CliContext } from "@elizaos/plugin-cli";
/**
 * Register Browser CLI commands
 *
 * Commands:
 * - browser status: Show browser service status
 * - browser start: Start a browser session
 * - browser stop: Stop browser service
 * - browser navigate: Navigate to a URL
 * - browser click: Click an element
 * - browser type: Type text into a field
 * - browser select: Select an option from dropdown
 * - browser extract: Extract information from the page
 * - browser screenshot: Take a screenshot
 * - browser back/forward/refresh: Navigation controls
 *
 * @param ctx - CLI context with program and optional runtime
 */
export declare function registerBrowserCli(ctx: CliContext): void;
//# sourceMappingURL=register.d.ts.map