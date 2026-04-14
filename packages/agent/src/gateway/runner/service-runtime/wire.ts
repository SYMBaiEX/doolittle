import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewayRunnerRuntimeApi } from "./api";
import { createGatewayRunnerRuntimeApi } from "./api";
import { assembleGatewayRunnerRuntime } from "./assembly";
import {
  createGatewayRunnerAdapter,
  observeGatewayRunnerAdapter,
} from "./platforms";
import type { GatewayRunnerRuntimeState } from "./state";

/**
 * A lazily-resolved value guard. Callers obtain `require()` before the value
 * exists; calling `require()` before `resolve()` throws. This breaks the
 * circular dependency between the assembled component tree and the API facade
 * that wraps it — both need to reference each other during boot.
 */
export interface LazyGuard<T> {
  require: () => T;
  resolve: (value: T) => void;
}

export function createLazyApiGuard<T>(label: string): LazyGuard<T> {
  let resolved: T | null = null;
  return {
    require: () => {
      if (!resolved) {
        throw new Error(`${label} was accessed before it was resolved.`);
      }
      return resolved;
    },
    resolve: (value) => {
      resolved = value;
    },
  };
}

/**
 * Wire the assembled runner components into a unified API facade.
 * Handles the circular bootstrap dependency: callbacks passed into assembly
 * route through the API, but the API is built from the assembly result.
 * The lazy guard resolves that cycle without exposing it to the class.
 */
export function wireGatewayRunnerRuntime(
  context: GatewayRunnerContext,
  state: GatewayRunnerRuntimeState,
): GatewayRunnerRuntimeApi {
  const guard = createLazyApiGuard<GatewayRunnerRuntimeApi>(
    "Gateway runner runtime API",
  );

  const assembled = assembleGatewayRunnerRuntime({
    context,
    state,
    createAdapter: (platform) => createGatewayRunnerAdapter(context, platform),
    runHeartbeat: (reason) => guard.require().control.heartbeat(reason),
    runWatchdog: (reason) => guard.require().control.watchdog(reason),
    observeAdapter: (platform, event) =>
      observeGatewayRunnerAdapter(state, platform, event),
    snapshotState: (reason, limit, filters) =>
      guard.require().recording.snapshotState(reason, limit, filters),
    getRuntimeStatus: () => guard.require().read.runtimeStatus(),
  });

  const api = createGatewayRunnerRuntimeApi({
    controlPlane: assembled.controlPlane,
    readModel: assembled.readModel,
    recording: assembled.recording,
    operations: assembled.operations,
    stateBookkeeping: assembled.stateBookkeeping,
  });

  guard.resolve(api);
  return api;
}
