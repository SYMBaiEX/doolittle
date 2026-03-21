import type { IAgentRuntime } from "@elizaos/core";
import { detectModelProvider, type McpToolCompatibility } from "./base";
export { type ArrayConstraints, McpToolCompatibility, type ModelInfo, type ModelProvider, type NumberConstraints, type ObjectConstraints, type SchemaConstraints, type StringConstraints, } from "./base";
export { detectModelProvider };
export declare function createMcpToolCompatibility(runtime: IAgentRuntime): Promise<McpToolCompatibility | null>;
export declare function createMcpToolCompatibilitySync(runtime: IAgentRuntime): McpToolCompatibility | null;
//# sourceMappingURL=index.d.ts.map