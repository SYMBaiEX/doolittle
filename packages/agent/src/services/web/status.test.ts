import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserCommandExists } from "./fetch";
import { buildBrowserStatus } from "./status";

vi.mock("./fetch", () => ({ browserCommandExists: vi.fn() }));

describe("browser capture readiness", () => {
  beforeEach(() => vi.mocked(browserCommandExists).mockReset());

  it("does not promote an executable DOM backend into rendered-page readiness", async () => {
    vi.mocked(browserCommandExists).mockResolvedValue(true);
    const status = await buildBrowserStatus(
      { provider: "lightpanda", command: "lightpanda", obeyRobots: true },
      {},
    );
    expect(status).toMatchObject({
      ready: true,
      mode: "browser",
      captureMode: "capture-card",
      captureReady: false,
    });
    expect(status.detail).toContain(
      "Rendered-page screenshots are unavailable",
    );
  });

  it("keeps an unavailable DOM backend and its placeholder explicit", async () => {
    vi.mocked(browserCommandExists).mockResolvedValue(false);
    expect(
      await buildBrowserStatus(
        { provider: "lightpanda", command: "missing", obeyRobots: true },
        {},
      ),
    ).toMatchObject({
      ready: false,
      mode: "fallback",
      captureMode: "placeholder",
      captureReady: false,
    });
  });

  it("keeps HTTP readiness separate from screenshot readiness", async () => {
    expect(
      await buildBrowserStatus(
        { provider: "basic", command: "lightpanda", obeyRobots: true },
        {},
      ),
    ).toMatchObject({
      ready: true,
      mode: "fallback",
      captureMode: "placeholder",
      captureReady: false,
    });
    expect(browserCommandExists).not.toHaveBeenCalled();
  });
});
