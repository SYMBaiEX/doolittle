import { getApplicationSession } from "../application/index";
import type { AppContext, AppContextOptions } from "./types";

export { getApplicationSession } from "../application/index";
export type { AppContext, AppContextOptions } from "./types";

/** Compatibility entrypoint backed by the process-owned application session. */
export async function getAppContext(
  options: AppContextOptions = {},
): Promise<AppContext> {
  return getApplicationSession().ensureRuntime(options);
}

export async function validateCriticalRuntimeServices(
  ...args: Parameters<
    typeof import("./runtime/critical").validateCriticalRuntimeServices
  >
) {
  const runtime = await import("./runtime/critical");
  return runtime.validateCriticalRuntimeServices(...args);
}
