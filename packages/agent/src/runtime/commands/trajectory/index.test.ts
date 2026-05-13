import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handleTrajectoryCommand } from ".";

function createContext(options?: {
  native?: boolean;
  gateway?: boolean;
  latestCompression?: Record<string, unknown> | undefined;
  latestReplay?: Record<string, unknown> | undefined;
  latestComparison?: Record<string, unknown> | undefined;
  latestBenchmarkRun?: Record<string, unknown> | undefined;
  compressBundleResult?: Record<string, unknown> | null | undefined;
  replayBundleResult?: Record<string, unknown> | null | undefined;
}) {
  let taskCounter = 0;
  const events = {
    datasetRequests: [] as Array<Record<string, unknown>>,
    filteredBundleRequests: [] as Array<Record<string, unknown>>,
    benchmarkRuns: [] as string[],
    ingests: [] as Array<Record<string, unknown>>,
    tasks: [] as Array<Record<string, unknown>>,
    gatewayLimits: [] as number[],
  };

  const bundles = [
    {
      manifestPath: "/tmp/baseline.json",
      dataPath: "/tmp/baseline.jsonl",
      createdAt: "2026-03-28T00:00:00.000Z",
      label: "baseline",
      messageCount: 12,
      sessionCount: 3,
      filters: { sessionId: "session-1", role: "assistant" as const },
    },
    {
      manifestPath: "/tmp/target.json",
      dataPath: "/tmp/target.jsonl",
      createdAt: "2026-03-28T01:00:00.000Z",
      label: "target",
      messageCount: 18,
      sessionCount: 4,
      filters: { sessionId: "session-2", role: "user" as const },
    },
  ];
  const manifests = [
    {
      manifestPath: "/tmp/benchmark-a.json",
      createdAt: "2026-03-28T02:00:00.000Z",
      label: "benchmark-a",
      group: "group-a",
      cases: [{ label: "baseline" }, { label: "target" }],
    },
  ];

  const context = {
    runtime: {
      getService: (service: string) => {
        if (service === "trajectory_logger" && options?.native) {
          return {
            exportLatest: () => "/tmp/native-export.jsonl",
            bundles: () => [
              {
                label: "native-bundle",
                createdAt: "2026-03-28T03:00:00.000Z",
                messageCount: 21,
                sessionCount: 5,
                filters: { sessionId: "native-session", role: "assistant" },
                dataPath: "/tmp/native-bundle.jsonl",
                manifestPath: "/tmp/native-bundle.json",
              },
            ],
            compareLatest: () => ({ source: "native", compared: true }),
          };
        }
        return undefined;
      },
    },
    services: {
      trajectories: {
        exportRecent: (limit: number) => `recent:${limit}`,
        exportDataset: (input: Record<string, unknown>) => {
          events.datasetRequests.push(input);
          return `/tmp/export-${events.datasetRequests.length}.jsonl`;
        },
        exportBundle: (limit: number) => ({
          manifestPath: `/tmp/bundle-${limit}.json`,
        }),
        analyze: (input: Record<string, unknown>) => ({
          analyzed: true,
          input,
        }),
        evaluate: async (input: Record<string, unknown>) => ({
          evaluated: true,
          input,
        }),
        package: async (input: Record<string, unknown>) => ({
          packaged: true,
          input,
        }),
        exportFilteredBundle: (input: Record<string, unknown>) => {
          events.filteredBundleRequests.push(input);
          return {
            manifestPath: `/tmp/filtered-${events.filteredBundleRequests.length}.json`,
            input,
          };
        },
        listBundles: (limit: number) => bundles.slice(0, limit),
        describeBenchmarkEnvironment: () => ({
          provider: "offline",
          model: "none",
        }),
        listBenchmarkManifests: (limit: number) => manifests.slice(0, limit),
        createBenchmarkManifest: (input: Record<string, unknown>) => ({
          manifestPath: "/tmp/created-benchmark.json",
          ...input,
        }),
        runLatestBenchmark: async () => options?.latestBenchmarkRun,
        runBenchmark: async (manifestPath: string) => {
          events.benchmarkRuns.push(manifestPath);
          return { manifestPath, ran: true };
        },
        replayLatest: () => options?.latestReplay,
        compareLatest: () => options?.latestComparison,
        ingestGatewayHistory: (input: Record<string, unknown>) => {
          events.ingests.push(input);
          return { ingested: true, ...input };
        },
        compareBundles: (left: string, right: string) => ({
          left,
          right,
          compared: true,
        }),
        createBatchManifest: (input: Record<string, unknown>) => ({
          manifestPath: "/tmp/batch.json",
          ...input,
        }),
        compressLatest: () => options?.latestCompression,
        compressBundle: (manifestPath: string) =>
          options?.compressBundleResult === null
            ? undefined
            : (options?.compressBundleResult ?? { compressed: manifestPath }),
        replayBundle: (manifestPath: string) =>
          options?.replayBundleResult === null
            ? undefined
            : (options?.replayBundleResult ?? { replay: manifestPath }),
      },
      delegation: {
        create: (input: Record<string, unknown>) => {
          const task = { id: `task-${++taskCounter}`, ...input };
          events.tasks.push(task);
          return task;
        },
      },
    },
    gateway: options?.gateway
      ? {
          history: async (limit: number) => {
            events.gatewayLimits.push(limit);
            return {
              traces: [{ id: "trace-1" }],
              inbox: [{ id: "inbox-1" }],
              outbox: [{ id: "outbox-1" }],
            };
          },
        }
      : undefined,
  } as unknown as AgentExecutionContext;

  return { context, events };
}

