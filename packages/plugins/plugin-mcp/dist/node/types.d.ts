import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { EmbeddedResource, ImageContent, Resource, ResourceTemplate, TextContent, Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const MCP_SERVICE_NAME: "mcp";
export declare const DEFAULT_MCP_TIMEOUT_SECONDS = 60000;
export declare const MIN_MCP_TIMEOUT_SECONDS = 1;
export declare const DEFAULT_MAX_RETRIES = 2;
export interface PingConfig {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly timeoutMs: number;
    readonly failuresBeforeDisconnect: number;
}
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed";
export interface ConnectionState {
    status: ConnectionStatus;
    pingInterval?: ReturnType<typeof setInterval>;
    reconnectTimeout?: ReturnType<typeof setTimeout>;
    reconnectAttempts: number;
    lastConnected?: Date;
    lastError?: Error;
    consecutivePingFailures: number;
}
export interface StdioMcpServerConfig {
    readonly type: "stdio";
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
    readonly timeoutInMillis?: number;
}
export interface HttpMcpServerConfig {
    readonly type: "http" | "streamable-http" | "sse";
    readonly url: string;
    readonly timeout?: number;
}
export type McpServerConfig = StdioMcpServerConfig | HttpMcpServerConfig;
export interface McpSettings {
    readonly servers: Readonly<Record<string, McpServerConfig>>;
    readonly maxRetries?: number;
}
export type McpServerStatus = "connecting" | "connected" | "disconnected";
export interface McpServer {
    readonly name: string;
    status: McpServerStatus;
    readonly config: string;
    error?: string;
    disabled?: boolean;
    tools?: readonly Tool[];
    resources?: readonly Resource[];
    resourceTemplates?: readonly ResourceTemplate[];
}
export interface McpConnection {
    server: McpServer;
    readonly client: Client;
    readonly transport: StdioClientTransport | SSEClientTransport;
}
export interface McpToolResult {
    readonly content: ReadonlyArray<TextContent | ImageContent | EmbeddedResource>;
    readonly isError?: boolean;
}
export interface McpResourceContent {
    readonly uri: string;
    readonly mimeType?: string;
    readonly text?: string;
    readonly blob?: string;
}
export interface McpResourceResponse {
    readonly contents: readonly McpResourceContent[];
}
export interface McpToolInputSchema {
    readonly properties?: Readonly<Record<string, JsonSchemaProperty>>;
    readonly required?: readonly string[];
    readonly [key: string]: JsonSchemaValue | Readonly<Record<string, JsonSchemaProperty>> | readonly string[] | undefined;
}
export interface McpToolInfo {
    readonly description: string;
    readonly inputSchema?: McpToolInputSchema;
}
export interface McpResourceInfo {
    readonly name: string;
    readonly description: string;
    readonly mimeType?: string;
}
export interface McpServerInfo {
    readonly status: string;
    readonly tools: Readonly<Record<string, McpToolInfo>>;
    readonly resources: Readonly<Record<string, McpResourceInfo>>;
}
export interface McpProviderData {
    readonly [serverName: string]: McpServerInfo;
}
export interface McpProviderValues {
    readonly mcp: McpProviderData;
    readonly mcpText?: string;
}
export interface McpProvider {
    readonly values: McpProviderValues;
    readonly data: {
        readonly mcp: McpProviderData;
    };
    readonly text: string;
}
export type JsonSchemaPrimitive = string | number | boolean | null;
export type JsonSchemaValue = JsonSchemaPrimitive | JsonSchemaObject | JsonSchemaArray;
export interface JsonSchemaObject {
    readonly [key: string]: JsonSchemaValue;
}
export type JsonSchemaArray = readonly JsonSchemaValue[];
export interface JsonSchemaProperty {
    readonly type?: string;
    readonly description?: string;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly format?: string;
    readonly enum?: readonly string[];
    readonly minimum?: number;
    readonly maximum?: number;
    readonly items?: JsonSchemaProperty;
    readonly properties?: Readonly<Record<string, JsonSchemaProperty>>;
    readonly required?: readonly string[];
    readonly [key: string]: JsonSchemaValue | JsonSchemaProperty | Readonly<Record<string, JsonSchemaProperty>> | readonly string[] | undefined;
}
export declare const ToolSelectionSchema: {
    readonly type: "object";
    readonly required: readonly ["serverName", "toolName", "arguments"];
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
        readonly arguments: {
            readonly type: "object";
        };
        readonly reasoning: {
            readonly type: "string";
        };
        readonly noToolAvailable: {
            readonly type: "boolean";
        };
    };
};
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
export declare const DEFAULT_PING_CONFIG: Readonly<PingConfig>;
export declare const MAX_RECONNECT_ATTEMPTS = 5;
export declare const BACKOFF_MULTIPLIER = 2;
export declare const INITIAL_RETRY_DELAY = 2000;
interface SuccessResult<T> {
    readonly success: true;
    readonly data: T;
}
interface ErrorResult {
    readonly success: false;
    readonly error: string;
}
export type ValidationResult<T> = SuccessResult<T> | ErrorResult;
export declare function assertNonNull<T>(value: T | null | undefined, message: string): T;
export declare function assertString(value: unknown, message: string): string;
export declare function assertNonEmptyString(value: unknown, message: string): string;
export declare function assertObject(value: unknown, message: string): Record<string, unknown>;
export {};
//# sourceMappingURL=types.d.ts.map