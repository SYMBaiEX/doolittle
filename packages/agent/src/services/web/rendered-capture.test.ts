import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSdkRenderedCapturePort,
  validateRenderedCapture,
} from "./rendered-capture";
import { WebService } from "./service";

async function fixture(width = 1280, height = 720) {
  const png = await sharp({
    create: { width, height, channels: 3, background: "#e5e5e5" },
  })
    .png()
    .toBuffer();
  return {
    data: png.toString("base64"),
    captureMode: "rendered-page",
    captureProtocol: "doolittle-rendered-page-v1",
    scope: "viewport-only-read-only",
    viewport: { width, height },
    blockedRequests: 1,
    facts: {
      url: "http://localhost:3000/",
      title: "Fixture",
      text: "Story CTA",
      viewport: { width, height, deviceScaleFactor: 1 },
      horizontalOverflow: false,
      counts: { main: 1, h1: 1, links: 1, images: 0, headings: 1 },
      headings: ["Story"],
      links: [
        {
          label: "Read story",
          href: "#letter",
          targetExists: true,
          targetText: "Newsletter",
        },
      ],
      images: [],
      contrastCandidates: [
        {
          text: "CTA",
          foreground: "rgb(37, 43, 37)",
          background: "rgb(37, 43, 37)",
          fontSize: "16px",
          fontWeight: "600",
        },
      ],
      limitations: ["Viewport-only pixels."],
    },
  };
}

describe("rendered capture validation", () => {
  it("keeps legacy and malformed qualifiers unknown without losing real pixels", async () => {
    const payload = await fixture();
    const result = validateRenderedCapture(payload, "http://localhost:3000/", {
      width: 1280,
      height: 720,
    });
    expect(result.evidence.facts.contrastCandidates[0].interactiveText).toEqual(
      {
        controlKind: null,
        eligibility: "unknown",
        subject: null,
        unambiguous: false,
      },
    );
    expect(result.evidence.facts.interactiveTextScan).toBeUndefined();
    Object.assign(payload.facts, {
      interactiveTextScan: { version: 2, complete: true, unknown: false },
    });
    Object.assign(payload.facts.contrastCandidates[0], {
      interactiveText: { controlKind: "div", eligibility: "eligible" },
    });
    const malformed = validateRenderedCapture(
      payload,
      "http://localhost:3000/",
      { width: 1280, height: 720 },
    );
    expect(
      malformed.evidence.facts.contrastCandidates[0].interactiveText
        ?.eligibility,
    ).toBe("unknown");
    expect(malformed.evidence.facts.interactiveTextScan).toBeUndefined();
  });

  it("preserves versioned qualifiers as bounded typed facts", async () => {
    const payload = await fixture();
    Object.assign(payload.facts, {
      interactiveTextScan: { version: 1, complete: false, unknown: true },
    });
    Object.assign(payload.facts.contrastCandidates[0], {
      interactiveText: {
        controlKind: "button",
        eligibility: "eligible",
        privateCanary: "secret",
      },
    });
    const result = validateRenderedCapture(payload, "http://localhost:3000/", {
      width: 1280,
      height: 720,
    });
    expect(result.evidence.facts.contrastCandidates[0].interactiveText).toEqual(
      {
        controlKind: "button",
        eligibility: "eligible",
        subject: null,
        unambiguous: false,
      },
    );
    expect(result.evidence.facts.interactiveTextScan).toEqual({
      version: 1,
      complete: false,
      unknown: true,
    });
    expect(JSON.stringify(result.evidence)).not.toContain("privateCanary");
  });

  it("accepts actual PNG bytes, matching viewport and bounded typed DOM facts", async () => {
    const payload = await fixture();
    const result = validateRenderedCapture(payload, "http://localhost:3000/", {
      width: 1280,
      height: 720,
    });
    expect(result.image.mediaType).toBe("image/png");
    expect(result.evidence.pixels).toMatchObject({ width: 1280, height: 720 });
    expect(result.evidence.pixels.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.evidence.facts.links[0]).toMatchObject({
      label: "Read story",
      targetText: "Newsletter",
    });
  });
  it("validates bounded subject tuples without trusting malformed identities", async () => {
    const payload = await fixture();
    Object.assign(payload.facts, {
      interactiveTextCandidates: [
        {
          ...payload.facts.contrastCandidates[0],
          interactiveText: {
            controlKind: "link",
            eligibility: "eligible",
            subject: ["id", "link", "owned-control"],
            unambiguous: true,
          },
        },
        {
          ...payload.facts.contrastCandidates[0],
          interactiveText: {
            controlKind: "button",
            eligibility: "eligible",
            subject: ["id", "link", "wrong-kind"],
            unambiguous: true,
          },
        },
      ],
    });
    const result = validateRenderedCapture(payload, "http://localhost:3000/", {
      width: 1280,
      height: 720,
    });
    expect(
      result.evidence.facts.interactiveTextCandidates?.[0].interactiveText,
    ).toMatchObject({
      subject: ["id", "link", "owned-control"],
      unambiguous: true,
    });
    expect(
      result.evidence.facts.interactiveTextCandidates?.[1].interactiveText,
    ).toMatchObject({ subject: null, unambiguous: false });
  });

  it.each([
    [
      "capture card",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.captureMode = "capture-card";
      },
    ],
    [
      "bad encoding",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.data = "not base64";
      },
    ],
    [
      "oversized PNG",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.data = "a".repeat(14 * 1024 * 1024);
      },
    ],
    [
      "viewport mismatch",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.viewport.width = 390;
      },
    ],
    [
      "pixel mismatch",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.facts.viewport.deviceScaleFactor = 2;
      },
    ],
    [
      "escaped origin",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.facts.url = "http://localhost:9000/private";
      },
    ],
    [
      "credentials",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.facts.url = "http://user:secret@localhost:3000/";
      },
    ],
    [
      "oversized text",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.facts.text = "x".repeat(16001);
      },
    ],
    [
      "unbounded links",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.facts.links = Array.from({ length: 81 }, () => p.facts.links[0]);
      },
    ],
    [
      "negative counts",
      (p: Awaited<ReturnType<typeof fixture>>) => {
        p.facts.counts.h1 = -1;
      },
    ],
  ])(
    "rejects %s without claiming rendered evidence",
    async (_label, modify) => {
      const payload = await fixture();
      modify(payload);
      expect(() =>
        validateRenderedCapture(payload, "http://localhost:3000", {
          width: 1280,
          height: 720,
        }),
      ).toThrow();
    },
  );
});

