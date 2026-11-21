// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BackendState } from "../../apps/desktop/src/shared/contracts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  desktopRequest: request,
}));
vi.mock("../../apps/desktop/src/renderer/bots/session-catalog", () => ({
  loadBotSessionCatalog: async (value: unknown) => value,
}));

import { useRuntimeWorkspaceData } from "../../apps/desktop/src/renderer/use-runtime-workspace-data";
import { createDeferred } from "../support/deferred";

const ready = { phase: "ready", message: "Ready" } as const;
let container: HTMLDivElement;
let root: Root;
let listener: (state: BackendState) => void;
let value: ReturnType<typeof useRuntimeWorkspaceData>;
let initial: ReturnType<typeof createDeferred<BackendState>>;
function Probe() {
  value = useRuntimeWorkspaceData(() => "toast");
  return null;
}
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  initial = createDeferred<BackendState>();
  Object.defineProperty(window, "doolittle", {
    configurable: true,
    value: {
      getBackendState: () => initial.promise,
      onBackendState: (next: typeof listener) => {
        listener = next;
        return () => undefined;
      },
    },
  });
  request.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function batch(label: string) {
  const gate = createDeferred<void>();
  return {
    gate,
    read: async (path: string) => {
      await gate.promise;
      if (path === "/runtime/status")
        return { provider: "offline", model: label, plugins: {} };
      if (path.startsWith("/sessions"))
        return {
          sessions: [
            {
              sessionId: label,
              preview: [],
              participants: [],
              messageCount: 0,
            },
          ],
        };
      return { projects: [] };
    },
  };
}
async function mount() {
  await act(async () => {
    root.render(createElement(Probe));
  });
  await act(async () => {
    listener(ready);
  });
}
it("shows runtime status and projects while conversation history is still loading", async () => {
  const history = createDeferred<{ sessions: [] }>();
  request.mockImplementation(async (path: string) => {
    if (path === "/runtime/status")
      return { provider: "offline", model: "local", plugins: {} };
    if (path.startsWith("/sessions")) return history.promise;
    return { projects: [{ id: "project" }] };
  });
  await mount();
  expect(value.runtime?.model).toBe("local");
  expect(value.projects[0]?.id).toBe("project");
  await act(async () => history.resolve({ sessions: [] }));
});
it("keeps the newest refresh and retains usable rows while reporting a real failure", async () => {
  const first = batch("old");
  const second = batch("new");
  request.mockImplementation(first.read);
  await mount();
  const oldSignal = request.mock.calls[0]?.[3] as AbortSignal;
  request.mockImplementation(second.read);
  let fresh!: Promise<boolean>;
  await act(async () => {
    fresh = value.refreshRuntime();
  });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => {
    second.gate.resolve();
    await fresh;
  });
  expect(value.sessions[0]?.sessionId).toBe("new");
  await act(async () => {
    first.gate.resolve();
    await Promise.resolve();
  });
  expect(value.runtime?.model).toBe("new");
  expect(value.sessions[0]?.sessionId).toBe("new");
  request.mockRejectedValue(new Error("Runtime disconnected"));
  await act(async () => {
    expect(await value.refreshRuntime()).toBe(false);
  });
  expect(value.globalError).toBe("Runtime disconnected");
  expect(value.sessions[0]?.sessionId).toBe("new");
});
it("does not let a late refresh or initial snapshot revive an offline backend", async () => {
  const old = batch("stale");
  request.mockImplementation(old.read);
  await mount();
  await act(async () => {
    listener({ phase: "degraded", message: "Disconnected" });
  });
  await act(async () => {
    initial.resolve(ready);
    old.gate.resolve();
    await Promise.resolve();
  });
  expect(value.backend.phase).toBe("degraded");
  expect(value.runtime).toBeNull();
  expect(value.sessions).toEqual([]);
});

it("uses a new catalog generation after a runtime restart", async () => {
  request.mockResolvedValue({ sessions: [], projects: [] });
  await mount();
  const originalGeneration = value.backendGeneration;
  await act(async () => {
    listener({ phase: "booting", message: "Restarting" });
    listener(ready);
  });
  expect(value.backendGeneration).toBe(originalGeneration + 1);
  await act(async () => listener({ ...ready, message: "Still ready" }));
  expect(value.backendGeneration).toBe(originalGeneration + 1);
});

it("publishes a host-confirmed chat immediately and rejects an older inventory completion", async () => {
  const stale = batch("before-host-commit");
  request.mockImplementation(stale.read);
  await mount();
  const scope = {
    botId: "lead",
    sessionId: "created",
    projectId: "project",
    workspacePath: "/owned/project",
    createdAt: "2026-11-02T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
  };
  act(() => value.publishConfirmedConversation(scope));
  expect(value.sessions[0]).toMatchObject({
    sessionId: "created",
    botId: "lead",
    projectId: "project",
    workspacePath: "/owned/project",
    messageCount: 0,
  });
  await act(async () => {
    stale.gate.resolve();
    await Promise.resolve();
  });
  expect(value.sessions.map((row) => row.sessionId)).toEqual(["created"]);
  request.mockRejectedValue(new Error("History temporarily unavailable"));
  await act(async () => {
    expect(await value.refreshRuntime()).toBe(false);
  });
  expect(value.sessions[0]?.sessionId).toBe("created");
});
