import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutocoderPipelineService } from "./autocoder-pipeline-service";

describe("AutocoderPipelineService", () => {
  it("persists runs with request/result artifacts and summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-"));
    const service = new AutocoderPipelineService(root);

    const research = service.record({
      kind: "research",
      projectName: "Eliza Native",
      request: { projectName: "Eliza Native", apis: ["github"] },
      result: { research: true },
    });
    const prd = service.record({
      kind: "prd",
      projectName: "Eliza Native",
      request: { projectName: "Eliza Native" },
      result: { prd: true },
      linkedRunIds: [research.id],
    });

    expect(service.list(5)).toHaveLength(2);
    expect(service.latest("research")?.id).toBe(research.id);
    expect(service.get(prd.id)?.linkedRunIds).toEqual([research.id]);
    expect(service.get(prd.id)?.artifactPaths).toHaveLength(2);
    expect(service.summary().counts.prd).toBe(1);
    expect(service.summary().total).toBe(2);
  });
});
