import { ServiceType } from "@elizaos/core";
import { ActionError, handleBrowserError, ServiceNotAvailableError, SessionError, } from "../utils/errors.js";
export const browserExtractAction = {
    name: "BROWSER_EXTRACT",
    similes: ["EXTRACT_DATA", "GET_TEXT", "SCRAPE"],
    description: "Extract data from the webpage",
    validate: async (runtime, message, state, options) => {
        const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
        const __avText = __avTextRaw.toLowerCase();
        const __avKeywords = ["browser", "extract"];
        const __avKeywordOk = __avKeywords.length > 0 &&
            __avKeywords.some((word) => word.length > 0 && __avText.includes(word));
        const __avRegex = /\b(?:browser|extract)\b/i;
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
            const __avKeywords = ["browser", "extract"];
            const __avKeywordOk = __avKeywords.length > 0 &&
                __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
            const __avRegex = /\b(?:browser|extract)\b/i;
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
                return (text.includes("extract") ||
                    text.includes("get") ||
                    text.includes("scrape") ||
                    text.includes("find") ||
                    text.includes("read"));
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
            handleBrowserError(error, callback, "extract data");
            return {
                text: "Browser service is not available",
                success: false,
                data: {
                    actionName: "BROWSER_EXTRACT",
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
            handleBrowserError(error, callback, "extract data");
            return {
                text: "No active browser session",
                success: false,
                data: {
                    actionName: "BROWSER_EXTRACT",
                    error: "no_session",
                },
                values: {
                    success: false,
                    errorType: "no_session",
                },
            };
        }
        const text = message.content?.text ?? "";
        const match = text.match(/(?:extract|get|find|scrape|read) (?:the )?(.+?)(?:\s+from|\s*$)/i);
        const instruction = match ? match[1] : text;
        const result = await service.getClient().extract(session.id, instruction);
        if (!result.success) {
            throw new ActionError("extract", "page", new Error(result.error ?? "Extraction failed"));
        }
        const extractedData = result.data;
        const foundText = extractedData?.data ?? "No data found";
        const found = extractedData?.found ?? false;
        const responseContent = {
            text: found
                ? `I found the ${instruction}: "${foundText}"`
                : `I couldn't find the requested ${instruction} on the page.`,
            actions: ["BROWSER_EXTRACT"],
            source: message.content?.source ?? "action",
        };
        await callback?.(responseContent);
        return {
            text: responseContent.text ?? "",
            success: true,
            data: {
                actionName: "BROWSER_EXTRACT",
                instruction,
                found,
                extractedData: foundText,
                sessionId: session.id,
            },
            values: {
                success: true,
                found,
                data: foundText,
            },
        };
    },
    examples: [
        [
            {
                name: "{{user}}",
                content: { text: "Extract the main heading from the page" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: 'I extracted the main heading: "Welcome to Our Website"',
                    actions: ["BROWSER_EXTRACT"],
                },
            },
        ],
    ],
};
//# sourceMappingURL=extract.js.map