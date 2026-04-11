import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleBrowserRoutes } from "./browser";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      web: {
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
      },
      personalities: {
        getActive: () => ({ id: "primary" }),
      },
    },
  } as unknown as AppContext;
}

describe("handleBrowserRoutes", () => {
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

  it("dispatches analyze and compare routes through the injected analysis runner", async () => {
    const context = createContext();
    const analyze = await handleBrowserRoutes(
      context,
      new Request("http://localhost/browser/analyze", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/browser/analyze"),
      async (_context, prompt, label, options) =>
        `${label}:${prompt}:${options?.personalityId ?? "none"}`,
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
      async (_context, prompt, label, options) =>
        `${label}:${prompt}:${options?.personalityId ?? "none"}`,
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
