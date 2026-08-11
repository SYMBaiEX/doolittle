import { describe, expect, it } from "vitest";
import {
  appendTerminalBytes,
  closeTerminalTabState,
  terminalChatContext,
  terminalTabLabelId,
} from "./interactive-terminal-state";
import { createInteractiveTerminalTab } from "./interactive-terminal-store";

describe("interactive terminal pure state", () => {
  it("preserves ANSI and trims output from the front", () => {
    expect(appendTerminalBytes("build ", "\u001B[32mok\u001B[0m\r\n", 64)).toBe(
      "build \u001B[32mok\u001B[0m\r\n",
    );
    expect(appendTerminalBytes("12345", "67890", 4)).toBe("7890");
  });

  it("adds one retained-output marker before the newly available bytes", () => {
    const first = appendTerminalBytes("before", "after", 100, true);
    expect(first).toBe(
      "before\n[Doolittle retained the newest terminal output.]after",
    );
    expect(appendTerminalBytes(first, "more", 120, true)).toBe(
      "before\n[Doolittle retained the newest terminal output.]aftermore",
    );
  });

  it("keeps the synchronously selected tab after an unrelated async close", () => {
    const first = createInteractiveTerminalTab("Terminal 1");
    first.id = "first";
    const second = createInteractiveTerminalTab("Terminal 2");
    second.id = "second";
    const selectedWhileClosing = createInteractiveTerminalTab("Terminal 3");
    selectedWhileClosing.id = "third";
    const result = closeTerminalTabState({
      tabs: [first, second, selectedWhileClosing],
      activeTabId: selectedWhileClosing.id,
      tabId: first.id,
      fallbackTab: createInteractiveTerminalTab("Terminal 1"),
    });

    expect(result.tabs).toEqual([second, selectedWhileClosing]);
    expect(result.activeTabId).toBe(selectedWhileClosing.id);
  });

  it("bounds terminal chat context to the newest output", () => {
    const context = terminalChatContext("x".repeat(20_100));

    expect(context).toContain("<terminal_context>");
    expect(context).toContain("</terminal_context>");
    expect(context).toContain("x".repeat(20_000));
    expect(context).not.toContain("x".repeat(20_001));
  });

  it("keeps the panel label identity separate from the editable tab control", () => {
    expect(terminalTabLabelId("a-tab")).toBe(
      "interactive-terminal-a-tab-label",
    );
  });
});
