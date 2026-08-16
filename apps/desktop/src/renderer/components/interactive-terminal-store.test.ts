import { describe, expect, it } from "vitest";
import type { InteractiveTerminalWorkspaceState } from "./interactive-terminal-store";
import {
  createInteractiveTerminalTab,
  loadInteractiveTerminalState,
  MAX_INTERACTIVE_TERMINAL_TABS,
  MAX_RENDERED_TERMINAL_OUTPUT,
  MAX_TERMINAL_COMMAND_HISTORY,
  parseInteractiveTerminalState,
  resolveInteractiveTerminalWorkspaceState,
  saveInteractiveTerminalState,
} from "./interactive-terminal-store";

function fakeStorage(): Storage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    length: 0,
    key: () => null,
  } as Storage & { values: Map<string, string> };
}

describe("interactive terminal state", () => {
  it("removes obsolete navigation-poll notices from persisted output", () => {
    const tab = createInteractiveTerminalTab("Terminal 1");
    tab.output = [
      "before",
      "[Terminal dceae3e2 cannot be polled after navigation.]",
      "after",
    ].join("\n");

    const parsed = parseInteractiveTerminalState({
      activeTabId: tab.id,
      tabs: [tab],
    });

    expect(parsed.tabs[0]?.output).toBe("before\nafter");
  });

  it("builds a workspace default when storage is empty", () => {
    const state = loadInteractiveTerminalState("/tmp/empty", fakeStorage());

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.name).toBe("Terminal 1");
    expect(state.tabs[0]?.state).toBe("closed");
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
  });

  it("restores and sanitizes persisted terminal state", () => {
    const storage = fakeStorage();
    const corrupted: InteractiveTerminalWorkspaceState = {
      activeTabId: "missing",
      tabs: Array.from({ length: 6 }, () => ({
        ...createInteractiveTerminalTab("Terminal"),
        state: "running",
        cursor: 9_999,
        output: "x".repeat(MAX_RENDERED_TERMINAL_OUTPUT + 1000),
        commandHistory: Array.from(
          { length: 200 },
          (_, index) => `command-${index}`,
        ),
      })),
    };
    const secondTab = corrupted.tabs.at(1);
    if (secondTab) {
      secondTab.id = "keep-1";
    }

    saveInteractiveTerminalState("/tmp/project", corrupted, storage);
    const restored = loadInteractiveTerminalState("/tmp/project", storage);

    expect(restored.tabs).toHaveLength(MAX_INTERACTIVE_TERMINAL_TABS);
    expect(restored.activeTabId).toBe(restored.tabs[0]?.id);
    expect(restored.tabs[0]?.commandHistory).toHaveLength(
      MAX_TERMINAL_COMMAND_HISTORY,
    );
    expect(
      restored.tabs[0]?.output.length <= MAX_RENDERED_TERMINAL_OUTPUT,
    ).toBe(true);
  });

  it("sanitizes malformed tab snapshots", () => {
    const loaded = parseInteractiveTerminalState({
      activeTabId: "ghost",
      tabs: [
        {
          id: "tab-a",
          name: "A",
          state: "bogus",
          cols: "wide",
          rows: -40,
          commandHistory: ["ls", "", 12, "git status"],
          output: 123,
          pty: "yes",
        },
      ],
    });

    expect(loaded.tabs).toHaveLength(1);
    expect(loaded.tabs[0]).toMatchObject({
      id: "tab-a",
      name: "A",
      state: "closed",
      cols: 100,
      rows: 5,
      commandHistory: ["ls", "git status"],
    });
  });

  it("does not mark an untouched persisted closed tab as stale", () => {
    const tab = createInteractiveTerminalTab("Terminal 1");
    tab.id = "default-tab";
    const state = parseInteractiveTerminalState({
      activeTabId: tab.id,
      tabs: [tab],
    });

    expect(state.tabs[0]?.stale).toBe(false);
  });

  it("marks a persisted non-running session as stale", () => {
    const tab = createInteractiveTerminalTab("Terminal 1");
    tab.id = "closed-session";
    tab.sessionId = "real-session";
    tab.state = "closed";
    const state = parseInteractiveTerminalState({
      activeTabId: tab.id,
      tabs: [tab],
    });

    expect(state.tabs[0]?.stale).toBe(true);
  });

  it("preserves active tabs during initial workspace hydration after user interaction", () => {
    const secondTab = createInteractiveTerminalTab("Terminal 2");
    const current: InteractiveTerminalWorkspaceState = {
      activeTabId: secondTab.id,
      tabs: [
        {
          ...createInteractiveTerminalTab("Terminal 1"),
          cwd: "Unknown",
        },
        {
          ...secondTab,
          cwd: "Unknown",
          output: "echo hello\n",
        },
      ],
    };
    const storage = fakeStorage();

    const resolved = resolveInteractiveTerminalWorkspaceState({
      previousWorkspacePath: "",
      nextWorkspacePath: "/work/doolittle",
      currentState: current,
      storage,
    });

    expect(resolved.tabs).toHaveLength(2);
    expect(resolved.activeTabId).toBe(secondTab.id);
    expect(resolved.tabs.every((tab) => tab.cwd === "/work/doolittle")).toBe(
      true,
    );
  });

  it("loads persisted workspace tabs when hydration has no local terminal activity", () => {
    const storage = fakeStorage();
    const persisted = createInteractiveTerminalTab("Saved terminal");
    persisted.cwd = "/work/doolittle";
    saveInteractiveTerminalState(
      "/work/doolittle",
      {
        activeTabId: persisted.id,
        tabs: [persisted],
      },
      storage,
    );

    const resolved = resolveInteractiveTerminalWorkspaceState({
      previousWorkspacePath: "",
      nextWorkspacePath: "/work/doolittle",
      currentState: {
        activeTabId: "",
        tabs: [createInteractiveTerminalTab("Terminal 1")],
      },
      storage,
    });

    expect(resolved.tabs).toHaveLength(1);
    expect(resolved.tabs[0]?.name).toBe("Saved terminal");
    expect(resolved.tabs[0]?.cwd).toBe("/work/doolittle");
  });

  it("closes persisted running tabs when returning after a workspace switch", () => {
    const storage = fakeStorage();
    const persisted = createInteractiveTerminalTab("Build shell");
    persisted.sessionId = "session-from-workspace-a";
    persisted.state = "running";
    persisted.output = "bun test\n";
    saveInteractiveTerminalState(
      "/work/a",
      { activeTabId: persisted.id, tabs: [persisted] },
      storage,
    );

    const resolved = resolveInteractiveTerminalWorkspaceState({
      previousWorkspacePath: "/work/b",
      nextWorkspacePath: "/work/a",
      currentState: {
        activeTabId: "workspace-b-tab",
        tabs: [createInteractiveTerminalTab("Terminal 1")],
      },
      storage,
    });

    expect(resolved.tabs[0]).toMatchObject({
      state: "closed",
      sessionId: null,
      stale: true,
      output: "bun test\n",
    });
  });

  it("keeps persisted running tabs live when the workspace did not change", () => {
    const storage = fakeStorage();
    const persisted = createInteractiveTerminalTab("Build shell");
    persisted.sessionId = "live-session";
    persisted.state = "running";
    saveInteractiveTerminalState(
      "/work/a",
      { activeTabId: persisted.id, tabs: [persisted] },
      storage,
    );

    const resolved = resolveInteractiveTerminalWorkspaceState({
      previousWorkspacePath: "/work/a",
      nextWorkspacePath: "/work/a",
      currentState: {
        activeTabId: persisted.id,
        tabs: [persisted],
      },
      storage,
    });

    expect(resolved.tabs[0]).toMatchObject({
      state: "running",
      sessionId: "live-session",
      stale: false,
    });
  });
});
