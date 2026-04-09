import { describe, expect, it } from "bun:test";
import type { SessionService } from "../session/service";
import { createTrajectoryServiceHosts } from "./service-support";

describe("trajectory service support", () => {
  it("builds stable host facades from the service source", async () => {
    const calls: string[] = [];
    const source = {
      baseDir: "/tmp/trajectory-support",
      sessions: {
        recent(limit: number) {
          calls.push(`recent:${limit}`);
          return [];
        },
        summary(limit: number) {
          calls.push(`summary:${limit}`);
          return { totalSessions: limit, recentSessionIds: [] };
        },
      } as unknown as Pick<SessionService, "recent" | "summary">,
      slug(value: string) {
        calls.push(`slug:${value}`);
        return value.toLowerCase().replaceAll(/\s+/g, "-");
      },
      describeBundle(manifestPath: string) {
        calls.push(`describeBundle:${manifestPath}`);
        return { manifestPath } as never;
      },
      replayBundle(manifestPath: string) {
        calls.push(`replayBundle:${manifestPath}`);
        return { manifestPath } as never;
      },
      compareBundles(leftManifestPath: string, rightManifestPath: string) {
        calls.push(`compareBundles:${leftManifestPath}:${rightManifestPath}`);
        return { leftManifestPath, rightManifestPath } as never;
      },
      evaluateBundle(manifestPath: string) {
        calls.push(`evaluateBundle:${manifestPath}`);
        return Promise.resolve({ manifestPath } as never);
      },
      analyze() {
        calls.push("analyze");
        return { bundle: { manifestPath: "bundle" } } as never;
      },
      readRecords(dataPath: string) {
        calls.push(`readRecords:${dataPath}`);
        return [];
      },
      listBundles(limit?: number) {
        calls.push(`listBundles:${limit ?? "none"}`);
        return [];
      },
      listBenchmarkManifests(limit?: number) {
        calls.push(`listBenchmarkManifests:${limit ?? "none"}`);
        return [];
      },
      describeBenchmarkManifest(manifestPath: string) {
        calls.push(`describeBenchmarkManifest:${manifestPath}`);
        return { manifestPath } as never;
      },
    };

    const hosts = createTrajectoryServiceHosts(source);

    expect(hosts.bundleStorage.baseDir).toBe("/tmp/trajectory-support");
    expect(hosts.bundleStorage.sessions).toBe(source.sessions);
    expect(hosts.rlExport.slug("Replay Fixture")).toBe("replay-fixture");
    expect(hosts.bundleOperations.baseDir).toBe("/tmp/trajectory-support");
    expect(hosts.benchmark.baseDir).toBe("/tmp/trajectory-support");

    expect(hosts.evaluation.describeBundle("bundle.json")).toMatchObject({
      manifestPath: "bundle.json",
    });
    expect(hosts.bundleOperations.readRecords("records.jsonl")).toEqual([]);
    expect(await hosts.benchmark.evaluateBundle("bundle.json")).toBeDefined();
    expect(hosts.benchmark.listBundles(5)).toEqual([]);
    expect(
      hosts.benchmark.compareBundles("left.json", "right.json"),
    ).toBeDefined();

    expect(calls).toEqual([
      "slug:Replay Fixture",
      "describeBundle:bundle.json",
      "readRecords:records.jsonl",
      "evaluateBundle:bundle.json",
      "listBundles:5",
      "compareBundles:left.json:right.json",
    ]);
  });
});
