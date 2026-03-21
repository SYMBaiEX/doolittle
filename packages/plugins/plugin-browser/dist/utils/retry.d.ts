import type { RetryConfig } from "../types.js";
export declare const DEFAULT_RETRY_CONFIGS: {
    navigation: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
    action: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
    extraction: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
    };
};
export declare function retryWithBackoff<T>(fn: () => Promise<T>, config: Partial<RetryConfig> & {
    timeout?: number;
}, operation: string): Promise<T>;
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=retry.d.ts.map