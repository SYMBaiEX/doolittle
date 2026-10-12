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

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const ready = { phase: "ready", message: "Ready" } as const;
let container: HTMLDivElement;
let root: Root;
let listener: (state: BackendState) => void;
let value: ReturnType<typeof useRuntimeWorkspaceData>;
let initial: ReturnType<typeof pending<BackendState>>;
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
  initial = pending<BackendState>();
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
  const gate = pending<void>();
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
it("keeps the newest refresh and retains usable rows while reporting a real failure", async () => {
  const first = batch("old");
  const second = batch("new");
  request.mockImplementation(first.read);
  await mount();
  request.mockImplementation(second.read);
  let fresh!: Promise<boolean>;
  await act(async () => {
    fresh = value.refreshRuntime();
  });
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
