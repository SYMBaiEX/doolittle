import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getScopedTurnActionResults,
  runWithTurnRuntimeScope,
} from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";
import type { BrowserAnalysisBundle } from "@/services/web/service";
import {
  createBrowserAnalysisAction,
  DOOLITTLE_BROWSER_ANALYZE_ACTION,
} from "./browser-analysis-action";

const access = vi.hoisted(() => ({ owner: true }));
vi.mock("@elizaos/agent/security/access", () => ({
  hasOwnerAccess: vi.fn(async () => access.owner),
}));

function fixture() {
  const analysis = {
    response: "The mobile heading overflows. The story link goes to signup.",
    prompt: "private model prompt",
    modelEvidence: "rendered-pixels",
    capture: {
      captureMode: "rendered-page",
      status: { captureReady: true },
      screenshotPath: "/private/capture.png",
      page: { text: "private DOM transcript" },
      renderedEvidence: {
        viewport: { width: 1280, height: 720 },
        pixels: {
          width: 1280,
          height: 720,
          bytes: 300,
          sha256: "a".repeat(64),
        },
        blockedRequests: 2,
        scope: "viewport-only-read-only",
        facts: { text: "private DOM transcript" },
      },
    },
    narrowCapture: {
      captureMode: "rendered-page",
      status: { captureReady: true },
      renderedEvidence: {
        viewport: { width: 390, height: 844 },
        pixels: { width: 390, height: 844, bytes: 100, sha256: "b".repeat(64) },
        blockedRequests: 0,
        scope: "viewport-only-read-only",
      },
    },
  } as unknown as BrowserAnalysisBundle;
  const analyze = vi.fn(async () => analysis);
  const renderOrigins = vi.fn(async () => ["http://localhost:3000"]);
  const runtime = {
    agentId: "agent-test",
    getSetting: () => undefined,
    getService: (name: string) =>
      name === DOOLITTLE_BROWSER_SERVICE ? { analyze } : null,
  } as unknown as IAgentRuntime;
  const message = {
    entityId: "owner-test",
    roomId: "room-test",
    content: { text: "Build and review the app", source: "desktop" },
  } as unknown as Memory;
  const action = createBrowserAnalysisAction({
    terminal: { renderOrigins },
  } as unknown as Pick<AppServices, "terminal">);
  const run = (url = "http://localhost:3000/story") =>
    action.handler(runtime, message, undefined, { parameters: { url } });
  return { action, analysis, analyze, renderOrigins, runtime, message, run };
}

afterEach(() => {
  access.owner = true;
  vi.unstubAllEnvs();
});

