import { describe, expect, it } from "vitest";
import type {
  Project,
  RuntimeStatus,
  SessionSummary,
} from "../shared/contracts";
import { resolveRuntimeWorkspaceResults } from "./use-runtime-workspace-data";

const runtime: RuntimeStatus = {
  model: "model",
  plugins: {},
  provider: "provider",
};

const session: SessionSummary = {
  messageCount: 1,
  participants: ["user"],
  preview: ["Hello"],
  sessionId: "session-1",
};

const project: Project = {
  createdAt: "2026-08-12T00:00:00.000Z",
  id: "project-1",
  name: "Project",
  pinned: false,
  resources: [],
  updatedAt: "2026-08-12T00:00:00.000Z",
};

describe("runtime workspace result projection", () => {
  it("projects a complete refresh snapshot", () => {
    expect(
      resolveRuntimeWorkspaceResults([
        { status: "fulfilled", value: runtime },
        { status: "fulfilled", value: { sessions: [session] } },
        { status: "fulfilled", value: { projects: [project] } },
      ]),
    ).toEqual({
      error: "",
      projects: [project],
      runtime,
      sessions: [session],
      succeeded: true,
    });
  });

  it("keeps successful resources and reports the last failed request", () => {
    expect(
      resolveRuntimeWorkspaceResults([
        { reason: new Error("runtime unavailable"), status: "rejected" },
        { status: "fulfilled", value: { sessions: [session] } },
        { reason: "projects unavailable", status: "rejected" },
      ]),
    ).toEqual({
      error: "projects unavailable",
      sessions: [session],
      succeeded: false,
    });
  });
});
