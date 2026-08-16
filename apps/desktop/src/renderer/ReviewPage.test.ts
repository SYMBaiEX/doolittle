import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apiResourceCacheKey } from "./lib";
import {
  reviewPatchResourceDependencies,
  reviewWorkspaceScopeKey,
  shouldShowReviewWorkspace,
} from "./ReviewPage";

const reviewPageSource = readFileSync(
  new URL("./ReviewPage.tsx", import.meta.url),
  "utf8",
);

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

  it("keeps same-relative-path patches separate across workspace scopes", () => {
    const path = "/repo/patch?path=src%2Fmain.ts&staged=false";
    const alpha = reviewPatchResourceDependencies(
      true,
      reviewWorkspaceScopeKey("/work/alpha", "project"),
      "change-src-main",
      "src/main.ts",
    );
    const beta = reviewPatchResourceDependencies(
      true,
      reviewWorkspaceScopeKey("/work/beta", "project"),
      "change-src-main",
      "src/main.ts",
    );
    expect(apiResourceCacheKey(path, alpha)).not.toBe(
      apiResourceCacheKey(path, beta),
    );
  });

  it("omits the duplicate queue and detail shell until review items exist", () => {
    expect(shouldShowReviewWorkspace(0)).toBe(false);
    expect(shouldShowReviewWorkspace(1)).toBe(true);
  });

  it("does not claim offline review notes are saved when storage fails", () => {
    expect(reviewPageSource).toContain("locallyPersisted: boolean");
    expect(reviewPageSource).toContain("It exists only in this window");
    expect(reviewPageSource).toContain("will be lost on reload");
  });
});
