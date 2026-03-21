import { logger, ServiceType } from "@elizaos/core";
import { validateActionKeywords, validateActionRegex, } from "../providerRelevance.js";
export const browserStateProvider = {
    name: "BROWSER_STATE",
    description: "Provides current browser state information",
    dynamic: true,
    get: async (runtime, _message, _state) => {
        const __providerKeywords = [
            "browser",
            "state",
            "browserstateprovider",
            "plugin",
            "status",
            "context",
            "info",
            "details",
            "chat",
            "conversation",
            "agent",
            "room",
            "channel",
            "user",
        ];
        const __providerRegex = new RegExp(`\\b(${__providerKeywords.join("|")})\\b`, "i");
        const __recentMessages = _state?.recentMessagesData || [];
        const __isRelevant = validateActionKeywords(_message, __recentMessages, __providerKeywords) ||
            validateActionRegex(_message, __recentMessages, __providerRegex);
        if (!__isRelevant) {
            return { text: "" };
        }
        const service = runtime.getService(ServiceType.BROWSER);
        const session = await service?.getCurrentSession();
        if (!session || !service) {
            return {
                text: "No active browser session",
                values: {
                    hasSession: false,
                },
                data: {},
            };
        }
        try {
            const client = service.getClient();
            const state = await client.getState(session.id);
            return {
                text: `Current browser page: "${state.title}" at ${state.url}`,
                values: {
                    hasSession: true,
                    url: state.url,
                    title: state.title,
                },
                data: {
                    sessionId: session.id,
                    createdAt: session.createdAt.toISOString(),
                },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error getting browser state: ${errorMessage}`);
            return {
                text: "Error getting browser state",
                values: {
                    hasSession: true,
                    error: true,
                },
                data: {},
            };
        }
    },
};
//# sourceMappingURL=browser-state.js.map