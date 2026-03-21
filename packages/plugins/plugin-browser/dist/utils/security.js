import { SecurityError } from "./errors.js";
const DEFAULT_SECURITY_CONFIG = {
    allowedDomains: [],
    blockedDomains: ["malware.com", "phishing.com"],
    maxUrlLength: 2048,
    allowLocalhost: true,
    allowFileProtocol: false,
};
export class UrlValidator {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
    }
    validate(url) {
        try {
            if (url.length > this.config.maxUrlLength) {
                return { valid: false, error: "URL is too long" };
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            }
            catch {
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    try {
                        parsedUrl = new URL(`https://${url}`);
                    }
                    catch {
                        return { valid: false, error: "Invalid URL format" };
                    }
                }
                else {
                    return { valid: false, error: "Invalid URL format" };
                }
            }
            if (parsedUrl.protocol === "file:" && !this.config.allowFileProtocol) {
                return { valid: false, error: "File protocol is not allowed" };
            }
            if (!["http:", "https:", "file:"].includes(parsedUrl.protocol)) {
                return { valid: false, error: "Only HTTP(S) protocols are allowed" };
            }
            const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
            if (isLocalhost && !this.config.allowLocalhost) {
                return { valid: false, error: "Localhost URLs are not allowed" };
            }
            for (const blocked of this.config.blockedDomains) {
                if (parsedUrl.hostname.includes(blocked)) {
                    return { valid: false, error: `Domain ${blocked} is blocked` };
                }
            }
            if (this.config.allowedDomains.length > 0) {
                const isAllowed = this.config.allowedDomains.some((allowed) => parsedUrl.hostname === allowed ||
                    parsedUrl.hostname.endsWith(`.${allowed}`));
                if (!isAllowed) {
                    return { valid: false, error: "Domain is not in the allowed list" };
                }
            }
            return { valid: true, sanitized: parsedUrl.href };
        }
        catch {
            return { valid: false, error: "Error validating URL" };
        }
    }
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
export const InputSanitizer = {
    sanitizeText(input) {
        return input
            .replace(/[<>]/g, "")
            .replace(/javascript:/gi, "")
            .replace(/on\w+\s*=/gi, "")
            .trim();
    },
    sanitizeSelector(selector) {
        return selector.replace(/['"]/g, "").replace(/[<>]/g, "").trim();
    },
    sanitizeFilePath(path) {
        return path
            .replace(/\.\./g, "")
            .replace(/[<>:"|?*]/g, "")
            .trim();
    },
};
export function validateSecureAction(url, validator) {
    if (!url) {
        return;
    }
    const validation = validator.validate(url);
    if (!validation.valid) {
        throw new SecurityError(`URL validation failed: ${validation.error}`, {
            url,
            error: validation.error,
        });
    }
}
export const defaultUrlValidator = new UrlValidator();
export class RateLimiter {
    config;
    actionCounts = new Map();
    sessionCounts = new Map();
    constructor(config) {
        this.config = config;
    }
    checkActionLimit(userId) {
        const now = Date.now();
        const userLimit = this.actionCounts.get(userId);
        if (!userLimit || now > userLimit.resetTime) {
            this.actionCounts.set(userId, {
                count: 1,
                resetTime: now + 60000,
            });
            return true;
        }
        if (userLimit.count >= this.config.maxActionsPerMinute) {
            return false;
        }
        userLimit.count++;
        return true;
    }
    checkSessionLimit(userId) {
        const now = Date.now();
        const userLimit = this.sessionCounts.get(userId);
        if (!userLimit || now > userLimit.resetTime) {
            this.sessionCounts.set(userId, {
                count: 1,
                resetTime: now + 3600000,
            });
            return true;
        }
        if (userLimit.count >= this.config.maxSessionsPerHour) {
            return false;
        }
        userLimit.count++;
        return true;
    }
}
//# sourceMappingURL=security.js.map