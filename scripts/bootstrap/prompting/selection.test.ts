import { describe, expect, it, mock, spyOn } from "bun:test";
import type { createInterface } from "node:readline/promises";
import type { PromptRuntime } from "./types";

const createRuntime = (): PromptRuntime & {
  warn: ReturnType<typeof mock>;
  info: ReturnType<typeof mock>;
} => ({
  getWizardScreen: () => null,
  warn: mock(() => {}),
  info: mock(() => {}),
});

const createQuestionInterface = (
  answers: string[],
): ReturnType<typeof createInterface> =>
  ({
    question: mock(async () => answers.shift() ?? ""),
  }) as unknown as ReturnType<typeof createInterface>;

describe("prompt selection", () => {
  const loadSelection = async () => {
    mock.restore();
    mock.clearAllMocks();
    mock.module("./terminal-menu", () => ({
      supportsInteractiveMenus: () => false,
      clearRenderedMenu: () => {},
      readMenuKeypress: async () => "",
      withRawMenuInput: async <T>(work: () => Promise<T>) => work(),
    }));
    return import(
      `./selection?bootstrap-prompting-selection=${Date.now()}-${Math.random()}`
    );
  };

  it("accepts direct value input for single selection", async () => {
    const { chooseOne } = await loadSelection();
    const runtime = createRuntime();
    const rl = createQuestionInterface(["quick"]);
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const value = await chooseOne(
      runtime,
      rl,
      "Choose mode",
      [
        { value: "offline", label: "offline" },
        { value: "quick", label: "quick", detail: "Fast path" },
      ],
      "offline",
    );

    expect(value).toBe("quick");
    expect(runtime.info).toHaveBeenCalledWith("Fast path");
    logSpy.mockRestore();
  });

  it("retries many selection on invalid input and de-duplicates values", async () => {
    const { chooseMany } = await loadSelection();
    const runtime = createRuntime();
    const rl = createQuestionInterface(["9", "2,2,1"]);
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const values = await chooseMany(
      runtime,
      rl,
      "Choose tools",
      [
        { value: "shell", label: "shell" },
        { value: "browser", label: "browser" },
      ],
      ["shell"],
    );

    expect(values).toEqual(["browser", "shell"]);
    expect(runtime.warn).toHaveBeenCalledTimes(1);
    expect(runtime.warn).toHaveBeenCalledWith(
      "Enter one or more valid option numbers.",
    );
    logSpy.mockRestore();
  });
});
