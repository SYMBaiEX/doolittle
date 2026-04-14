import { assembleGatewayRunnerOperations } from "./operations";
import { shapeGatewayRunnerRuntimeAssembly } from "./output";
import { assembleGatewayRunnerReadPlane } from "./read-plane";
import type {
  GatewayRunnerRuntimeAssembly,
  GatewayRunnerRuntimeAssemblyFactories,
  GatewayRunnerRuntimeAssemblyInput,
} from "./types";
import {
  assembleGatewayRunnerControlPlane,
  assembleGatewayRunnerRecording,
} from "./wiring";

export function composeGatewayRunnerRuntime(
  input: GatewayRunnerRuntimeAssemblyInput &
    GatewayRunnerRuntimeAssemblyFactories,
): GatewayRunnerRuntimeAssembly {
  const { buildReadPlane, buildOperations, buildControlPlane, buildRecording } =
    input;

  const { plane, operationsDelegate } = assembleGatewayRunnerReadPlane(
    input,
    buildReadPlane,
  );
  const recording = assembleGatewayRunnerRecording({
    input,
    plane,
    buildRecording,
  });
  const operations = assembleGatewayRunnerOperations({
    input,
    recording,
    operationsDelegate,
    buildOperations,
  });
  const controlPlane = assembleGatewayRunnerControlPlane({
    input,
    plane,
    recording,
    buildControlPlane,
  });

  return shapeGatewayRunnerRuntimeAssembly({
    plane,
    recording,
    controlPlane,
    operations,
  });
}
