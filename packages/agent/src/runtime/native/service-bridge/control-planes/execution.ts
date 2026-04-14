import { getNativeExecutionControlPlaneDetails } from "../native-execution-control-plane";
import { getNativePlanningControlPlane } from "./planning";
import type { RuntimeLike } from "./types";

export function getNativeExecutionControlPlane(runtime: RuntimeLike) {
  return getNativeExecutionControlPlaneDetails(
    runtime,
    getNativePlanningControlPlane(runtime),
  );
}
