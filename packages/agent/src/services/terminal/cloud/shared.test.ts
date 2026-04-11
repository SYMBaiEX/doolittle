import { describe, expect, it } from "bun:test";
import {
  createMissingCloudTargetRunResult,
  readCloudInfoSummary,
} from "./shared";

describe("terminal cloud shared helpers", () => {
  it("reads cloud info summaries from json payloads", () => {
    expect(readCloudInfoSummary(JSON.stringify({ name: "Alpha" }))).toBe(
      "Alpha",
    );
    expect(readCloudInfoSummary(JSON.stringify({ status: "ready" }))).toBe(
      "ready",
    );
    expect(readCloudInfoSummary("not json", "fallback")).toBe("fallback");
  });

  it("builds consistent missing-target run results", () => {
    const result = createMissingCloudTargetRunResult(
      "Daytona",
      "execution.daytonaTarget",
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Daytona backend requires");
  });
});