describe("official SDK rendered capture client", () => {
  let server: Server | undefined;
  afterEach(async () => {
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  async function setup(payload: unknown) {
    const calls: Array<{
      method: string | undefined;
      path: string | undefined;
      authorized: boolean;
    }> = [];
    const token = "a".repeat(64);
    server = createServer((request, response) => {
      calls.push({
        method: request.method,
        path: request.url,
        authorized: request.headers.authorization === `Bearer ${token}`,
      });
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify(
          request.method === "POST"
            ? { tab: { id: "11111111-1111-4111-8111-111111111111" } }
            : request.method === "DELETE"
              ? { closed: true }
              : request.url?.endsWith("/snapshot")
                ? payload
                : { tabs: [] },
        ),
      );
    });
    await new Promise<void>((resolve) =>
      server?.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test listener");
    const port = createSdkRenderedCapturePort({
      ELIZA_BROWSER_WORKSPACE_URL: `http://127.0.0.1:${address.port}`,
      ELIZA_BROWSER_WORKSPACE_TOKEN: token,
    });
    if (!port) throw new Error("Missing capture port");
    return { port, calls };
  }

  it("authenticates open/snapshot/close with the public SDK and cleans up on success", async () => {
    const { port, calls } = await setup(await fixture());
    expect(await port.available()).toBe(true);
    await port.capture("http://localhost:3000", { width: 1280, height: 720 });
    expect(calls.map((call) => call.method)).toEqual([
      "GET",
      "POST",
      "GET",
      "DELETE",
    ]);
    expect(calls.every((call) => call.authorized)).toBe(true);
  });

  it("closes its owned tab even when screenshot validation fails", async () => {
    const { port, calls } = await setup({ data: "capture-card" });
    await expect(
      port.capture("http://localhost:3000", { width: 1280, height: 720 }),
    ).rejects.toThrow();
    expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "DELETE"]);
  });

  it("does not open a tab for an already-cancelled operation", async () => {
    const { port, calls } = await setup(await fixture());
    const abort = new AbortController();
    abort.abort();
    await expect(
      port.capture(
        "http://localhost:3000",
        { width: 1280, height: 720 },
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it.each([
    "https://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000/private",
    "http://user:secret@127.0.0.1:3000",
    "http://127.0.0.1:3000?token=x",
  ])("does not accept an unrelated bridge URL %s", (url) => {
    expect(
      createSdkRenderedCapturePort({
        ELIZA_BROWSER_WORKSPACE_URL: url,
        ELIZA_BROWSER_WORKSPACE_TOKEN: "a".repeat(64),
      }),
    ).toBeUndefined();
  });
});

describe("WebService rendered model analysis", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function setup() {
    root = mkdtempSync(join(tmpdir(), "doolittle-rendered-analysis-"));
    const modelAnalysis = {
      bindRuntime: vi.fn(),
      analyze: vi.fn(
        async () => "CTA is unreadable and Read story goes to Newsletter.",
      ),
    };
    const renderedCapture = {
      available: vi.fn(async () => true),
      capture: vi.fn(
        async (
          url: string,
          viewport: { width: number; height: number },
          _abortSignal?: AbortSignal,
        ) =>
          validateRenderedCapture(
            await fixture(viewport.width, viewport.height),
            url,
            viewport,
          ),
      ),
    };
    const service = new WebService(
      () => ({ provider: "basic", command: "lightpanda", obeyRobots: true }),
      root,
      { renderedCapture, modelAnalysis },
    );
    return { service, modelAnalysis, renderedCapture };
  }

  it("attaches desktop and narrow pixels once, includes measured facts and writes private truthful artifacts", async () => {
    const { service, modelAnalysis, renderedCapture } = await setup();
    const analysis = await service.analyzeWithModel("http://localhost:3000");
    expect(renderedCapture.capture.mock.calls.map((call) => call[1])).toEqual([
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]);
    expect(modelAnalysis.analyze).toHaveBeenCalledOnce();
    const [prompt, options] = modelAnalysis.analyze.mock
      .calls[0] as unknown as [string, { images: unknown[] }];
    expect(options.images).toHaveLength(2);
    expect(prompt).toContain("rgb(37, 43, 37)");
    expect(prompt).toContain("Newsletter");
    expect(prompt).toContain("untrusted evidence");
    expect(prompt).not.toContain("text-only analysis call");
    expect(analysis).toMatchObject({
      response: "CTA is unreadable and Read story goes to Newsletter.",
      modelEvidence: "rendered-pixels",
      capture: {
        captureMode: "rendered-page",
        screenshotSvgPath: "",
        status: {
          provider: "basic",
          renderBackend: "electron-private-capture",
          captureReady: true,
        },
      },
    });
    expect(analysis.narrowCapture?.renderedEvidence?.viewport.width).toBe(390);
    for (const path of [
      analysis.capture.screenshotPath,
      analysis.capture.snapshotPath,
      analysis.capture.manifestPath,
      analysis.capture.reportPath,
    ])
      expect(statSync(path).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(
      readFileSync(analysis.capture.manifestPath, "utf8"),
    );
    expect(manifest.renderedEvidence.backend).toBe("electron-private-capture");
    expect(manifest).not.toHaveProperty("data");
    expect(readFileSync(analysis.capture.reportPath, "utf8")).not.toContain(
      "Screenshot SVG:",
    );
  });

  it("keeps a failed render honest and sends only text, never a placeholder image", async () => {
    const { service, modelAnalysis, renderedCapture } = await setup();
    renderedCapture.capture.mockRejectedValue(
      new Error("private bridge failure"),
    );
    const analysis = await service.analyzeWithModel(
      "data:text/html,<h1>Fallback</h1>",
    );
    expect(analysis.modelEvidence).toBe("text-only");
    expect(analysis.capture.captureMode).toBe("placeholder");
    expect(analysis.capture.status.captureReady).toBe(false);
    expect(modelAnalysis.analyze).toHaveBeenCalledOnce();
    const [prompt, options] = modelAnalysis.analyze.mock
      .calls[0] as unknown as [string, Record<string, unknown>];
    expect(prompt).toContain("text-only analysis call");
    expect(options).not.toHaveProperty("images");
    expect(JSON.stringify(analysis)).not.toContain("private bridge failure");
  });

  it("does not turn a cancelled capture into fallback or run a model", async () => {
    const { service, modelAnalysis, renderedCapture } = await setup();
    const abort = new AbortController();
    abort.abort();
    await expect(
      service.analyzeWithModel("http://localhost:3000", "vision", {
        abortSignal: abort.signal,
      }),
    ).rejects.toThrow();
    expect(renderedCapture.capture).not.toHaveBeenCalled();
    expect(modelAnalysis.analyze).not.toHaveBeenCalled();
  });

  it("passes cancellation into prepared analysis and discards a late rendered capture without writing artifacts", async () => {
    const { service, modelAnalysis, renderedCapture } = await setup();
    const artifactRoot = root;
    if (!artifactRoot) throw new Error("No capture fixture directory");
    const payload = validateRenderedCapture(
      await fixture(),
      "http://localhost:3000/",
      { width: 1280, height: 720 },
    );
    let release: ((value: typeof payload) => void) | undefined;
    renderedCapture.capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const prepared = service.analyze("http://localhost:3000/", "vision", {
      abortSignal: controller.signal,
    });
    const rejected = expect(prepared).rejects.toThrow(
      "cancelled during capture",
    );
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(renderedCapture.capture.mock.calls[0]?.[2]).toBe(controller.signal);
    controller.abort(new Error("cancelled during capture"));
    release?.(payload);
    await rejected;
    expect(readdirSync(artifactRoot)).toEqual([]);
    expect(modelAnalysis.analyze).not.toHaveBeenCalled();
  });

  it("cannot attach arbitrary file paths or borrowed captures as images", async () => {
    const { service, modelAnalysis } = await setup();
    const other = new WebService(
      () => ({ provider: "basic", command: "lightpanda", obeyRobots: true }),
      root,
    );
    const analysis = await other.analyze("data:text/html,<h1>Other</h1>");
    analysis.capture.screenshotPath = "/private/not-owned.png";
    const result = await service.completeAnalysis(analysis);
    expect(result.modelEvidence).toBe("text-only");
    expect(modelAnalysis.analyze.mock.calls[0]).not.toHaveProperty("1.images");
  });
});
