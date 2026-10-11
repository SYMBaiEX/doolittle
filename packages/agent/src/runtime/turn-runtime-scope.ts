import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { ActionResult, runV5MessageRuntimeStage1 } from "@elizaos/core";
import { actionResultActionName } from "@/runtime/action-result-metadata";
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
  settledActionResults?: ActionResult[];
  plannerBudget?: TurnPlannerBudget;
  actionReceipts: {
    originals: WeakMap<ActionResult, string>;
    byId: Map<string, ActionResult>;
  };
};

const turnRuntimeScope = new AsyncLocalStorage<TurnRuntimeScope>();
const originalSettingReaders = new WeakMap<object, (key: string) => unknown>();

type NativePlannerConfig = NonNullable<
  Parameters<typeof runV5MessageRuntimeStage1>[0]["plannerLoopConfig"]
>;

/** One allowance shared by all native SDK message passes in a user turn. */
export class TurnPlannerBudget {
  private remaining: number;
  private callsInPass = 0;
  private passes = 0;

  constructor(
    maxToolCalls: number,
    private readonly model: string,
    private readonly maxPasses = 12,
  ) {
    this.remaining = Number.isFinite(maxToolCalls)
      ? Math.max(1, Math.floor(maxToolCalls))
      : 16;
  }

  get exhausted(): boolean {
    return this.remaining <= 0 || this.passes >= this.maxPasses;
  }

  beginPass(): NativePlannerConfig {
    if (this.exhausted)
      throw new Error("Native planner turn budget exhausted.");
    this.passes += 1;
    this.callsInPass = 0;
    return {
      // Keep the SDK's default per-pass ceiling, shrinking it as this turn's
      // allowance is spent. A ceiling is a refusal, never a graceful yield.
      maxToolCalls: Math.min(16, this.remaining),
      contextWindowModelName: this.model,
      compactionEnabled: true,
    };
  }

  observeStreamChunk(chunk: string): void {
    // beta.7 emits one pending tool_call before every admitted native call,
    // even when a failed/repeated call never reaches its returned action list.
    // Count only that SDK envelope, not model tokens or a tool-result message.
    try {
      const event = JSON.parse(chunk) as {
        type?: unknown;
        toolCall?: { name?: unknown; status?: unknown };
        metadata?: { iteration?: unknown };
      } | null;
      if (
        event?.type === "tool_call" &&
        typeof event.toolCall?.name === "string" &&
        event.toolCall.status === "pending" &&
        typeof event.metadata?.iteration === "number"
      )
        this.callsInPass += 1;
    } catch {
      // Ordinary streamed prose is not a native tool event.
    }
  }

  finishPass(observedActionCount: number): void {
    // Older/test message-service adapters may omit streaming events. Use their
    // results conservatively; do not charge both projections for the same pass.
    this.remaining -= Math.max(this.callsInPass, observedActionCount);
    this.callsInPass = 0;
  }
}

export function getScopedTurnPlannerBudget(
  runtime: object,
): TurnPlannerBudget | undefined {
  const scope = turnRuntimeScope.getStore();
  return scope?.runtime === runtime ? scope.plannerBudget : undefined;
}

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
  scope: Omit<TurnRuntimeScope, "runtime" | "actionReceipts">,
  task: () => T,
): T {
  installScopedSettingReader(runtime);
  const current = turnRuntimeScope.getStore();
  const actionReceipts =
    current?.runtime === runtime &&
    current.settledActionResults === scope.settledActionResults
      ? current.actionReceipts
      : {
          originals: new WeakMap<ActionResult, string>(),
          byId: new Map<string, ActionResult>(),
        };
  return turnRuntimeScope.run({ runtime, ...scope, actionReceipts }, task);
}

/** Add adapter settings without losing the parent turn identity or cancellation. */
export function runWithAdditionalTurnRuntimeSettings<T>(
  runtime: RuntimeSettingsReader & object,
  settings: ReadonlyMap<string, unknown>,
  task: () => T,
): T {
  const current = turnRuntimeScope.getStore();
  const parent = current?.runtime === runtime ? current : undefined;
  return runWithTurnRuntimeScope(
    runtime,
    {
      ...parent,
      settings: new Map([...(parent?.settings ?? []), ...settings]),
    },
    task,
  );
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

/**
 * Retains Doolittle-owned action evidence across an SDK continuation failure.
 *
 * Eliza beta.7 does not expose its newer settled-action callback, so managed
 * actions record only their own receipt-backed result here. The array belongs
 * to one AsyncLocalStorage turn and is shared by nested adapter settings.
 */
export function recordScopedTurnActionResult(
  runtime: object,
  result: ActionResult,
): void {
  const scope = turnRuntimeScope.getStore();
  if (scope?.runtime !== runtime || !scope.settledActionResults) return;
  if (scope.actionReceipts.originals.has(result)) return;
  const receiptId = randomUUID();
  scope.actionReceipts.originals.set(result, receiptId);
  scope.actionReceipts.byId.set(receiptId, result);
  // An occurrence ID, not a session/resource identifier or authentication.
  // beta.7 reconstructs wrappers but copies data; JSON clones preserve this
  // content-free identity. Only actual settlement here may mint it. Copy data
  // rather than modifying SDK-owned nested values; optional stamping cannot
  // turn completed work into failure when the result is non-extensible/frozen.
  try {
    result.data = { ...result.data, doolittleTurnReceiptId: receiptId };
  } catch {
    // The full original is still retained. Unidentified projections cannot
    // become fresh managed-app/browser evidence in an active turn scope.
  }
  scope.settledActionResults.push(result);
}

export function hasScopedTurnActionReceipts(runtime: object): boolean {
  const scope = turnRuntimeScope.getStore();
  return scope?.runtime === runtime && scope.settledActionResults !== undefined;
}

/** Resolve a projection to its full original without moving that occurrence. */
export function resolveScopedTurnActionResult(
  runtime: object,
  result: ActionResult,
): ActionResult | undefined {
  const scope = turnRuntimeScope.getStore();
  if (scope?.runtime !== runtime || !scope.settledActionResults)
    return undefined;
  const originalId = scope.actionReceipts.originals.get(result);
  if (originalId) return scope.actionReceipts.byId.get(originalId);
  try {
    const id = result.data?.doolittleTurnReceiptId;
    const original =
      typeof id === "string" ? scope.actionReceipts.byId.get(id) : undefined;
    if (!original) return undefined;
    const projectedAction = actionResultActionName(result)?.toUpperCase();
    const originalAction = actionResultActionName(original)?.toUpperCase();
    // Reduced SDK envelopes may omit identity; an explicit contradictory
    // identity is not this occurrence and must retain its own invalidation.
    if (projectedAction && originalAction && projectedAction !== originalAction)
      return undefined;
    return original;
  } catch {
    return undefined;
  }
}

export function getScopedTurnActionResults(runtime: object): ActionResult[] {
  const scope = turnRuntimeScope.getStore();
  return scope?.runtime === runtime
    ? [...(scope.settledActionResults ?? [])]
    : [];
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
