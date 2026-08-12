import { describe, expect, it } from "vitest";
import type { Project, SessionSummary } from "../shared/contracts";
import {
  assignSessionProject,
  projectUsesPath,
  replaceProject,
  upsertProject,
} from "./use-project-management";

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    pinned: false,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    resources: [],
    ...overrides,
  };
}

function session(sessionId: string, projectId?: string): SessionSummary {
  return {
    sessionId,
    projectId,
    messageCount: 0,
    participants: [],
    preview: [],
  };
}

describe("project management transforms", () => {
  it("matches either the primary path or a folder resource", () => {
    const candidate = project("alpha", {
      primaryPath: "/repo/alpha",
      resources: [
        {
          id: "resource-a",
          projectId: "alpha",
          kind: "folder",
          label: "docs",
          value: "/repo/alpha/docs",
          createdAt: "2026-08-12T00:00:00.000Z",
        },
        {
          id: "resource-b",
          projectId: "alpha",
          kind: "file",
          label: "notes",
          value: "/repo/alpha/notes.md",
          createdAt: "2026-08-12T00:00:00.000Z",
        },
      ],
    });
    const equals = (left: string | undefined, right: string) => left === right;

    expect(projectUsesPath(candidate, "/repo/alpha", equals)).toBe(true);
    expect(projectUsesPath(candidate, "/repo/alpha/docs", equals)).toBe(true);
    expect(projectUsesPath(candidate, "/repo/alpha/notes.md", equals)).toBe(
      false,
    );
  });

  it("upserts a selected project at the end without duplicating it", () => {
    const alpha = project("alpha");
    const beta = project("beta");
    const updatedAlpha = project("alpha", { name: "Updated alpha" });

    expect(upsertProject([alpha, beta], updatedAlpha)).toEqual([
      beta,
      updatedAlpha,
    ]);
  });

  it("replaces a project in place for stable navigation order", () => {
    const alpha = project("alpha");
    const beta = project("beta");
    const updatedAlpha = project("alpha", { pinned: true });

    expect(replaceProject([alpha, beta], updatedAlpha)).toEqual([
      updatedAlpha,
      beta,
    ]);
  });

  it("moves only the selected session and removes null project scope", () => {
    const sessions = [session("one", "alpha"), session("two", "beta")];

    expect(assignSessionProject(sessions, "one", "gamma")).toEqual([
      session("one", "gamma"),
      session("two", "beta"),
    ]);
    expect(assignSessionProject(sessions, "one", null)).toEqual([
      session("one"),
      session("two", "beta"),
    ]);
  });
});
