import { describe, expect, it } from "vitest";
import { buildProjectPromptContext } from "./project-context";

const project = {
  id: "project-1",
  name: "Desktop polish",
  description: "Make the desktop experience deliberate and warm.",
  instructions: "Keep the interface focused and verify changes.",
  primaryPath: "/workspace/doolittle",
  pinned: false,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

describe("buildProjectPromptContext", () => {
  it("renders bounded project data without widening execution access", () => {
    const context = buildProjectPromptContext({
      sessionId: "session-1",
      workspaceDir: "/workspace/doolittle",
      sessions: {
        projectIdForSession: () => project.id,
        getProject: () => project,
        projectResources: () => [
          {
            id: "resource-1",
            projectId: project.id,
            kind: "folder",
            label: "Desktop app",
            value: "/workspace/doolittle/apps/desktop",
            createdAt: project.createdAt,
          },
        ],
      },
    });

    expect(context).toContain("PROJECT CONTEXT");
    expect(context).toContain("projectName=Desktop polish");
    expect(context).toContain("description=Make the desktop experience");
    expect(context).toContain("projectInstructions=Keep the interface");
    expect(context).toContain("declaredPrimaryPath=/workspace/doolittle");
    expect(context).toContain("[folder] Desktop app");
    expect(context).toContain("effectiveWorkingDirectory=/workspace/doolittle");
    expect(context).toContain(
      "A project with no declared resources is not an empty project",
    );
    expect(context).toContain(
      "inspect the effective working directory with local workspace tools",
    );
    expect(context).toContain(
      "do not expand filesystem, terminal, or tool access",
    );
  });

  it("returns no prompt block when the session is not in a project", () => {
    const context = buildProjectPromptContext({
      sessionId: "session-1",
      workspaceDir: "/workspace/doolittle",
      sessions: {
        projectIdForSession: () => undefined,
        getProject: () => project,
        projectResources: () => [],
      },
    });

    expect(context).toBeUndefined();
  });

  it("does not apply archived project instructions to resumed chats", () => {
    const sessions = {
      projectIdForSession: () => "project-1",
      getProject: () => ({
        id: "project-1",
        name: "Archived work",
        instructions: "This should no longer apply.",
        pinned: false,
        archivedAt: "2026-07-27T12:00:00.000Z",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T12:00:00.000Z",
      }),
      projectResources: () => [],
    };

    expect(
      buildProjectPromptContext({
        sessions,
        sessionId: "session-1",
        workspaceDir: "/workspace",
      }),
    ).toBeUndefined();
  });
});
