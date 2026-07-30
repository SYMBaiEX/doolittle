import { describe, expect, it } from "vitest";
import type { Project, SessionSummary } from "../shared/contracts";
import { resolveWorkspaceSelection } from "./workspace-selection";

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
  {
    id: "beta",
    name: "Beta",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    resources: [
      {
        id: "beta-folder",
        projectId: "beta",
        kind: "folder" as const,
        label: "Beta",
        value: "/work/beta",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
] satisfies Project[];

const sessions = [
  {
    sessionId: "alpha-chat",
    projectId: "alpha",
    messageCount: 1,
    participants: ["user" as const],
    preview: [],
    endedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    sessionId: "beta-chat",
    projectId: "beta",
    messageCount: 1,
    participants: ["user" as const],
    preview: [],
    endedAt: "2026-02-01T00:00:00.000Z",
  },
] satisfies SessionSummary[];

const pathsEqual = (left: string | undefined, right: string) => left === right;

describe("workspace selection", () => {
  it("replaces an unrelated project and chat with the workspace target", () => {
    expect(
      resolveWorkspaceSelection({
        workspacePath: "/work/beta",
        projects,
        sessions,
        selectedSessionId: "alpha-chat",
        createSessionId: () => "new-chat",
        pathsEqual,
      }),
    ).toEqual({ projectScope: "beta", sessionId: "beta-chat" });
  });

  it("uses General when the workspace has no active project", () => {
    expect(
      resolveWorkspaceSelection({
        workspacePath: "/work/other",
        projects,
        sessions,
        selectedSessionId: "alpha-chat",
        createSessionId: () => "new-chat",
        pathsEqual,
      }),
    ).toEqual({ projectScope: "unscoped", sessionId: "new-chat" });
  });
});
