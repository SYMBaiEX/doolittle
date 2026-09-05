import type { BackendPhase } from "../../shared/contracts";
import type { View } from "../desktop-navigation";

export interface DesktopRouteCapabilities {
  /** API data is safe when ready, or for degraded diagnostics in read-only mode. */
  readonly apiRead: boolean;
  /** Mutations are disabled until the runtime is ready. */
  readonly writes: boolean;
}

const DIAGNOSTIC_ROUTES = new Set<View>(["runtime", "compatibility"]);

export function desktopRouteCapabilities(
  view: View,
  phase: BackendPhase,
): DesktopRouteCapabilities {
  const ready = phase === "ready";
  const diagnosticsReadOnly =
    DIAGNOSTIC_ROUTES.has(view) && phase === "degraded";
  return {
    apiRead: ready || diagnosticsReadOnly,
    writes: ready,
  };
}
