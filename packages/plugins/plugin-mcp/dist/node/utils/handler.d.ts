import type { ActionResult, HandlerCallback } from "@elizaos/core";
interface ToolSelectionResult {
    readonly noToolAvailable?: boolean;
    readonly reasoning?: string;
}
export declare function handleNoToolAvailable(callback: HandlerCallback | undefined, toolSelection: ToolSelectionResult | null | undefined): Promise<ActionResult>;
export {};
//# sourceMappingURL=handler.d.ts.map