describe("trajectory command router", () => {
  it("prefers native export, list, and compare latest overrides", async () => {
    const { context } = createContext({
      native: true,
      latestComparison: { source: "product" },
    });

    const exported = await handleTrajectoryCommand(
      "/trajectories export",
      context,
    );
    const listed = await handleTrajectoryCommand("/trajectories list", context);
    const compared = await handleTrajectoryCommand(
      "/trajectories compare latest",
      context,
    );

    expect(exported).toBe("/tmp/native-export.jsonl");
    expect(listed).toContain("native-bundle");
    expect(compared).toContain('"source": "native"');
  });

  it("applies trajectory defaults and resolves benchmark labels", async () => {
    const { context, events } = createContext();

    const exported = await handleTrajectoryCommand(
      "/trajectories export label:demo",
      context,
    );
    const created = await handleTrajectoryCommand(
      "/trajectories benchmark create label:sweep rubric:score :: label:baseline => label:target",
      context,
    );
    const run = await handleTrajectoryCommand(
      "/trajectories benchmark run benchmark-a",
      context,
    );

    expect(exported).toBe("/tmp/export-1.jsonl");
    expect(events.datasetRequests[0]).toMatchObject({
      label: "demo",
      limit: 200,
      mode: "dataset",
      purpose: "trajectory export",
    });
    expect(created).toContain('"manifestPath": "/tmp/created-benchmark.json"');
    expect(run).toContain('"/tmp/benchmark-a.json"');
    expect(events.benchmarkRuns).toEqual(["/tmp/benchmark-a.json"]);
  });

  it("handles gateway ingest and trajectory batch creation", async () => {
    const { context, events } = createContext({ gateway: true });

    const ingested = await handleTrajectoryCommand(
      "/trajectories ingest gateway limit:12 label:gw tags:live,history notes:daily",
      context,
    );
    const batch = await handleTrajectoryCommand(
      "/trajectories batch label:sweep rubric:quality,latency :: prompt one => prompt two",
      context,
    );

    expect(ingested).toContain('"ingested": true');
    expect(events.gatewayLimits).toEqual([12]);
    expect(events.ingests[0]).toMatchObject({
      label: "gw",
      tags: ["live", "history"],
      notes: "daily",
    });
    expect(batch).toContain('"manifestPath": "/tmp/batch.json"');
    expect(events.tasks).toHaveLength(2);
    expect(events.tasks[0]).toMatchObject({
      title: "Batch prompt 1",
      group: "trajectory-batch:sweep",
    });
  });

  it("supports trajectory compress/replay commands and gateway absence errors", async () => {
    const { context } = createContext({
      latestCompression: undefined,
      latestReplay: { replay: "latest" },
    });

    const emptyCompress = await handleTrajectoryCommand(
      "/trajectories compress latest",
      context,
    );
    const compress = await handleTrajectoryCommand(
      "/trajectories compress baseline",
      context,
    );
    const replay = await handleTrajectoryCommand(
      "/trajectories replay latest",
      context,
    );
    const compare = await handleTrajectoryCommand(
      "/trajectories compare baseline :: target",
      context,
    );
    const missingGateway = await handleTrajectoryCommand(
      "/trajectories ingest gateway",
      context,
    );

    expect(emptyCompress).toBe("No trajectory bundles recorded.");
    expect(compress).toContain('"/tmp/baseline.json"');
    expect(replay).toContain('"replay": "latest"');
    expect(compare).toContain('"/tmp/baseline.json"');
    expect(missingGateway).toBe(
      "Gateway runtime is not available in this execution context.",
    );
  });

  it("handles analysis, evaluation, packaging, and missing bundle failures", async () => {
    const { context } = createContext({
      compressBundleResult: null,
      replayBundleResult: null,
      latestCompression: { latest: true },
      latestReplay: undefined,
      latestBenchmarkRun: { latest: true },
    });

    const analysis = await handleTrajectoryCommand(
      "/trajectories analyze label:study purpose:analysis mode:research tags:alpha",
      context,
    );
    const evaluation = await handleTrajectoryCommand(
      "/trajectories evaluate label:eval rubric:quality,latency",
      context,
    );
    const packaged = await handleTrajectoryCommand(
      "/trajectories package label:pkg notes:nightly",
      context,
    );
    const environment = await handleTrajectoryCommand(
      "/trajectories benchmark environment",
      context,
    );
    const replayFailure = await handleTrajectoryCommand(
      "/trajectories replay baseline",
      context,
    );
    const compressFailure = await handleTrajectoryCommand(
      "/trajectories compress baseline",
      context,
    );
    const missingReplay = await handleTrajectoryCommand(
      "/trajectories replay missing",
      context,
    );
    const missingCompress = await handleTrajectoryCommand(
      "/trajectories compress missing",
      context,
    );

    expect(analysis).toContain('"analyzed": true');
    expect(evaluation).toContain('"evaluated": true');
    expect(packaged).toContain('"packaged": true');
    expect(environment).toContain('"provider": "offline"');
    expect(replayFailure).toBe(
      "Trajectory bundle could not be replayed: baseline",
    );
    expect(compressFailure).toBe(
      "Trajectory bundle could not be compressed: baseline",
    );
    expect(missingReplay).toBe("Trajectory bundle not found: missing");
    expect(missingCompress).toBe("Trajectory bundle not found: missing");
  });
});
