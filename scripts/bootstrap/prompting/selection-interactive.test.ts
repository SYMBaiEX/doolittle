import { afterEach, describe, expect, it, mock } from "bun:test";

function installSelectionInteractiveMocks(keys: string[]) {
  const keypresses = [...keys];
  const clearRenderedMenu = mock(() => 0);
  const readMenuKeypress = mock(async () => keypresses.shift() ?? "\r");
  const withRawMenuInput = mock(
    async <T>(run: () => Promise<T>): Promise<T> => run(),
  );

  mock.module("./terminal-menu", () => ({
    clearRenderedMenu,
    readMenuKeypress,
    withRawMenuInput,
  }));
  mock.module("../core/output", () => ({
    bootstrapColor: {
      cyan: "cyan",
      dim: "dim",
      bold: "",
    },
    paint: (value: string) => value,
  }));

  return {
    clearRenderedMenu,
    readMenuKeypress,
    withRawMenuInput,
  };
}

async function loadSelectionInteractive() {
  return import(
    `./selection-interactive?selection-interactive-tests=${Date.now()}-${Math.random()}`
  );
}

describe("prompting interactive selection", () => {
  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("resolves the current selection from direct enter in single-select flow", async () => {
    installSelectionInteractiveMocks(["\r"]);
    const { chooseOneInteractive } = await loadSelectionInteractive();

    const value = await chooseOneInteractive(
      "Choose mode",
      [
        { value: "offline", label: "Offline" },
        { value: "openai", label: "OpenAI" },
        { value: "claude", label: "Claude" },
      ],
      "offline",
    );

    expect(value).toBe("offline");
  });

  it("moves the single-select cursor with arrows and confirms on enter", async () => {
    const { readMenuKeypress } = installSelectionInteractiveMocks([
      "\u001b[B",
      "\u001b[B",
      "\r",
    ]);
    const { chooseOneInteractive } = await loadSelectionInteractive();

    const value = await chooseOneInteractive(
      "Choose provider",
      [
        { value: "offline", label: "Offline" },
        { value: "openai", label: "OpenAI" },
        { value: "claude", label: "Claude" },
      ],
      "offline",
    );

    expect(readMenuKeypress).toHaveBeenCalledTimes(3);
    expect(value).toBe("claude");
  });

  it("handles multi-select toggles and returns active values", async () => {
    installSelectionInteractiveMocks(["2", "\r"]);
    const { chooseManyInteractive } = await loadSelectionInteractive();

    const selected = await chooseManyInteractive(
      "Select tools",
      [
        { value: "mcp", label: "MCP" },
        { value: "acp", label: "ACP" },
        { value: "tts", label: "TTS" },
      ],
      ["mcp"],
    );

    expect(selected).toEqual(["mcp", "acp"]);
  });

  it("returns defaults when escaping from multi-select", async () => {
    installSelectionInteractiveMocks(["\u001b"]);
    const { chooseManyInteractive } = await loadSelectionInteractive();

    const selected = await chooseManyInteractive(
      "Select tools",
      [
        { value: "mcp", label: "MCP" },
        { value: "acp", label: "ACP" },
      ],
      ["acp"],
    );

    expect(selected).toEqual(["acp"]);
  });
});
