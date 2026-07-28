import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapWizardContext } from "../bootstrap-context";
import type { PromptHandle } from "../prompting/types";

function installPromptOpMocks() {
  const promptAsk = vi.fn(async (runtime: never) => {
    expect(runtime).toBeDefined();
    return "prompt-answer";
  });
  const promptAskSecret = vi.fn(async () => "secret-answer");
  const promptChooseOne = vi.fn(async () => "openai");
  const promptChooseMany = vi.fn(async () => ["mcp"]);
  const promptAskYesNo = vi.fn(async () => false);

  vi.doMock("../prompting/secret", () => ({
    askSecret: promptAskSecret,
  }));
  vi.doMock("../prompting/selection", () => ({
    chooseOne: promptChooseOne,
    chooseMany: promptChooseMany,
  }));
  vi.doMock("../prompting/text-prompts", () => ({
    ask: promptAsk,
    askYesNo: promptAskYesNo,
  }));

  return {
    promptAsk,
    promptAskSecret,
    promptChooseOne,
    promptChooseMany,
    promptAskYesNo,
  };
}

async function loadPromptOps() {
  return import("./prompt-ops");
}

const createContext = (): BootstrapWizardContext =>
  ({
    getWizardScreen: vi.fn(() => null),
    section: vi.fn(() => {}),
    banner: () => {},
    info: vi.fn(() => {}),
    warn: vi.fn(() => {}),
    formatKeyLabel: (label: string) => `[${label}]`,
    options: { headless: false, skipWizard: false },
    root: "/tmp",
    setWizardScreen: () => {},
    abortBootstrap: () => {},
    raceBootstrapAbort: async <T>(operation: Promise<T>) => await operation,
    throwIfBootstrapAborted: () => {},
  }) as BootstrapWizardContext;

describe("bootstrap core prompt ops", () => {
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

  it("delegates raw text prompts to the prompting text surface", async () => {
    const { promptAsk } = installPromptOpMocks();
    const { ask } = await loadPromptOps();
    const context = createContext();

    const value = await ask(
      context,
      null as unknown as PromptHandle,
      "name",
      "Doolittle",
    );

    expect(value).toBe("prompt-answer");
    expect(promptAsk).toHaveBeenCalledTimes(1);
    expect(promptAsk).toHaveBeenCalledWith(
      expect.objectContaining({
        getWizardScreen: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
      }),
      null,
      "name",
      "Doolittle",
    );
  });

  it("delegates yes/no prompts and returns the delegated response", async () => {
    const { promptAskYesNo } = installPromptOpMocks();
    const { askYesNo } = await loadPromptOps();
    const context = createContext();

    const value = await askYesNo(
      context,
      null as unknown as PromptHandle,
      "Proceed",
      true,
    );

    expect(value).toBe(false);
    expect(promptAskYesNo).toHaveBeenCalledTimes(1);
    expect(promptAskYesNo).toHaveBeenCalledWith(
      expect.objectContaining({
        getWizardScreen: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
      }),
      null,
      "Proceed",
      true,
    );
  });

  it("delegates single-choice selection without mutating prompt options", async () => {
    const { promptChooseOne } = installPromptOpMocks();
    const { chooseOne } = await loadPromptOps();
    const context = createContext();

    const value = await chooseOne(
      context,
      null as unknown as PromptHandle,
      "choose",
      [
        { value: "openai", label: "OpenAI" },
        { value: "claude-code", label: "Claude" },
      ],
      "openai",
    );

    expect(value).toBe("openai");
    expect(promptChooseOne).toHaveBeenCalledTimes(1);
    expect(promptChooseOne).toHaveBeenCalledWith(
      expect.objectContaining({
        getWizardScreen: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
      }),
      null,
      "choose",
      [
        { value: "openai", label: "OpenAI" },
        { value: "claude-code", label: "Claude" },
      ],
      "openai",
      undefined,
    );
  });

  it("delegates multi-choice and secret prompts", async () => {
    const { promptChooseMany, promptAskSecret } = installPromptOpMocks();
    const { chooseMany, askSecret } = await loadPromptOps();
    const context = createContext();

    const selected = await chooseMany(
      context,
      null as unknown as PromptHandle,
      "tools",
      [
        { value: "mcp", label: "mcp" },
        { value: "acp", label: "acp" },
      ],
      ["mcp"],
    );
    const secret = await askSecret(
      context,
      null as unknown as PromptHandle,
      "token",
      "fallback",
    );

    expect(selected).toEqual(["mcp"]);
    expect(secret).toBe("secret-answer");
    expect(promptChooseMany).toHaveBeenCalledTimes(1);
    expect(promptChooseMany).toHaveBeenCalledWith(
      expect.objectContaining({
        getWizardScreen: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
      }),
      null,
      "tools",
      [
        { value: "mcp", label: "mcp" },
        { value: "acp", label: "acp" },
      ],
      ["mcp"],
    );
    expect(promptAskSecret).toHaveBeenCalledTimes(1);
    expect(promptAskSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        getWizardScreen: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
      }),
      null,
      "token",
      "fallback",
    );
  });
});
