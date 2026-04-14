import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type { PlatformAdapter } from "@/gateway/platforms/base";
import type { GatewayRunnerRuntimeMeta } from "@/gateway/runner/bootstrap";
import type { GatewayPlatformStateView } from "@/gateway/state/state-snapshot";
import type { PlatformName } from "@/types/gateway";

const DEFAULT_DAEMON_STATE: GatewayDaemonState = {
  heartbeatRuns: 0,
  watchdogRuns: 0,
  restartRuns: 0,
  restartRecoveries: 0,
  restartBackoffs: 0,
  watchdogSkips: 0,
};

export class GatewayRunnerRuntimeState {
  readonly adapters = new Map<PlatformName, PlatformAdapter>();
  readonly platformStates = new Map<PlatformName, GatewayPlatformStateView>();
  readonly daemonState: GatewayDaemonState = {
    ...DEFAULT_DAEMON_STATE,
  };
  readonly restartBackoffByPlatform = new Map<
    PlatformName,
    GatewayRestartState
  >();

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private supervisionInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private startedAt?: string;
  private stoppedAt?: string;
  private lastHeartbeatAt?: string;
  private lastSupervisionAt?: string;

  getRunning(): boolean {
    return this.running;
  }

  setRunning(value: boolean): void {
    this.running = value;
  }

  getStartedAt(): string | undefined {
    return this.startedAt;
  }

  setStartedAt(value: string | undefined): void {
    this.startedAt = value;
  }

  getStoppedAt(): string | undefined {
    return this.stoppedAt;
  }

  setStoppedAt(value: string | undefined): void {
    this.stoppedAt = value;
  }

  getLastHeartbeatAt(): string | undefined {
    return this.lastHeartbeatAt;
  }

  setLastHeartbeatAt(value: string | undefined): void {
    this.lastHeartbeatAt = value;
  }

  getHeartbeatInterval(): ReturnType<typeof setInterval> | null {
    return this.heartbeatInterval;
  }

  setHeartbeatInterval(value: ReturnType<typeof setInterval> | null): void {
    this.heartbeatInterval = value;
  }

  getSupervisionInterval(): ReturnType<typeof setInterval> | null {
    return this.supervisionInterval;
  }

  setSupervisionInterval(value: ReturnType<typeof setInterval> | null): void {
    this.supervisionInterval = value;
  }

  getLastSupervisionAt(): string | undefined {
    return this.lastSupervisionAt;
  }

  setLastSupervisionAt(value: string | undefined): void {
    this.lastSupervisionAt = value;
  }

  getWatchdogAt(): string | undefined {
    return this.daemonState.lastWatchdogAt;
  }

  getRuntimeMeta(): GatewayRunnerRuntimeMeta {
    return {
      pid: process.pid,
      running: this.running,
      updatedAt: new Date().toISOString(),
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastWatchdogAt: this.daemonState.lastWatchdogAt,
      lastSupervisionAt: this.lastSupervisionAt,
      adapterPlatforms: Array.from(this.adapters.keys()),
    };
  }
}
