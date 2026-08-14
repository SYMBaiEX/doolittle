import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleProjectRoutes } from "./projects";

function context() {
  const projects = new Map<
    string,
    { id: string; name: string; pinned: boolean }
  >();
  const resources = new Map<string, unknown[]>();
  return {
    services: {
      sessions: {
        listProjects: () => [...projects.values()],
        createProject: (input: {
          id?: string;
          name: string;
          pinned?: boolean;
        }) => {
          const project = {
            id: input.id ?? "generated",
            name: input.name,
            pinned: input.pinned ?? false,
          };
          projects.set(project.id, project);
          return project;
        },
        getProject: (id: string) => projects.get(id),
        updateProject: (id: string, input: { name?: string }) => {
          const project = projects.get(id);
          if (!project) return undefined;
          const next = { ...project, name: input.name ?? project.name };
          projects.set(id, next);
          return next;
        },
        archiveProject: (id: string) => projects.get(id),
        projectResources: (id: string) => resources.get(id) ?? [],
        addProjectResource: (id: string, input: unknown) => {
          if (!projects.has(id)) return undefined;
          const value = {
            id: "resource-1",
            projectId: id,
            ...(input as object),
          };
          resources.set(id, [value]);
          return value;
        },
        removeProjectResource: () => true,
      },
    },
  } as unknown as AppContext;
}

describe("handleProjectRoutes", () => {
  it("creates, updates, and lists projects with bounded validated fields", async () => {
    const app = context();
    const create = await handleProjectRoutes(
      app,
      new Request("http://localhost/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "team:project-1",
          name: "Launch",
          pinned: true,
        }),
      }),
      new URL("http://localhost/projects"),
    );
    expect(create?.status).toBe(201);
    const patch = await handleProjectRoutes(
      app,
      new Request("http://localhost/projects/team%3Aproject-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Release" }),
      }),
      new URL("http://localhost/projects/team%3Aproject-1"),
    );
    await expect(patch?.json()).resolves.toEqual({
      project: {
        id: "team:project-1",
        name: "Release",
        pinned: true,
        resources: [],
      },
    });
    const list = await handleProjectRoutes(
      app,
      new Request("http://localhost/projects"),
      new URL("http://localhost/projects"),
    );
    await expect(list?.json()).resolves.toEqual({
      projects: [
        {
          id: "team:project-1",
          name: "Release",
          pinned: true,
          resources: [],
        },
      ],
    });
  });

  it("rejects invalid project and file resource paths", async () => {
    const app = context();
    const invalid = await handleProjectRoutes(
      app,
      new Request("http://localhost/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x".repeat(121) }),
      }),
      new URL("http://localhost/projects"),
    );
    expect(invalid?.status).toBe(400);
    const file = await handleProjectRoutes(
      app,
      new Request("http://localhost/projects/missing/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "file",
          label: "Nope",
          value: "relative.txt",
        }),
      }),
      new URL("http://localhost/projects/missing/resources"),
    );
    expect(file?.status).toBe(400);
  });

  it("returns a stable 400 for malformed project mutations", async () => {
    const response = await handleProjectRoutes(
      context(),
      new Request("http://localhost/projects", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/projects"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
  });
});
