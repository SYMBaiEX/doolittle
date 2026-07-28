import type {
  EvaluatorProcessorContext,
  EvaluatorRunContext,
  Memory,
  State,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
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

function message(text: string): Memory {
  return { content: { text } } as Memory;
}

function runContext(text: string): EvaluatorRunContext {
  return {
    runtime: {} as never,
    message: message(text),
    options: {},
  };
}

async function processorContext(
  text: string,
  output: "STORE" = "STORE",
): Promise<
  EvaluatorProcessorContext<
    "STORE",
    { fact: string; target: "user" | "memory" }
  >
> {
  const base = runContext(text);
  const evaluator = createMemoryNudgeEvaluator({} as AppServices);
  const prepared =
    (
      evaluator.prepare as (
        context: EvaluatorRunContext & { state: State },
      ) => Promise<{ fact: string; target: "user" | "memory" }>
    )({
      ...base,
      state: {} as State,
    }) ?? Promise.resolve({ fact: "", target: "memory" as const });

  return {
    ...base,
    state: {} as State,
    prepared: await prepared,
    output,
    evaluatorName: evaluator.name,
  } as never;
}

describe("memoryNudge evaluator", () => {
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

  it("uses the beta evaluator contract", () => {
    const { services } = makeServices();
    const evaluator = createMemoryNudgeEvaluator(services);
    expect(evaluator.schema).toBeDefined();
    expect(typeof evaluator.shouldRun).toBe("function");
    expect(typeof evaluator.prepare).toBe("function");
    expect(typeof evaluator.prompt).toBe("function");
    expect(typeof evaluator.processors?.[0]?.process).toBe("function");
  });

  it("persists a normalized explicit memory request from the processor", async () => {
    const { services, writes } = makeServices();
    const evaluator = createMemoryNudgeEvaluator(services);
    const processor = evaluator.processors?.[0];
    if (!processor) {
      throw new Error("expected a memory nudge processor");
    }

    await processor.process(await processorContext("remember that we use Bun"));

    expect(writes).toEqual([{ target: "memory", content: "we use Bun" }]);
  });

  it("swallows duplicate or over-limit memory write failures", async () => {
    const evaluator = createMemoryNudgeEvaluator({
      memory: {
        add: () => {
          throw new Error("duplicate");
        },
      },
    } as unknown as AppServices);
    const processor = evaluator.processors?.[0];
    if (!processor) {
      throw new Error("expected a memory nudge processor");
    }

    await expect(
      processor.process(await processorContext("remember that we use Bun")),
    ).resolves.toBeUndefined();
  });
});
