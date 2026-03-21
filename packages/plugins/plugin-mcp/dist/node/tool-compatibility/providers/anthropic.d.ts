import { McpToolCompatibility, type SchemaConstraints } from "../base";
export declare class AnthropicMcpCompatibility extends McpToolCompatibility {
    shouldApply(): boolean;
    protected getUnsupportedStringProperties(): readonly string[];
    protected getUnsupportedNumberProperties(): readonly string[];
    protected getUnsupportedArrayProperties(): readonly string[];
    protected getUnsupportedObjectProperties(): readonly string[];
    protected mergeDescription(originalDescription: string | undefined, constraints: SchemaConstraints): string;
    private formatConstraintsForAnthropic;
}
//# sourceMappingURL=anthropic.d.ts.map