import { basename, join } from "node:path";
import type { LoadedSkillWithSource } from "@elizaos/plugin-agent-skills";
import type { SkillDocument } from "@/types";
import type { LoadedNativeSkills } from "./native-loader";

export function projectOfficialSkills(
  official: LoadedSkillWithSource[],
  local: LoadedNativeSkills,
): LoadedNativeSkills {
  const localBySlug = new Map(
    [...local.native, ...local.workspace].map((skill) => [skill.slug, skill]),
  );
  const projected = official.map((skill) =>
    projectOfficialSkill(skill, localBySlug.get(skill.slug)),
  );

  return {
    workspace: projected.filter(
      (skill) => skill.source === "workspace" || skill.source === "generated",
    ),
    native: projected.filter(
      (skill) => skill.source !== "workspace" && skill.source !== "generated",
    ),
    commandSpecs: local.commandSpecs,
  };
}

function projectOfficialSkill(
  skill: LoadedSkillWithSource,
  local?: SkillDocument,
): SkillDocument {
  return {
    slug: skill.slug,
    title: local?.title ?? skill.name,
    description: skill.description,
    path:
      local?.path ??
      (basename(skill.path).toLowerCase() === "skill.md"
        ? skill.path
        : join(skill.path, "SKILL.md")),
    content: skill.content,
    source: local?.source ?? skill.source,
    commandName: local?.commandName,
    userInvocable: local?.userInvocable,
    disableModelInvocation: local?.disableModelInvocation,
  };
}
