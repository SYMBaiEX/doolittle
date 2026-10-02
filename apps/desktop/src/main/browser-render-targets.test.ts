import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendState } from "../shared/contracts";
import { isActiveManagedRenderUrl } from "./browser-render-targets";

describe("active managed render targets", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ready: BackendState = {
    phase: "ready",
    url: "http://127.0.0.1:3001",
    message: "ready",
  };
  const target = new URL("http://localhost:3000/page");
  it("consults only the current backend's fixed origin-only endpoint", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ origins: [target.origin] })),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await isActiveManagedRenderUrl(target, () => ready)).toBe(true);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "http://127.0.0.1:3001/browser/render-targets",
    );
  });
  it("fails closed during startup, shutdown and unrelated backend authorities", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const state of [
      { phase: "booting", message: "booting" },
      { phase: "stopped", message: "stopped" },
      { ...ready, url: "http://localhost:3001" },
      { ...ready, url: "https://example.com" },
    ])
      expect(
        await isActiveManagedRenderUrl(target, () => state as BackendState),
      ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("denies missing origins, failed requests and backend changes during authorization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ origins: [] }))),
    );
    expect(await isActiveManagedRenderUrl(target, () => ready)).toBe(false);
    let state = ready;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        state = { phase: "stopped", message: "stopped" };
        return new Response(JSON.stringify({ origins: [target.origin] }));
      }),
    );
    expect(await isActiveManagedRenderUrl(target, () => state)).toBe(false);
  });
  it("denies a workspace switch even when the runtime listener is unchanged", async () => {
    let workspace = "first-workspace";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        workspace = "second-workspace";
        return new Response(JSON.stringify({ origins: [target.origin] }));
      }),
    );
    expect(
      await isActiveManagedRenderUrl(
        target,
        () => ready,
        () => workspace,
      ),
    ).toBe(false);
  });
});
