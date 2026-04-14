import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { BootstrapPromptScreen, PromptRuntime } from "./types";

function createRuntime(): PromptRuntime {
  return {
    getWizardScreen: mock(() => null),
    warn: mock(() => {}),
    info: mock(() => {}),
  };
}

async function loadSecretWithMocks() {
  const ask = mock(async () => "fallback-answer");

  mock.module("./text-prompts", () => ({
    ask,
  }));
  mock.module("./readline", () => ({
    requireReadline: mock(() => ({
      question: mock(async () => "fallback-answer"),
    })),
  }));
  mock.module("node:child_process", () => ({
    spawnSync: mock(() => ({ stdout: Buffer.from("") })),
  }));

  return {
    ask,
    module: import(`./secret?secret-tests=${Date.now()}-${Math.random()}`),
  };
}

describe("prompting secret helper", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("prefers wizard screen prompts when they exist", async () => {
    const promptText = mock(async (prompt: string, defaultValue: string) => {
      expect(prompt).toBe("Api key");
      expect(defaultValue).toBe("stored");
      return `${prompt}::${defaultValue}`;
    });

    mock.module("./text-prompts", () => ({
      ask: mock(async () => "should-not-be-used"),
    }));

    const runtime = createRuntime();
    const wizardScreen: BootstrapPromptScreen = {
      promptText,
      promptYesNo: mock(async () => true),
      selectOne: async <T extends string>(
        _prompt: string,
        _optionsList: Array<{ value: T; label: string; detail?: string }>,
        defaultValue: T,
      ) => defaultValue,
      selectMany: async <T extends string>() => [] as T[],
    };
    runtime.getWizardScreen = () => wizardScreen;

    const { askSecret } = await import(
      `./secret?secret-tests=${Date.now()}-${Math.random()}`
    );
    const value = await askSecret(runtime, null as never, "Api key", "stored");

    expect(value).toBe("Api key::stored");
    expect(promptText).toHaveBeenCalledWith("Api key", "stored", {
      secret: true,
    });
  });

  it("falls back to text prompt when no wizard screen is available", async () => {
    mock.module("node:process", () => ({
      stdin: {
        isTTY: false,
        write: () => {},
        setRawMode: undefined,
        resume: () => {},
      },
      stdout: { isTTY: false, write: () => {} },
    }));

    const { ask, module } = await loadSecretWithMocks();
    const { askSecret } = await module;
    const runtime = createRuntime();

    const value = await askSecret(runtime, null as never, "Api key", "stored");

    expect(value).toBe("fallback-answer");
    expect(ask).toHaveBeenCalledWith(runtime, null, "Api key", "stored");
  });
});
