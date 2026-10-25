import { basename, join } from "node:path";
import type { LoadedSkillWithSource } from "@elizaos/plugin-agent-skills";
import type { SkillDocument } from "../../types/index";
import type { LoadedNativeSkills } from "./native-loader";

export function projectOfficialSkills(
  official: LoadedSkillWithSource[],
  local: LoadedNativeSkills,
): LoadedNativeSkills {
  const localBySlug = new Map(
    [...local.native, ...local.workspace].map((skill) => [skill.slug, skill]),
  );
  const projected = official
    .filter(
      (skill) =>
        (skill.source !== "workspace" && skill.source !== "extra") ||
        localBySlug.has(skill.slug),
    )
    .map((skill) => projectOfficialSkill(skill, localBySlug.get(skill.slug)));
  const known = new Set(projected.map((skill) => skill.slug));
  // The SDK service is the catalog authority, but its process-wide snapshot
  // cannot observe a newly selected desktop workspace. Add only the current
  // workspace's local entries that it has not loaded.
  for (const skill of [
    ...local.workspace,
    ...local.native.filter((entry) => entry.source === "project"),
  ]) {
    if (!known.has(skill.slug)) projected.push(skill);
  }

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
    description: local?.description ?? skill.description,
    path:
      local?.path ??
      (basename(skill.path).toLowerCase() === "skill.md"
        ? skill.path
        : join(skill.path, "SKILL.md")),
    content: local?.content ?? skill.content,
    source: local?.source ?? skill.source,
    commandName: local?.commandName,
    userInvocable: local?.userInvocable,
    disableModelInvocation: local?.disableModelInvocation,
  };
}
