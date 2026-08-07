import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleBrowserRoutes } from "./browser";

function createContext(): AppContext {
  const web = {
    status: async () => ({
      captureMode: "pixel",
      captureReady: true,
      analysisReady: true,
    }),
    fetchText: async (url: string) => `page:${url}`,
    inspect: async (url: string) => ({ url, mode: "inspect" }),
    snapshot: async (url: string) => `snapshot:${url}`,
    screenshot: async (url: string) => `screenshot:${url}`,
    capture: async (url: string) => ({ url, mode: "capture" }),
    analyze: async (url: string) => ({
      url,
      prompt: `analyze:${url}`,
      mode: "analysis",
    }),
    compare: async (leftUrl: string, rightUrl: string) => ({
      leftUrl,
      rightUrl,
      mode: "compare",
    }),
    analyzeComparison: async (leftUrl: string, rightUrl: string) => ({
      leftUrl,
      rightUrl,
      prompt: `compare:${leftUrl}:${rightUrl}`,
      mode: "comparison-analysis",
    }),
  };
  return {
    runtime: {
      getService: (name: string) => {
        if (name === "doolittle_personality") {
          return {
            activeId: () => "primary",
            get: (id: string) => ({ id }),
          };
        }
        if (name === DOOLITTLE_BROWSER_SERVICE) {
          return {
            status: web.status,
            fetch: web.fetchText,
            inspect: web.inspect,
            snapshot: web.snapshot,
            screenshot: web.screenshot,
            capture: web.capture,
            analyze: web.analyze,
            compare: web.compare,
            analyzeComparison: web.analyzeComparison,
          };
        }
        return null;
      },
    },
    services: {
      web,
      personalities: {
        getActive: () => ({ id: "primary" }),
      },
    },
  } as unknown as AppContext;
}

