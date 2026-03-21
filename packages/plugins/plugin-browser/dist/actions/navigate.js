import { ServiceType } from "@elizaos/core";
import { handleBrowserError, NoUrlFoundError, SecurityError, ServiceNotAvailableError, } from "../utils/errors.js";
import { DEFAULT_RETRY_CONFIGS, retryWithBackoff } from "../utils/retry.js";
import { defaultUrlValidator, validateSecureAction, } from "../utils/security.js";
import { extractUrl } from "../utils/url.js";
export const browserNavigateAction = {
    name: "BROWSER_NAVIGATE",
    similes: ["GO_TO_URL", "OPEN_WEBSITE", "VISIT_PAGE", "NAVIGATE_TO"],
    description: "Navigate the browser to a specified URL",
    validate: async (runtime, message, state, options) => {
        const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
        const __avText = __avTextRaw.toLowerCase();
        const __avKeywords = ["browser", "navigate"];
        const __avKeywordOk = __avKeywords.length > 0 &&
            __avKeywords.some((word) => word.length > 0 && __avText.includes(word));
        const __avRegex = /\b(?:browser|navigate)\b/i;
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
            const __avKeywords = ["browser", "navigate"];
            const __avKeywordOk = __avKeywords.length > 0 &&
                __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
            const __avRegex = /\b(?:browser|navigate)\b/i;
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
                const url = extractUrl(message.content.text ?? "");
                return url !== null;
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
            handleBrowserError(error, callback, "navigate to the requested page");
            return {
                text: "Browser service is not available",
                success: false,
                data: {
                    actionName: "BROWSER_NAVIGATE",
                    error: "service_not_available",
                },
                values: {
                    success: false,
                    errorType: "service_not_available",
                },
            };
        }
        const url = extractUrl(message.content.text ?? "");
        if (!url) {
            const error = new NoUrlFoundError();
            handleBrowserError(error, callback, "navigate to a page");
            return {
                text: "I couldn't find a URL in your request. Please provide a valid URL to navigate to.",
                success: false,
                data: {
                    actionName: "BROWSER_NAVIGATE",
                    error: "no_url_found",
                },
                values: {
                    success: false,
                    errorType: "no_url_found",
                },
            };
        }
        try {
            validateSecureAction(url, defaultUrlValidator);
        }
        catch (error) {
            if (error instanceof SecurityError) {
                handleBrowserError(error, callback);
                return {
                    text: "Security error: Cannot navigate to restricted URL",
                    success: false,
                    data: {
                        actionName: "BROWSER_NAVIGATE",
                        error: "security_error",
                        url,
                    },
                    values: {
                        success: false,
                        errorType: "security_error",
                    },
                };
            }
            throw error;
        }
        let session = await service.getCurrentSession();
        if (!session) {
            const sessionId = `session-${Date.now()}`;
            session = await service.createSession(sessionId);
        }
        const result = await retryWithBackoff(async () => {
            const client = service.getClient();
            return await client.navigate(session?.id, url);
        }, DEFAULT_RETRY_CONFIGS.navigation, `navigate to ${url}`);
        const responseContent = {
            text: `I've navigated to ${url}. The page title is: "${result.title}"`,
            actions: ["BROWSER_NAVIGATE"],
            source: message.content.source,
        };
        await callback?.(responseContent);
        return {
            text: responseContent.text ?? "",
            success: true,
            data: {
                actionName: "BROWSER_NAVIGATE",
                url: result.url,
                title: result.title,
                sessionId: session.id,
            },
            values: {
                success: true,
                url: result.url,
                pageTitle: result.title,
            },
        };
    },
    examples: [
        [
            {
                name: "{{user}}",
                content: {
                    text: "Go to google.com",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: 'I\'ve navigated to https://google.com. The page title is: "Google"',
                    actions: ["BROWSER_NAVIGATE"],
                },
            },
        ],
    ],
};
//# sourceMappingURL=navigate.js.map