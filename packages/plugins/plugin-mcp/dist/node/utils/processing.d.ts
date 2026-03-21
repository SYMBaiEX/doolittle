import { type HandlerCallback, type IAgentRuntime, type Media, type Memory, type State } from "@elizaos/core";
import type { McpProviderData, McpResourceContent } from "../types";
interface ResourceResult {
    readonly contents: readonly McpResourceContent[];
}
export declare function processResourceResult(result: ResourceResult, uri: string): {
    resourceContent: string;
    resourceMeta: string;
};
interface ToolContentItem {
    readonly type: string;
    readonly text?: string;
    readonly mimeType?: string;
    readonly data?: string;
    readonly resource?: {
        readonly uri: string;
        readonly text?: string;
        readonly blob?: string;
    };
}
interface ToolResult {
    readonly content: readonly ToolContentItem[];
    readonly isError?: boolean;
}
export declare function processToolResult(result: ToolResult, serverName: string, toolName: string, runtime: IAgentRuntime, messageEntityId: string): {
    toolOutput: string;
    hasAttachments: boolean;
    attachments: Media[];
};
export declare function handleResourceAnalysis(runtime: IAgentRuntime, message: Memory, uri: string, serverName: string, resourceContent: string, resourceMeta: string, callback?: HandlerCallback): Promise<void>;
interface McpProviderArg {
    readonly values: {
        readonly mcp: McpProviderData;
    };
    readonly data: {
        readonly mcp: McpProviderData;
    };
    readonly text: string;
}
export declare function handleToolResponse(runtime: IAgentRuntime, message: Memory, serverName: string, toolName: string, toolArgs: Readonly<Record<string, unknown>>, toolOutput: string, hasAttachments: boolean, attachments: readonly Media[], state: State, mcpProvider: McpProviderArg, callback?: HandlerCallback): Promise<Memory>;
export declare function sendInitialResponse(callback?: HandlerCallback): Promise<void>;
export {};
//# sourceMappingURL=processing.d.ts.map