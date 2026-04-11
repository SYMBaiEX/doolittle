import { describe, expect, it } from "bun:test";
import { selectLatestTrajectoryBenchmarkManifest } from "./latest-benchmark";

describe("trajectory latest benchmark helper", () => {
  it("selects the first manifest as the latest manifest", () => {
    expect(selectLatestTrajectoryBenchmarkManifest([])).toBeUndefined();
    expect(
      selectLatestTrajectoryBenchmarkManifest([
        {
          manifestPath: "/tmp/trajectory-newest-benchmark.json",
          summaryPath: "/tmp/trajectory-newest-benchmark.md",
          createdAt: "2026-04-10T00:00:02.000Z",
          label: "newest",
          purpose: "benchmark",
          tags: [],
          rubric: [],
          cases: [],
          group: "trajectory-benchmark:newest",
          environment: {
            provider: "offline",
            model: "offline",
            baseUrl: "",
            temperature: 0,
            maxTokens: 0,
            bundleCount: 0,
            canEvaluate: true,
            canPackage: true,
          },
        },
        {
          manifestPath: "/tmp/trajectory-older-benchmark.json",
          summaryPath: "/tmp/trajectory-older-benchmark.md",
          createdAt: "2026-04-10T00:00:01.000Z",
          label: "older",
          purpose: "benchmark",
          tags: [],
          rubric: [],
          cases: [],
          group: "trajectory-benchmark:older",
          environment: {
            provider: "offline",
            model: "offline",
            baseUrl: "",
            temperature: 0,
            maxTokens: 0,
            bundleCount: 0,
            canEvaluate: true,
            canPackage: true,
          },
        },
      ])?.label,
    ).toBe("newest");
  });
});
