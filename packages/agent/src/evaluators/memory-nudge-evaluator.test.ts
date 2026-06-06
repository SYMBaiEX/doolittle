import { describe, expect, it } from "bun:test";
import type { EvaluatorRunContext, Memory } from "@elizaos/core";
import type { AppServices } from "@/services";
import { createMemoryNudgeEvaluator } from "./memory-nudge-evaluator";

function makeServices() {
  const writes: Array<{ target: string; content: string }> = [];
  const services = {
    memory: {
      add: (target: string, content: string) => {
        writes.push({ target, content });
        return content;
      },
    },
  } as unknown as AppServices;
  return { services, writes };
}

function runContext(text: string): EvaluatorRunContext {
  return {
    message: { content: { text } } as Memory,
  } as EvaluatorRunContext;
}

describe("memoryNudge evaluator (beta contract)", () => {
  it("gates on remember/save cues via shouldRun", async () => {
    const { services } = makeServices();
    const evaluator = createMemoryNudgeEvaluator(services);
    expect(
      await evaluator.shouldRun(runContext("remember that we use Bun")),
    ).toBe(true);
    expect(await evaluator.shouldRun(runContext("what is the weather"))).toBe(
      false,
    );
  });

  it("requires a schema and prompt (beta-required fields)", () => {
    const { services } = makeServices();
    const evaluator = createMemoryNudgeEvaluator(services);
    expect(evaluator.schema).toBeDefined();
    expect(typeof evaluator.prompt).toBe("function");
  });

  it("parses model output into a normalized record", () => {
    const { services } = makeServices();
    const evaluator = createMemoryNudgeEvaluator(services);
    expect(
      evaluator.parse?.({
        shouldStore: true,
        target: "user",
        fact: "  likes bun  ",
      }),
    ).toEqual({ shouldStore: true, target: "user", fact: "likes bun" });
    expect(evaluator.parse?.({ target: "memory", fact: "" })).toBeNull();
    expect(evaluator.parse?.(null)).toBeNull();
  });

  it("persists the parsed fact through a processor", async () => {
    const { services, writes } = makeServices();
    const evaluator = createMemoryNudgeEvaluator(services);
    const processor = evaluator.processors?.[0];
    if (!processor) {
      throw new Error("expected a persistence processor");
    }
    type ProcessorContext = Parameters<typeof processor.process>[0];
    await processor.process({
      output: { shouldStore: true, target: "memory", fact: "uses bun" },
    } as unknown as ProcessorContext);
    await processor.process({
      output: { shouldStore: false, target: "memory", fact: "ignored" },
    } as unknown as ProcessorContext);
    expect(writes).toEqual([{ target: "memory", content: "uses bun" }]);
  });
});
