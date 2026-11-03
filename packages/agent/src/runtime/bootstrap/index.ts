import { getApplicationSession } from "../application/index";
import type { AppContext, AppContextOptions } from "./types";

export { validateCriticalRuntimeServices } from "./runtime";
export { getApplicationSession } from "../application/index";
export type { AppContext, AppContextOptions } from "./types";

/** Compatibility entrypoint backed by the process-owned application session. */
export async function getAppContext(
  options: AppContextOptions = {},
): Promise<AppContext> {
  return getApplicationSession().ensureRuntime(options);
}
