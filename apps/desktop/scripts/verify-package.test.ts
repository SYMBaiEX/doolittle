import { describe, expect, it, vi } from "vitest";
import { verifyMacCodeSignature } from "./verify-package";

describe("macOS package signature verification", () => {
  it("runs strict codesign verification against the staged app bundle", () => {
    const run = vi.fn(() => 0);
    expect(() =>
      verifyMacCodeSignature("/staging/mac-arm64/Doolittle.app", run),
    ).not.toThrow();
    expect(run).toHaveBeenCalledWith("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      "/staging/mac-arm64/Doolittle.app",
    ]);
  });

  it("fails when codesign rejects the packaged application", () => {
    const run = vi.fn(() => 1);
    expect(() => verifyMacCodeSignature("/release/Doolittle.app", run)).toThrow(
      "macOS code signature verification failed",
    );
    expect(run).toHaveBeenCalledWith("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      "/release/Doolittle.app",
    ]);
  });
});
