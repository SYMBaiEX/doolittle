import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handleTrajectoryBenchmarkCommands } from "./benchmark";

function createContext() {
  const events = {
    benchmarkRuns: [] as string[],
  };

  const manifests = [
    {
      manifestPath: "/tmp/baseline.json",
      createdAt: "2026-04-01T00:00:00.000Z",
      label: "baseline",
      group: "g1",
      cases: [{ label: "v1" }, { label: "v2" }],
    },
  ];

  const context = {
    services: {
      trajectories: {
        describeBenchmarkEnvironment: () => ({
          provider: "unit-test",
          model: "test-model",
        }),
        listBenchmarkManifests: (limit: number) => manifests.slice(0, limit),
        createBenchmarkManifest: (input: Record<string, unknown>) => ({
          manifestPath: "/tmp/created.json",
          ...input,
        }),
        runLatestBenchmark: async () => ({
          manifestPath: "/tmp/baseline.json",
        }),
        runBenchmark: async (manifestPath: string) => {
          events.benchmarkRuns.push(manifestPath);
          return { manifestPath, ran: true };
        },
      },
    },
  } as unknown as AgentExecutionContext;

  return { context, events, manifests };
}

describe("trajectory benchmark commands", () => {
  it("returns environment/list and resolves run aliases", async () => {
    const { context, events } = createContext();
    const environment = await handleTrajectoryBenchmarkCommands(
      "/trajectories benchmarks environment",
      context,
    );
    const listing = await handleTrajectoryBenchmarkCommands(
      "/trajectories benchmark list",
      context,
    );
    const runLatest = await handleTrajectoryBenchmarkCommands(
      "/trajectories benchmark run latest",
      context,
    );

    expect(environment).toContain('"provider": "unit-test"');
    expect(listing).toContain("baseline");
    expect(runLatest).toContain('"/tmp/baseline.json"');
    expect(events.benchmarkRuns).toEqual([]);
  });

  it("creates and runs label-resolved manifests", async () => {
    const { context, events } = createContext();
    const created = await handleTrajectoryBenchmarkCommands(
      "/trajectories benchmark create label:baseline :: label:baseline => label:target",
      context,
    );
    const run = await handleTrajectoryBenchmarkCommands(
      "/trajectories benchmark run baseline",
      context,
    );

    expect(created).toContain('"/tmp/created.json"');
    expect(run).toContain('"/tmp/baseline.json"');
    expect(events.benchmarkRuns).toEqual(["/tmp/baseline.json"]);
  });

  it("returns usage for malformed run requests", async () => {
    const { context } = createContext();
    const usage = await handleTrajectoryBenchmarkCommands(
      "/trajectories benchmark run ",
      context,
    );
    expect(usage).toBe(
      "Usage: /trajectories benchmark run <manifest-path|label|latest>",
    );
  });
});
