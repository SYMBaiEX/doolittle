import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("release changelog", () => {
  it("binds the current package version to a dated release section", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { version: string };
    const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    const releaseHeading = new RegExp(
      `^## \\[${manifest.version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`,
      "m",
    );
    const unreleased = changelog.match(
      /^## \[Unreleased\]\n([\s\S]*?)(?=^## \[)/m,
    )?.[1];

    expect(changelog).toMatch(releaseHeading);
    expect(changelog.match(releaseHeading)).toHaveLength(1);
    expect(unreleased).toContain("No unreleased changes");
    expect(unreleased).not.toMatch(/^### /m);
  });
});
