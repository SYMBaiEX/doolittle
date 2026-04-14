import type { GatewayRunnerBootstrapResult } from "@/gateway/runner/bootstrap";
import { createGatewayRunnerControlPlane } from "@/gateway/runner/control-plane";
import { GatewayRunnerRecording } from "@/gateway/runner/recording";
import {
  buildGatewayRunnerControlPlaneDependencies,
  buildGatewayRunnerRecordingDeps,
} from "./builders";
import type {
  GatewayRunnerRuntimeAssemblyFactories,
  GatewayRunnerRuntimeAssemblyInput,
} from "./types";

interface GatewayRunnerRecordingAssemblyInput {
  input: GatewayRunnerRuntimeAssemblyInput;
  plane: GatewayRunnerBootstrapResult;
  buildRecording?: GatewayRunnerRuntimeAssemblyFactories["buildRecording"];
}

interface GatewayRunnerControlPlaneAssemblyInput {
  input: GatewayRunnerRuntimeAssemblyInput;
  plane: GatewayRunnerBootstrapResult;
  recording: GatewayRunnerRecording;
  buildControlPlane?: GatewayRunnerRuntimeAssemblyFactories["buildControlPlane"];
}

export function assembleGatewayRunnerRecording({
  input,
  plane,
  buildRecording = (deps) => new GatewayRunnerRecording(deps),
}: GatewayRunnerRecordingAssemblyInput): GatewayRunnerRecording {
  return buildRecording(
    buildGatewayRunnerRecordingDeps(plane, input.getRuntimeStatus),
  );
}

export function assembleGatewayRunnerControlPlane({
  input,
  plane,
  recording,
  buildControlPlane = createGatewayRunnerControlPlane,
}: GatewayRunnerControlPlaneAssemblyInput) {
  return buildControlPlane(
    buildGatewayRunnerControlPlaneDependencies(input, plane, recording),
  );
}
