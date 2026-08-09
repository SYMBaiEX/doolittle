import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("normalizes Error and non-Error failures", () => {
    expect(errorMessage(new Error("failed"))).toBe("failed");
    expect(errorMessage("failed")).toBe("failed");
    expect(errorMessage({ code: "FAILED" })).toBe("[object Object]");
  });
});
