import { ServiceType } from "@elizaos/core";
import { ActionError, handleBrowserError, ServiceNotAvailableError, SessionError, } from "../utils/errors.js";
export const browserTypeAction = {
    name: "BROWSER_TYPE",
    similes: ["TYPE_TEXT", "INPUT", "ENTER_TEXT"],
    description: "Type text into an input field on the webpage",
    validate: async (runtime, message, state, options) => {
        const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
        const __avText = __avTextRaw.toLowerCase();
        const __avKeywords = ["browser", "type"];
        const __avKeywordOk = __avKeywords.length > 0 &&
            __avKeywords.some((word) => word.length > 0 && __avText.includes(word));
        const __avRegex = /\b(?:browser|type)\b/i;
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
            const __avKeywords = ["browser", "type"];
            const __avKeywordOk = __avKeywords.length > 0 &&
                __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
            const __avRegex = /\b(?:browser|type)\b/i;
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
                return (text.includes("type") ||
                    text.includes("input") ||
                    text.includes("enter"));
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
            handleBrowserError(error, callback, "type text");
            return {
                text: "Browser service is not available",
                success: false,
                data: {
                    actionName: "BROWSER_TYPE",
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
            handleBrowserError(error, callback, "type text");
            return {
                text: "No active browser session",
                success: false,
                data: {
                    actionName: "BROWSER_TYPE",
                    error: "no_session",
                },
                values: {
                    success: false,
                    errorType: "no_session",
                },
            };
        }
        const text = message.content?.text ?? "";
        const match = text.match(/["']([^"']+)["']/);
        const textToType = match ? match[1] : "";
        const fieldMatch = text.match(/(?:in|into) (?:the )?(.+)$/i);
        const field = fieldMatch ? fieldMatch[1] : "input field";
        if (!textToType) {
            throw new ActionError("type", field, new Error("No text specified to type"));
        }
        const result = await service
            .getClient()
            .type(session.id, textToType, field);
        if (!result.success) {
            throw new ActionError("type", field, new Error(result.error ?? "Type failed"));
        }
        const responseContent = {
            text: `I've typed "${textToType}" in the ${field}`,
            actions: ["BROWSER_TYPE"],
            source: message.content?.source ?? "action",
        };
        await callback?.(responseContent);
        return {
            text: responseContent.text ?? "",
            success: true,
            data: {
                actionName: "BROWSER_TYPE",
                textTyped: textToType,
                field,
                sessionId: session.id,
            },
            values: {
                success: true,
                textTyped: textToType,
                field,
            },
        };
    },
    examples: [
        [
            {
                name: "{{user}}",
                content: { text: 'Type "hello world" in the search box' },
            },
            {
                name: "{{agent}}",
                content: {
                    text: 'I\'ve typed "hello world" in the search box.',
                    actions: ["BROWSER_TYPE"],
                },
            },
        ],
    ],
};
//# sourceMappingURL=type.js.map