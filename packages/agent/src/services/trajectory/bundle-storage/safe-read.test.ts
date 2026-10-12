import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TrajectoryEvaluationService } from "../service";
import {
  MAX_TRAJECTORY_MANIFEST_BYTES,
  MAX_TRAJECTORY_RECORD_BYTES,
  TrajectoryInputError,
} from "./safe-read";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "trajectory-owned-"));
  roots.push(root);
  const owned = join(root, "owned");
  const foreign = join(root, "foreign");
  mkdirSync(owned);
  mkdirSync(foreign);
  const sessions = {
    recent: () => [
      {
        sessionId: "s",
        createdAt: "2026-01-01T00:00:00Z",
        role: "user",
        text: "hello",
      },
    ],
  };
  const service = new TrajectoryEvaluationService(owned, sessions as never);
  const bundle = service.exportFilteredBundle({
    label: "safe",
    purpose: "test",
    mode: "research",
    limit: 1,
  });
  return { root, owned, foreign, service, bundle };
}

function expectInvalid(action: () => unknown) {
  expect(action).toThrow(TrajectoryInputError);
  expect(action).toThrow("Invalid trajectory artifact.");
}

describe("trajectory owned artifact reads", () => {
  it("keeps generated flows and an operator-selected symlinked root", () => {
    const { root, owned, service, bundle } = fixture();
    expect(service.replayBundle(bundle.manifestPath).replayCount).toBe(1);
    const selector = join(root, "selector");
    symlinkSync(owned, selector, "dir");
    const linked = new TrajectoryEvaluationService(selector, {
      recent: () => [],
    } as never);
    const linkedBundle = linked.exportFilteredBundle({
      label: "linked",
      purpose: "test",
      mode: "research",
      limit: 1,
    });
    expect(linked.describeBundle(linkedBundle.manifestPath).label).toBe(
      "linked",
    );
  });

  it("rejects outside, traversal, foreign-root, and linked manifest paths", () => {
    const { root, owned, foreign, service, bundle } = fixture();
    const outside = join(foreign, "foreign-manifest.json");
    writeFileSync(outside, "{}", "utf8");
    expectInvalid(() => service.describeBundle(outside));
    expectInvalid(() =>
      service.replayBundle(
        join(owned, "..", "foreign", "foreign-manifest.json"),
      ),
    );
    const linkedFile = join(owned, "linked-manifest.json");
    symlinkSync(bundle.manifestPath, linkedFile);
    expectInvalid(() => service.describeBundle(linkedFile));
    const linkedDir = join(owned, "linked-dir");
    symlinkSync(foreign, linkedDir, "dir");
    expectInvalid(() =>
      service.describeBundle(join(linkedDir, "foreign-manifest.json")),
    );
    expectInvalid(() => service.describeBundle(root));
  });

  it("rejects forged referenced data, malformed manifest and records", () => {
    const { owned, foreign, service, bundle } = fixture();
    const forge = join(owned, "forged-manifest.json");
    const valid = service.describeBundle(bundle.manifestPath);
    writeFileSync(
      forge,
      JSON.stringify({ ...valid, dataPath: join(foreign, "secret.jsonl") }),
    );
    expectInvalid(() => service.replayBundle(forge));
    writeFileSync(forge, "not json");
    expectInvalid(() => service.describeBundle(forge));
    truncateSync(forge, MAX_TRAJECTORY_MANIFEST_BYTES + 1);
    expectInvalid(() => service.describeBundle(forge));
    writeFileSync(
      forge,
      JSON.stringify({ ...valid, roleCounts: { constructor: 1 } }),
    );
    expectInvalid(() => service.describeBundle(forge));
    writeFileSync(
      forge,
      JSON.stringify({
        createdAt: "now",
        label: "x",
        dataPath: bundle.dataPath,
      }),
    );
    expectInvalid(() => service.describeBundle(forge));
    writeFileSync(bundle.dataPath, "{broken-json}");
    expectInvalid(() => service.replayBundle(bundle.manifestPath));
    writeFileSync(
      bundle.dataPath,
      JSON.stringify({
        sessionId: "s",
        createdAt: "now",
        role: "user",
        text: "x",
        metadata: { constructor: "bad" },
      }),
    );
    expectInvalid(() => service.replayBundle(bundle.manifestPath));
  });

  it("rejects malformed consumed optional fields and negative counters", () => {
    const { owned, service, bundle } = fixture();
    const forged = join(owned, "malformed-manifest.json");
    const original = JSON.parse(readFileSync(bundle.manifestPath, "utf8"));
    for (const override of [
      { tags: { length: 1 } },
      { summaryPath: 42 },
      { filters: { sessionId: [] } },
      { messageCount: -1 },
      { roleCounts: { user: -1 } },
      { mode: [] },
    ]) {
      writeFileSync(forged, JSON.stringify({ ...original, ...override }));
      expectInvalid(() => service.compressBundle(forged));
    }
  });

  it("rejects oversized and non-regular data without blocking on FIFOs", () => {
    const { owned, service, bundle } = fixture();
    truncateSync(bundle.dataPath, MAX_TRAJECTORY_RECORD_BYTES + 1);
    expectInvalid(() => service.replayBundle(bundle.manifestPath));
    rmSync(bundle.dataPath);
    mkdirSync(bundle.dataPath);
    expectInvalid(() => service.replayBundle(bundle.manifestPath));
    rmSync(bundle.dataPath, { recursive: true });
    const result = spawnSync("mkfifo", [bundle.dataPath]);
    if (result.status === 0)
      expectInvalid(() => service.replayBundle(bundle.manifestPath));
    else expect(result.error ?? result.stderr.toString()).toBeDefined();
    expect(dirname(bundle.dataPath)).toBe(owned);
  });

  it("rejects benchmark manifests with foreign case references", async () => {
    const { foreign, service, bundle } = fixture();
    const benchmark = service.createBenchmarkManifest({
      cases: [{ manifestPath: bundle.manifestPath }],
    });
    expect(
      service.describeBenchmarkManifest(benchmark.manifestPath).cases,
    ).toHaveLength(1);
    const poisoned = {
      ...benchmark,
      cases: [{ manifestPath: join(foreign, "case.json"), label: "foreign" }],
    };
    writeFileSync(benchmark.manifestPath, JSON.stringify(poisoned));
    expectInvalid(() =>
      service.describeBenchmarkManifest(benchmark.manifestPath),
    );
    await expect(service.runBenchmark(benchmark.manifestPath)).rejects.toThrow(
      TrajectoryInputError,
    );
    writeFileSync(benchmark.manifestPath, "{invalid");
    await expect(service.runBenchmark(benchmark.manifestPath)).rejects.toThrow(
      TrajectoryInputError,
    );
    for (const override of [{ tags: { length: 1 } }, { rubric: "bad" }]) {
      writeFileSync(
        benchmark.manifestPath,
        JSON.stringify({
          ...benchmark,
          cases: [
            { manifestPath: bundle.manifestPath, label: "valid", ...override },
          ],
        }),
      );
      expectInvalid(() =>
        service.describeBenchmarkManifest(benchmark.manifestPath),
      );
    }
    writeFileSync(
      benchmark.manifestPath,
      JSON.stringify({ ...benchmark, summaryPath: 42 }),
    );
    expectInvalid(() =>
      service.describeBenchmarkManifest(benchmark.manifestPath),
    );
  });
});
