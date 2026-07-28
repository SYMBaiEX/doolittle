import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPromptScreen, PromptRuntime } from "./types";

function createRuntime(): PromptRuntime {
  return {
    getWizardScreen: vi.fn(() => null),
    warn: vi.fn(() => {}),
    info: vi.fn(() => {}),
  };
}

async function loadSecretWithMocks() {
  const ask = vi.fn(async () => "fallback-answer");

  vi.doMock("./text-prompts", () => ({
    ask,
  }));
  vi.doMock("./readline", () => ({
    requireReadline: vi.fn(() => ({
      question: vi.fn(async () => "fallback-answer"),
    })),
  }));
  vi.doMock("node:child_process", () => ({
    spawnSync: vi.fn(() => ({ stdout: Buffer.from("") })),
  }));

  return {
    ask,
    module: import("./secret"),
  };
}

describe("prompting secret helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("prefers wizard screen prompts when they exist", async () => {
    const promptText = vi.fn(async (prompt: string, defaultValue: string) => {
      expect(prompt).toBe("Api key");
      expect(defaultValue).toBe("stored");
      return `${prompt}::${defaultValue}`;
    });

    vi.doMock("./text-prompts", () => ({
      ask: vi.fn(async () => "should-not-be-used"),
    }));

    const runtime = createRuntime();
    const wizardScreen: BootstrapPromptScreen = {
      promptText,
      promptYesNo: vi.fn(async () => true),
      selectOne: async <T extends string>(
        _prompt: string,
        _optionsList: Array<{ value: T; label: string; detail?: string }>,
        defaultValue: T,
      ) => defaultValue,
      selectMany: async <T extends string>() => [] as T[],
    };
    runtime.getWizardScreen = () => wizardScreen;

    const { askSecret } = await import("./secret");
    const value = await askSecret(runtime, null as never, "Api key", "stored");

    expect(value).toBe("Api key::stored");
    expect(promptText).toHaveBeenCalledWith("Api key", "stored", {
      secret: true,
    });
  });

  it("falls back to text prompt when no wizard screen is available", async () => {
    vi.doMock("node:process", () => ({
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
