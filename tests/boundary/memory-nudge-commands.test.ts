import type { Memory } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createMemoryNudgeEvaluator } from "../../packages/agent/src/evaluators/memory-nudge-evaluator";
import type { AppServices } from "../../packages/agent/src/services";

function fixture(text?: string) {
  const add = vi.fn();
  const evaluator = createMemoryNudgeEvaluator({
    memory: { add },
  } as unknown as AppServices);
  const message = {
    content: text === undefined ? {} : { text },
    metadata: { doolittle: { userId: "test-user" } },
  } as Memory;
  type Context = Parameters<NonNullable<typeof evaluator.shouldRun>>[0];
  const context = { message } as Context;
  return { add, evaluator, context };
}

it.each([
  ["remember that releases are on Friday", "releases are on Friday"],
  ["please remember to run tests", "to run tests"],
  ["save that releases are on Friday", "releases are on Friday"],
  ["keep in mind that releases are on Friday", "releases are on Friday"],
  ["keep in mind releases are on Friday", "releases are on Friday"],
  ["remember thatcher is a surname", "thatcher is a surname"],
  ["  PLEASE REMEMBER this fact  ", "this fact"],
  ["remember this line\nand this line", "this line\nand this line"],
  ["Keep in mind: deploys are Fridays", "deploys are Fridays"],
  ["Remember; deploys are Fridays", "deploys are Fridays"],
  ["Please remember, thatcher is a surname", "thatcher is a surname"],
])("persists explicit command %j", async (text, fact) => {
  const { add, evaluator, context } = fixture(text);
  expect(await evaluator.shouldRun?.(context)).toBe(true);
  const prepared = await evaluator.prepare?.(context);
  expect(prepared).toEqual({ fact, target: "memory" });
  if (!prepared) throw new Error("Missing prepared memory");
  await evaluator.processors?.[0].process({ ...context, prepared });
  expect(add).toHaveBeenCalledExactlyOnceWith("memory", fact, "test-user");
});

it.each([
  "don't remember this fact",
  "do not remember this fact",
  "never remember this fact",
  "please don't remember this fact",
  "please do not remember this fact",
  "do you remember our previous conversation?",
  "Do you remember that I prefer tea?",
  "Can you keep in mind what I said?",
  "I remember our previous conversation",
  "I will save that later",
  "remembering this is difficult",
  "remembered this fact",
  "save thatcher is a surname",
  "keep in mindfulness practice",
  "remember",
  "remember that",
  "please remember   ",
  "save that",
  "keep in mind",
  "Remember,",
  "Keep in mind:",
  "",
  undefined,
])("does not persist non-command or empty input %j", async (text) => {
  const { add, evaluator, context } = fixture(text);
  expect(await evaluator.shouldRun?.(context)).toBe(false);
  const prepared = await evaluator.prepare?.(context);
  if (!prepared) throw new Error("Missing prepared memory");
  await evaluator.processors?.[0].process({ ...context, prepared });
  expect(add).not.toHaveBeenCalled();
});

it.each([
  ["Remember that I prefer tea", "I prefer tea"],
  ["Remember, I prefer tabs", "I prefer tabs"],
  ["Remember that I live in Paris", "I live in Paris"],
])("retains user preference ownership for %j", async (text, fact) => {
  const { add, evaluator, context } = fixture(text);
  const prepared = await evaluator.prepare?.(context);
  expect(prepared).toEqual({ fact, target: "user" });
  if (!prepared) throw new Error("Missing prepared memory");
  await evaluator.processors?.[0].process({ ...context, prepared });
  expect(add).toHaveBeenCalledExactlyOnceWith("user", fact, "test-user");
});

it("tolerates a rejected storage write", async () => {
  const { add, evaluator, context } = fixture("remember this fact");
  add.mockImplementation(() => {
    throw new Error("Memory limit reached");
  });
  const prepared = await evaluator.prepare?.(context);
  if (!prepared) throw new Error("Missing prepared memory");
  await expect(
    evaluator.processors?.[0].process({ ...context, prepared }),
  ).resolves.toBeUndefined();
  expect(add).toHaveBeenCalledOnce();
});
