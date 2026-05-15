import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppContext } from "@/runtime/bootstrap";
import { handleTrajectoryRoutes } from "./trajectories";

function createContext(options?: {
  native?: boolean;
  sdk?: boolean;
}): AppContext {
  let taskCount = 0;
  const dataDir = mkdtempSync(join(tmpdir(), "doolittle-routes-"));
  const nativeTrajectory = options?.native
    ? {
        exportLatest: () => "/native/export.json",
        bundles: () => [
          { manifestPath: "/native/bundle.json", label: "native" },
        ],
        compareLatest: () => ({ native: true }),
      }
    : null;
  const sdkTrajectory = options?.sdk
    ? {
        startTrajectory: () => "sdk-trajectory",
        startStep: () => "sdk-step",
        endTrajectory: () => undefined,
        logLlmCall: () => undefined,
        exportTrajectories: () => ({
          filename: "sdk.json",
          data: "[]",
          mimeType: "application/json",
        }),
        listTrajectories: () => ({ trajectories: [], total: 0 }),
      }
    : null;

  return {
    config: {
      dataDir,
    },
    runtime:
      options?.native || options?.sdk
        ? {
            getService: (service: string) => {
              if (service === "trajectory_logger") {
                return nativeTrajectory;
              }
              if (service === "trajectories") {
                return sdkTrajectory;
              }
              return null;
            },
            getServicesByType: (service: string) =>
              service === "trajectories" && sdkTrajectory
                ? [sdkTrajectory]
                : [],
          }
        : {},
    gateway: {
      history: async (limit: number) => ({
        traces: [{ id: `trace-${limit}` }],
        inbox: [{ id: "inbox-1" }],
        outbox: [{ id: "outbox-1" }],
      }),
    },
    services: {
      delegation: {
        create: (input: Record<string, unknown>) => ({
          id: `task-${++taskCount}`,
          ...input,
        }),
      },
      trajectories: {
        exportDataset: (input: { label?: string }) =>
          `/tmp/${input.label ?? "latest"}.json`,
        exportFilteredBundle: (input: { label?: string }) => ({
          bundle: input.label ?? "bundle",
        }),
        replayLatest: () => ({ latest: true }),
        listBundles: (_limit: number) => [
          {
            manifestPath: "/tmp/alpha.manifest.json",
            label: "alpha",
            limit: 25,
            purpose: "analysis",
            mode: "dataset",
            tags: ["ops"],
            notes: "bundle notes",
            filters: {
              sessionId: "session-1",
              role: "assistant",
            },
          },
        ],
        replayBundle: (manifestPath: string) => ({ manifestPath }),
        ingestGatewayHistory: (input: {
          traces: unknown[];
          label: string;
          tags: string[];
        }) => ({
          label: input.label,
          traceCount: input.traces.length,
          tags: input.tags,
        }),
        createBatchManifest: (input: {
          label: string;
          taskIds: string[];
          group: string;
        }) => input,
        compareLatest: () => ({ latest: "comparison" }),
        compareBundles: (
          leftManifestPath: string,
          rightManifestPath: string,
        ) => ({
          leftManifestPath,
          rightManifestPath,
        }),
        compressLatest: () => ({ manifestPath: "/tmp/compressed.json" }),
        compressBundle: (
          manifestPath: string,
          options: { sampleCount?: number },
        ) => ({
          manifestPath,
          options,
        }),
        analyze: (input: { label?: string }) => ({
          label: input.label ?? "analysis",
        }),
        evaluate: async (input: { label?: string; rubric?: string[] }) => ({
          label: input.label ?? "evaluation",
          rubric: input.rubric ?? [],
        }),
        package: async (input: { label?: string; mode?: string }) => ({
          label: input.label ?? "package",
          mode: input.mode ?? "dataset",
        }),
        evaluateLatest: async () => ({ latest: true }),
        evaluateBundle: async (manifestPath: string) => ({ manifestPath }),
        packageLatest: async () => ({ latest: true }),
        describeBundle: (manifestPath: string) => ({
          manifestPath,
          limit: 10,
          label: "described",
          purpose: "package",
          mode: "dataset",
          tags: ["ops"],
          notes: "described bundle",
          filters: {
            sessionId: "session-2",
            role: "assistant",
          },
        }),
        describeBenchmarkEnvironment: () => ({ provider: "local" }),
        listBenchmarkManifests: (limit: number) => [
          { label: "bench-1", limit },
        ],
        createBenchmarkManifest: (input: Record<string, unknown>) => ({
          id: "bench-1",
          ...input,
        }),
        runLatestBenchmark: async () => ({ id: "run-latest" }),
        runBenchmark: async (manifestPath: string) => ({ manifestPath }),
      },
    },
  } as unknown as AppContext;
}

function createJsonRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>,
): Request {
  return new Request(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

describe("handleTrajectoryRoutes", () => {
  it("requires SDK trajectory export while preserving native bundles and latest comparisons", async () => {
    const context = createContext({ native: true });

    const exported = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/export", "POST", {}),
      new URL("http://localhost/trajectories/export"),
    );
    const bundles = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/trajectories/bundles"),
      new URL("http://localhost/trajectories/bundles"),
    );
    const comparison = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/trajectories/compare/latest"),
      new URL("http://localhost/trajectories/compare/latest"),
    );

    expect(exported?.status).toBe(503);
    expect(await exported?.json()).toEqual({
      error: "ElizaOS SDK trajectory export unavailable",
      detail:
        "Doolittle debug bundles are not model-training trajectories. Enable the ElizaOS trajectories service before exporting training data.",
      trainingCompatible: false,
      expectedTrainingSource: "elizaos-sdk",
    });
    expect(await bundles?.json()).toEqual({
      bundles: [{ manifestPath: "/native/bundle.json", label: "native" }],
    });
    expect(await comparison?.json()).toEqual({ comparison: { native: true } });
  });

  it("exports through the ElizaOS SDK trajectory service when available", async () => {
    const context = createContext({ sdk: true });

    const exported = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/export", "POST", {
        label: "sdk-bridge",
      }),
      new URL("http://localhost/trajectories/export"),
    );
    const bundles = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/trajectories/bundles"),
      new URL("http://localhost/trajectories/bundles"),
    );

    const exportedJson = await exported?.json();
    expect(exportedJson).toEqual({
      path: expect.stringContaining("/trajectories/sdk.json"),
      export: expect.objectContaining({
        filename: "sdk.json",
        mimeType: "application/json",
        source: "elizaos-sdk",
      }),
    });
    expect(await bundles?.json()).toEqual({
      bundles: [
        expect.objectContaining({
          manifestPath: "/tmp/alpha.manifest.json",
          label: "alpha",
        }),
      ],
    });
  });

  it("handles replay, compare, and compress routes with validation", async () => {
    const context = createContext();

    const replay = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/trajectories/replay?label=alpha"),
      new URL("http://localhost/trajectories/replay?label=alpha"),
    );
    const compareError = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/compare", "POST", {}),
      new URL("http://localhost/trajectories/compare"),
    );
    const compressed = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/compress", "POST", {
        manifestPath: "/tmp/alpha.manifest.json",
        sampleCount: 3,
      }),
      new URL("http://localhost/trajectories/compress"),
    );

    expect(await replay?.json()).toEqual({
      replay: { manifestPath: "/tmp/alpha.manifest.json" },
    });
    expect(compareError?.status).toBe(400);
    expect(await compareError?.json()).toEqual({
      error: "leftManifestPath and rightManifestPath are required",
    });
    expect(await compressed?.json()).toEqual({
      compressed: {
        manifestPath: "/tmp/alpha.manifest.json",
        options: { sampleCount: 3 },
      },
    });
  });

  it("ingests gateway history and creates trajectory batches", async () => {
    const context = createContext();

    const ingested = await handleTrajectoryRoutes(
      context,
      createJsonRequest(
        "http://localhost/trajectories/ingest/gateway",
        "POST",
        {
          label: "gateway-history",
        },
      ),
      new URL("http://localhost/trajectories/ingest/gateway"),
    );
    const batch = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/batch", "POST", {
        label: "nightly",
        prompts: ["first prompt", "second prompt"],
      }),
      new URL("http://localhost/trajectories/batch"),
    );

    expect(await ingested?.json()).toEqual({
      bundle: {
        label: "gateway-history",
        traceCount: 1,
        tags: ["gateway", "history"],
      },
    });
    expect(await batch?.json()).toEqual({
      batch: {
        label: "nightly",
        purpose: "trajectory batch",
        prompts: ["first prompt", "second prompt"],
        rubric: undefined,
        tags: undefined,
        taskIds: ["task-1", "task-2"],
        group: "trajectory-batch:nightly",
      },
      tasks: [
        expect.objectContaining({ id: "task-1", title: "Batch prompt 1" }),
        expect.objectContaining({ id: "task-2", title: "Batch prompt 2" }),
      ],
    });
  });

  it("routes analyze, evaluate, package, and benchmark flows", async () => {
    const context = createContext();

    const analyzed = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/analyze", "POST", {
        label: "analysis",
      }),
      new URL("http://localhost/trajectories/analyze"),
    );
    const packaged = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/trajectories/package?label=alpha"),
      new URL("http://localhost/trajectories/package?label=alpha"),
    );
    const benchmark = await handleTrajectoryRoutes(
      context,
      createJsonRequest("http://localhost/trajectories/benchmark/run", "POST", {
        latest: true,
      }),
      new URL("http://localhost/trajectories/benchmark/run"),
    );

    expect(await analyzed?.json()).toEqual({
      analysis: { label: "analysis" },
    });
    expect(await packaged?.json()).toEqual({
      package: { label: "alpha", mode: "dataset" },
    });
    expect(await benchmark?.json()).toEqual({
      benchmark: { id: "run-latest" },
    });
  });

  it("returns benchmark environment data and null for unrelated routes", async () => {
    const context = createContext();

    const environment = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/trajectories/benchmark/environment"),
      new URL("http://localhost/trajectories/benchmark/environment"),
    );
    const unrelated = await handleTrajectoryRoutes(
      context,
      new Request("http://localhost/not-trajectories"),
      new URL("http://localhost/not-trajectories"),
    );

    expect(await environment?.json()).toEqual({
      environment: { provider: "local" },
    });
    expect(unrelated).toBeNull();
  });
});
