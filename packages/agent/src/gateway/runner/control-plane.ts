import type { PlatformName } from "../../types/gateway";
import type { GatewayStateSnapshot } from "../state/state-snapshot/index";
import type {
  GatewaySupervisionDependencies,
  GatewaySupervisionRecord,
} from "../supervision/index";
import {
  runGatewayRestart,
  runGatewayWatch,
  runGatewayWatchdog,
} from "../supervision/index";
import type {
  GatewayRunnerLifecycleHost,
  GatewayRunnerLifecycleHostInputs,
  GatewayRunnerSupervisionHostInputs,
} from "./host";
import {
  buildGatewayRunnerLifecycleHost,
  buildGatewayRunnerSupervisionDeps,
} from "./host";
import { heartbeatGatewayRunner } from "./lifecycle/heartbeat";
import { startGatewayRunnerLifecycle } from "./lifecycle/startup";
import { stopGatewayRunnerLifecycle } from "./lifecycle/stop";

export interface GatewayRunnerControlPlaneDependencies {
  lifecycle: GatewayRunnerLifecycleHostInputs;
  supervision: GatewayRunnerSupervisionHostInputs;
  buildLifecycleHost?: (
    params: GatewayRunnerLifecycleHostInputs,
  ) => GatewayRunnerLifecycleHost;
  buildSupervisionDeps?: (
    params: GatewayRunnerSupervisionHostInputs,
  ) => GatewaySupervisionDependencies;
  runLifecycleStart?: (host: GatewayRunnerLifecycleHost) => Promise<void>;
  runLifecycleStop?: (host: GatewayRunnerLifecycleHost) => Promise<void>;
  runHeartbeat?: (
    host: GatewayRunnerLifecycleHost,
    reason: string,
  ) => Promise<GatewayStateSnapshot>;
  runWatchdog?: (
    deps: GatewaySupervisionDependencies,
    reason: string,
  ) => Promise<GatewaySupervisionRecord[]>;
  runWatch?: (
    deps: GatewaySupervisionDependencies,
    platform: PlatformName | "all",
    reason: string,
  ) => Promise<GatewaySupervisionRecord[]>;
  runRestart?: (
    deps: GatewaySupervisionDependencies,
    platform: PlatformName | "all",
    reason: string,
  ) => Promise<GatewaySupervisionRecord[]>;
}

export interface GatewayRunnerControlPlane {
  start(): Promise<void>;
  stop(): Promise<void>;
  heartbeat(reason?: string): Promise<GatewayStateSnapshot>;
  supervise(reason?: string): Promise<GatewaySupervisionRecord[]>;
  watchdog(reason?: string): Promise<GatewaySupervisionRecord[]>;
  watch(
    platform: PlatformName | "all",
    reason?: string,
  ): Promise<GatewaySupervisionRecord[]>;
  restart(
    platform: PlatformName | "all",
    reason?: string,
  ): Promise<GatewaySupervisionRecord[]>;
}

export function createGatewayRunnerControlPlane(
  params: GatewayRunnerControlPlaneDependencies,
): GatewayRunnerControlPlane {
  const {
    lifecycle,
    supervision,
    buildLifecycleHost = buildGatewayRunnerLifecycleHost,
    buildSupervisionDeps = buildGatewayRunnerSupervisionDeps,
    runLifecycleStart = startGatewayRunnerLifecycle,
    runLifecycleStop = stopGatewayRunnerLifecycle,
    runHeartbeat = heartbeatGatewayRunner,
    runWatchdog = runGatewayWatchdog,
    runWatch = runGatewayWatch,
    runRestart = runGatewayRestart,
  } = params;

  const lifecycleHostBuilder = () => {
    return buildLifecycleHost({
      ...lifecycle,
      runHeartbeat: lifecycle.runHeartbeat,
      runWatchdog: lifecycle.runWatchdog,
    });
  };

  const supervisionDepsBuilder = () => {
    return buildSupervisionDeps({
      ...supervision,
      setLastSupervisionAt: supervision.setLastSupervisionAt,
    });
  };

  let transition:
    | { kind: "start" | "stop"; pending: Promise<void> }
    | undefined;

  function enqueueTransition(
    kind: "start" | "stop",
    run: (host: GatewayRunnerLifecycleHost) => Promise<void>,
  ): Promise<void> {
    if (transition?.kind === kind) return transition.pending;
    const previous = transition?.pending.catch(() => undefined);
    const pending = Promise.resolve(previous)
      .then(() => run(lifecycleHostBuilder()))
      .finally(() => {
        if (transition?.pending === pending) transition = undefined;
      });
    transition = { kind, pending };
    return pending;
  }

  return {
    start(): Promise<void> {
      return enqueueTransition("start", runLifecycleStart);
    },

    stop(): Promise<void> {
      return enqueueTransition("stop", runLifecycleStop);
    },

    heartbeat(reason = "heartbeat"): Promise<GatewayStateSnapshot> {
      return runHeartbeat(lifecycleHostBuilder(), reason);
    },

    async supervise(reason = "manual"): Promise<GatewaySupervisionRecord[]> {
      const deps = supervisionDepsBuilder();
      return runWatchdog(deps, reason);
    },

    async watchdog(reason = "watchdog"): Promise<GatewaySupervisionRecord[]> {
      const deps = supervisionDepsBuilder();
      return runWatchdog(deps, reason);
    },

    async watch(
      platform: PlatformName | "all",
      reason = "manual-watch",
    ): Promise<GatewaySupervisionRecord[]> {
      const deps = supervisionDepsBuilder();
      return runWatch(deps, platform, reason);
    },

    async restart(
      platform: PlatformName | "all",
      reason = "manual",
    ): Promise<GatewaySupervisionRecord[]> {
      const deps = supervisionDepsBuilder();
      return runRestart(deps, platform, reason);
    },
  };
}
