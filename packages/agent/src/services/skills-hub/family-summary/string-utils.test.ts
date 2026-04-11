import { describe, expect, it } from "bun:test";
import { matchesFamily, rootFromSlug, titleizeSlug } from "./string-utils";

describe("skill hub family slug helpers", () => {
  it("titleizes family slugs", () => {
    expect(titleizeSlug("planner/quick-start")).toBe("Planner Quick Start");
    expect(titleizeSlug("research")).toBe("Research");
  });

  it("matches family prefixes and generated special case", () => {
    expect(matchesFamily("planning/coordination", "planning")).toBe(true);
    expect(matchesFamily("planning/coordination/fast", "planning")).toBe(true);
    expect(matchesFamily("generated/task-skill", "generated")).toBe(true);
    expect(matchesFamily("planning/coordination", "generated")).toBe(false);
  });

  it("extracts root from slug with slash normalization", () => {
    expect(rootFromSlug("planning/coordination")).toBe("planning");
    expect(rootFromSlug("generated\\task-skill")).toBe("generated");
    expect(rootFromSlug("")).toBe("unknown");
  });
});
