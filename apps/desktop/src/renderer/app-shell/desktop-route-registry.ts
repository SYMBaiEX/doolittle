import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import { type View, views } from "../desktop-navigation";
import {
  cancelDesktopRouteResourcePrefetchIntent,
  prefetchDesktopRouteResources,
  type RouteReadiness,
  scheduleDesktopRouteResourcePrefetch,
} from "./desktop-route-prefetch";

type RouteLoader = () => Promise<unknown>;
type RegisteredRouteProps = Record<string, unknown>;
type ComponentExportKey<Module> = {
  [Key in keyof Module]-?: Module[Key] extends ComponentType<infer _Props>
    ? Key
    : never;
}[keyof Module];
type RouteComponent<Module, Key extends keyof Module> =
  Module[Key] extends ComponentType<infer Props> ? ComponentType<Props> : never;

const registeredRouteLoaders: Partial<Record<View, RouteLoader>> = {};
const registeredRouteComponents: Partial<
  Record<View, ComponentType<RegisteredRouteProps>>
> = {};
const registeredRouteResetters: Partial<Record<View, () => void>> = {};

/** Register lazy rendering and module preloading from one loader declaration. */
function lazyNamedRoute<Module extends object, Key extends keyof Module>(
  routeViews: readonly View[],
  load: () => Promise<Module>,
  exportName: Key & ComponentExportKey<Module>,
): LazyExoticComponent<RouteComponent<Module, Key>> {
  const createComponent = () =>
    lazy(async () => {
      const module = await load();
      const component = module[exportName];
      if (typeof component !== "function") {
        throw new Error(
          `Missing route component export: ${String(exportName)}`,
        );
      }
      return { default: component } as {
        default: RouteComponent<Module, Key>;
      };
    });
  const component = createComponent();
  const reset = () => {
    const nextComponent =
      createComponent() as unknown as ComponentType<RegisteredRouteProps>;
    for (const view of routeViews) {
      registeredRouteComponents[view] = nextComponent;
    }
  };
  for (const view of routeViews) {
    registeredRouteLoaders[view] = load;
    registeredRouteComponents[view] =
      component as unknown as ComponentType<RegisteredRouteProps>;
    registeredRouteResetters[view] = reset;
  }
  return component;
}

/** Return the current route component, including any post-failure reset. */
export function getDesktopRouteComponent(
  view: View,
): ComponentType<RegisteredRouteProps> {
  const component = registeredRouteComponents[view];
  if (!component) throw new Error(`Missing desktop route component: ${view}`);
  return component;
}

/** Replace a rejected lazy component so a user retry can request its chunk again. */
export function resetDesktopRoute(view: View): void {
  registeredRouteResetters[view]?.();
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
export async function warmDesktopRoute(
  view: View,
  runtimeReady: RouteReadiness = true,
  workspacePath = "",
): Promise<void> {
  cancelDesktopRouteResourcePrefetchIntent();
  await Promise.all([
    DESKTOP_ROUTE_PRELOADERS[view](),
    prefetchDesktopRouteResources(view, runtimeReady, workspacePath),
  ]);
}

/**
 * Preload the route module immediately for exploratory focus and hover intent.
 * Resource data waits for a sustained dwell, preventing incidental API bursts.
 */
export function preloadDesktopRoute(
  view: View,
  runtimeReady: RouteReadiness = true,
  workspacePath = "",
): void {
  void DESKTOP_ROUTE_PRELOADERS[view]().catch(() => undefined);
  scheduleDesktopRouteResourcePrefetch(view, runtimeReady, workspacePath);
}
