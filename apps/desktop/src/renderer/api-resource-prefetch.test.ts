import {
  __resetResourceCache,
  getCached,
} from "@elizaos/ui/hooks/resource-cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desktopRequest: vi.fn() }));

vi.mock("./eliza-client", () => ({
  desktopRequest: mocks.desktopRequest,
}));

import { apiResourceCacheKey, prefetchApiResource } from "./lib";

describe("prefetchApiResource", () => {
  beforeEach(() => {
    __resetResourceCache();
    mocks.desktopRequest.mockReset();
  });

  test("deduplicates concurrent requests and reuses a fresh Eliza cache entry", async () => {
    const response = { accounts: [{ id: "primary" }] };
    mocks.desktopRequest.mockResolvedValue(response);

    const [first, second] = await Promise.all([
      prefetchApiResource("/runtime/accounts", [true]),
      prefetchApiResource("/runtime/accounts", [true]),
    ]);

    expect(first).toEqual(response);
    expect(second).toEqual(response);
    expect(mocks.desktopRequest).toHaveBeenCalledTimes(1);
    expect(mocks.desktopRequest).toHaveBeenCalledWith(
      "/runtime/accounts",
      "GET",
    );

    await expect(
      prefetchApiResource("/runtime/accounts", [true]),
    ).resolves.toEqual(response);
    expect(mocks.desktopRequest).toHaveBeenCalledTimes(1);
    expect(
      getCached(apiResourceCacheKey("/runtime/accounts", [true]) ?? ""),
    ).toMatchObject({ data: response });
  });

  test("keeps dependency-specific resources isolated and ignores null paths", async () => {
    mocks.desktopRequest.mockImplementation(async (path: string) => ({ path }));

    await prefetchApiResource("/logs?limit=500", [true, "all", ""]);
    await prefetchApiResource("/logs?limit=500", [true, "error", ""]);
    await expect(prefetchApiResource(null, [true])).resolves.toBeNull();

    expect(mocks.desktopRequest).toHaveBeenCalledTimes(2);
  });
});
