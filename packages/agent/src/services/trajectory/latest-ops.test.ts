import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrajectoryBundleEntry } from "../../types/trajectory";
import {
  compareLatestTrajectoryBundles,
  compressLatestTrajectoryBundle,
  replayLatestTrajectoryBundle,
} from "./latest-ops";
import type { TrajectoryServiceHosts } from "./service-support";

function createHosts(baseDir: string): TrajectoryServiceHosts {
  const bundles = new Map<string, TrajectoryBundleEntry>([
    [
      "bundle-2.json",
      {
        manifestPath: "bundle-2.json",
        dataPath: "bundle-2.jsonl",
        summaryPath: "bundle-2.md",
        createdAt: "2026-03-20T00:00:00.000Z",
        label: "latest",
        purpose: "trajectory",
        mode: "research",
        tags: [],
        limit: 2,
        messageCount: 4,
        sessionCount: 2,
        sessions: ["session-a", "session-b"],
        roleCounts: { user: 2, assistant: 2 },
        filters: { sessionId: null, role: null },
      },
    ],
    [
      "bundle-1.json",
      {
        manifestPath: "bundle-1.json",
        dataPath: "bundle-1.jsonl",
        summaryPath: "bundle-1.md",
        createdAt: "2026-03-19T00:00:00.000Z",
        label: "previous",
        purpose: "trajectory",
        mode: "research",
        tags: [],
        limit: 2,
        messageCount: 2,
        sessionCount: 1,
        sessions: ["session-a"],
        roleCounts: { user: 1, assistant: 1 },
        filters: { sessionId: null, role: null },
      },
    ],
  ]);
  const records = new Map<string, ReturnType<typeof buildRecords>>();

  function buildRecords() {
    return [
      {
        sessionId: "session-a",
        createdAt: "2026-03-20T00:00:00.000Z",
        role: "user" as const,
        text: "hello",
      },
      {
        sessionId: "session-a",
        createdAt: "2026-03-20T00:00:01.000Z",
        role: "assistant" as const,
        text: "hi",
      },
      {
        sessionId: "session-b",
        createdAt: "2026-03-20T00:00:02.000Z",
        role: "user" as const,
        text: "more",
      },
      {
        sessionId: "session-b",
        createdAt: "2026-03-20T00:00:03.000Z",
        role: "assistant" as const,
        text: "response",
      },
    ];
  }

  records.set("bundle-2.jsonl", buildRecords());
  records.set("bundle-1.jsonl", buildRecords().slice(0, 2));

  return {
    evaluation: {
      baseDir,
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
      describeBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return bundle;
      },
      replayBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return {
          ...bundle,
          replayPath: join(baseDir, `${bundle.label}.replay.jsonl`),
          replaySummaryPath: join(baseDir, `${bundle.label}.replay.md`),
          replayCount: bundle.messageCount,
          replayPreview: [],
        };
      },
      listBundles(limit: number) {
        return Array.from(bundles.values()).slice(0, limit);
      },
      analyze() {
        throw new Error("Unexpected analyze call");
      },
    },
    bundleStorage: {
      baseDir,
      sessions: {
        recent() {
          return [];
        },
        summary() {
          return { totalSessions: 2 };
        },
      } as never,
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
    },
    rlExport: {
      baseDir,
      sessions: {
        recent() {
          return [];
        },
        summary() {
          return { totalSessions: 0 };
        },
      } as never,
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
    },
    bundleOperations: {
      baseDir,
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
      describeBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return bundle;
      },
      readRecords(dataPath: string) {
        return records.get(dataPath) ?? [];
      },
      listBundles(limit: number) {
        return Array.from(bundles.values()).slice(0, limit);
      },
      replayBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return {
          ...bundle,
          replayPath: join(baseDir, `${bundle.label}.replay.jsonl`),
          replaySummaryPath: join(baseDir, `${bundle.label}.replay.md`),
          replayCount: bundle.messageCount,
          replayPreview: [],
        };
      },
    },
    benchmark: {
      baseDir,
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
      describeBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return bundle;
      },
      listBundles(limit: number) {
        return Array.from(bundles.values()).slice(0, limit);
      },
      replayBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return {
          ...bundle,
          replayPath: join(baseDir, `${bundle.label}.replay.jsonl`),
          replaySummaryPath: join(baseDir, `${bundle.label}.replay.md`),
          replayCount: bundle.messageCount,
          replayPreview: [],
        };
      },
      compareBundles(leftManifestPath: string, rightManifestPath: string) {
        const left = bundles.get(leftManifestPath);
        const right = bundles.get(rightManifestPath);
        if (!left || !right) {
          throw new Error("Missing comparison bundles");
        }
        return {
          left,
          right,
          leftReplay: {
            ...left,
            replayPath: "",
            replaySummaryPath: "",
            replayCount: left.messageCount,
            replayPreview: [],
          },
          rightReplay: {
            ...right,
            replayPath: "",
            replaySummaryPath: "",
            replayCount: right.messageCount,
            replayPreview: [],
          },
          reportPath: join(baseDir, "compare-report.md"),
          summaryPath: join(baseDir, "compare-summary.md"),
          messageDelta: right.messageCount - left.messageCount,
          sessionDelta: right.sessionCount - left.sessionCount,
          roleDelta: { user: 0, assistant: 0, system: 0 },
          findings: ["comparison"],
          recommendation: "use the stronger candidate",
        };
      },
      evaluateBundle(manifestPath: string) {
        const bundle = bundles.get(manifestPath);
        if (!bundle) {
          throw new Error(`Missing bundle for ${manifestPath}`);
        }
        return Promise.resolve({
          focus: "evaluation" as const,
          bundle,
          replay: {
            ...bundle,
            replayPath: "",
            replaySummaryPath: "",
            replayCount: bundle.messageCount,
            replayPreview: [],
          },
          prompt: "prompt",
          highlights: ["highlight"],
          score: bundle.messageCount * 10,
          grade: "B" as const,
          findings: ["finding"],
          recommendations: ["recommendation"],
          evaluationPath: join(baseDir, "evaluation.json"),
          reportPath: join(baseDir, "evaluation.md"),
          response: "response",
          responsePath: join(baseDir, "response.txt"),
        });
      },
    },
  } as TrajectoryServiceHosts;
}

describe("trajectory latest ops", () => {
  it("delegates latest bundle wrappers to the shared hosts", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-trajectory-latest-"));
    const hosts = createHosts(root);

    try {
      expect(replayLatestTrajectoryBundle(hosts)?.manifestPath).toBe(
        "bundle-2.json",
      );
      expect(compressLatestTrajectoryBundle(hosts)?.bundle.manifestPath).toBe(
        "bundle-2.json",
      );
      expect(compareLatestTrajectoryBundles(hosts)?.left.manifestPath).toBe(
        "bundle-1.json",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
