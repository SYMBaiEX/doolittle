import { describe, expect, test } from "vitest";
import { views } from "../desktop-navigation";
import {
  DESKTOP_ROUTE_PRELOADERS,
  DESKTOP_ROUTE_RESOURCE_PREFETCHES,
} from "./DesktopRouteContent";

describe("desktop route preloaders", () => {
  test("covers every application route", () => {
    expect(new Set(Object.keys(DESKTOP_ROUTE_PRELOADERS))).toEqual(views);
    for (const preloader of Object.values(DESKTOP_ROUTE_PRELOADERS)) {
      expect(preloader).toBeTypeOf("function");
    }
  });

  test("warms the default resource keys for latency-sensitive routes", () => {
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.connections).toEqual([
      { path: "/runtime/accounts", dependencies: [true] },
    ]);
    expect(DESKTOP_ROUTE_RESOURCE_PREFETCHES.dashboard).toEqual([
      { path: "/repo/status", dependencies: [true] },
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
});
