import type { BackendPhase } from "../../shared/contracts";
import type { View } from "../desktop-navigation";

export interface DesktopRouteCapabilities {
  /** Route chunks are safe to load even while the local runtime is booting. */
  readonly modulePreload: true;
  /** API data is safe when ready, or for degraded diagnostics in read-only mode. */
  readonly apiRead: boolean;
  /** Runtime diagnostics can remain visible while the runtime is degraded. */
  readonly diagnosticsReadOnly: boolean;
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
    modulePreload: true,
    apiRead: ready || diagnosticsReadOnly,
    diagnosticsReadOnly,
    writes: ready,
  };
}

/** Renderable route state, including degraded read-only diagnostics. */
export function canRenderDesktopRoute(
  view: View,
  phase: BackendPhase,
): boolean {
  const capabilities = desktopRouteCapabilities(view, phase);
  return capabilities.apiRead || capabilities.diagnosticsReadOnly;
}
