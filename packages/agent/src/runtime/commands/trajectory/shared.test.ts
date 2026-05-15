import { describe, expect, it } from "bun:test";

import {
  formatTrajectoryBundleList,
  parseTrajectoryArgs,
  parseTrajectoryBenchmarkCases,
  resolveTrajectoryManifestPath,
} from "./shared";

describe("trajectory shared", () => {
  it("parses trajectory option tokens", () => {
    expect(
      parseTrajectoryArgs(
        "session:abc role:user limit:12 label:demo purpose:study mode:evaluation tags:a,b notes:daily rubric:quality,latency events:false kind:event event:model.response category:model run:run-a",
      ),
    ).toEqual({
      sessionId: "abc",
      role: "user",
      limit: 12,
      label: "demo",
      purpose: "study",
      mode: "evaluation",
      tags: ["a", "b"],
      notes: "daily",
      rubric: ["quality", "latency"],
      includeEvents: false,
      recordKind: "event",
      event: "model.response",
      category: "model",
      runId: "run-a",
    });
  });

  it("parses benchmark cases and resolves manifest labels", () => {
    expect(
      parseTrajectoryBenchmarkCases(
        "label:baseline => manifest:/tmp/target.json => /tmp/direct.json",
      ),
    ).toEqual([
      { label: "baseline" },
      { manifestPath: "/tmp/target.json" },
      { manifestPath: "/tmp/direct.json" },
    ]);

    const bundles = [
      {
        manifestPath: "/tmp/baseline.json",
        label: "baseline",
        createdAt: "2026-03-30T00:00:00.000Z",
        messageCount: 10,
        sessionCount: 2,
      },
    ];
    expect(resolveTrajectoryManifestPath("baseline", bundles)).toBe(
      "/tmp/baseline.json",
    );
    expect(resolveTrajectoryManifestPath("missing", bundles)).toBeUndefined();
  });

  it("formats bundle lists with filter summaries", () => {
    expect(
      formatTrajectoryBundleList([
        {
          manifestPath: "/tmp/baseline.json",
          label: "baseline",
          createdAt: "2026-03-30T00:00:00.000Z",
          messageCount: 10,
          sessionCount: 2,
          dataPath: "/tmp/baseline.jsonl",
          filters: { sessionId: "session-1", role: "assistant" },
        },
      ]),
    ).toContain("session:session-1");
    expect(
      formatTrajectoryBundleList([
        {
          manifestPath: "/tmp/sdk.json",
          label: "sdk",
          createdAt: "2026-03-30T00:00:00.000Z",
          messageCount: 1,
          sessionCount: 1,
          trainingCompatible: true,
          trainingFormat: "elizaos-sdk",
        },
      ]),
    ).toContain("training=ready format=elizaos-sdk");
    expect(formatTrajectoryBundleList([])).toBe(
      "No trajectory bundles recorded.",
    );
  });
});
