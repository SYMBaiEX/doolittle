import { describe, expect, it } from "vitest";
import {
  completedResponseText,
  reconcileStreamedResponse,
} from "./streamed-response";

describe("streamed response reconciliation", () => {
  it("keeps backward-compatible append behavior for delta-only events", () => {
    expect(reconcileStreamedResponse("Hello", { delta: " world" })).toBe(
      "Hello world",
    );
  });

  it("replaces provisional prose with the authoritative response snapshot", () => {
    expect(
      reconcileStreamedResponse("Working…", {
        delta: "The final answer",
        response: "The final answer",
      }),
    ).toBe("The final answer");
  });

  it("uses the completed response even when provisional content exists", () => {
    expect(
      completedResponseText("A duplicated provisional answer", {
        response: "One final answer",
      }),
    ).toBe("One final answer");
  });
});
