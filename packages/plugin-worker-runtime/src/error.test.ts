import { describe, expect, it } from "vitest";
import { fromWireError, toWireError } from "./error.js";

describe("worker error compatibility boundary", () => {
  it("round-trips the standard error fields used on the worker wire", () => {
    const source = new TypeError("Invalid worker payload");
    const restored = fromWireError(toWireError(source));

    expect(restored).toBeInstanceOf(Error);
    expect(restored.name).toBe("TypeError");
    expect(restored.message).toBe("Invalid worker payload");
    expect(restored.stack).toContain("Invalid worker payload");
  });

  it("normalizes non-error values without throwing during transport", () => {
    expect(toWireError("worker stopped")).toEqual({
      name: "Error",
      message: "worker stopped",
    });
    expect(fromWireError(null).message).toBe("null");
    expect(fromWireError({}).message).toBe("Remote worker error");
  });
});
