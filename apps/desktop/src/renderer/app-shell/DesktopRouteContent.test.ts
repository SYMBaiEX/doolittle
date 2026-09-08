import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { views } from "../desktop-navigation";
import {
  cancelDesktopRouteResourcePrefetchIntent,
  DESKTOP_ROUTE_RESOURCE_PREFETCHES,
} from "./desktop-route-prefetch";
import {
  DESKTOP_ROUTE_PRELOADERS,
  getDesktopRouteComponent,
  preloadDesktopRoute,
  resetDesktopRoute,
} from "./desktop-route-registry";

const routeRegistrySource = readFileSync(
  new URL("./desktop-route-registry.ts", import.meta.url),
  "utf8",
);
const routeContentSource = readFileSync(
  new URL("./DesktopRouteContent.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("desktop route preloaders", () => {
  test("covers every application route", () => {
    expect(new Set(Object.keys(DESKTOP_ROUTE_PRELOADERS))).toEqual(views);
    for (const preloader of Object.values(DESKTOP_ROUTE_PRELOADERS)) {
      expect(preloader).toBeTypeOf("function");
    }
  });

  test("replaces a rejected lazy component so route retry can re-request it", () => {
    const before = getDesktopRouteComponent("connections");

    resetDesktopRoute("connections");

    expect(getDesktopRouteComponent("connections")).not.toBe(before);
  });

  test("registers each consolidated destination owner for every contextual alias", () => {
    expect(DESKTOP_ROUTE_PRELOADERS.chat).toBe(
      DESKTOP_ROUTE_PRELOADERS.sessions,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.chat).toBe(DESKTOP_ROUTE_PRELOADERS.media);
    expect(DESKTOP_ROUTE_PRELOADERS.code).toBe(
      DESKTOP_ROUTE_PRELOADERS.browser,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.orchestration).toBe(
      DESKTOP_ROUTE_PRELOADERS.gateway,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.orchestration).toBe(
      DESKTOP_ROUTE_PRELOADERS.automations,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.settings).toBe(
      DESKTOP_ROUTE_PRELOADERS.connections,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.settings).toBe(
      DESKTOP_ROUTE_PRELOADERS.operatorSetup,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.dashboard).not.toBe(
      DESKTOP_ROUTE_PRELOADERS.activity,
    );
    expect(DESKTOP_ROUTE_PRELOADERS.dashboard).not.toBe(
      DESKTOP_ROUTE_PRELOADERS.analytics,
    );
  });

  test("resets the owner lazy component for every contextual alias", () => {
    const before = getDesktopRouteComponent("sessions");

    resetDesktopRoute("media");

    expect(getDesktopRouteComponent("chat")).not.toBe(before);
    expect(getDesktopRouteComponent("sessions")).toBe(
      getDesktopRouteComponent("media"),
    );
  });

  test("warms the default resource keys for latency-sensitive routes", () => {
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.connections).toEqual([
      { path: "/runtime/accounts", dependencies: [true] },
    ]);
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.settings).toEqual([
      { path: "/settings", dependencies: [true] },
    ]);
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.analytics).toEqual([
      { path: "/analytics", dependencies: [true] },
    ]);
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.dashboard).toEqual([
      { path: "/repo/status", dependencies: [true], workspaceScoped: true },
      { path: "/setup/summary", dependencies: [true] },
      { path: "/runtime/account-pool", dependencies: [true] },
    ]);
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.gateway).toEqual([
      { path: "/gateway/state", dependencies: [true] },
      { path: "/gateway/inbox?limit=25", dependencies: [true] },
      { path: "/gateway/outbox?limit=25", dependencies: [true] },
    ]);
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.runtime).toEqual([
      { path: "/runtime/status", dependencies: [true] },
      { path: "/runtime/account-pool", dependencies: [true] },
      { path: "/autonomy/status", dependencies: [true] },
    ]);

    for (const resources of Object.values(DESKTOP_ROUTE_RESOURCE_PREFETCHES)) {
      for (const resource of resources ?? []) {
        expect(resource.path).toMatch(/^\//u);
        expect(Array.isArray(resource.dependencies)).toBe(true);
      }
    }
  });

  test("keeps exploratory route preloads intent-gated for runtime data", () => {
    expect(routeRegistrySource).toContain(
      "void DESKTOP_ROUTE_PRELOADERS[view]().catch(() => undefined)",
    );
    expect(routeRegistrySource).toContain(
      "scheduleDesktopRouteResourcePrefetch(view, runtimeReady, workspacePath)",
    );
    expect(routeRegistrySource).not.toMatch(
      /function preloadDesktopRoute[\s\S]*?warmDesktopRoute\(view\)/u,
    );
    expect(() => preloadDesktopRoute("dashboard")).not.toThrow();
    cancelDesktopRouteResourcePrefetchIntent();
  });

  test("derives route activity from the shared backend capability policy", () => {
    expect(routeContentSource).toContain("desktopRouteCapabilities");
    expect(routeContentSource).toContain(
      "const active = routeCapabilities.apiRead;",
    );
  });

  test("uses stable destination owners for contextual sections", () => {
    expect(routeContentSource).toContain("settingsSectionForView(view)");
    expect(routeContentSource).toContain("renderedViewForView(view)");
    expect(routeContentSource).toContain("settingsViewForSection(section)");
    expect(routeContentSource).toContain('case "models":');
    expect(routeContentSource).toContain('case "connections":');
    expect(routeContentSource).toContain('case "sessions":');
    expect(routeContentSource).toContain('case "media":');
    expect(routeContentSource).toContain('case "browser":');
    expect(routeContentSource).toContain('surface={view === "browser"');
    expect(routeContentSource).toContain("requestedTab={");
  });

  test("keeps Work tabs compatible with their standalone legacy routes", () => {
    expect(routeContentSource).toContain('section === "review"');
    expect(routeContentSource).toContain('section === "automations"');
    expect(routeContentSource).toContain('section === "inbox"');
    expect(routeContentSource).toContain('"automations"');
    expect(routeContentSource).toContain('"gateway"');
    expect(routeContentSource).toContain('"orchestration"');
  });

  test("keeps the Chat stream owner mounted behind other routes", () => {
    expect(appSource).toContain(
      'const chatRouteActive = renderedView === "chat";',
    );
    expect(appSource).toContain(
      'const persistentChatView: View = chatRouteActive ? view : "chat";',
    );
    expect(appSource).toContain("hidden={!chatRouteActive}");
    expect(appSource).toContain("inert={!chatRouteActive}");
    expect(appSource).toContain(
      "data-view={chatRouteActive ? persistentChatView : undefined}",
    );
    expect(appSource).toContain("{routeContent(persistentChatView)}");
    expect(appSource).toContain("{!chatRouteActive ? (");
  });
});
