import { type ComponentType, lazy } from "react";
import { renderedViewForView, type View } from "../desktop-navigation";
import {
  cancelDesktopRouteResourcePrefetchIntent,
  prefetchDesktopRouteResources,
  type RouteReadiness,
  scheduleDesktopRouteResourcePrefetch,
} from "./desktop-route-prefetch";

type DesktopRouteComponent = ComponentType<Record<string, unknown>>;

function lazyRoute<Module, Props extends object>(
  load: () => Promise<Module>,
  page: (module: Module) => ComponentType<Props>,
) {
  // The shell supplies the props for each route in DesktopRouteContent.
  const loader = async () => ({
    default: page(await load()) as unknown as DesktopRouteComponent,
  });
  return { load: loader, component: lazy(loader) };
}

const routes = {
  dashboard: lazyRoute(
    () => import("../DashboardPage"),
    (page) => page.DashboardPage,
  ),
  chat: lazyRoute(
    () => import("../ChatPage"),
    (page) => page.ChatPage,
  ),
  code: lazyRoute(
    () => import("../CodingWorkspacePage"),
    (page) => page.CodingWorkspacePage,
  ),
  orchestration: lazyRoute(
    () => import("../OrchestrationPage"),
    (page) => page.OrchestrationPage,
  ),
  analytics: lazyRoute(
    () => import("../analytics/AnalyticsPage"),
    (page) => page.AnalyticsPage,
  ),
  activity: lazyRoute(
    () => import("../ActivityPage"),
    (page) => page.ActivityPage,
  ),
  settings: lazyRoute(
    () => import("../SettingsPage"),
    (page) => page.SettingsPage,
  ),
};

export function getDesktopRouteComponent(view: View): DesktopRouteComponent {
  return routes[renderedViewForView(view)].component;
}

/** Replace a rejected lazy component so the user can retry its chunk. */
export function resetDesktopRoute(view: View): void {
  const route = routes[renderedViewForView(view)];
  route.component = lazy(route.load);
}

/** Warm the route module and its first-view resources once navigation commits. */
export async function warmDesktopRoute(
  view: View,
  runtimeReady: RouteReadiness = true,
  workspacePath = "",
): Promise<void> {
  cancelDesktopRouteResourcePrefetchIntent();
  await Promise.all([
    routes[renderedViewForView(view)].load(),
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
  void routes[renderedViewForView(view)].load().catch(() => undefined);
  scheduleDesktopRouteResourcePrefetch(view, runtimeReady, workspacePath);
}
