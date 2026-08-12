import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import { type View, views } from "../desktop-navigation";
import {
  cancelDesktopRouteResourcePrefetchIntent,
  prefetchDesktopRouteResources,
  scheduleDesktopRouteResourcePrefetch,
} from "./desktop-route-prefetch";

type RouteLoader = () => Promise<unknown>;
type ComponentExportKey<Module> = {
  [Key in keyof Module]-?: Module[Key] extends ComponentType<infer _Props>
    ? Key
    : never;
}[keyof Module];
type RouteComponent<Module, Key extends keyof Module> =
  Module[Key] extends ComponentType<infer Props> ? ComponentType<Props> : never;

const registeredRouteLoaders: Partial<Record<View, RouteLoader>> = {};

/** Register lazy rendering and module preloading from one loader declaration. */
function lazyNamedRoute<Module extends object, Key extends keyof Module>(
  routeViews: readonly View[],
  load: () => Promise<Module>,
  exportName: Key & ComponentExportKey<Module>,
): LazyExoticComponent<RouteComponent<Module, Key>> {
  for (const view of routeViews) registeredRouteLoaders[view] = load;
  return lazy(async () => {
    const module = await load();
    const component = module[exportName];
    if (typeof component !== "function") {
      throw new Error(`Missing route component export: ${String(exportName)}`);
    }
    return { default: component } as {
      default: RouteComponent<Module, Key>;
    };
  });
}

export const DashboardPage = lazyNamedRoute(
  ["dashboard"],
  () => import("../DashboardPage"),
  "DashboardPage",
);
export const ChatPage = lazyNamedRoute(
  ["chat"],
  () => import("../ChatPage"),
  "ChatPage",
);
export const CodingWorkspacePage = lazyNamedRoute(
  ["code"],
  () => import("../CodingWorkspacePage"),
  "CodingWorkspacePage",
);
export const BrowserPage = lazyNamedRoute(
  ["browser"],
  () => import("../BrowserPage"),
  "BrowserPage",
);
export const GatewayPage = lazyNamedRoute(
  ["gateway"],
  () => import("../GatewayPage"),
  "GatewayPage",
);
export const OrchestrationPage = lazyNamedRoute(
  ["review", "orchestration"],
  () => import("../OrchestrationPage"),
  "OrchestrationPage",
);
export const SessionsPage = lazyNamedRoute(
  ["sessions"],
  () => import("../sessions/SessionsPage"),
  "SessionsPage",
);
export const AnalyticsPage = lazyNamedRoute(
  ["analytics"],
  () => import("../analytics/AnalyticsPage"),
  "AnalyticsPage",
);
export const ActivityPage = lazyNamedRoute(
  ["activity"],
  () => import("../ActivityPage"),
  "ActivityPage",
);
export const MediaPage = lazyNamedRoute(
  ["media"],
  () => import("../MediaPage"),
  "MediaPage",
);
export const MemoryPage = lazyNamedRoute(
  ["memory"],
  () => import("../MemoryPage"),
  "MemoryPage",
);
export const ModelsPage = lazyNamedRoute(
  ["models"],
  () => import("../ModelsPage"),
  "ModelsPage",
);
export const ConnectionsPage = lazyNamedRoute(
  ["connections"],
  () => import("../ConnectionsPage"),
  "ConnectionsPage",
);
export const ToolsPage = lazyNamedRoute(
  ["tools"],
  () => import("../ToolsPage"),
  "ToolsPage",
);
export const SkillsPage = lazyNamedRoute(
  ["skills"],
  () => import("../SkillsPage"),
  "SkillsPage",
);
export const PluginsPage = lazyNamedRoute(
  ["plugins"],
  () => import("../PluginsPage"),
  "PluginsPage",
);
export const ProfilesPage = lazyNamedRoute(
  ["profiles"],
  () => import("../ProfilesPage"),
  "ProfilesPage",
);
export const AutomationsPage = lazyNamedRoute(
  ["automations"],
  () => import("../AutomationsPage"),
  "AutomationsPage",
);
export const LogsPage = lazyNamedRoute(
  ["logs"],
  () => import("../LogsPage"),
  "LogsPage",
);
export const SettingsPage = lazyNamedRoute(
  ["settings"],
  () => import("../SettingsPage"),
  "SettingsPage",
);
export const KeysPage = lazyNamedRoute(
  ["keys"],
  () => import("../KeysPage"),
  "KeysPage",
);
export const DocsPage = lazyNamedRoute(
  ["docs"],
  () => import("../DocsPage"),
  "DocsPage",
);
export const RuntimePage = lazyNamedRoute(
  ["runtime"],
  () => import("../RuntimePage"),
  "RuntimePage",
);
export const CompatibilityPage = lazyNamedRoute(
  ["compatibility"],
  () => import("../CompatibilityPage"),
  "CompatibilityPage",
);
export const RegistryPage = lazyNamedRoute(
  ["registry"],
  () => import("../RegistryPage"),
  "RegistryPage",
);
export const SetupPage = lazyNamedRoute(
  ["operatorSetup"],
  () => import("../SetupPage"),
  "SetupPage",
);

function completeRouteLoaderRegistry(): Readonly<Record<View, RouteLoader>> {
  for (const view of views) {
    if (!registeredRouteLoaders[view]) {
      throw new Error(`Missing desktop route loader: ${view}`);
    }
  }
  return registeredRouteLoaders as Record<View, RouteLoader>;
}

export const DESKTOP_ROUTE_PRELOADERS = completeRouteLoaderRegistry();

/** Warm the route module and its first-view resources once navigation commits. */
export async function warmDesktopRoute(view: View): Promise<void> {
  cancelDesktopRouteResourcePrefetchIntent();
  await Promise.all([
    DESKTOP_ROUTE_PRELOADERS[view](),
    prefetchDesktopRouteResources(view),
  ]);
}

/**
 * Preload the route module immediately for exploratory focus and hover intent.
 * Resource data waits for a sustained dwell, preventing incidental API bursts.
 */
export function preloadDesktopRoute(view: View): void {
  void DESKTOP_ROUTE_PRELOADERS[view]().catch(() => undefined);
  scheduleDesktopRouteResourcePrefetch(view);
}
