import type { RateLimitConfig, SecurityConfig } from "../types.js";
export declare class UrlValidator {
    private config;
    constructor(config?: Partial<SecurityConfig>);
    validate(url: string): {
        valid: boolean;
        sanitized?: string;
        error?: string;
    };
    updateConfig(config: Partial<SecurityConfig>): void;
}
export declare const InputSanitizer: {
    sanitizeText(input: string): string;
    sanitizeSelector(selector: string): string;
    sanitizeFilePath(path: string): string;
};
export declare function validateSecureAction(url: string | null, validator: UrlValidator): void;
export declare const defaultUrlValidator: UrlValidator;
export declare class RateLimiter {
    private config;
    private actionCounts;
    private sessionCounts;
    constructor(config: RateLimitConfig);
    checkActionLimit(userId: string): boolean;
    checkSessionLimit(userId: string): boolean;
}
//# sourceMappingURL=security.d.ts.map