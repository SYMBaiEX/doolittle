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
      content: localSkill.content,
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
});
