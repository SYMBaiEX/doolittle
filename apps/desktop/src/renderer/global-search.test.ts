import { expect, test } from "vitest";
import {
  globalSearchGroups,
  normalizeGlobalSearchResults,
} from "./global-search";

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
    results.filter((result) => result.group === "Workspace code"),
  ).toHaveLength(8);
  expect(results.map((result) => result.id)).toContain("project:project-1");
  expect(results.map((result) => result.id)).toContain(
    "project-source:project-1:source-1",
  );
  expect(results.map((result) => result.id)).toContain("task:task-1");
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
