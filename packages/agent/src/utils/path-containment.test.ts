import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isStrictlyContainedPath } from "./path-containment";

describe("isStrictlyContainedPath", () => {
  const root = resolve("workspace");

  it("accepts strict descendants", () => {
    expect(
      isStrictlyContainedPath(root, resolve(root, "nested/file.txt")),
    ).toBe(true);
  });

  it("rejects the root, parent traversal, and siblings", () => {
    expect(isStrictlyContainedPath(root, root)).toBe(false);
    expect(isStrictlyContainedPath(root, resolve(root, ".."))).toBe(false);
    expect(isStrictlyContainedPath(root, resolve(root, "../sibling"))).toBe(
      false,
    );
  });
});
