import type { State } from "@elizaos/core";
import { type ValidationResult } from "../types";
import { type ResourceSelection, type ToolSelectionArgument, type ToolSelectionName } from "./schemas";
export type { ResourceSelection } from "./schemas";
export interface ToolSelection {
    readonly serverName: string;
    readonly toolName: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly reasoning?: string;
    readonly noToolAvailable?: boolean;
}
export declare function validateToolSelectionName(parsed: unknown, state: State): ValidationResult<ToolSelectionName>;
export declare function validateToolSelectionArgument(parsed: unknown, toolInputSchema: Readonly<Record<string, unknown>>): ValidationResult<ToolSelectionArgument>;
export declare function validateResourceSelection(selection: unknown): ValidationResult<ResourceSelection>;
export declare function createToolSelectionFeedbackPrompt(originalResponse: string, errorMessage: string, composedState: State, userMessage: string): string;
export declare function createResourceSelectionFeedbackPrompt(originalResponse: string, errorMessage: string, composedState: State, userMessage: string): string;
//# sourceMappingURL=validation.d.ts.map