import { describe, expect, it, mock } from "bun:test";
import type { createInterface } from "node:readline/promises";
import type { PromptRuntime } from "../prompting/types";

const createRuntime = (
  screen: unknown = null,
): PromptRuntime & {
  warn: ReturnType<typeof mock>;
  info: ReturnType<typeof mock>;
} => ({
  getWizardScreen: () => screen as never,
  warn: mock(() => {}),
  info: mock(() => {}),
});

const createQuestionInterface = (
  answers: string[],
): ReturnType<typeof createInterface> =>
  ({
    question: mock(async () => answers.shift() ?? ""),
  }) as unknown as ReturnType<typeof createInterface>;

describe("bootstrap prompts", () => {
  const loadPrompting = async () => {
    mock.restore();
    mock.clearAllMocks();
    return import(
      `../prompting/text-prompts?bootstrap-core-prompts=${Date.now()}-${Math.random()}`
    );
  };

  const loadSelection = async () => {
    mock.restore();
    mock.clearAllMocks();
    return import(
      `../prompting/selection?bootstrap-core-prompts=${Date.now()}-${Math.random()}`
    );
  };

  it("prefers wizard prompt text when a wizard screen is active", async () => {
    const { ask } = await loadPrompting();
    const promptText = mock(async () => "riddle");
    const runtime = createRuntime({
      promptText,
      promptYesNo: mock(async () => false),
      selectOne: mock(async () => "offline"),
      selectMany: mock(async () => []),
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
