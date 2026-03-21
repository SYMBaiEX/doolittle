import type { CapSolverConfig, CaptchaTask, CaptchaType } from "../types.js";
interface CapSolverTaskResult {
    token?: string;
    gRecaptchaResponse?: string;
}
export declare class CapSolverService {
    private config;
    private readonly apiUrl;
    private readonly retryAttempts;
    private readonly pollingInterval;
    constructor(config: CapSolverConfig);
    /**
     * Create a CAPTCHA solving task
     */
    createTask(task: CaptchaTask): Promise<string>;
    getTaskResult(taskId: string): Promise<CapSolverTaskResult>;
    solveTurnstile(websiteURL: string, websiteKey: string, proxy?: string, userAgent?: string): Promise<string>;
    solveRecaptchaV2(websiteURL: string, websiteKey: string, isInvisible?: boolean, proxy?: string): Promise<string>;
    solveRecaptchaV3(websiteURL: string, websiteKey: string, pageAction: string, minScore?: number, proxy?: string): Promise<string>;
    solveHCaptcha(websiteURL: string, websiteKey: string, proxy?: string): Promise<string>;
}
export declare function detectCaptchaType(page: {
    $: (selector: string) => Promise<Element | null>;
    evaluate: <T>(fn: () => T) => Promise<T>;
}): Promise<{
    type: CaptchaType;
    siteKey?: string;
}>;
export declare function injectCaptchaSolution(page: {
    evaluate: <T>(fn: (token: string) => T, token: string) => Promise<T>;
}, captchaType: CaptchaType, solution: string): Promise<void>;
export {};
//# sourceMappingURL=captcha.d.ts.map