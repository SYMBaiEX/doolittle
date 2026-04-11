import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handleTrajectoryExportCommands } from "./export";

function createContext(options?: {
  native?: boolean;
  listFromService?: boolean;
}) {
  const listCalls: { limit: number }[] = [];
  const calls: Array<Record<string, unknown>> = [];
  const context = {
    runtime: {
      getService: (service: string) =>
        service === "trajectory_logger" && options?.native
          ? {
              exportLatest: () => "/tmp/native-export.jsonl",
              bundles: () => [
                {
                  manifestPath: "/tmp/native-bundle.json",
                  label: "native",
                  createdAt: "2026-04-01T00:00:00.000Z",
                  messageCount: 1,
                  sessionCount: 1,
                  dataPath: "/tmp/native.jsonl",
                  filters: { sessionId: "native-session", role: "assistant" },
                },
              ],
            }
          : undefined,
    },
    services: {
      trajectories: {
        exportRecent: (limit: number) => `recent:${limit}`,
        exportDataset: (input: Record<string, unknown>) => {
          calls.push(input);
          return `/tmp/export-${calls.length}.jsonl`;
        },
        exportBundle: (limit: number) => ({
          manifestPath: `/tmp/bundle-${limit}.json`,
        }),
        exportFilteredBundle: (input: Record<string, unknown>) => {
          calls.push(input);
          return {
            manifestPath: `/tmp/filtered-${calls.length}.json`,
          };
        },
        listBundles: (limit: number) => {
          listCalls.push({ limit });
          return options?.listFromService
            ? [
                {
                  manifestPath: "/tmp/service.json",
                  label: "service",
                  createdAt: "2026-04-01T00:00:00.000Z",
                  messageCount: 3,
                  sessionCount: 2,
                },
              ]
            : [];
        },
      },
    },
  } as unknown as AgentExecutionContext;

  return { context, calls, listCalls };
}

describe("trajectory export commands", () => {
  it("prefers native export/list and keeps fallback behavior", async () => {
    const { context, calls } = createContext({ native: true });
    const exported = await handleTrajectoryExportCommands(
      "/trajectories export",
      context,
    );
    const dataset = await handleTrajectoryExportCommands(
      "/trajectories export label:demo mode:dataset",
      context,
    );
    const listed = await handleTrajectoryExportCommands(
      "/trajectories list",
      context,
    );

    expect(exported).toBe("/tmp/native-export.jsonl");
    expect(dataset).toBe("/tmp/export-1.jsonl");
    expect(calls[0]).toMatchObject({
      limit: 200,
      mode: "dataset",
      purpose: "trajectory export",
      label: "demo",
    });
    expect(listed).toContain("native");
  });

  it("falls back to service bundles and supports filtered exports", async () => {
    const { context, listCalls, calls } = createContext({
      listFromService: true,
    });
    const listed = await handleTrajectoryExportCommands(
      "/trajectories list",
      context,
    );
    const filtered = await handleTrajectoryExportCommands(
      "/trajectories bundle label:filter limit:42",
      context,
    );

    expect(listCalls).toEqual([{ limit: 10 }]);
    expect(calls).toEqual([
      {
        limit: 42,
        mode: "research",
        purpose: "trajectory research",
        label: "filter",
      },
    ]);
    expect(listed).toContain("service");
    expect(filtered).toContain('"/tmp/filtered-1.json"');
  });
});
