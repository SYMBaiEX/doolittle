import { describe, expect, it } from "vitest";
import type { InteractiveTerminalSession } from "../../shared/contracts";
import { createInteractiveTerminalTab } from "./interactive-terminal-store";
import { mergeManagedApplicationTabs } from "./managed-application-tabs";

const session: InteractiveTerminalSession = {
  id: "managed-app",
  cwd: "/workspace/blog",
  state: "running",
  shell: "zsh",
  cols: 100,
  rows: 30,
  startedAt: "2026-09-22T12:00:00Z",
  pty: true,
  supportsResize: true,
  outputBytes: 80,
  managed: true,
  processId: 42,
};

describe("managed app terminal discovery", () => {
  it("adds an agent-started app as an existing terminal session, without duplicating it", () => {
    const first = createInteractiveTerminalTab("Terminal 1");
    const result = mergeManagedApplicationTabs([first], [session]);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      name: "App · blog",
      sessionId: "managed-app",
      state: "running",
      cwd: "/workspace/blog",
    });
    expect(mergeManagedApplicationTabs(result, [session])).toBe(result);
  });

  it("replaces only an inactive tab if the tab strip is full", () => {
    const tabs = Array.from({ length: 4 }, (_, i) => ({
      ...createInteractiveTerminalTab(`Terminal ${i}`),
      state: i === 2 ? ("closed" as const) : ("running" as const),
    }));
    const result = mergeManagedApplicationTabs(tabs, [session]);
    expect(result).toHaveLength(4);
    expect(result).toContain(tabs[0]);
    expect(result).toContain(tabs[1]);
    expect(result).toContain(tabs[3]);
    expect(result).not.toContain(tabs[2]);
    expect(
      mergeManagedApplicationTabs(result, [{ ...session, id: "second-app" }]),
    ).toBe(result);
  });

  it("does not resurrect stopped app sessions or import unrelated shells", () => {
    const tabs = [createInteractiveTerminalTab()];
    expect(
      mergeManagedApplicationTabs(tabs, [
        { ...session, state: "closed" },
        { ...session, managed: false },
      ]),
    ).toBe(tabs);
  });
});
