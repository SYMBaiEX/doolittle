import { ServiceType } from "@elizaos/core";
import { ActionError, handleBrowserError, ServiceNotAvailableError, SessionError, } from "../utils/errors.js";
export const browserScreenshotAction = {
    name: "BROWSER_SCREENSHOT",
    similes: ["TAKE_SCREENSHOT", "CAPTURE_PAGE", "SCREENSHOT"],
    description: "Take a screenshot of the current page",
    validate: async (runtime, message, state, options) => {
        const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
        const __avText = __avTextRaw.toLowerCase();
        const __avKeywords = ["browser", "screenshot"];
        const __avKeywordOk = __avKeywords.length > 0 &&
            __avKeywords.some((word) => word.length > 0 && __avText.includes(word));
        const __avRegex = /\b(?:browser|screenshot)\b/i;
        const __avRegexOk = __avRegex.test(__avText);
        const __avSource = String(message?.content?.source ?? message?.source ?? "");
        const __avExpectedSource = "";
        const __avSourceOk = __avExpectedSource
            ? __avSource === __avExpectedSource
            : Boolean(__avSource ||
                state ||
                runtime?.agentId ||
                runtime?.getService ||
                runtime?.getSetting);
        const __avOptions = options && typeof options === "object" ? options : {};
        const __avInputOk = __avText.trim().length > 0 ||
            Object.keys(__avOptions).length > 0 ||
            Boolean(message?.content && typeof message.content === "object");
        if (!(__avKeywordOk && __avRegexOk && __avSourceOk && __avInputOk)) {
            return false;
        }
        const __avLegacyValidate = async (runtime, message, state, options) => {
            const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
            const __avText = __avTextRaw.toLowerCase();
            const __avKeywords = ["browser", "screenshot"];
            const __avKeywordOk = __avKeywords.length > 0 &&
                __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
            const __avRegex = /\b(?:browser|screenshot)\b/i;
            const __avRegexOk = __avRegex.test(__avText);
            const __avSource = String(message?.content?.source ?? message?.source ?? "");
            const __avExpectedSource = "";
            const __avSourceOk = __avExpectedSource
                ? __avSource === __avExpectedSource
                : Boolean(__avSource || state || runtime?.agentId || runtime?.getService);
            const __avOptions = options && typeof options === "object" ? options : {};
            const __avInputOk = __avText.trim().length > 0 ||
                Object.keys(__avOptions).length > 0 ||
                Boolean(message?.content && typeof message.content === "object");
            if (!(__avKeywordOk && __avRegexOk && __avSourceOk && __avInputOk)) {
                return false;
            }
            const __avLegacyValidate = async (runtime, message, _state) => {
                const browserEnabled = runtime.getSetting("ENABLE_BROWSER") === "true" ||
                    runtime.getSetting("BROWSER_ENABLED") === "true";
                if (!browserEnabled) {
                    return false;
                }
                const service = runtime.getService(ServiceType.BROWSER);
                if (!service) {
                    return false;
                }
                const text = message.content?.text?.toLowerCase() ?? "";
                return (text.includes("screenshot") ||
                    text.includes("capture") ||
                    text.includes("snap"));
            };
            try {
                return Boolean(await __avLegacyValidate(runtime, message, state, options));
            }
            catch {
                return false;
            }
        };
        try {
            return Boolean(await __avLegacyValidate(runtime, message, state, options));
        }
        catch {
            return false;
        }
    },
    handler: async (runtime, message, _state, _options, callback, _responses) => {
        const service = runtime.getService(ServiceType.BROWSER);
        if (!service) {
            const error = new ServiceNotAvailableError();
            handleBrowserError(error, callback, "take screenshot");
            return {
                text: "Browser service is not available",
                success: false,
                data: {
                    actionName: "BROWSER_SCREENSHOT",
                    error: "service_not_available",
                },
                values: {
                    success: false,
                    errorType: "service_not_available",
                },
            };
        }
        const session = await service.getOrCreateSession();
        if (!session) {
            const error = new SessionError("No active browser session");
            handleBrowserError(error, callback, "take screenshot");
            return {
                text: "No active browser session",
                success: false,
                data: {
                    actionName: "BROWSER_SCREENSHOT",
                    error: "no_session",
                },
                values: {
                    success: false,
                    errorType: "no_session",
                },
            };
        }
        const result = await service.getClient().screenshot(session.id);
        if (!result.success) {
            throw new ActionError("screenshot", "page", new Error(result.error ?? "Screenshot failed"));
        }
        const screenshotData = result.data;
        const url = screenshotData?.url ?? "unknown";
        const title = screenshotData?.title ?? "Untitled";
        const responseContent = {
            text: `I've taken a screenshot of the page "${title}" at ${url}`,
            actions: ["BROWSER_SCREENSHOT"],
            source: message.content?.source ?? "action",
            data: {
                screenshot: screenshotData?.screenshot ?? "",
                mimeType: screenshotData?.mimeType ?? "image/png",
                url,
                title,
            },
        };
        await callback?.(responseContent);
        return {
            text: responseContent.text ?? "",
            success: true,
            data: {
                actionName: "BROWSER_SCREENSHOT",
                url,
                title,
                sessionId: session.id,
                screenshot: screenshotData?.screenshot ?? "",
            },
            values: {
                success: true,
                url,
                title,
            },
        };
    },
    examples: [
        [
            {
                name: "{{user}}",
                content: { text: "Take a screenshot of the page" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I've taken a screenshot of the page.",
                    actions: ["BROWSER_SCREENSHOT"],
                },
            },
        ],
    ],
};
//# sourceMappingURL=screenshot.js.map