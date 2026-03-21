import { logger } from "@elizaos/core";
import axios from "axios";
export class CapSolverService {
    config;
    apiUrl;
    retryAttempts;
    pollingInterval;
    constructor(config) {
        this.config = config;
        this.apiUrl = config.apiUrl ?? "https://api.capsolver.com";
        this.retryAttempts = config.retryAttempts ?? 60;
        this.pollingInterval = config.pollingInterval ?? 2000;
    }
    /**
     * Create a CAPTCHA solving task
     */
    async createTask(task) {
        try {
            const response = await axios.post(`${this.apiUrl}/createTask`, {
                clientKey: this.config.apiKey,
                task,
            }, {
                headers: { "Content-Type": "application/json" },
                timeout: 30000,
            });
            if (response.data.errorId !== 0) {
                throw new Error(`CapSolver error: ${response.data.errorDescription ?? "Unknown error"}`);
            }
            logger.info("CapSolver task created:", response.data.taskId);
            return response.data.taskId;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error creating CapSolver task: ${errorMessage}`);
            throw error;
        }
    }
    async getTaskResult(taskId) {
        let attempts = 0;
        while (attempts < this.retryAttempts) {
            try {
                const response = await axios.post(`${this.apiUrl}/getTaskResult`, {
                    clientKey: this.config.apiKey,
                    taskId,
                }, {
                    headers: { "Content-Type": "application/json" },
                    timeout: 30000,
                });
                if (response.data.errorId !== 0) {
                    throw new Error(`CapSolver error: ${response.data.errorDescription ?? "Unknown error"}`);
                }
                if (response.data.status === "ready") {
                    logger.info("CapSolver task completed successfully");
                    return response.data.solution;
                }
                await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
                attempts++;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Error getting CapSolver task result: ${errorMessage}`);
                throw error;
            }
        }
        throw new Error("CapSolver task timeout");
    }
    async solveTurnstile(websiteURL, websiteKey, proxy, userAgent) {
        logger.info("Solving Cloudflare Turnstile captcha");
        const task = {
            type: proxy ? "AntiTurnstileTask" : "AntiTurnstileTaskProxyLess",
            websiteURL,
            websiteKey,
        };
        if (proxy) {
            const proxyParts = proxy.split(":");
            task.proxy = `${proxyParts[0]}:${proxyParts[1]}`;
            if (proxyParts.length > 2) {
                task.proxyLogin = proxyParts[2];
                task.proxyPassword = proxyParts[3];
            }
        }
        if (userAgent) {
            task.userAgent = userAgent;
        }
        const taskId = await this.createTask(task);
        const solution = await this.getTaskResult(taskId);
        return solution.token ?? "";
    }
    async solveRecaptchaV2(websiteURL, websiteKey, isInvisible = false, proxy) {
        logger.info("Solving reCAPTCHA v2");
        const task = {
            type: proxy ? "RecaptchaV2Task" : "RecaptchaV2TaskProxyless",
            websiteURL,
            websiteKey,
            isInvisible,
        };
        if (proxy) {
            const proxyParts = proxy.split(":");
            task.proxy = `${proxyParts[0]}:${proxyParts[1]}`;
            if (proxyParts.length > 2) {
                task.proxyLogin = proxyParts[2];
                task.proxyPassword = proxyParts[3];
            }
        }
        const taskId = await this.createTask(task);
        const solution = await this.getTaskResult(taskId);
        return solution.gRecaptchaResponse ?? "";
    }
    async solveRecaptchaV3(websiteURL, websiteKey, pageAction, minScore = 0.7, proxy) {
        logger.info("Solving reCAPTCHA v3");
        const task = {
            type: proxy ? "RecaptchaV3Task" : "RecaptchaV3TaskProxyless",
            websiteURL,
            websiteKey,
            pageAction,
            minScore,
        };
        if (proxy) {
            const proxyParts = proxy.split(":");
            task.proxy = `${proxyParts[0]}:${proxyParts[1]}`;
            if (proxyParts.length > 2) {
                task.proxyLogin = proxyParts[2];
                task.proxyPassword = proxyParts[3];
            }
        }
        const taskId = await this.createTask(task);
        const solution = await this.getTaskResult(taskId);
        return solution.gRecaptchaResponse ?? "";
    }
    async solveHCaptcha(websiteURL, websiteKey, proxy) {
        logger.info("Solving hCaptcha");
        const task = {
            type: proxy ? "HCaptchaTask" : "HCaptchaTaskProxyless",
            websiteURL,
            websiteKey,
        };
        if (proxy) {
            const proxyParts = proxy.split(":");
            task.proxy = `${proxyParts[0]}:${proxyParts[1]}`;
            if (proxyParts.length > 2) {
                task.proxyLogin = proxyParts[2];
                task.proxyPassword = proxyParts[3];
            }
        }
        const taskId = await this.createTask(task);
        const solution = await this.getTaskResult(taskId);
        return solution.token ?? "";
    }
}
export async function detectCaptchaType(page) {
    try {
        const turnstileElement = await page.$("[data-sitekey]");
        if (turnstileElement) {
            const cfTurnstile = await page.$(".cf-turnstile");
            if (cfTurnstile) {
                return { type: "turnstile" };
            }
        }
        const recaptchaElement = await page.$("[data-sitekey], .g-recaptcha");
        if (recaptchaElement) {
            const isV3 = await page.evaluate(() => {
                const grecaptcha = globalThis.grecaptcha;
                return typeof grecaptcha?.execute === "function";
            });
            return { type: isV3 ? "recaptcha-v3" : "recaptcha-v2" };
        }
        const hcaptchaElement = await page.$("[data-sitekey].h-captcha, [data-hcaptcha-sitekey]");
        if (hcaptchaElement) {
            return { type: "hcaptcha" };
        }
        return { type: "none" };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error detecting CAPTCHA type: ${errorMessage}`);
        return { type: "none" };
    }
}
export async function injectCaptchaSolution(page, captchaType, solution) {
    switch (captchaType) {
        case "turnstile":
            await page.evaluate((token) => {
                const doc = globalThis;
                const textarea = doc.document.querySelector('[name="cf-turnstile-response"]');
                if (textarea) {
                    textarea.value = token;
                }
                doc.turnstileCallback?.(token);
            }, solution);
            break;
        case "recaptcha-v2":
        case "recaptcha-v3":
            await page.evaluate((token) => {
                const doc = globalThis;
                const textarea = doc.document.querySelector('[name="g-recaptcha-response"]');
                if (textarea) {
                    textarea.value = token;
                    textarea.style.display = "block";
                }
                doc.onRecaptchaSuccess?.(token);
            }, solution);
            break;
        case "hcaptcha":
            await page.evaluate((token) => {
                const doc = globalThis;
                const textarea = doc.document.querySelector('[name="h-captcha-response"]');
                if (textarea) {
                    textarea.value = token;
                }
                const input = doc.document.querySelector('[name="g-recaptcha-response"]');
                if (input) {
                    input.value = token;
                }
                doc.hcaptchaCallback?.(token);
            }, solution);
            break;
    }
}
//# sourceMappingURL=captcha.js.map