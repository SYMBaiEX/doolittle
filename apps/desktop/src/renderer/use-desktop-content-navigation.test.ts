import { describe, expect, it, vi } from "vitest";
import type { Project, SessionSummary } from "../shared/contracts";
import type { GlobalSearchTarget } from "./global-search";
import {
  createNavigationTransitionCoordinator,
  navigateGlobalSearchTarget,
  resolveChatContextHandoff,
} from "./use-desktop-content-navigation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function navigationActions(
  overrides: Partial<Parameters<typeof navigateGlobalSearchTarget>[2]> = {},
) {
  return {
    openProjectManager: vi.fn(),
    openSession: vi.fn(),
    pathsEqual: (left: string | undefined, right: string) => left === right,
    selectProjectScope: vi.fn(),
    setNavigationIntent: vi.fn(),
    setView: vi.fn(),
    switchToRecentWorkspace: vi.fn(async () => true),
    workspacePath: "/work/current",
    ...overrides,
  };
}

describe("desktop content navigation", () => {
  it("drops a stale task destination after a newer target is selected", async () => {
    const coordinator = createNavigationTransitionCoordinator();
    const firstSwitch = deferred<boolean>();
    const actions = navigationActions({
      switchToRecentWorkspace: vi.fn(() => firstSwitch.promise),
    });
    const first: GlobalSearchTarget = {
      kind: "task",
      taskId: "old-task",
      workspacePath: "/work/other",
    };
    const second: GlobalSearchTarget = { kind: "log", id: "new-log" };

    const pending = navigateGlobalSearchTarget(first, coordinator, actions);
    await navigateGlobalSearchTarget(second, coordinator, actions);
    firstSwitch.resolve(true);
    await pending;

    expect(actions.setView).toHaveBeenCalledTimes(1);
    expect(actions.setView).toHaveBeenCalledWith("logs");
    expect(actions.setNavigationIntent).not.toHaveBeenCalled();
  });

  it("routes a task only after its workspace switch succeeds", async () => {
    const coordinator = createNavigationTransitionCoordinator();
    const actions = navigationActions({
      switchToRecentWorkspace: vi.fn(async () => false),
    });

    await navigateGlobalSearchTarget(
      { kind: "task", taskId: "blocked", workspacePath: "/work/other" },
      coordinator,
      actions,
    );
    expect(actions.setView).not.toHaveBeenCalled();
    expect(actions.setNavigationIntent).not.toHaveBeenCalled();

    actions.switchToRecentWorkspace.mockResolvedValueOnce(true);
    await navigateGlobalSearchTarget(
      { kind: "task", taskId: "ready", workspacePath: "/work/other" },
      coordinator,
      actions,
    );
    expect(actions.setView).toHaveBeenCalledWith("orchestration");
    expect(actions.setNavigationIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "orchestration-task",
        target: { taskId: "ready" },
      }),
    );
  });

  it("routes workspace search targets with the selected file path intact", async () => {
    const coordinator = createNavigationTransitionCoordinator();
    const actions = navigationActions();

    await navigateGlobalSearchTarget(
      { kind: "workspace", path: "src/renderer/App.tsx" },
      coordinator,
      actions,
    );

    expect(actions.setView).toHaveBeenCalledWith("code");
    expect(actions.setNavigationIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "workspace-file",
        target: { path: "src/renderer/App.tsx" },
      }),
    );
  });

  it("opens a global-search result beyond the 200 hydrated sessions in its true project", async () => {
    const coordinator = createNavigationTransitionCoordinator();
    const actions = navigationActions();

    await navigateGlobalSearchTarget(
      {
        kind: "conversation",
        sessionId: "session-201",
        projectId: "project-b",
      },
      coordinator,
      actions,
    );

    expect(actions.openSession).toHaveBeenCalledWith(
      "session-201",
      "project-b",
    );
  });
});

const projects = [
  {
    id: "alpha",
    name: "Alpha",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    primaryPath: "/work/alpha",
    resources: [],
  },
] satisfies Project[];

const sessions = [
  {
    sessionId: "older",
    projectId: "alpha",
    messageCount: 1,
    participants: ["user" as const],
    preview: [],
    endedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    sessionId: "newer",
    projectId: "alpha",
    messageCount: 1,
    participants: ["user" as const],
    preview: [],
    endedAt: "2026-02-01T00:00:00.000Z",
  },
] satisfies SessionSummary[];

describe("chat context handoff navigation", () => {
  it("keeps the selected session when it belongs to the resolved scope", () => {
    expect(
      resolveChatContextHandoff({
        createId: () => "handoff",
        createSessionId: () => "draft",
        pathsEqual: (left, right) => left === right,
        projects,
        request: {
          text: "  Review this.  ",
          workspacePath: "/work/alpha",
          projectScope: "all",
        },
        selectedSession: "older",
        sessions,
      }),
    ).toEqual({
      status: "ready",
      scope: "alpha",
      sessionId: "older",
      handoff: {
        id: "handoff",
        prompt: "Review this.",
        capsule: null,
        text: "Review this.",
        workspacePath: "/work/alpha",
        projectScope: "alpha",
        sessionId: "older",
      },
    });
  });

  it("uses the latest matching session and rejects unresolved broad context", () => {
    expect(
      resolveChatContextHandoff({
        createId: () => "handoff",
        createSessionId: () => "draft",
        pathsEqual: (left, right) => left === right,
        projects,
        request: {
          text: "Review this.",
          workspacePath: "/work/alpha",
          projectScope: "all",
        },
        selectedSession: "outside-scope",
        sessions,
      }),
    ).toMatchObject({ status: "ready", sessionId: "newer" });
    expect(
      resolveChatContextHandoff({
        createId: () => "handoff",
        createSessionId: () => "draft",
        pathsEqual: (left, right) => left === right,
        projects,
        request: {
          text: "Review this.",
          workspacePath: "/work/unknown",
          projectScope: "all",
        },
        selectedSession: "older",
        sessions,
      }),
    ).toEqual({ status: "unresolved" });
  });
});
