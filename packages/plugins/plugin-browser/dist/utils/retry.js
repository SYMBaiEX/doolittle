import { logger } from "@elizaos/core";
export const DEFAULT_RETRY_CONFIGS = {
    navigation: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
    },
    action: {
        maxAttempts: 2,
        initialDelayMs: 500,
        maxDelayMs: 2000,
        backoffMultiplier: 1.5,
    },
    extraction: {
        maxAttempts: 2,
        initialDelayMs: 500,
        maxDelayMs: 3000,
        backoffMultiplier: 2,
    },
};
export async function retryWithBackoff(fn, config, operation) {
    const maxAttempts = config.maxAttempts ?? 3;
    const initialDelay = config.initialDelayMs ?? 1000;
    const maxDelay = config.maxDelayMs ?? 5000;
    const backoffMultiplier = config.backoffMultiplier ?? 2;
    let lastError;
    let delay = initialDelay;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            logger.info(`Attempting ${operation} (attempt ${attempt}/${maxAttempts})`);
            if (config.timeout) {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out after ${config.timeout}ms`)), config.timeout));
                return await Promise.race([fn(), timeoutPromise]);
            }
            return await fn();
        }
        catch (error) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`${operation} failed (attempt ${attempt}/${maxAttempts}): ${errorMessage}`);
            if (attempt < maxAttempts) {
                logger.info(`Retrying ${operation} in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay = Math.min(delay * backoffMultiplier, maxDelay);
            }
        }
    }
    logger.error(`${operation} failed after ${maxAttempts} attempts`);
    throw (lastError ?? new Error(`${operation} failed after ${maxAttempts} attempts`));
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map