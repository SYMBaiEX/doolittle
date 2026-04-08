import { describe, expect, it } from "bun:test";
import {
  buildAutocoderPipelineRecordOutcome,
  buildAutocoderPipelineWorkflowDraft,
  summarizeAutocoderPipelineValue,
} from "./workflow-actions-decisions";

describe("autocoder pipeline workflow action decisions", () => {
  it("builds a fallback workflow draft from request content", () => {
    const draft = buildAutocoderPipelineWorkflowDraft({
      kind: "prd",
      projectName: "Eliza Native",
      request: {
        prompt: "Generate a PRD for the research flow",
      },
    });

    expect(draft.title).toBe("prd Eliza Native");
    expect(draft.objective).toBe("Generate a PRD for the research flow");
    expect(draft.kind).toBe("prd");
  });

  it("normalizes terminal record outcomes", () => {
    const failed = buildAutocoderPipelineRecordOutcome({
      kind: "generate",
      request: { prompt: "Build the thing" },
      result: { ok: false, reason: "boom" },
      status: "failed",
      linkedRunIds: ["run-1"],
    });
    const cancelled = buildAutocoderPipelineRecordOutcome({
      kind: "generate",
      request: { prompt: "Build the thing" },
      result: { cancelled: true, reason: "stopped" },
      status: "cancelled",
    });
    const completed = buildAutocoderPipelineRecordOutcome({
      kind: "generate",
      request: { prompt: "Build the thing" },
      result: { ok: true },
    });

    expect(failed).toEqual({
      status: "failed",
      result: '{ "ok": false, "reason": "boom" }',
      linkedRunIds: ["run-1"],
    });
    expect(cancelled).toEqual({
      status: "cancelled",
      result: '{ "cancelled": true, "reason": "stopped" }',
    });
    expect(completed).toEqual({
      status: "completed",
      result: { ok: true },
      linkedRunIds: undefined,
    });
  });

  it("summarizes long values without whitespace noise", () => {
    const summary = summarizeAutocoderPipelineValue({
      text: "alpha ".repeat(60),
    });

    expect(summary.length).toBeLessThanOrEqual(240);
    expect(summary).not.toContain("\n");
  });
});