describe("agent-invokable managed browser critique", () => {
  it("declares an owner-gated coding and browser action", () => {
    expect(fixture().action).toMatchObject({
      name: DOOLITTLE_BROWSER_ANALYZE_ACTION,
      contexts: ["code", "browser", "web"],
      roleGate: { minRole: "OWNER" },
      parameters: [expect.objectContaining({ name: "url", required: true })],
    });
  });

  it("returns bounded useful findings and pixel metadata through the native service", async () => {
    const { runtime, run, analyze } = fixture();
    const { result, recorded } = await runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      async () => {
        const result = await run();
        return { result, recorded: getScopedTurnActionResults(runtime) };
      },
    );
    expect(analyze).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledWith(
      "http://localhost:3000/story",
      undefined,
    );
    expect(result).toMatchObject({
      success: true,
      continueChain: true,
      data: {
        modelEvidence: "rendered-pixels",
        evidence: [
          expect.objectContaining({ blockedRequests: 2 }),
          expect.objectContaining({ viewport: { width: 390, height: 844 } }),
        ],
      },
    });
    expect(result?.text).toContain("story link goes to signup");
    expect(result?.text).toContain("untrusted-page-critique");
    expect(result?.text).toContain(
      "not completion or interaction verification",
    );
    expect(result).not.toHaveProperty("verifiedUserFacing");
    expect(JSON.stringify(result)).not.toMatch(/private|prompt|base64/u);
    expect(recorded).toEqual([result]);
  });

  it.each([
    undefined,
    2,
    "bad url",
    "https://example.com/",
    "http://192.168.1.2:3000/",
    "http://localhost/",
    "http://owner:secret@localhost:3000/",
    "http://localhost:3000/\nsecret",
    "http://localhost:3000/%0a",
    `http://localhost:3000/${"a".repeat(4096)}`,
  ])(
    "rejects invalid or unscoped input before any page review: %s",
    async (url) => {
      const { action, runtime, message, analyze, renderOrigins } = fixture();
      const result = await action.handler(runtime, message, undefined, {
        parameters: url === undefined ? {} : { url },
      });
      expect(result?.success).toBe(false);
      expect(analyze).not.toHaveBeenCalled();
      expect(renderOrigins).not.toHaveBeenCalled();
      expect(result?.text).not.toContain("secret");
    },
  );

  it("rejects an unmanaged or no-longer-ready local URL", async () => {
    const { run, renderOrigins, analyze } = fixture();
    renderOrigins.mockResolvedValue([]);
    expect(await run()).toMatchObject({ success: false });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("enforces owner access in the handler, not only planner metadata", async () => {
    access.owner = false;
    const { run, analyze, renderOrigins } = fixture();
    expect(await run()).toMatchObject({ success: false });
    expect(analyze).not.toHaveBeenCalled();
    expect(renderOrigins).not.toHaveBeenCalled();
  });

  it("fails closed on missing identity", async () => {
    const { action, runtime, message, analyze } = fixture();
    expect(
      await action.handler(
        runtime,
        { ...message, entityId: undefined } as unknown as Memory,
        undefined,
        {
          parameters: { url: "http://localhost:3000" },
        },
      ),
    ).toMatchObject({ success: false });
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each(["discord", "telegram", "api", undefined])(
    "does not grant remote or unknown channels host page access: %s",
    async (source) => {
      const { action, runtime, message, analyze } = fixture();
      const result = await action.handler(
        runtime,
        { ...message, content: { ...message.content, source } },
        undefined,
        { parameters: { url: "http://localhost:3000" } },
      );
      expect(result?.success).toBe(false);
      expect(analyze).not.toHaveBeenCalled();
    },
  );

  it("labels text fallback honestly, without creating a second model call", async () => {
    const { run, analysis } = fixture();
    analysis.modelEvidence = "text-only";
    analysis.capture.captureMode = "placeholder";
    analysis.capture.status.captureReady = false;
    delete analysis.capture.renderedEvidence;
    delete analysis.narrowCapture;
    const result = await run();
    expect(result?.text).toContain("rendered layout was not verified");
    expect(result?.data).toMatchObject({ modelEvidence: "text-only" });
  });

  it("fails honestly when model analysis is unavailable", async () => {
    const { run, analysis } = fixture();
    delete analysis.response;
    expect(await run()).toMatchObject({ success: false });
  });

  it("bounds model output and excludes raw capture fields", async () => {
    const { run, analysis } = fixture();
    analysis.response = "x".repeat(25_000);
    const result = await run();
    expect(result?.text?.length).toBeLessThan(11_000);
    expect(result?.data).toMatchObject({ critiqueTruncated: true });
  });

  it("does not reflect arbitrary provider errors or credentials", async () => {
    const { run, analyze } = fixture();
    analyze.mockRejectedValue(new Error("Bearer private-provider-secret"));
    const result = await run();
    expect(result?.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-provider-secret");
  });

  it("forwards the turn abort signal and rejects late results after cancellation", async () => {
    const { runtime, run, analyze, analysis } = fixture();
    const controller = new AbortController();
    analyze.mockImplementation(async () => {
      controller.abort();
      return analysis;
    });
    await expect(
      runWithTurnRuntimeScope(
        runtime,
        { settings: new Map(), abortSignal: controller.signal },
        run,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(analyze).toHaveBeenCalledWith(
      "http://localhost:3000/story",
      controller.signal,
    );
  });

  it("does not start a review when already cancelled", async () => {
    const { runtime, run, analyze } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runWithTurnRuntimeScope(
        runtime,
        { settings: new Map(), abortSignal: controller.signal },
        run,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(analyze).not.toHaveBeenCalled();
  });
});
