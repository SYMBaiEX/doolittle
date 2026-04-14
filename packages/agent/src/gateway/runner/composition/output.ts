import type { GatewayRunnerBootstrapResult } from "@/gateway/runner/bootstrap";
import type { GatewayRunnerControlPlane } from "@/gateway/runner/control-plane";
import type { GatewayRunnerOperations } from "@/gateway/runner/operations";
import type { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type { GatewayRunnerRuntimeAssembly } from "./types";

interface GatewayRunnerRuntimeAssemblyOutputInput {
  plane: GatewayRunnerBootstrapResult;
  recording: GatewayRunnerRecording;
  controlPlane: GatewayRunnerControlPlane;
  operations: GatewayRunnerOperations;
}

export function shapeGatewayRunnerRuntimeAssembly({
  plane,
  recording,
  controlPlane,
  operations,
}: GatewayRunnerRuntimeAssemblyOutputInput): GatewayRunnerRuntimeAssembly {
  return {
    snapshotPath: plane.snapshotPath,
    snapshotHistoryPath: plane.snapshotHistoryPath,
    runtimeStatusPath: plane.runtimeStatusPath,
    supervisionPath: plane.supervisionPath,
    inboxPath: plane.inboxPath,
    outboxPath: plane.outboxPath,
    attachmentsPath: plane.attachmentsPath,
    traceLog: plane.traceLog,
    inboxLog: plane.inboxLog,
    outboxLog: plane.outboxLog,
    attachmentLog: plane.attachmentLog,
    supervisionLog: plane.supervisionLog,
    stateBookkeeping: plane.stateBookkeeping,
    readModel: plane.readModel,
    recording,
    controlPlane,
    operations,
  };
}
