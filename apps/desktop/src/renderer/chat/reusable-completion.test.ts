import { describe, expect, it } from "vitest";
import type { SkillCatalogItem } from "../catalog-entry-models";
import type { PromptLibraryEntry } from "../conversation-persistence";
import { reusableCompletions } from "./reusable-completion";

const prompts: PromptLibraryEntry[] = [
  {
    id: "general",
    title: "Release review",
    content: "Review the release carefully.",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
  {
    id: "project",
    title: "Project audit",
    content: "Audit this project.",
    projectId: "project-1",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T01:00:00.000Z",
  },
  {
    id: "foreign",
    title: "Private foreign prompt",
    content: "Do not show this elsewhere.",
    projectId: "project-2",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T02:00:00.000Z",
  },
];

const skills: SkillCatalogItem[] = [
  {
    id: "release/check",
    title: "Release check",
    description: "Verify a release.",
    slug: "release/check",
    family: "release",
    source: "workspace",
    commandName: "release-check",
    userInvocable: true,
    modelInvocable: true,
  },
];

describe("reusable completions", () => {
  it("searches active and general prompts without leaking other projects", () => {
    const results = reusableCompletions("$", prompts, skills, "project-1");
    expect(results.map((entry) => entry.label)).toEqual([
      "Project audit",
      "Release review",
      "Release check",
    ]);
  });

  it("expands skills to their official slash command", () => {
    expect(reusableCompletions("$release", prompts, skills)[1]).toMatchObject({
      kind: "skill",
      insertText: "/release-check",
    });
  });

  it("returns no results outside the dollar-prefix workflow", () => {
    expect(reusableCompletions("release", prompts, skills)).toEqual([]);
  });
});
