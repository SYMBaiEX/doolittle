import { describe, expect, test, vi } from "vitest";
import { prefetchApiResource } from "../lib";
import { prefetchDesktopRouteResources } from "./desktop-route-prefetch";

vi.mock("../lib", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib")>();
  return {
    ...original,
    prefetchApiResource: vi.fn(async () => undefined),
  };
});

describe("desktop route resource prefetch", () => {
  test("warms each resource in a route without inventing a second cache", async () => {
    await prefetchDesktopRouteResources("dashboard");

    expect(prefetchApiResource).toHaveBeenCalledTimes(3);
    expect(prefetchApiResource).toHaveBeenNthCalledWith(1, "/repo/status", [
      true,
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
});
