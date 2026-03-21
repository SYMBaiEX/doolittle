export declare const toolSelectionNameSchema: {
    readonly type: "object";
    readonly required: readonly ["serverName", "toolName"];
    readonly properties: {
        readonly serverName: {
            readonly type: "string";
            readonly minLength: 1;
            readonly errorMessage: "serverName must not be empty";
        };
        readonly toolName: {
            readonly type: "string";
            readonly minLength: 1;
            readonly errorMessage: "toolName must not be empty";
        };
        readonly reasoning: {
            readonly type: "string";
        };
        readonly noToolAvailable: {
            readonly type: "boolean";
        };
    };
};
export interface ToolSelectionName {
    readonly serverName: string;
    readonly toolName: string;
    readonly reasoning?: string;
    readonly noToolAvailable?: boolean;
}
export declare const toolSelectionArgumentSchema: {
    readonly type: "object";
    readonly required: readonly ["toolArguments"];
    readonly properties: {
        readonly toolArguments: {
            readonly type: "object";
        };
    };
};
export interface ToolSelectionArgument {
    readonly toolArguments: Readonly<Record<string, unknown>>;
}
export declare const ResourceSelectionSchema: {
    readonly type: "object";
    readonly required: readonly ["serverName", "uri"];
    readonly properties: {
        readonly serverName: {
            readonly type: "string";
            readonly minLength: 1;
            readonly errorMessage: "serverName must not be empty";
        };
        readonly uri: {
            readonly type: "string";
            readonly minLength: 1;
            readonly errorMessage: "uri must not be empty";
        };
        readonly reasoning: {
            readonly type: "string";
        };
        readonly noResourceAvailable: {
            readonly type: "boolean";
        };
    };
};
export interface ResourceSelection {
    readonly serverName: string;
    readonly uri: string;
    readonly reasoning?: string;
    readonly noResourceAvailable?: boolean;
}
export declare function isToolSelectionName(value: unknown): value is ToolSelectionName;
export declare function isToolSelectionArgument(value: unknown): value is ToolSelectionArgument;
export declare function isResourceSelection(value: unknown): value is ResourceSelection;
//# sourceMappingURL=schemas.d.ts.map