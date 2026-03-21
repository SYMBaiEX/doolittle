import type { IAgentRuntime } from "@elizaos/core";
import type { JSONSchema7 } from "json-schema";
export interface StringConstraints {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    enum?: readonly string[];
}
export interface NumberConstraints {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
}
export interface ArrayConstraints {
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
}
export interface ObjectConstraints {
    minProperties?: number;
    maxProperties?: number;
    additionalProperties?: boolean;
}
export type SchemaConstraints = StringConstraints | NumberConstraints | ArrayConstraints | ObjectConstraints;
export type ModelProvider = "openai" | "anthropic" | "google" | "openrouter";
export interface ModelInfo {
    readonly provider: ModelProvider;
    readonly modelId: string;
    readonly supportsStructuredOutputs?: boolean;
    readonly isReasoningModel?: boolean;
}
export declare abstract class McpToolCompatibility {
    protected readonly modelInfo: ModelInfo;
    constructor(modelInfo: ModelInfo);
    abstract shouldApply(): boolean;
    transformToolSchema(toolSchema: JSONSchema7): JSONSchema7;
    protected processSchema(schema: JSONSchema7): JSONSchema7;
    protected processStringSchema(schema: JSONSchema7): JSONSchema7;
    protected processNumberSchema(schema: JSONSchema7): JSONSchema7;
    protected processArraySchema(schema: JSONSchema7): JSONSchema7;
    protected processObjectSchema(schema: JSONSchema7): JSONSchema7;
    protected processGenericSchema(schema: JSONSchema7): JSONSchema7;
    protected mergeDescription(originalDescription: string | undefined, constraints: SchemaConstraints): string;
    protected abstract getUnsupportedStringProperties(): readonly string[];
    protected abstract getUnsupportedNumberProperties(): readonly string[];
    protected abstract getUnsupportedArrayProperties(): readonly string[];
    protected abstract getUnsupportedObjectProperties(): readonly string[];
}
export declare function detectModelProvider(runtime: IAgentRuntime): ModelInfo;
//# sourceMappingURL=base.d.ts.map