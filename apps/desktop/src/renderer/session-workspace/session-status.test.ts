import { describe, expect, it } from "vitest";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { sessionPanelStatus } from "./session-status";
import {
  foreignSessionProject,
  sessionWorkspaceBinding,
} from "./session-workspace-binding";

function receipt(
  status: DesktopRunUpdate["run"]["status"],
  pendingApprovals = 0,
) {
  const latest: DesktopRunUpdate = {
    type:
      status === "complete"
        ? "completed"
        : status === "error"
          ? "error"
          : status === "cancelled"
            ? "cancelled"
            : "waiting",
    sessionId: "a",
    run: {
      runId: "run-a",
      sessionId: "a",
      roomId: "a",
      source: "desktop",
      message: "",
      runDepth: "standard",
      configuredMaxIterations: 10,
      observedActionCount: 0,
      progressMode: "all",
      status,
      localMutations: [],
      pendingApprovals,
      startedAt: "2026-10-03T10:00:00.000Z",
      updatedAt: "2026-10-03T10:00:01.000Z",
    },
  };
  return { "run-a": { latest, events: [latest] } };
}

describe("truthful per-session status", () => {
  it("projects actual run attention, waiting and independent terminal outcomes", () => {
    for (const [status, expected] of [
      ["complete", "Complete"],
      ["cancelled", "Stopped"],
      ["error", "Failed"],
    ] as const) {
      expect(
        sessionPanelStatus({
          sessionId: "a",
          receipts: receipt(status),
          backendPhase: "ready",
        }),
      ).toBe(expected);
      expect(
        sessionPanelStatus({
          sessionId: "b",
          receipts: receipt(status),
          backendPhase: "ready",
        }),
      ).toBe("Ready");
    }
    expect(
      sessionPanelStatus({
        sessionId: "a",
        activeRequest: "run-a",
        receipts: receipt("waiting", 2),
        backendPhase: "ready",
      }),
    ).toBe("Needs approval · 2");
    expect(
      sessionPanelStatus({
        sessionId: "a",
        activeRequest: "run-a",
        receipts: receipt("waiting"),
        backendPhase: "ready",
      }),
    ).toBe("Waiting");
  });

  it("does not call missing bounded history complete and explains connection and queued state", () => {
    expect(
      sessionPanelStatus({
        sessionId: "a",
        receipts: {},
        backendPhase: "booting",
      }),
    ).toBe("Connecting");
    expect(
      sessionPanelStatus({
        sessionId: "a",
        activeRequest: "run-a",
        receipts: {},
        backendPhase: "degraded",
      }),
    ).toBe("Reconnecting");
    expect(
      sessionPanelStatus({
        sessionId: "a",
        receipts: {},
        backendPhase: "ready",
        queuedCount: 2,
        queuePaused: true,
      }),
    ).toBe("Queue paused");
  });
});

describe("shared workspace binding", () => {
  const session = {
    sessionId: "a",
    projectId: "project",
    title: "",
    participants: [],
    preview: [],
    messageCount: 0,
  };
  const project = {
    id: "project",
    name: "Project",
    primaryPath: "/private/tmp/repo",
  };
  it("uses canonical paths rather than selected project identity", () => {
    expect(
      foreignSessionProject(session, [project], "/tmp/repo", "darwin"),
    ).toBeUndefined();
    expect(
      foreignSessionProject(session, [project], "/tmp/other", "darwin"),
    ).toBe(project);
    expect(
      foreignSessionProject(
        session,
        [{ ...project, primaryPath: "C:\\Repo" }],
        "c:/repo/",
        "win32",
      ),
    ).toBeUndefined();
  });
  it("does not assert unknown project paths are foreign", () => {
    expect(
      foreignSessionProject(session, [], "/tmp/repo", "darwin"),
    ).toBeUndefined();
    expect(
      foreignSessionProject(
        session,
        [{ id: "project", name: "Project" }],
        "/tmp/repo",
        "darwin",
      ),
    ).toBeUndefined();
  });
  it("distinguishes unresolved project metadata from a known current workspace before dispatch", () => {
    expect(
      sessionWorkspaceBinding(session, [], "/tmp/other", "darwin").kind,
    ).toBe("unknown");
    expect(
      sessionWorkspaceBinding(
        session,
        [{ id: "project", name: "Project" }],
        "/tmp/other",
        "darwin",
      ).kind,
    ).toBe("unknown");
    expect(
      sessionWorkspaceBinding(session, [project], "/tmp/repo", "darwin").kind,
    ).toBe("current");
    expect(
      sessionWorkspaceBinding(
        { ...session, projectId: undefined },
        [],
        "/tmp/other",
        "darwin",
      ).kind,
    ).toBe("unbound");
  });
});
