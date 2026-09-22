import { describe, expect, it, vi } from "vitest";
import { checkOllamaReadiness } from "./ollama-readiness";

describe("Ollama readiness", () => {
  it("reports authentication failures without exposing response bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("secret server detail", { status: 401 }));
    const result = await checkOllamaReadiness(
      "http://localhost:11434",
      "local",
      fetchImpl,
    );
    expect(result).toEqual({
      ready: false,
      detail:
        "Ollama returned HTTP 401. Check its endpoint and authentication.",
    });
  });

  it("handles malformed catalogs and entries without claiming readiness", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ models: [null, 3, {}, { name: 12 }] })),
      );
    await expect(
      checkOllamaReadiness("http://localhost:11434/api", "local", fetchImpl),
    ).resolves.toMatchObject({ ready: false });
    fetchImpl.mockResolvedValue(new Response("not json"));
    await expect(
      checkOllamaReadiness("http://localhost:11434/api", "local", fetchImpl),
    ).resolves.toMatchObject({
      ready: false,
      detail: expect.stringContaining("invalid model catalog"),
    });
  });

  it("does not issue requests for invalid endpoints", async () => {
    const fetchImpl = vi.fn();
    await expect(
      checkOllamaReadiness("not a URL", "local", fetchImpl),
    ).resolves.toMatchObject({ ready: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
