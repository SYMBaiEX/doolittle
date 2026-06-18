import { describe, expect, it } from "bun:test";
import type { IAgentRuntime, Memory, ResearchResult } from "@elizaos/core";
import { createResearchAction } from "./research-action";

function message(text: string): Memory {
  return { content: { text } } as Memory;
}

function makeRuntime(opts: {
  hasModel: boolean;
  research?: () => Promise<ResearchResult>;
}): IAgentRuntime {
  return {
    getModel: () => (opts.hasModel ? () => Promise.resolve({}) : undefined),
    useModel: (_modelType: unknown, _params: unknown) =>
      (
        opts.research ??
        (async () => {
          throw new Error("no research model");
        })
      )(),
  } as unknown as IAgentRuntime;
}

const noModelRuntime = makeRuntime({ hasModel: false });

describe("research action (ModelType.RESEARCH adoption)", () => {
  it("validates only a /research command with a question", async () => {
    const action = createResearchAction();
    expect(
      await action.validate(noModelRuntime, message("/research RAG in 2026")),
    ).toBe(true);
    expect(await action.validate(noModelRuntime, message("/research"))).toBe(
      false,
    );
    expect(
      await action.validate(noModelRuntime, message("tell me about RAG")),
    ).toBe(false);
  });

  it("responds gracefully when no RESEARCH model is registered", async () => {
    const action = createResearchAction();
    let delivered = "";
    const result = await action.handler(
      noModelRuntime,
      message("/research what is X"),
      undefined,
      undefined,
      async (content) => {
        delivered = content.text ?? "";
        return [];
      },
    );
    expect(result).toMatchObject({ success: false });
    expect(delivered).toContain("OPENAI_API_KEY");
  });

  it("runs the research model and renders a cited report", async () => {
    const action = createResearchAction();
    const runtime = makeRuntime({
      hasModel: true,
      research: async () =>
        ({
          id: "resp_1",
          text: "RAG combines retrieval with generation.",
          annotations: [
            {
              url: "https://a.example/x",
              title: "Paper A",
              startIndex: 0,
              endIndex: 3,
            },
            {
              url: "https://a.example/x",
              title: "Paper A dup",
              startIndex: 4,
              endIndex: 7,
            },
            {
              url: "https://b.example/y",
              title: "Paper B",
              startIndex: 8,
              endIndex: 11,
            },
          ],
        }) as unknown as ResearchResult,
    });
    let delivered = "";
    const result = await action.handler(
      runtime,
      message("/research how does RAG work"),
      undefined,
      undefined,
      async (content) => {
        delivered = content.text ?? "";
        return [];
      },
    );
    expect(result?.success).toBe(true);
    expect(delivered).toContain("RAG combines retrieval with generation.");
    expect(delivered).toContain("Sources:");
    expect(delivered).toContain("https://a.example/x");
    expect(delivered).toContain("https://b.example/y");
    // de-duped by url -> exactly two source lines
    expect(delivered.match(/^- /gmu)?.length).toBe(2);
  });

  it("reports a clear failure when the model throws", async () => {
    const action = createResearchAction();
    const runtime = makeRuntime({
      hasModel: true,
      research: async () => {
        throw new Error("rate limited");
      },
    });
    const result = await action.handler(
      runtime,
      message("/research boom"),
      undefined,
      undefined,
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("rate limited");
  });
});
