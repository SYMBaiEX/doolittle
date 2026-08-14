import { afterEach, expect, test, vi } from "vitest";

const hook = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  desktopRequest: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => undefined | (() => void)) => {
    hook.cleanup = effect() ?? undefined;
  },
  useMemo: <T>(factory: () => T) => factory(),
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(value: T) => {
    const setter = vi.fn();
    hook.setters.push(setter);
    return [value, setter];
  },
}));

vi.mock("./lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib")>()),
  desktopRequest: hook.desktopRequest,
}));

import {
  globalSearchGroups,
  normalizeGlobalSearchResults,
  useGlobalSearch,
} from "./global-search";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  hook.cleanup = undefined;
  hook.setters = [];
  Reflect.deleteProperty(globalThis, "window");
});

test("normalizes, deduplicates, and bounds results from local search sources", () => {
  const results = normalizeGlobalSearchResults(
    {
      projects: {
        projects: [
          {
            id: "project-1",
            name: "Runtime tools",
            description: "Desktop runtime work",
            resources: [
              {
                id: "source-1",
                kind: "file",
                label: "runtime.ts",
                value: "/work/runtime.ts",
              },
            ],
          },
        ],
      },
      sessions: {
        hits: [
          {
            sessionId: "session-1",
            projectId: "project-1",
            text: "Find the runtime status",
            createdAt: "2026-07-27T10:00:00.000Z",
          },
          {
            sessionId: "session-1",
            text: "Duplicate result",
            createdAt: "2026-07-27T10:01:00.000Z",
          },
        ],
      },
      workspace: {
        results: Array.from({ length: 10 }, (_, index) => ({
          path: `src/runtime-${index}.ts`,
          matches: ["runtime status"],
        })),
      },
      tasks: {
        tasks: [
          {
            id: "task-1",
            title: "Check runtime",
            objective: "Find runtime status",
            status: "running",
            workspaceRoot: "/work/runtime",
          },
          {
            id: "task-2",
            title: "Unrelated",
            objective: "No match",
            status: "pending",
          },
        ],
      },
      logs: {
        logs: [
          {
            at: "now",
            scope: "runtime",
            message: "Runtime started",
            level: "info",
          },
        ],
      },
    },
    "runtime",
  );

  expect(
    results.filter((result) => result.group === "Conversations"),
  ).toHaveLength(1);
  expect(
    results.find((result) => result.id === "conversation:session-1")?.target,
  ).toEqual({
    kind: "conversation",
    sessionId: "session-1",
    projectId: "project-1",
  });
  expect(
    results.filter((result) => result.group === "Workspace code"),
  ).toHaveLength(8);
  expect(results.map((result) => result.id)).toContain("project:project-1");
  expect(results.map((result) => result.id)).toContain(
    "project-source:project-1:source-1",
  );
  expect(results.map((result) => result.id)).toContain("task:task-1");
  expect(results.find((result) => result.id === "task:task-1")?.target).toEqual(
    {
      kind: "task",
      taskId: "task-1",
      workspacePath: "/work/runtime",
    },
  );
  expect(results.map((result) => result.id)).not.toContain("task:task-2");
  expect(
    results.find((result) => result.id === "workspace:src/runtime-0.ts")
      ?.description,
  ).toContain("Code");
});

test("rejects short queries and maps result groups to selectable commands", () => {
  expect(
    normalizeGlobalSearchResults(
      { projects: {}, sessions: {}, workspace: {}, tasks: {}, logs: {} },
      "r",
    ),
  ).toEqual([]);
  const groups = globalSearchGroups(
    [
      {
        id: "log:1",
        group: "Logs",
        label: "Runtime started",
        description: "info · runtime",
        keywords: ["runtime"],
        target: { kind: "log", id: "1" },
      },
    ],
    () => undefined,
  );
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ label: "Logs", items: [{ id: "log:1" }] });
});

test("aborts all in-flight requests after the debounce when global search unmounts", async () => {
  vi.useFakeTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout },
  });
  const signals: AbortSignal[] = [];
  hook.desktopRequest.mockImplementation(
    (_path: string, _method: string, _body: unknown, signal?: AbortSignal) =>
      new Promise((_, reject) => {
        if (signal) {
          signals.push(signal);
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }
      }),
  );

  useGlobalSearch("runtime", true);
  await vi.advanceTimersByTimeAsync(180);

  expect(hook.desktopRequest).toHaveBeenCalledTimes(5);
  expect(signals).toHaveLength(5);
  expect(signals.every((signal) => !signal.aborted)).toBe(true);

  hook.cleanup?.();
  await Promise.resolve();

  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(
    hook.setters.flatMap((setter) => setter.mock.calls).flat(),
  ).not.toContain("Some local search sources are unavailable (5/5).");
});

test("restarts workspace search when the active workspace changes", async () => {
  vi.useFakeTimers();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout },
  });
  const signals: AbortSignal[] = [];
  hook.desktopRequest.mockImplementation(
    (_path: string, _method: string, _body: unknown, signal?: AbortSignal) =>
      new Promise(() => {
        if (signal) signals.push(signal);
      }),
  );

  useGlobalSearch("runtime", true, "/work/alpha");
  await vi.advanceTimersByTimeAsync(180);
  expect(hook.desktopRequest).toHaveBeenCalledTimes(5);

  hook.cleanup?.();
  useGlobalSearch("runtime", true, "/work/beta");
  await vi.advanceTimersByTimeAsync(180);

  expect(hook.desktopRequest).toHaveBeenCalledTimes(10);
  expect(signals.slice(0, 5).every((signal) => signal.aborted)).toBe(true);
  expect(hook.desktopRequest).toHaveBeenNthCalledWith(
    6,
    "/projects?includeArchived=true",
    "GET",
    undefined,
    expect.any(AbortSignal),
  );
});
