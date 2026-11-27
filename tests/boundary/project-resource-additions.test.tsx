// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ToastInput } from "../../apps/desktop/src/renderer/components/ToastRegion";
import type { ProjectLike } from "../../apps/desktop/src/renderer/project-manager/models";
import type { ProjectManagementActions } from "../../apps/desktop/src/renderer/use-project-management";
import type {
  Project,
  WorkspaceState,
} from "../../apps/desktop/src/shared/contracts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  desktopRequest: request,
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { useProjectManagement } from "../../apps/desktop/src/renderer/use-project-management";

const noop = () => {};
const project: Project = {
  id: "project-a",
  name: "Alpha",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  resources: [],
};
const projectLike: ProjectLike = { id: project.id, name: project.name };

function Probe({
  capture,
  pushToast,
}: {
  capture: (actions: ProjectManagementActions, projects: Project[]) => void;
  pushToast: (toast: ToastInput) => string;
}) {
  const [projects, setProjects] = useState<Project[]>([project]);
  const workspace: WorkspaceState = { currentPath: "", recentPaths: [] };
  const actions = useProjectManagement({
    createSessionId: () => "created-session",
    pathsEqual: (left, right) => left === right,
    projectScope: "all",
    projects,
    pushToast,
    selectProjectScope: noop,
    selectedSession: "",
    setProjectScope: noop,
    setProjects,
    setSelectedSession: noop,
    setSessions: noop,
    setView: noop,
    setWorkspace: noop,
    switchToRecentWorkspace: async () => false,
    transitionToProjectScope: noop,
    workspace,
  });
  capture(actions, projects);
  return null;
}

function resource(value: string, kind: "file" | "folder" = "file") {
  return {
    id: `resource-${value}`,
    projectId: project.id,
    kind,
    label: value.split("/").at(-1) ?? value,
    value,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function withProbe(
  run: (probe: {
    actions: () => ProjectManagementActions;
    projects: () => Project[];
    pushToast: ReturnType<typeof vi.fn>;
  }) => Promise<void>,
) {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const captured: {
    actions?: ProjectManagementActions;
    projects: Project[];
  } = { projects: [] };
  const pushToast = vi.fn<(toast: ToastInput) => string>(() => "toast");
  try {
    act(() =>
      root.render(
        <Probe
          capture={(actions, projects) => {
            captured.actions = actions;
            captured.projects = projects;
          }}
          pushToast={pushToast}
        />,
      ),
    );
    await run({
      actions: () => {
        if (!captured.actions) throw new Error("Probe did not render.");
        return captured.actions;
      },
      projects: () => captured.projects,
      pushToast,
    });
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
}

function installPicker(kind: "file" | "folder", paths: string[]) {
  const pick = vi.fn(async () => ({ canceled: false, kind, paths }));
  Object.defineProperty(window, "doolittle", {
    configurable: true,
    value: {
      pickProjectFiles: kind === "file" ? pick : vi.fn(),
      pickProjectFolders: kind === "folder" ? pick : vi.fn(),
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, "doolittle");
  request.mockReset();
});

it("continues multi-file additions after failure and reports the exact outcome", async () => {
  installPicker("file", ["/alpha", "/beta", "/gamma"]);
  const storedProject = {
    ...project,
    resources: [resource("/alpha"), resource("/gamma")],
  };
  request.mockImplementation(
    async (path: string, method: string, body?: unknown) => {
      if (path === "/projects?includeArchived=true")
        return { projects: [storedProject] };
      if (path === `/projects/${project.id}/resources` && method === "POST") {
        const value = (body as { value: string }).value;
        if (value === "/beta") throw new Error("already attached");
        return {};
      }
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  );

  await withProbe(async (probe) => {
    let failure: unknown;
    await act(async () => {
      try {
        await probe.actions().addProjectResources(projectLike, "file");
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Added 2 of 3 files. Added: /alpha, /gamma. Could not add /beta: already attached.",
    );
    expect(
      request.mock.calls
        .filter(
          ([path, method]) =>
            path === `/projects/${project.id}/resources` && method === "POST",
        )
        .map(([, , body]) => (body as { value: string }).value),
    ).toEqual(["/alpha", "/beta", "/gamma"]);
    expect(probe.projects()).toEqual([storedProject]);
    expect(probe.pushToast).not.toHaveBeenCalled();
  });
});

it("uses the first successfully added folder as the fallback primary path", async () => {
  installPicker("folder", ["/bad", "/good"]);
  const storedProject = {
    ...project,
    primaryPath: "/good",
    resources: [resource("/good", "folder")],
  };
  request.mockImplementation(
    async (path: string, method: string, body?: unknown) => {
      if (path === "/projects?includeArchived=true")
        return { projects: [storedProject] };
      if (path === `/projects/${project.id}/resources` && method === "POST") {
        const value = (body as { value: string }).value;
        if (value === "/bad") throw new Error("folder unavailable");
        return {};
      }
      if (path === `/projects/${project.id}` && method === "PATCH")
        return { project: { ...project, primaryPath: "/good" } };
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  );

  await withProbe(async (probe) => {
    let failure: unknown;
    await act(async () => {
      try {
        await probe.actions().addProjectResources(projectLike, "folder");
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Added 1 of 2 folders. Added: /good. Could not add /bad: folder unavailable.",
    );
    const primaryPatches = request.mock.calls.filter(
      ([path, method]) =>
        path === `/projects/${project.id}` && method === "PATCH",
    );
    expect(primaryPatches).toHaveLength(1);
    expect(primaryPatches[0]?.[2]).toEqual({ primaryPath: "/good" });
    expect(probe.projects()).toEqual([storedProject]);
  });
});
