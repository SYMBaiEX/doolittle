export type ErrorCode = "SERVICE_NOT_AVAILABLE" | "SESSION_ERROR" | "NAVIGATION_ERROR" | "ACTION_ERROR" | "SECURITY_ERROR" | "CAPTCHA_ERROR" | "TIMEOUT_ERROR" | "NO_URL_FOUND";
export declare class BrowserError extends Error {
    readonly code: ErrorCode;
    readonly userMessage: string;
    readonly recoverable: boolean;
    readonly details?: Record<string, unknown>;
    constructor(message: string, code: ErrorCode, userMessage: string, recoverable?: boolean, details?: Record<string, unknown>);
}
export declare class ServiceNotAvailableError extends BrowserError {
    constructor();
}
export declare class SessionError extends BrowserError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class NavigationError extends BrowserError {
    constructor(url: string, originalError?: Error);
}
export declare class ActionError extends BrowserError {
    constructor(action: string, target: string, originalError?: Error);
}
export declare class SecurityError extends BrowserError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class CaptchaError extends BrowserError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class TimeoutError extends BrowserError {
    constructor(operation: string, timeoutMs: number);
}
export declare class NoUrlFoundError extends BrowserError {
    constructor();
}
export declare function handleBrowserError(error: Error | BrowserError, callback?: (content: {
    text: string;
    error?: boolean;
}) => Promise<unknown>, action?: string): void;
//# sourceMappingURL=errors.d.ts.map