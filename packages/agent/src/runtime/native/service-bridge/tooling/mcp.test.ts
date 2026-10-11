import { describe, expect, it, vi } from "vitest";

const { searchMarketplaceMock, getMarketplaceServerMock } = vi.hoisted(() => ({
  searchMarketplaceMock: vi.fn(),
  getMarketplaceServerMock: vi.fn(),
}));

vi.mock("@elizaos/agent/services/mcp-marketplace", () => ({
  generateMcpConfigFromServerDetails: (server: unknown) => ({ server }),
  getMcpServerDetails: getMarketplaceServerMock,
  searchMcpMarketplace: searchMarketplaceMock,
}));

import {
  getEffectiveMcpMarketplaceServer,
  searchEffectiveMcpMarketplace,
} from "./mcp";

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("MCP marketplace cancellation", () => {
  it.each([
    new Error("fixture-secret\n    at transport (/private/file:1)"),
    "fixture-secret\n    at transport (/private/file:1)",
  ])("does not expose marketplace exception details", async (failure) => {
    searchMarketplaceMock.mockRejectedValueOnce(failure);
    getMarketplaceServerMock.mockRejectedValueOnce(failure);

    const search = await searchEffectiveMcpMarketplace("browser");
    const lookup = await getEffectiveMcpMarketplaceServer("browser");
    expect(search.error).toBe("MCP marketplace search failed.");
    expect(lookup.error).toBe("MCP marketplace lookup failed.");
    expect(JSON.stringify([search, lookup])).not.toContain("fixture-secret");
    expect(JSON.stringify([search, lookup])).not.toContain("/private/file");
  });

  it("returns promptly when a search is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    searchMarketplaceMock.mockReturnValue(new Promise(() => undefined));

    await expect(
      searchEffectiveMcpMarketplace("browser", 10, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(searchMarketplaceMock).not.toHaveBeenCalled();
  });

  it("does not convert an in-flight search abort into an unavailable result", async () => {
    const controller = new AbortController();
    const request = pending<{ results: unknown[] }>();
    searchMarketplaceMock.mockReturnValue(request.promise);

    const result = searchEffectiveMcpMarketplace(
      "browser",
      10,
      controller.signal,
    );
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("applies the same cancellation contract to server details", async () => {
    const controller = new AbortController();
    const request = pending<{ name: string }>();
    getMarketplaceServerMock.mockReturnValue(request.promise);

    const result = getEffectiveMcpMarketplaceServer(
      "example-server",
      controller.signal,
    );
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
