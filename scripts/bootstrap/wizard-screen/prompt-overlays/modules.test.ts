import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createPromptYesNoHandler } from "./confirm";
import { createSelectManyHandler } from "./select-many";
import { createSelectOneHandler } from "./select-one";
import type { WizardPromptOverlayDependencies } from "./shared";
import { createPromptTextHandler } from "./text";

function createDeps() {
  const calls: Array<{ title: string; body: string }> = [];
  const render = mock(() => {});
  const setFooter = mock(() => {});
  const showOverlay = mock(async (title: string, body: string) => {
    calls.push({ title, body });
    if (title === "Confirm") {
      return true as never;
    }
    if (title === "Input") {
      return "stored" as never;
    }
    if (title === "Choose One") {
      return "openai" as never;
    }
    return ["mcp", "acp"] as never;
  });

  const deps: WizardPromptOverlayDependencies = {
    formatKeyLabel: (label) => `[${label}]`,
    render,
    setFooter,
    showOverlay,
    widgets: {
      header: {
        style: {
          bg: "#000",
        },
      },
    } as never,
  };

  return { deps, calls, showOverlay, render, setFooter };
}

describe("wizard-screen prompt overlay modules", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("delegates yes/no prompts to overlay titles and text cues", async () => {
    const { deps, calls, showOverlay } = createDeps();
    const handler = createPromptYesNoHandler(deps);

    const value = await handler("Enable plugin", true);

    expect(value).toBe(true);
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].title).toBe("Confirm");
    expect(calls[0].body).toContain("Enable plugin");
    expect(calls[0].body).toContain("Enter confirms");
  });

  it("delegates text prompts with secret flag and stores defaults", async () => {
    const { deps, calls, showOverlay } = createDeps();
    const handler = createPromptTextHandler(deps);

    const value = await handler("API key", "stored", { secret: true });

    expect(value).toBe("stored");
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(calls[0].title).toBe("Input");
    expect(calls[0].body).toContain("API key");
    expect(calls[0].body).toContain("stored");
  });

  it("delegates single-select prompts and tracks subtitles", async () => {
    const { deps, calls, showOverlay } = createDeps();
    const handler = createSelectOneHandler(deps);

    const value = await handler(
      "Choose provider",
      [
        { value: "openai", label: "OpenAI", detail: "Primary" },
        { value: "offline", label: "Offline" },
      ],
      "openai",
      { onHighlight: () => {} },
    );

    expect(value).toBe("openai");
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(calls[0].title).toBe("Choose One");
    expect(calls[0].body).toContain("Choose provider");
    expect(calls[0].body).toContain("Enter confirm");
  });

  it("delegates multi-select prompts and communicates selection details", async () => {
    const { deps, calls, showOverlay } = createDeps();
    const handler = createSelectManyHandler(deps);

    const value = await handler(
      "Select tools",
      [
        { value: "mcp", label: "MCP" },
        { value: "acp", label: "ACP" },
      ],
      ["mcp"],
    );

    expect(value).toEqual(["mcp", "acp"]);
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(calls[0].title).toBe("Choose Many");
    expect(calls[0].body).toContain("Select tools");
    expect(calls[0].body).toContain("Space toggle");
  });
});
