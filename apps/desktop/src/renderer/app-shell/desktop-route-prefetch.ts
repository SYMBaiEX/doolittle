import type { BackendPhase } from "../../shared/contracts";
import type { View } from "../desktop-navigation";
import { prefetchApiResource } from "../lib";
import {
  type DesktopRouteCapabilities,
  desktopRouteCapabilities,
} from "./desktop-route-capabilities";

/**
 * Keep exploratory data prefetch behind a short, stable intent dwell. Route
 * module chunks still preload immediately, but API resources wait long enough
 * to filter out pointer sweeps across the sidebar.
 */
export const DESKTOP_ROUTE_PREFETCH_DWELL_MS = 180;

export interface DesktopRouteResourcePrefetch {
  path: string;
  dependencies: readonly unknown[];
}

/** Default-view resources that are safe and useful to warm before navigation. */
export const DESKTOP_ROUTE_RESOURCE_PREFETCHES: Readonly<
  Partial<Record<View, readonly DesktopRouteResourcePrefetch[]>>
> = {
  activity: [{ path: "/activity?limit=200", dependencies: [true] }],
  analytics: [{ path: "/analytics", dependencies: [true] }],
  automations: [{ path: "/cron/jobs", dependencies: [true] }],
  browser: [{ path: "/browser/status", dependencies: [true] }],
  compatibility: [{ path: "/runtime/compatibility", dependencies: [true] }],
  connections: [{ path: "/runtime/accounts", dependencies: [true] }],
  dashboard: [
    { path: "/repo/status", dependencies: [true] },
    { path: "/setup/summary", dependencies: [true] },
    { path: "/runtime/account-pool", dependencies: [true] },
  ],
  gateway: [
    { path: "/gateway/state", dependencies: [true] },
    { path: "/gateway/inbox?limit=25", dependencies: [true] },
    { path: "/gateway/outbox?limit=25", dependencies: [true] },
  ],
  keys: [{ path: "/secrets", dependencies: [true] }],
  logs: [{ path: "/logs?limit=500", dependencies: [true, "all", ""] }],
  memory: [{ path: "/memory?target=memory", dependencies: [true] }],
  models: [
    { path: "/settings", dependencies: [true] },
    {
      path: "/runtime/models?refresh=false",
      dependencies: [true, false],
    },
  ],
  operatorSetup: [
    { path: "/setup/summary", dependencies: [true] },
    { path: "/runtime/account-pool", dependencies: [true] },
  ],
  plugins: [{ path: "/runtime/plugins?view=catalog", dependencies: [true] }],
  profiles: [{ path: "/personality", dependencies: [true] }],
  registry: [
    {
      path: "/runtime/registry",
      dependencies: [true, "", undefined],
    },
  ],
  runtime: [
    { path: "/runtime/status", dependencies: [true] },
    { path: "/runtime/account-pool", dependencies: [true] },
    { path: "/autonomy/status", dependencies: [true] },
  ],
  settings: [{ path: "/settings", dependencies: [true] }],
  skills: [{ path: "/skills", dependencies: [true] }],
  tools: [{ path: "/tools?profile=full", dependencies: [true, "full"] }],
};

interface DesktopRoutePrefetchIntent {
  view: View;
  timer?: ReturnType<typeof setTimeout>;
}

let pendingDesktopRoutePrefetchIntent: DesktopRoutePrefetchIntent | null = null;

export type RouteReadiness = boolean | BackendPhase | DesktopRouteCapabilities;

function canPrefetchRouteResources(
  view: View,
  readiness: RouteReadiness,
): boolean {
  if (typeof readiness === "boolean") return readiness;
  if (typeof readiness === "string") {
    return desktopRouteCapabilities(view, readiness).apiRead;
  }
  return readiness.apiRead;
}

/** Cancel the currently pending exploratory resource prefetch, if any. */
export function cancelDesktopRouteResourcePrefetchIntent(): void {
  const intent = pendingDesktopRoutePrefetchIntent;
  if (intent?.timer !== undefined) clearTimeout(intent.timer);
  pendingDesktopRoutePrefetchIntent = null;
}

/**
 * Queue resource prefetch for a sustained route intent. Only the latest route
 * owns the dwell timer, so sweeping across many routes cannot fan out API
 * requests. Committed navigation uses `prefetchDesktopRouteResources`
 * directly and remains immediate.
 */
export function scheduleDesktopRouteResourcePrefetch(
  view: View,
  runtimeReady: RouteReadiness = true,
): void {
  if (!canPrefetchRouteResources(view, runtimeReady)) {
    cancelDesktopRouteResourcePrefetchIntent();
    return;
  }
  if (pendingDesktopRoutePrefetchIntent?.view === view) return;

  cancelDesktopRouteResourcePrefetchIntent();
  if (!(DESKTOP_ROUTE_RESOURCE_PREFETCHES[view]?.length ?? 0)) return;

  const intent: DesktopRoutePrefetchIntent = { view };
  intent.timer = setTimeout(() => {
    if (pendingDesktopRoutePrefetchIntent !== intent) return;
    pendingDesktopRoutePrefetchIntent = null;
    void prefetchDesktopRouteResources(view, runtimeReady).catch(
      () => undefined,
    );
  }, DESKTOP_ROUTE_PREFETCH_DWELL_MS);
  pendingDesktopRoutePrefetchIntent = intent;
}

export async function prefetchDesktopRouteResources(
  view: View,
  runtimeReady: RouteReadiness = true,
): Promise<void> {
  if (!canPrefetchRouteResources(view, runtimeReady)) return;
  const resources = DESKTOP_ROUTE_RESOURCE_PREFETCHES[view] ?? [];
  await Promise.all(
    resources.map(({ dependencies, path }) =>
      prefetchApiResource(path, dependencies),
    ),
  );
}
