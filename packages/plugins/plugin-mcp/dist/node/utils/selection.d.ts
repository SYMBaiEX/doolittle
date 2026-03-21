import { type HandlerCallback, type IAgentRuntime, type Memory, type State } from "@elizaos/core";
import type { McpProvider } from "../types";
import type { ToolSelectionArgument, ToolSelectionName } from "./schemas";
export interface CreateToolSelectionOptions {
    readonly runtime: IAgentRuntime;
    readonly state: State;
    readonly message: Memory;
    readonly callback?: HandlerCallback;
    readonly mcpProvider: McpProvider;
    readonly toolSelectionName?: ToolSelectionName;
}
export declare function createToolSelectionName({ runtime, state, message, callback, mcpProvider, }: CreateToolSelectionOptions): Promise<ToolSelectionName | null>;
export declare function createToolSelectionArgument({ runtime, state, message, callback, mcpProvider, toolSelectionName, }: CreateToolSelectionOptions): Promise<ToolSelectionArgument | null>;
//# sourceMappingURL=selection.d.ts.map