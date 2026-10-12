import type { LoadedSkillWithSource } from "@elizaos/plugin-agent-skills";
import { describe, expect, it } from "vitest";
import type { SkillDocument } from "@/types";
import { projectOfficialSkills } from "./official-loader";

describe("projectOfficialSkills", () => {
  it("keeps the complete local description when the official projection is truncated", () => {
    const localSkill: SkillDocument = {
      slug: "authoring",
      title: "Doolittle Documentation Authoring",
      description:
        "Use this skill when writing or updating operator docs, usage notes, or workspace guides for Doolittle.",
      path: "/workspace/skills/authoring/SKILL.md",
      content: "# Doolittle Documentation Authoring",
      source: "workspace",
      commandName: "authoring",
      userInvocable: true,
      disableModelInvocation: false,
    };
    const officialSkill = {
      slug: "authoring",
      name: "authoring",
      description:
        "Use this skill when writing or updating operator docs, usage notes,",
      path: "/workspace/skills/authoring",
      content: "# Stale content from another workspace",
      source: "workspace",
    } as LoadedSkillWithSource;

    expect(
      projectOfficialSkills([officialSkill], {
        workspace: [localSkill],
        native: [],
        commandSpecs: [],
      }).workspace[0],
    ).toMatchObject({
      title: localSkill.title,
      description: localSkill.description,
      commandName: "authoring",
      userInvocable: true,
      disableModelInvocation: false,
      content: localSkill.content,
    });
  });

  it("uses official metadata when no matching local skill is available", () => {
    const officialSkill = {
      slug: "remote-skill",
      name: "Remote skill",
      description: "Provided by the official Agent Skills service.",
      path: "/managed/remote-skill",
      content: "# Remote skill",
      source: "managed",
    } as LoadedSkillWithSource;

    expect(
      projectOfficialSkills([officialSkill], {
        workspace: [],
        native: [],
        commandSpecs: [],
      }).native[0],
    ).toMatchObject({
      slug: "remote-skill",
      title: "Remote skill",
      description: "Provided by the official Agent Skills service.",
      source: "managed",
    });
  });

  it("retains only locally loaded project skills absent from the official catalog", () => {
    const current = {
      slug: "current-project",
      title: "Current project",
      description: "Current instructions",
      path: "/current/.elizaos/skills/current-project/SKILL.md",
      content: "# Current project",
      source: "project",
    } as SkillDocument;
    const result = projectOfficialSkills([], {
      workspace: [],
      native: [current],
      commandSpecs: [],
    });
    expect(result.native).toEqual([current]);
  });

  it("does not project workspace entries from a different root's SDK snapshot", () => {
    const oldWorkspaceSkill = {
      slug: "old-project",
      name: "Old project",
      description: "Instructions from another root",
      path: "/old/.elizaos/skills/old-project",
      content: "# Old workspace instructions",
      source: "workspace",
    } as LoadedSkillWithSource;
    const result = projectOfficialSkills([oldWorkspaceSkill], {
      workspace: [],
      native: [],
      commandSpecs: [],
    });
    expect(result.native).toEqual([]);
    expect(result.workspace).toEqual([]);
  });
});
