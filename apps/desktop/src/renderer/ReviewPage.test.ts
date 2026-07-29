import { describe, expect, it } from "vitest";
import { reviewWorkspaceScopeKey } from "./ReviewPage";

describe("review workspace scope", () => {
  it("changes for either the selected workspace or project scope", () => {
    const current = reviewWorkspaceScopeKey("/work/alpha", "project-alpha");

    expect(reviewWorkspaceScopeKey("/work/beta", "project-alpha")).not.toBe(
      current,
    );
    expect(reviewWorkspaceScopeKey("/work/alpha", "project-beta")).not.toBe(
      current,
    );
  });

  it("keeps path and project boundaries unambiguous", () => {
    expect(reviewWorkspaceScopeKey("/work/a", "bc")).not.toBe(
      reviewWorkspaceScopeKey("/work/ab", "c"),
    );
  });
});
