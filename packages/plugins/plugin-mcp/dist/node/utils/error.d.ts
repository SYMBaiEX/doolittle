import type { State } from "@elizaos/core";
import { type ActionResult, type HandlerCallback, type IAgentRuntime, type Memory } from "@elizaos/core";
import type { McpProvider } from "../types";
export declare function handleMcpError(state: State, mcpProvider: McpProvider, error: unknown, runtime: IAgentRuntime, message: Memory, type: "tool" | "resource", callback?: HandlerCallback): Promise<ActionResult>;
export declare class McpError extends Error {
    readonly code: string;
    constructor(message: string, code?: string);
    static connectionError(serverName: string, details?: string): McpError;
    static toolNotFound(toolName: string, serverName: string): McpError;
    static resourceNotFound(uri: string, serverName: string): McpError;
    static validationError(details: string): McpError;
    static serverError(serverName: string, details?: string): McpError;
}
//# sourceMappingURL=error.d.ts.map