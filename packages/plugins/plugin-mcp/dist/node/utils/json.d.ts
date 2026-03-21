export declare function parseJSON<T>(input: string): T;
export declare function validateJsonSchema<T>(data: unknown, schema: Readonly<Record<string, unknown>>): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
export declare function stringifyJSON(value: unknown): string;
export declare function assertJsonObject(value: unknown, context: string): Record<string, unknown>;
//# sourceMappingURL=json.d.ts.map