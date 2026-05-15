import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentExecutionContext } from "../../chat";
import { handleTrajectoryExportCommands } from "./export";

function createContext(options?: { sdk?: boolean; listFromService?: boolean }) {
  const listCalls: { limit: number }[] = [];
  const calls: Array<Record<string, unknown>> = [];
  const dataDir = mkdtempSync(join(tmpdir(), "doolittle-trajectory-"));
  const sdkTrajectory = options?.sdk
    ? {
        startTrajectory: () => "trajectory-1",
        startStep: () => "step-1",
        exportTrajectories: () => ({
          filename: "sdk.json",
          data: JSON.stringify([{ id: "trajectory-1" }]),
          mimeType: "application/json",
        }),
        listTrajectories: () => ({
          trajectories: [
            {
              id: "trajectory-1",
              agentId: "agent-1",
              source: "cli",
              status: "completed",
              startTime: 1,
              endTime: 2,
              durationMs: 1,
              stepCount: 1,
              llmCallCount: 1,
              providerAccessCount: 0,
              totalPromptTokens: 10,
              totalCompletionTokens: 5,
              createdAt: "2026-04-01T00:00:00.000Z",
              metadata: { roomId: "room-1" },
            },
          ],
          total: 1,
          offset: 0,
          limit: 10,
        }),
      }
    : undefined;
  const context = {
    config: {
      dataDir,
    },
    runtime: {
      getService: (service: string) =>
        service === "trajectories" ? sdkTrajectory : undefined,
      getServicesByType: (service: string) =>
        service === "trajectories" && sdkTrajectory ? [sdkTrajectory] : [],
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
  it("prefers ElizaOS SDK exports and trajectory lists", async () => {
    const { context } = createContext({ sdk: true });
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

    expect(exported).toContain("ElizaOS SDK trajectory export:");
    expect(exported).toContain("sdk.json");
    expect(dataset).toContain("ElizaOS SDK trajectory export:");
    expect(listed).toContain("trajectory-1");
    expect(listed).toContain("training=ready format=elizaos-sdk");
  });

  it("keeps non-SDK records out of training export and supports debug bundles", async () => {
    const { context, listCalls, calls } = createContext({
      listFromService: true,
    });
    const exported = await handleTrajectoryExportCommands(
      "/trajectories export label:demo",
      context,
    );
    const listed = await handleTrajectoryExportCommands(
      "/trajectories list",
      context,
    );
    const filtered = await handleTrajectoryExportCommands(
      "/trajectories bundle label:filter limit:42",
      context,
    );

    expect(exported).toContain("ElizaOS SDK trajectory export unavailable");
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
    expect(listed).toContain("training=debug-only format=doolittle-debug");
    expect(filtered).toContain('"/tmp/filtered-1.json"');
  });
});
