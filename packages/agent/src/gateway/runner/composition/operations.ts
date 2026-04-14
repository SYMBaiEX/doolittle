import {
  createGatewayRunnerOperations,
  type GatewayRunnerOperations,
} from "@/gateway/runner/operations";
import type { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type { GatewayRunnerOperationsDelegate } from "./operations-delegate";
import type {
  GatewayRunnerRuntimeAssemblyFactories,
  GatewayRunnerRuntimeAssemblyInput,
} from "./types";

interface GatewayRunnerOperationsAssemblyInput {
  input: GatewayRunnerRuntimeAssemblyInput;
  recording: GatewayRunnerRecording;
  operationsDelegate: GatewayRunnerOperationsDelegate;
  buildOperations?: GatewayRunnerRuntimeAssemblyFactories["buildOperations"];
}

export function assembleGatewayRunnerOperations({
  input,
  recording,
  operationsDelegate,
  buildOperations = createGatewayRunnerOperations,
}: GatewayRunnerOperationsAssemblyInput): GatewayRunnerOperations {
  const {
    context,
    adapters,
    snapshotState,
    observeAdapter,
    getOutboxSessionIdByDeliveryId,
  } = input;

  const operations = buildOperations({
    context,
    adapters,
    recording,
    snapshotState: (reason, limit?: number) =>
      snapshotState(reason, limit) as Promise<unknown>,
    observeAdapter,
    getOutboxSessionIdByDeliveryId,
  });

  operationsDelegate.set(operations);
  return operations;
}
