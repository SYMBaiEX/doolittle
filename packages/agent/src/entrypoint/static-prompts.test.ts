import { describe, expect, it } from "bun:test";
import {
  formatTopLevelError,
  isRecoverableTopLevelRuntimeError,
  resolveStaticPrompt,
} from "./static-prompts";

describe("formatTopLevelError", () => {
  it("prefers trimmed error messages", () => {
    expect(formatTopLevelError(new Error("  boom  "))).toBe("boom");
  });

  it("handles plain strings and unknown values", () => {
    expect(formatTopLevelError("  nope  ")).toBe("nope");
    expect(formatTopLevelError(42)).toBe("42");
  });
});

describe("resolveStaticPrompt", () => {
  it("returns exit text for quit commands", () => {
    expect(resolveStaticPrompt("quit", "Doolittle", process.cwd())).toEqual({
      text: "Closing Doolittle.",
      shouldExit: true,
    });
  });

  it("returns search usage when query is missing", () => {
    expect(
      resolveStaticPrompt("/commands search ", "Doolittle", process.cwd()),
    ).toEqual({
      text: "Usage: /commands search <query>",
    });
  });
});

describe("isRecoverableTopLevelRuntimeError", () => {
  it("recognizes configured recoverable fragments", () => {
    expect(
      isRecoverableTopLevelRuntimeError(
        new Error("Cannot connect to API right now"),
      ),
    ).toBe(true);
    expect(isRecoverableTopLevelRuntimeError(new Error("Totally broken"))).toBe(
      false,
    );
  });
});
