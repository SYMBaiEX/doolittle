import type { InteractiveTerminalSession } from "../../shared/contracts";
import {
  createInteractiveTerminalTab,
  type InteractiveTerminalTabState,
  MAX_INTERACTIVE_TERMINAL_TABS,
} from "./interactive-terminal-store";

/** Discover agent-started apps in the existing terminal, without replacing live tabs. */
export function mergeManagedApplicationTabs(
  tabs: InteractiveTerminalTabState[],
  sessions: InteractiveTerminalSession[],
): InteractiveTerminalTabState[] {
  let next = tabs;
  for (const session of sessions) {
    if (
      !session.managed ||
      session.state !== "running" ||
      next.some((tab) => tab.sessionId === session.id)
    )
      continue;
    if (next.length >= MAX_INTERACTIVE_TERMINAL_TABS) {
      const disposable = next.findIndex((tab) => tab.state !== "running");
      if (disposable < 0) continue;
      next = next.filter((_, index) => index !== disposable);
    }
    const project =
      session.cwd.split(/[\\/]/u).filter(Boolean).at(-1) || "application";
    const tab: InteractiveTerminalTabState = {
      ...createInteractiveTerminalTab(`App · ${project}`),
      id: `app-${session.id}`,
      sessionId: session.id,
      state: session.state,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      startedAt: session.startedAt,
      pty: session.pty,
      supportsResize: session.supportsResize,
      outputBytes: session.outputBytes,
    };
    next = [...next, tab];
  }
  return next;
}
