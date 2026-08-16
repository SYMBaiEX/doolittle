import { AsyncLocalStorage } from "node:async_hooks";
import type { LinkedProviderName } from "@/runtime/linked-provider-accounts";

type RuntimeSettingsReader = {
  getSetting: (key: string) => unknown;
};

export type TurnCommandHooks = {
  runLocalShellCommand?: (params: {
    command: string;
    afterSuccessConnectProvider?: LinkedProviderName;
  }) => Promise<string>;
};

type TurnRuntimeScope = {
  runtime: object;
  settings: ReadonlyMap<string, unknown>;
  abortSignal?: AbortSignal;
  personalityId?: string;
  commandHooks?: TurnCommandHooks;
};

const turnRuntimeScope = new AsyncLocalStorage<TurnRuntimeScope>();
const originalSettingReaders = new WeakMap<object, (key: string) => unknown>();

/**
 * Runs an SDK turn with request-local runtime settings.
 *
 * Eliza provider plugins receive the shared runtime and resolve credentials,
 * models, and session metadata through `runtime.getSetting`. Intercepting that
 * accessor once lets all first- and third-party providers observe a stable
 * turn snapshot without changing the shared runtime or serialising requests.
 */
export function runWithTurnRuntimeScope<T>(
  runtime: RuntimeSettingsReader & object,
  scope: Omit<TurnRuntimeScope, "runtime">,
  task: () => T,
): T {
  installScopedSettingReader(runtime);
  return turnRuntimeScope.run({ runtime, ...scope }, task);
}

export function getScopedTurnPersonalityId(
  runtime: object,
): string | undefined {
  const scope = turnRuntimeScope.getStore();
  return scope?.runtime === runtime ? scope.personalityId : undefined;
}

/**
 * Returns the active message turn's cancellation signal for Doolittle actions.
 *
 * Eliza beta.7 does not copy the message-service abort signal into planned
 * action handler options. Keeping it request-local closes that compatibility
 * gap without mutating the shared runtime.
 */
export function getScopedTurnAbortSignal(
  runtime: object,
): AbortSignal | undefined {
  const scope = turnRuntimeScope.getStore();
  return scope?.runtime === runtime ? scope.abortSignal : undefined;
}

/**
 * Returns command-only hooks for the active SDK message turn. These hooks are
 * request-scoped so the command action can preserve CLI-specific behavior
 * without bypassing the Eliza shortcut and action lifecycle.
 */
export function getScopedTurnCommandHooks(
  runtime: object,
): TurnCommandHooks | undefined {
  const scope = turnRuntimeScope.getStore();
  return scope?.runtime === runtime ? scope.commandHooks : undefined;
}

function installScopedSettingReader(
  runtime: RuntimeSettingsReader & object,
): void {
  if (originalSettingReaders.has(runtime)) {
    return;
  }

  const originalGetSetting = runtime.getSetting.bind(runtime);
  originalSettingReaders.set(runtime, originalGetSetting);

  runtime.getSetting = (key: string): unknown => {
    const scope = turnRuntimeScope.getStore();
    if (scope?.runtime === runtime && scope.settings.has(key)) {
      return scope.settings.get(key);
    }
    return originalGetSetting(key);
  };
}
