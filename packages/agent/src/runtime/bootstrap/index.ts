import { buildAppContext } from "./app-context";
import { AppContextManager } from "./app-context-manager";

export { isRecoverablePgliteInitError } from "./recovery/recoverable";
export { validateCriticalRuntimeServices } from "./runtime";
export type {
  AppContext,
  AppContextOptions,
} from "./types";

import type { AppContext, AppContextOptions } from "./types";

const appContextManager = new AppContextManager(buildAppContext);

export async function getAppContext(
  options: AppContextOptions = {},
): Promise<AppContext> {
  return appContextManager.get(options);
}
