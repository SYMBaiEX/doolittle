import { describe, expect, it } from "vitest";
import { assertOptionalDependencyEntry } from "./dependency-key";

describe("runtime optional dependency entries", () => {
  it("accepts ordinary package names and string versions", () => {
    expect(() =>
      assertOptionalDependencyEntry("@scope/package", "^1.0.0", "package.json"),
    ).not.toThrow();
  });

  it("rejects prototype keys and non-string versions", () => {
    for (const name of ["__proto__", "constructor", "prototype"]) {
      expect(() =>
        assertOptionalDependencyEntry(name, "1.0.0", "package.json"),
      ).toThrow("Unsafe optional dependency");
    }
    expect(() =>
      assertOptionalDependencyEntry("package", {}, "package.json"),
    ).toThrow("Unsafe optional dependency");
  });
});
