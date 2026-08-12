import type { View } from "../desktop-navigation";
import { prefetchApiResource } from "../lib";

export interface DesktopRouteResourcePrefetch {
  path: string;
  dependencies: readonly unknown[];
}

/** Default-view resources that are safe and useful to warm before navigation. */
export const DESKTOP_ROUTE_RESOURCE_PREFETCHES: Readonly<
  Partial<Record<View, readonly DesktopRouteResourcePrefetch[]>>
> = {
  activity: [{ path: "/activity?limit=200", dependencies: [true] }],
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
  settings: [
    { path: "/settings", dependencies: [true] },
    { path: "/runtime/accounts", dependencies: [true] },
  ],
  skills: [{ path: "/skills", dependencies: [true] }],
  tools: [{ path: "/tools?profile=full", dependencies: [true, "full"] }],
};

export async function prefetchDesktopRouteResources(view: View): Promise<void> {
  const resources = DESKTOP_ROUTE_RESOURCE_PREFETCHES[view] ?? [];
  await Promise.all(
    resources.map(({ dependencies, path }) =>
      prefetchApiResource(path, dependencies),
    ),
  );
}
