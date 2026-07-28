import type { createInterface } from "node:readline/promises";
import { describe, expect, it, vi } from "vitest";
import type { PromptRuntime } from "../prompting/types";

const createRuntime = (
  screen: unknown = null,
): PromptRuntime & {
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
} => ({
  getWizardScreen: () => screen as never,
  warn: vi.fn(() => {}),
  info: vi.fn(() => {}),
});

const createQuestionInterface = (
  answers: string[],
): ReturnType<typeof createInterface> =>
  ({
    question: vi.fn(async () => answers.shift() ?? ""),
  }) as unknown as ReturnType<typeof createInterface>;

describe("bootstrap prompts", () => {
  const loadPrompting = async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    return import("../prompting/text-prompts");
  };

  const loadSelection = async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    return import("../prompting/selection");
  };

  it("prefers wizard prompt text when a wizard screen is active", async () => {
    const { ask } = await loadPrompting();
    const promptText = vi.fn(async () => "riddle");
    const runtime = createRuntime({
      promptText,
      promptYesNo: vi.fn(async () => false),
      selectOne: vi.fn(async () => "offline"),
      selectMany: vi.fn(async () => []),
    });

    const value = await ask(runtime, null, "What is your name", "Doolittle");

    expect(value).toBe("riddle");
    expect(promptText).toHaveBeenCalledWith("What is your name", "Doolittle");
  });

  it("retries chooseOne on invalid input and returns the first valid numeric choice", async () => {
    await loadPrompting();
    const { chooseOne } = await loadSelection();
    const runtime = createRuntime();
    const rl = createQuestionInterface(["maybe", "2"]);

    const value = await chooseOne(
      runtime,
      rl,
      "Choose mode",
      [
        { value: "offline", label: "offline" },
        { value: "quick", label: "quick" },
      ],
      "offline",
    );

    expect(value).toBe("quick");
    expect(runtime.warn).toHaveBeenCalledTimes(1);
    expect(runtime.warn).toHaveBeenCalledWith(
      "Pick one of the listed options.",
    );
  });

  it("retries yes/no prompts on invalid input and returns the resolved boolean", async () => {
    const { askYesNo } = await loadPrompting();
    const runtime = createRuntime();
    const rl = createQuestionInterface(["huh", "yes"]);

    const value = await askYesNo(runtime, rl, "Proceed", false);

    expect(value).toBe(true);
    expect(runtime.warn).toHaveBeenCalledTimes(1);
    expect(runtime.warn).toHaveBeenCalledWith("Please answer yes or no.");
  });
});
