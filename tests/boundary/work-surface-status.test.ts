import { expect, it } from "vitest";
import { statusTier } from "../../apps/desktop/src/renderer/work-surface/status";

it("maps in-flight states to active", () => {
  for (const status of ["running", "executing", "in progress", "busy"]) {
    expect(statusTier(status)).toBe("active");
  }
});

it("maps waiting and queued states to pending", () => {
  for (const status of ["pending", "queued", "draft", "scheduled", "idle"]) {
    expect(statusTier(status)).toBe("pending");
  }
});

it("maps human-gated and degraded states to attention", () => {
  for (const status of [
    "waiting approval",
    "blocked",
    "needs_review",
    "stalled",
  ]) {
    expect(statusTier(status)).toBe("attention");
  }
});

it("maps terminal outcomes to done, failed, or muted", () => {
  for (const status of ["completed", "succeeded", "approved"]) {
    expect(statusTier(status)).toBe("done");
  }
  for (const status of ["failed", "error", "denied", "timed out"]) {
    expect(statusTier(status)).toBe("failed");
  }
  for (const status of ["cancelled", "canceled", "stopped", "skipped"]) {
    expect(statusTier(status)).toBe("muted");
  }
});

it("falls back to pending for unknown statuses and muted for empty", () => {
  expect(statusTier("weird-custom-state")).toBe("pending");
  expect(statusTier("")).toBe("muted");
  expect(statusTier(undefined)).toBe("muted");
});
