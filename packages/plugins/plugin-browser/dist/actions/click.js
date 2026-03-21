import { ServiceType } from "@elizaos/core";
import { ActionError, handleBrowserError, ServiceNotAvailableError, SessionError, } from "../utils/errors.js";
export const browserClickAction = {
    name: "BROWSER_CLICK",
    similes: ["CLICK_ELEMENT", "TAP", "PRESS_BUTTON"],
    description: "Click on an element on the webpage",
    validate: async (runtime, message, state, options) => {
        const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
        const __avText = __avTextRaw.toLowerCase();
        const __avKeywords = ["browser", "click"];
        const __avKeywordOk = __avKeywords.length > 0 &&
            __avKeywords.some((word) => word.length > 0 && __avText.includes(word));
        const __avRegex = /\b(?:browser|click)\b/i;
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
            const __avKeywords = ["browser", "click"];
            const __avKeywordOk = __avKeywords.length > 0 &&
                __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
            const __avRegex = /\b(?:browser|click)\b/i;
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
                return (text.includes("click") ||
                    text.includes("tap") ||
                    text.includes("press"));
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
            handleBrowserError(error, callback, "click on element");
            return {
                text: "Browser service is not available",
                success: false,
                data: {
                    actionName: "BROWSER_CLICK",
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
            handleBrowserError(error, callback, "click on element");
            return {
                text: "No active browser session",
                success: false,
                data: {
                    actionName: "BROWSER_CLICK",
                    error: "no_session",
                },
                values: {
                    success: false,
                    errorType: "no_session",
                },
            };
        }
        const text = message.content?.text ?? "";
        const match = text.match(/click (?:on |the )?(.+)$/i);
        const description = match ? match[1] : "element";
        const result = await service.getClient().click(session.id, description);
        if (!result.success) {
            throw new ActionError("click", description, new Error(result.error ?? "Click failed"));
        }
        const responseContent = {
            text: `I've successfully clicked on "${description}"`,
            actions: ["BROWSER_CLICK"],
            source: message.content?.source ?? "action",
        };
        await callback?.(responseContent);
        return {
            text: responseContent.text ?? "",
            success: true,
            data: {
                actionName: "BROWSER_CLICK",
                element: description,
                sessionId: session.id,
            },
            values: {
                success: true,
                element: description,
            },
        };
    },
    examples: [
        [
            {
                name: "{{user}}",
                content: { text: "Click on the search button" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I've clicked on the search button.",
                    actions: ["BROWSER_CLICK"],
                },
            },
        ],
    ],
};
//# sourceMappingURL=click.js.map