import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prefetchApiResource } from "../lib";
import {
  cancelDesktopRouteResourcePrefetchIntent,
  DESKTOP_ROUTE_PREFETCH_DWELL_MS,
  prefetchDesktopRouteResources,
  scheduleDesktopRouteResourcePrefetch,
} from "./desktop-route-prefetch";

vi.mock("../lib", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib")>();
  return {
    ...original,
    prefetchApiResource: vi.fn(async () => undefined),
  };
});

describe("desktop route resource prefetch", () => {
  beforeEach(() => {
    vi.mocked(prefetchApiResource).mockClear();
  });

  afterEach(() => {
    cancelDesktopRouteResourcePrefetchIntent();
    vi.useRealTimers();
  });

  test("warms each resource in a route without inventing a second cache", async () => {
    await prefetchDesktopRouteResources("dashboard");

    expect(prefetchApiResource).toHaveBeenCalledTimes(3);
    expect(prefetchApiResource).toHaveBeenNthCalledWith(1, "/repo/status", [
      true,
      "",
    ]);
    expect(prefetchApiResource).toHaveBeenNthCalledWith(2, "/setup/summary", [
      true,
    ]);
    expect(prefetchApiResource).toHaveBeenNthCalledWith(
      3,
      "/runtime/account-pool",
      [true],
    );
  });

  test("does nothing for routes with no safe default resource", async () => {
    vi.mocked(prefetchApiResource).mockClear();

    await prefetchDesktopRouteResources("chat");

    expect(prefetchApiResource).not.toHaveBeenCalled();
  });

  test("does not call runtime APIs before the runtime is ready", async () => {
    vi.useFakeTimers();

    await prefetchDesktopRouteResources("dashboard", false);
    scheduleDesktopRouteResourcePrefetch("dashboard", false);
    await vi.advanceTimersByTimeAsync(DESKTOP_ROUTE_PREFETCH_DWELL_MS);

    expect(prefetchApiResource).not.toHaveBeenCalled();
  });

  test("uses the active workspace identity for repository status prefetch", async () => {
    await prefetchDesktopRouteResources("dashboard", true, "/work/alpha");

    expect(prefetchApiResource).toHaveBeenNthCalledWith(1, "/repo/status", [
      true,
      "/work/alpha",
    ]);
  });

  test("prefetches degraded diagnostic reads without enabling writes", async () => {
    await prefetchDesktopRouteResources("runtime", "degraded");
    await prefetchDesktopRouteResources("compatibility", "degraded");

    expect(prefetchApiResource).toHaveBeenCalled();
  });

  test("retains phase gating through the dwell timer", async () => {
    vi.useFakeTimers();

    scheduleDesktopRouteResourcePrefetch("dashboard", "degraded");
    await vi.advanceTimersByTimeAsync(DESKTOP_ROUTE_PREFETCH_DWELL_MS);

    expect(prefetchApiResource).not.toHaveBeenCalled();
  });

  test("waits for a sustained intent before warming route data", async () => {
    vi.useFakeTimers();

    scheduleDesktopRouteResourcePrefetch("dashboard");

    await vi.advanceTimersByTimeAsync(DESKTOP_ROUTE_PREFETCH_DWELL_MS - 1);
    expect(prefetchApiResource).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(prefetchApiResource).toHaveBeenCalledTimes(3);
  });

  test("coalesces repeated intents and cancels stale pointer-sweep routes", async () => {
    vi.useFakeTimers();

    scheduleDesktopRouteResourcePrefetch("dashboard");
    scheduleDesktopRouteResourcePrefetch("dashboard");
    await vi.advanceTimersByTimeAsync(DESKTOP_ROUTE_PREFETCH_DWELL_MS / 2);

    scheduleDesktopRouteResourcePrefetch("gateway");
    await vi.advanceTimersByTimeAsync(DESKTOP_ROUTE_PREFETCH_DWELL_MS);

    expect(prefetchApiResource).toHaveBeenCalledTimes(3);
    expect(prefetchApiResource).not.toHaveBeenCalledWith("/repo/status", [
      true,
    ]);
    expect(prefetchApiResource).toHaveBeenNthCalledWith(1, "/gateway/state", [
      true,
    ]);
  });
});