describe("handleBrowserRoutes", () => {
  function postBrowserRoute(
    pathname: string,
    body: Record<string, unknown>,
  ): Promise<Response | null> {
    return handleBrowserRoutes(
      createContext(),
      new Request(`http://localhost${pathname}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      new URL(`http://localhost${pathname}`),
      async () => "analysis",
    );
  }

  it("returns browser fetch, status, inspect, and capture payloads", async () => {
    const context = createContext();
    const fetchResponse = await handleBrowserRoutes(
      context,
      new Request("http://localhost/web/fetch?url=https://example.com"),
      new URL("http://localhost/web/fetch?url=https://example.com"),
    );
    const statusResponse = await handleBrowserRoutes(
      context,
      new Request("http://localhost/browser/status"),
      new URL("http://localhost/browser/status"),
    );
    const inspectResponse = await handleBrowserRoutes(
      context,
      new Request("http://localhost/web/inspect?url=https://example.com"),
      new URL("http://localhost/web/inspect?url=https://example.com"),
    );
    const captureResponse = await handleBrowserRoutes(
      context,
      new Request("http://localhost/browser/capture", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/browser/capture"),
    );
    const snapshotResponse = await handleBrowserRoutes(
      context,
      new Request("http://localhost/browser/snapshot", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/browser/snapshot"),
    );

    await expect(fetchResponse?.json()).resolves.toEqual({
      page: "page:https://example.com",
    });
    await expect(statusResponse?.json()).resolves.toEqual({
      browser: {
        captureMode: "pixel",
        captureReady: true,
        analysisReady: true,
      },
    });
    await expect(inspectResponse?.json()).resolves.toEqual({
      inspection: { url: "https://example.com", mode: "inspect" },
    });
    await expect(captureResponse?.json()).resolves.toEqual({
      capture: { url: "https://example.com", mode: "capture" },
    });
    await expect(snapshotResponse?.json()).resolves.toEqual({
      path: "snapshot:https://example.com",
    });
  });

  it("validates required browser inputs", async () => {
    const missingUrl = await handleBrowserRoutes(
      createContext(),
      new Request("http://localhost/web/fetch"),
      new URL("http://localhost/web/fetch"),
    );
    const missingCompare = await handleBrowserRoutes(
      createContext(),
      new Request("http://localhost/browser/compare", {
        method: "POST",
        body: JSON.stringify({ leftUrl: "https://left" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/browser/compare"),
    );

    expect(missingUrl?.status).toBe(400);
    await expect(missingUrl?.json()).resolves.toEqual({
      error: "url is required",
    });
    expect(missingCompare?.status).toBe(400);
    await expect(missingCompare?.json()).resolves.toEqual({
      error: "leftUrl and rightUrl are required",
    });
  });

  it("rejects non-http URLs on every URL-bearing browser route", async () => {
    const responses = await Promise.all([
      handleBrowserRoutes(
        createContext(),
        new Request("http://localhost/web/fetch?url=file%3A%2F%2F%2Ftmp%2Fx"),
        new URL("http://localhost/web/fetch?url=file%3A%2F%2F%2Ftmp%2Fx"),
      ),
      handleBrowserRoutes(
        createContext(),
        new Request(
          "http://localhost/browser/inspect?url=javascript%3Aalert(1)",
        ),
        new URL("http://localhost/browser/inspect?url=javascript%3Aalert(1)"),
      ),
      postBrowserRoute("/web/snapshot", { url: "ftp://example.com" }),
      postBrowserRoute("/browser/snapshot", { url: "file:///tmp/page.html" }),
      postBrowserRoute("/browser/screenshot", { url: "data:text/plain,page" }),
      postBrowserRoute("/browser/capture", { url: "ws://example.com" }),
      postBrowserRoute("/browser/analyze", { url: "javascript:alert(1)" }),
      postBrowserRoute("/browser/compare", {
        leftUrl: "ftp://left.example",
        rightUrl: "https://right.example",
      }),
      postBrowserRoute("/browser/compare/analyze", {
        leftUrl: "https://left.example",
        rightUrl: "file:///tmp/right.html",
      }),
    ]);

    for (const response of responses) {
      expect(response?.status).toBe(400);
      expect((await response?.json())?.error).toMatch(/must use http or https/);
    }
  });

  it("rejects credentials, control characters, and oversized URLs", async () => {
    const credentials = await postBrowserRoute("/browser/capture", {
      url: "https://user:secret@example.com/private",
    });
    const controlCharacter = await postBrowserRoute("/browser/screenshot", {
      url: "https://example.com/%2500private",
    });
    const oversized = await postBrowserRoute("/browser/analyze", {
      url: `https://example.com/${"a".repeat(4_096)}`,
    });

    expect(credentials?.status).toBe(400);
    await expect(credentials?.json()).resolves.toEqual({
      error: "url must not include credentials",
    });
    expect(controlCharacter?.status).toBe(400);
    await expect(controlCharacter?.json()).resolves.toEqual({
      error: "url must not contain control characters",
    });
    expect(oversized?.status).toBe(400);
    await expect(oversized?.json()).resolves.toEqual({
      error: "url must be at most 4096 characters",
    });
  });

  it("validates both comparison URLs", async () => {
    const invalidLeft = await postBrowserRoute("/browser/compare", {
      leftUrl: "https://user:secret@left.example",
      rightUrl: "https://right.example",
    });
    const invalidRight = await postBrowserRoute("/browser/compare/analyze", {
      leftUrl: "http://localhost:3000",
      rightUrl: "https://right.example/%00private",
    });

    expect(invalidLeft?.status).toBe(400);
    await expect(invalidLeft?.json()).resolves.toEqual({
      error: "leftUrl must not include credentials",
    });
    expect(invalidRight?.status).toBe(400);
    await expect(invalidRight?.json()).resolves.toEqual({
      error: "rightUrl must not contain control characters",
    });
  });

  it("preserves valid localhost and remote HTTP evidence URLs", async () => {
    const localhost = await postBrowserRoute("/browser/capture", {
      url: "http://localhost:4173/evidence?view=desktop",
    });
    const remote = await postBrowserRoute("/browser/compare", {
      leftUrl: "https://left.example/evidence",
      rightUrl: "http://right.example:8080/evidence?run=2",
    });

    await expect(localhost?.json()).resolves.toEqual({
      capture: {
        url: "http://localhost:4173/evidence?view=desktop",
        mode: "capture",
      },
    });
    await expect(remote?.json()).resolves.toEqual({
      comparison: {
        leftUrl: "https://left.example/evidence",
        rightUrl: "http://right.example:8080/evidence?run=2",
        mode: "compare",
      },
    });
  });

  it("dispatches analyze and compare routes through the injected analysis runner", async () => {
    const context = createContext();
    const analysisOptions: Array<{
      label: string;
      abortSignal?: AbortSignal;
    }> = [];
    const analyze = await handleBrowserRoutes(
      context,
      new Request("http://localhost/browser/analyze", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/browser/analyze"),
      async (_context, prompt, options) => {
        analysisOptions.push(options);
        return `${options.label}:${prompt}:${options.personalityId ?? "none"}`;
      },
    );
    const compareAnalyze = await handleBrowserRoutes(
      context,
      new Request("http://localhost/browser/compare/analyze", {
        method: "POST",
        body: JSON.stringify({
          leftUrl: "https://left",
          rightUrl: "https://right",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/browser/compare/analyze"),
      async (_context, prompt, options) => {
        analysisOptions.push(options);
        return `${options.label}:${prompt}:${options.personalityId ?? "none"}`;
      },
    );

    await expect(analyze?.json()).resolves.toEqual({
      analysis: {
        url: "https://example.com",
        prompt: "analyze:https://example.com",
        mode: "analysis",
      },
      response: "browser:analyze:https://example.com:primary",
    });
    await expect(compareAnalyze?.json()).resolves.toEqual({
      analysis: {
        leftUrl: "https://left",
        rightUrl: "https://right",
        prompt: "compare:https://left:https://right",
        mode: "comparison-analysis",
      },
      response: "browser-comparison:compare:https://left:https://right:primary",
    });
    expect(analysisOptions.map((options) => options.label)).toEqual([
      "browser",
      "browser-comparison",
    ]);
    expect(analysisOptions.every((options) => options.abortSignal)).toBe(true);
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleBrowserRoutes(
      createContext(),
      new Request("http://localhost/not-browser"),
      new URL("http://localhost/not-browser"),
    );

    expect(response).toBeNull();
  });
});
