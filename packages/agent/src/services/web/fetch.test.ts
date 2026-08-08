import { describe, expect, it, vi } from "vitest";
import { buildPageMetrics, extractReadableText } from "./content";
import { fetchWithBasic, resolveBasicFetchPolicy } from "./fetch";

describe("web-service fetch helpers", () => {
  it("extracts readable text and metadata from html", () => {
    const readable = extractReadableText(
      "<html><head><title>Meta</title><meta name='description' content='Desc'><link rel='canonical' href='https://example.com'></head><body><h1>Hello</h1><p>World</p></body></html>",
    );

    expect(readable.title).toBe("Meta");
    expect(readable.metaDescription).toBe("Desc");
    expect(readable.canonicalUrl).toBe("https://example.com");
    expect(readable.text).toContain("Hello");
    expect(readable.text).toContain("World");
  });

  it("builds stable metrics from markup", () => {
    const metrics = buildPageMetrics(
      "<html><body><h1>Alpha</h1><p>Beta</p><a href='/x'>Link</a><img src='y'></body></html>",
      "Alpha\nBeta\nLink",
      "text/html",
    );

    expect(metrics.wordCount).toBe(3);
    expect(metrics.linkCount).toBe(1);
    expect(metrics.imageCount).toBe(1);
    expect(metrics.headingCount).toBe(1);
    expect(metrics.contentLength).toBeGreaterThan(0);
    expect(metrics.contentHash.length).toBeGreaterThan(0);
  });

  it("uses Eliza's guarded fetch for public remote pages", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("remote", {
          headers: { "content-type": "text/plain" },
        }),
    );
    const lookupFn = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);

    await expect(
      fetchWithBasic("https://example.com/evidence", {
        fetchImpl,
        lookupFn,
      }),
    ).resolves.toEqual({ body: "remote", contentType: "text/plain" });
    expect(lookupFn).toHaveBeenCalledWith("example.com", { all: true });
  });

  it("rejects redirects from public pages into localhost", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://localhost:4173/private" },
        }),
    );
    const lookupFn = vi.fn(async (hostname: string) =>
      hostname === "localhost"
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }],
    );

    await expect(
      fetchWithBasic("https://example.com/redirect", {
        fetchImpl,
        lookupFn,
      }),
    ).rejects.toThrow("Blocked hostname: localhost");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("allows only the explicit localhost evidence-preview policy", async () => {
    const fetchImpl = vi.fn(async () => new Response("preview"));
    const lookupFn = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);

    expect(
      resolveBasicFetchPolicy(new URL("http://localhost:4173/evidence")),
    ).toEqual({ allowedHostnames: ["localhost"] });
    expect(
      resolveBasicFetchPolicy(new URL("http://127.0.0.1:4173/evidence")),
    ).toBeUndefined();
    await expect(
      fetchWithBasic("http://localhost:4173/evidence", {
        fetchImpl,
        lookupFn,
      }),
    ).resolves.toMatchObject({ body: "preview" });
    await expect(
      fetchWithBasic("http://127.0.0.1:4173/evidence", {
        fetchImpl,
        lookupFn,
      }),
    ).rejects.toThrow("private/internal IP address");
  });

  it("preserves non-network data URL fixtures without opening SSRF access", async () => {
    await expect(fetchWithBasic("data:text/plain,fixture")).resolves.toEqual({
      body: "fixture",
      contentType: "text/plain",
    });
  });
});
