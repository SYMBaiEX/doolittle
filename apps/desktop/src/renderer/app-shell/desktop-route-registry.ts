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
  ["chat", "sessions", "media"],
  () => import("../ChatPage"),
  "ChatPage",
);
export const CodingWorkspacePage = lazyNamedRoute(
  ["code", "browser"],
  () => import("../CodingWorkspacePage"),
  "CodingWorkspacePage",
);
export const OrchestrationPage = lazyNamedRoute(
  ["gateway", "review", "orchestration", "automations"],
  () => import("../OrchestrationPage"),
  "OrchestrationPage",
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
export const SettingsPage = lazyNamedRoute(
  [
    "settings",
    "models",
    "connections",
    "tools",
    "skills",
    "plugins",
    "memory",
    "profiles",
    "logs",
    "keys",
    "docs",
    "runtime",
    "compatibility",
    "registry",
    "operatorSetup",
  ],
  () => import("../SettingsPage"),
  "SettingsPage",
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
