// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackendState,
  Project,
  RuntimeStatus,
  SessionSummary,
} from "../shared/contracts";

const mocks = vi.hoisted(() => ({ desktopRequest: vi.fn() }));

vi.mock("./lib", () => ({ desktopRequest: mocks.desktopRequest }));

import {
  resolveRuntimeWorkspaceResults,
  useRuntimeWorkspaceData,
} from "./use-runtime-workspace-data";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

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

const readyBackend = {
  message: "Runtime ready",
  phase: "ready" as const,
};

function workspaceBatch(
  runtimeValue: RuntimeStatus,
  sessionValue: SessionSummary[],
  projectValue: Project[],
) {
  return {
    projects: deferred<{ projects: Project[] }>(),
    runtime: deferred<RuntimeStatus>(),
    sessions: deferred<{ sessions: SessionSummary[] }>(),
    values: { projectValue, runtimeValue, sessionValue },
  };
}

function resolveBatch(batch: ReturnType<typeof workspaceBatch>) {
  batch.runtime.resolve(batch.values.runtimeValue);
  batch.sessions.resolve({ sessions: batch.values.sessionValue });
  batch.projects.resolve({ projects: batch.values.projectValue });
}

function WorkspaceProbe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useRuntimeWorkspaceData>) => void;
}) {
  const value = useRuntimeWorkspaceData(vi.fn());
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

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

describe("runtime workspace refresh", () => {
  let container: HTMLDivElement;
  let root: Root;
  let backendListener: ((state: BackendState) => void) | undefined;
  let latest: ReturnType<typeof useRuntimeWorkspaceData> | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    backendListener = undefined;
    latest = undefined;
    mocks.desktopRequest.mockReset();
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: {
        getBackendState: vi.fn(async () => ({
          message: "Connecting",
          phase: "booting" as const,
        })),
        onBackendState: vi.fn((listener: (state: BackendState) => void) => {
          backendListener = listener;
          return () => {
            backendListener = undefined;
          };
        }),
        retryBackend: vi.fn(),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("ignores an older refresh when a newer refresh resolves first", async () => {
    const first = workspaceBatch(runtime, [session], [project]);
    const newerRuntime = { ...runtime, model: "new-model" };
    const newerSession = { ...session, preview: ["New"] };
    const newerProject = { ...project, name: "New Project" };
    const second = workspaceBatch(newerRuntime, [newerSession], [newerProject]);
    const batches = [first, second];
    mocks.desktopRequest.mockImplementation((path: string) => {
      const batch =
        batches[Math.floor((mocks.desktopRequest.mock.calls.length - 1) / 3)];
      if (path === "/runtime/status") return batch?.runtime.promise;
      if (path === "/sessions?limit=200") return batch?.sessions.promise;
      return batch?.projects.promise;
    });

    act(() =>
      root.render(
        createElement(WorkspaceProbe, {
          onValue: (value) => (latest = value),
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
      backendListener?.(readyBackend);
      await Promise.resolve();
    });
    expect(mocks.desktopRequest).toHaveBeenCalledTimes(3);

    let secondRefresh!: Promise<boolean>;
    await act(async () => {
      secondRefresh = latest?.refreshRuntime() ?? Promise.resolve(false);
      await Promise.resolve();
    });
    expect(mocks.desktopRequest).toHaveBeenCalledTimes(6);
    resolveBatch(second);
    await act(async () => {
      await secondRefresh;
    });
    resolveBatch(first);
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest?.runtime).toEqual(newerRuntime);
    expect(latest?.sessions).toEqual([newerSession]);
    expect(latest?.projects).toEqual([newerProject]);
  });

  it("does not apply a refresh that resolves after the backend leaves ready", async () => {
    const pending = workspaceBatch(runtime, [session], [project]);
    mocks.desktopRequest.mockImplementation((path: string) =>
      path === "/runtime/status"
        ? pending.runtime.promise
        : path === "/sessions?limit=200"
          ? pending.sessions.promise
          : pending.projects.promise,
    );

    act(() =>
      root.render(
        createElement(WorkspaceProbe, {
          onValue: (value) => (latest = value),
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
      backendListener?.(readyBackend);
      await Promise.resolve();
    });
    expect(mocks.desktopRequest).toHaveBeenCalledTimes(3);

    await act(async () => {
      backendListener?.({ message: "Offline", phase: "offline" });
      await Promise.resolve();
    });
    resolveBatch(pending);
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest?.runtime).toBeNull();
    expect(latest?.sessions).toEqual([]);
    expect(latest?.projects).toEqual([]);
  });
});
