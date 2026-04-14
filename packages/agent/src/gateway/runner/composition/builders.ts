import type { GatewayRunnerBootstrapResult } from "@/gateway/runner/bootstrap";
import type { GatewayRunnerControlPlaneDependencies } from "@/gateway/runner/control-plane";
import type {
  GatewayRunnerRecording,
  GatewayRunnerRecordingDeps,
} from "@/gateway/runner/recording";
import type { GatewayRunnerRuntimeAssemblyInput } from "./types";

export function buildGatewayRunnerRecordingDeps(
  plane: GatewayRunnerBootstrapResult,
  getRuntimeStatus: GatewayRunnerRuntimeAssemblyInput["getRuntimeStatus"],
): GatewayRunnerRecordingDeps {
  return {
    traceLog: plane.traceLog,
    inboxLog: plane.inboxLog,
    outboxLog: plane.outboxLog,
    attachmentLog: plane.attachmentLog,
    supervisionLog: plane.supervisionLog,
    inboxPath: plane.inboxPath,
    outboxPath: plane.outboxPath,
    attachmentsPath: plane.attachmentsPath,
    runtimeStatusPath: plane.runtimeStatusPath,
    supervisionPath: plane.supervisionPath,
    ensurePlatformState: plane.stateBookkeeping.ensurePlatformState.bind(
      plane.stateBookkeeping,
    ),
    updatePlatformStateFromTrace:
      plane.stateBookkeeping.updatePlatformStateFromTrace.bind(
        plane.stateBookkeeping,
      ),
    getRuntimeStatus,
  };
}

export function buildGatewayRunnerControlPlaneDependencies(
  input: GatewayRunnerRuntimeAssemblyInput,
  plane: GatewayRunnerBootstrapResult,
  recording: Pick<
    GatewayRunnerRecording,
    "pushTrace" | "writeRuntimeStatus" | "recordSupervision"
  >,
): GatewayRunnerControlPlaneDependencies {
  const {
    context,
    adapters,
    daemonState,
    isRunning,
    setRunning,
    getStartedAt,
    setStartedAt,
    getStoppedAt,
    setStoppedAt,
    getLastHeartbeatAt,
    setLastHeartbeatAt,
    getHeartbeatInterval,
    setHeartbeatInterval,
    getSupervisionInterval,
    setSupervisionInterval,
    createAdapter,
    runHeartbeat,
    runWatchdog,
    observeAdapter,
    snapshotState,
    setLastSupervisionAt,
  } = input;

  return {
    lifecycle: {
      context,
      adapters,
      daemonState,
      getRunning: isRunning,
      setRunning,
      getStartedAt,
      setStartedAt,
      getStoppedAt,
      setStoppedAt,
      getLastHeartbeatAt,
      setLastHeartbeatAt,
      getHeartbeatInterval,
      setHeartbeatInterval,
      getSupervisionInterval,
      setSupervisionInterval,
      createAdapter,
      ensureRestartState: plane.stateBookkeeping.ensureRestartState.bind(
        plane.stateBookkeeping,
      ),
      syncPlatformStateFromHealth:
        plane.stateBookkeeping.syncPlatformStateFromHealth.bind(
          plane.stateBookkeeping,
        ),
      pushTrace: recording.pushTrace.bind(recording),
      observeAdapter,
      writeRuntimeStatus: recording.writeRuntimeStatus.bind(recording),
      snapshotState: (reason: string, limit: number) =>
        snapshotState(reason, limit),
      runHeartbeat,
      runWatchdog,
    },
    supervision: {
      adapters,
      daemonState,
      stateBookkeeping: {
        ensureRestartState: plane.stateBookkeeping.ensureRestartState.bind(
          plane.stateBookkeeping,
        ),
        ensurePlatformState: plane.stateBookkeeping.ensurePlatformState.bind(
          plane.stateBookkeeping,
        ),
      },
      recording: {
        recordSupervision: recording.recordSupervision.bind(recording),
        pushTrace: recording.pushTrace.bind(recording),
      },
      setLastSupervisionAt,
      observeAdapter,
      writeRuntimeStatus: recording.writeRuntimeStatus.bind(recording),
      snapshotState: (reason: string, limit?: number) =>
        snapshotState(reason, limit),
    },
  };
}
