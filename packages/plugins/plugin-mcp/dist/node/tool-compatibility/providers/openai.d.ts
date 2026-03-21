import { McpToolCompatibility, type SchemaConstraints } from "../base";
export declare class OpenAIMcpCompatibility extends McpToolCompatibility {
    shouldApply(): boolean;
    protected getUnsupportedStringProperties(): readonly string[];
    protected getUnsupportedNumberProperties(): readonly string[];
    protected getUnsupportedArrayProperties(): readonly string[];
    protected getUnsupportedObjectProperties(): readonly string[];
}
export declare class OpenAIReasoningMcpCompatibility extends McpToolCompatibility {
    shouldApply(): boolean;
    protected getUnsupportedStringProperties(): readonly string[];
    protected getUnsupportedNumberProperties(): readonly string[];
    protected getUnsupportedArrayProperties(): readonly string[];
    protected getUnsupportedObjectProperties(): readonly string[];
    protected mergeDescription(originalDescription: string | undefined, constraints: SchemaConstraints): string;
    private formatConstraintsForReasoningModel;
}
//# sourceMappingURL=openai.d.ts.map