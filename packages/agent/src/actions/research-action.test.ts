import {
  type IAgentRuntime,
  type Memory,
  ModelType,
  type ResearchResult,
} from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { promptCacheMetrics } from "@/runtime/prompt-cache";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import { createResearchAction } from "./research-action";

function message(text: string): Memory {
  return { content: { text } } as Memory;
}

function makeRuntime(opts: {
  hasModel: boolean;
  cloudEnabled?: boolean;
  research?: (params: unknown, provider?: string) => Promise<ResearchResult>;
  onModelRequest?: (modelType: unknown, provider?: string) => void;
}): IAgentRuntime {
  return {
    getSetting: () => (opts.cloudEnabled === false ? "false" : "true"),
    getModel: () => (opts.hasModel ? () => Promise.resolve({}) : undefined),
    useModel: (modelType: unknown, params: unknown, provider?: string) => {
      opts.onModelRequest?.(modelType, provider);
      return (
        opts.research ??
        (async () => {
          throw new Error("no research model");
        })
      )(params, provider);
    },
  } as unknown as IAgentRuntime;
}

const noModelRuntime = makeRuntime({ hasModel: false });

describe("research action (ModelType.RESEARCH adoption)", () => {
  beforeEach(() => promptCacheMetrics.reset());

  it("lets the Eliza planner select research for natural-language turns", async () => {
    const action = createResearchAction();
    expect(
      await action.validate(noModelRuntime, message("/research RAG in 2026")),
    ).toBe(true);
    expect(await action.validate(noModelRuntime, message("/research"))).toBe(
      true,
    );
    expect(
      await action.validate(noModelRuntime, message("tell me about RAG")),
    ).toBe(true);
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
    expect(delivered).toContain("Eliza Cloud research provider");
  });

  it("does not call a registered research model while Eliza Cloud is disabled", async () => {
    const action = createResearchAction();
    const onModelRequest = vi.fn();
    const runtime = makeRuntime({
      hasModel: true,
      cloudEnabled: false,
      onModelRequest,
      research: async () =>
        ({ id: "resp_disabled", text: "Should not run." }) as ResearchResult,
    });

    const result = await action.handler(
      runtime,
      message("/research disabled provider"),
      undefined,
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Deep research is disabled");
    expect(onModelRequest).not.toHaveBeenCalled();
  });

  it("runs the research model and renders a cited report", async () => {
    const action = createResearchAction();
    let observedModelType: unknown;
    let observedProvider: string | undefined;
    const runtime = makeRuntime({
      hasModel: true,
      onModelRequest: (modelType, provider) => {
        observedModelType = modelType;
        observedProvider = provider;
      },
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
    expect(observedModelType).toBe(ModelType.RESEARCH);
    expect(observedProvider).toBe("elizaOSCloud");
    expect(result?.verifiedUserFacing).toBe(true);
    expect(result?.userFacingText).toBe(delivered);
    expect(result?.data).toEqual({
      actionName: "DOOLITTLE_RESEARCH",
      responseId: "resp_1",
      sources: [
        { title: "Paper A", url: "https://a.example/x" },
        { title: "Paper B", url: "https://b.example/y" },
      ],
    });
    expect(delivered).toContain("RAG combines retrieval with generation.");
    expect(delivered).toContain("Sources:");
    expect(delivered).toContain("https://a.example/x");
    expect(delivered).toContain("https://b.example/y");
    // de-duped by url -> exactly two source lines
    expect(delivered.match(/^- /gmu)?.length).toBe(2);
  });

  it("prefers planner-supplied structured parameters", async () => {
    let observedInput = "";
    const action = createResearchAction();
    const runtime = makeRuntime({
      hasModel: true,
      research: async (params) => {
        observedInput = (params as { input?: string }).input ?? "";
        return { id: "resp_2", text: "Planner report." } as ResearchResult;
      },
    });

    const result = await action.handler(
      runtime,
      message("Please investigate this topic."),
      undefined,
      { parameters: { question: "planner question" } },
    );

    expect(observedInput).toContain(
      "Produce a rigorous research report for the user.",
    );
    expect(observedInput).toContain("Research question:\nplanner question");
    expect(result?.text).toBe("Planner report.");

    const cacheSnapshot = promptCacheMetrics.snapshot();
    expect(cacheSnapshot.calls).toBe(1);
    expect(cacheSnapshot.eligibleCalls).toBe(0);
    expect(cacheSnapshot.segmentsEmitted).toBe(0);
    expect(cacheSnapshot.byProvider.research).toMatchObject({
      calls: 1,
      eligible: 0,
      segmentsEmitted: 0,
    });
  });

  it("forwards turn cancellation to the research model", async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const action = createResearchAction();
    const runtime = makeRuntime({
      hasModel: true,
      research: async (params) => {
        observedSignal = (params as { signal?: AbortSignal }).signal;
        return { id: "resp_abort", text: "Report." } as ResearchResult;
      },
    });

    await action.handler(
      runtime,
      message("/research cancellation"),
      undefined,
      { abortSignal: controller.signal },
    );

    expect(observedSignal).toBe(controller.signal);
  });

  it("stops awaiting beta providers and rethrows cancellation", async () => {
    const controller = new AbortController();
    const callback = vi.fn();
    let providerStarted = false;
    const action = createResearchAction();
    const runtime = makeRuntime({
      hasModel: true,
      research: async () => {
        providerStarted = true;
        return await new Promise<ResearchResult>(() => undefined);
      },
    });
    const pending = action.handler(
      runtime,
      message("/research cancellation"),
      undefined,
      { abortSignal: controller.signal },
      callback,
    );
    await vi.waitFor(() => expect(providerStarted).toBe(true));

    controller.abort(new DOMException("cancelled", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(callback).not.toHaveBeenCalled();
  });

  it("recovers request-local cancellation when beta.7 omits handler options", async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const action = createResearchAction();
    const runtime = makeRuntime({
      hasModel: true,
      research: async (params) => {
        observedSignal = (params as { signal?: AbortSignal }).signal;
        return { id: "resp_scoped", text: "Report." } as ResearchResult;
      },
    });

    await runWithTurnRuntimeScope(
      runtime,
      {
        abortSignal: controller.signal,
        settings: new Map(),
      },
      () =>
        action.handler(
          runtime,
          message("/research planned cancellation"),
          undefined,
          undefined,
        ),
    );

    expect(observedSignal).toBe(controller.signal);
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
