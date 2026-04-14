import { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";
import type { OperatorRuntimeSummaryDependencies } from "./types";

export function resolveOwnership(
  dependencies: OperatorRuntimeSummaryDependencies,
) {
  return (
    dependencies.nativeOwnership?.controlPlane() ??
    (dependencies.runtime
      ? getNativeOwnershipControlPlane(
          dependencies.runtime,
          undefined,
          dependencies.config,
          dependencies.diagnostics.currentGatewayConfig(),
        )
      : undefined)
  );
}
