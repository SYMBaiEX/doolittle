import type { Plugin } from "@elizaos/core";
import { browserClickAction } from "./actions/click.js";
import { browserExtractAction } from "./actions/extract.js";
import { browserNavigateAction } from "./actions/navigate.js";
import { browserScreenshotAction } from "./actions/screenshot.js";
import { browserSelectAction } from "./actions/select.js";
import { browserTypeAction } from "./actions/type.js";
import { BrowserService, Session } from "./services/browser-service.js";
import { BrowserProcessManager } from "./services/process-manager.js";
import { BrowserWebSocketClient } from "./services/websocket-client.js";
export * from "./types.js";
export * from "./utils/index.js";
export { BrowserService, Session, BrowserWebSocketClient, BrowserProcessManager, };
export { browserNavigateAction, browserClickAction, browserTypeAction, browserSelectAction, browserExtractAction, browserScreenshotAction, };
export declare const browserPlugin: Plugin;
export default browserPlugin;
//# sourceMappingURL=index.d.ts.map