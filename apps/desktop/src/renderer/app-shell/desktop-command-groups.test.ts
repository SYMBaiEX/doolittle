import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../shared/contracts";
import type { ProjectLike } from "../project-manager/models";
import { buildDesktopCommandGroups } from "./desktop-command-groups";

function session(index: number): SessionSummary {
  return {
    sessionId: `session-${index}`,
    title: `Conversation ${index}`,
    messageCount: index,
    participants: ["user", "assistant"],
    preview: [],
  };
}

function project(index: number, pinned = false): ProjectLike {
  return {
    id: `project-${index}`,
    name: `Project ${index}`,
    chatCount: index,
    pinned,
    updatedAt: `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`,
  };
}

function build(
  overrides: Partial<Parameters<typeof buildDesktopCommandGroups>[0]> = {},
) {
  return buildDesktopCommandGroups({
    backendPhase: "ready",
    navCollapsed: false,
    onChooseRepository: vi.fn(),
    onCreateConversation: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onOpenSession: vi.fn(),
    onRefresh: vi.fn(),
    onSelectProjectScope: vi.fn(),
    onSetView: vi.fn(),
    onSwitchRecentWorkspace: vi.fn(async () => true),
    onToggleAppearance: vi.fn(),
    onToggleNavigation: vi.fn(),
    onToggleTerminal: vi.fn(),
    paletteQuery: "",
    platform: "darwin",
    projectCards: Array.from({ length: 6 }, (_, index) =>
      project(index + 1, index === 0),
    ),
    recentWorkspacePaths: ["/work/current", "/work/other"],
    resolvedAppearance: "dark",
    runningTasks: 2,
    searchCommandGroups: [],
    sessionsCount: 12,
    sidebarSessions: Array.from({ length: 7 }, (_, index) =>
      session(index + 1),
    ),
    terminalOpen: false,
    workspacePath: "/work/current",
    ...overrides,
  });
}

describe("desktop command groups", () => {
  it("keeps the idle palette bounded and action-oriented", () => {
    const groups = build();

    expect(groups.map((group) => group.id)).toEqual([
      "recents",
      "quick-actions",
      "projects",
    ]);
    expect(groups[0]?.items).toHaveLength(4);
    expect(groups[1]?.items.map((item) => item.id)).toEqual([
      "new-chat",
      "toggle-terminal",
      "open-workspace",
      "open-live-tasks",
    ]);
    expect(groups[2]?.items).toHaveLength(4);
    expect(groups[2]?.items[0]?.label).toBe("Project 1");
  });

  it("exposes the full catalog during search and wires the terminal shortcut", () => {
    const onToggleTerminal = vi.fn();
    const groups = build({ paletteQuery: "terminal", onToggleTerminal });
    const commands = groups.flatMap((group) => group.items);
    const terminal = commands.find((item) => item.id === "toggle-terminal");

    expect(groups.some((group) => group.id === "workspaces")).toBe(true);
    expect(groups.some((group) => group.id === "workspace")).toBe(true);
    expect(terminal?.shortcuts).toEqual(["⌘ J"]);
    terminal?.onSelect?.(terminal);
    expect(onToggleTerminal).toHaveBeenCalledOnce();
  });
});
