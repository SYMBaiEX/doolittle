import { describe, expect, it } from "bun:test";
import { createKnowledgePlugin } from "./index";

describe("createKnowledgePlugin", () => {
  it("exposes extraction, read/list, and normalized recall/search helpers", async () => {
    const plugin = createKnowledgePlugin({
      knowledge: {
        extractPdf: async (path) => `pdf:${path}`,
      },
      memory: {
        list: () => ["m1", "m2"],
        remember: (_target, input) => ({
          ok: true,
          stored: input.text,
          totalLength: input.text.length,
          truncated: false,
        }),
        read: () => "memory-body",
        summary: () => ({
          target: "memory" as const,
          entries: 2,
          characters: 11,
          preview: ["memory-body"],
        }),
      },
      sessions: {
        search: (query, limit) =>
          Array.from({ length: limit }).map((_, index) => ({
            sessionId: `s-${index}`,
            createdAt: "2026-03-22T00:00:00.000Z",
            role: "user" as const,
            text: `${query}-${index}`,
          })),
      },
    });

    const ServiceCtor = plugin.services?.[0] as unknown as {
      start(runtime?: unknown): Promise<{
        extractPdf(path: string): Promise<string>;
        list(target?: "memory" | "user"): string[];
        search(
          query: string,
          limit?: number,
        ): {
          memory: string;
          sessions: unknown[];
          memoryCharacters: number;
          sessionHits: number;
        };
      }>;
    };
    const service = await ServiceCtor.start();
    expect(await service.extractPdf("/tmp/example.pdf")).toBe(
      "pdf:/tmp/example.pdf",
    );
    expect(service.list()).toEqual(["m1", "m2"]);
    expect(service.search("query", 2)).toEqual({
      memory: "memory-body",
      sessions: [
        {
          sessionId: "s-0",
          createdAt: "2026-03-22T00:00:00.000Z",
          role: "user",
          text: "query-0",
        },
        {
          sessionId: "s-1",
          createdAt: "2026-03-22T00:00:00.000Z",
          role: "user",
          text: "query-1",
        },
      ],
      memoryCharacters: 11,
      sessionHits: 2,
    });
  });
});
