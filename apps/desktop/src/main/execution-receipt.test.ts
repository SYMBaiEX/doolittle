import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DesktopExecutionAdmission } from "./execution-admission";
import { releaseAbandonedExecutionClaim } from "./execution-receipt";

describe("abandoned execution receipt", () => {
  it("releases only the exact main-bound bot and run", () => {
    const admission = new DesktopExecutionAdmission();
    const runId = randomUUID();
    const result = admission.claim({
      botId: "one",
      runId,
      sessionId: "session",
      kind: "foreground",
    });
    const request = {
      operation: "execution.claim" as const,
      payload: { runId },
    };
    releaseAbandonedExecutionClaim(admission, "two", request, result);
    expect(admission.snapshot().active).toBe(1);
    releaseAbandonedExecutionClaim(
      admission,
      "one",
      { operation: "codex.auth", payload: { runId } },
      result,
    );
    expect(admission.snapshot().active).toBe(1);
    releaseAbandonedExecutionClaim(admission, "one", request, result);
    expect(admission.snapshot().active).toBe(0);
    releaseAbandonedExecutionClaim(admission, "one", request, result);
    expect(admission.snapshot().active).toBe(0);
  });
});
