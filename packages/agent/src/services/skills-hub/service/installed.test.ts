import { describe, expect, it } from "vitest";
import type { SkillHubInstalledRecord } from "../types";
import { mergeInstalledRecords } from "./installed";

function record(
  slug: string,
  source: string,
  title = slug,
): SkillHubInstalledRecord {
  return {
    slug,
    title,
    path: `/skills/${slug}/SKILL.md`,
    installedAt: "2026-07-30T00:00:00.000Z",
    source,
    root: slug.split("/")[0] ?? slug,
    category: slug.split("/")[1] ?? "general",
  };
}

describe("mergeInstalledRecords", () => {
  it("preserves portable imports and lets official managed records win slug collisions", () => {
    expect(
      mergeInstalledRecords(
        [
          record("portable/local", "installed"),
          record("release/checklist", "installed", "Portable checklist"),
        ],
        [
          record("managed/remote", "managed"),
          record("release/checklist", "managed", "Managed checklist"),
        ],
      ),
    ).toEqual([
      expect.objectContaining({ slug: "portable/local", source: "installed" }),
      expect.objectContaining({
        slug: "release/checklist",
        source: "managed",
        title: "Managed checklist",
      }),
      expect.objectContaining({ slug: "managed/remote", source: "managed" }),
    ]);
  });
});
