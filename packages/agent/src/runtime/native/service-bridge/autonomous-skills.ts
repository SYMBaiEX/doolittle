import { basename, join } from "node:path";
import type { LoadedSkillWithSource } from "@elizaos/plugin-agent-skills";
import type { AppServices } from "@/services";
import type { SkillDocument } from "@/types";
import { getNativeServices, type RuntimeLike } from "./runtime";

function projectOfficialSkill(
  skill: LoadedSkillWithSource,
  local?: SkillDocument,
): SkillDocument {
  return {
    slug: skill.slug,
    title: skill.name,
    description: skill.description,
    path:
      basename(skill.path).toLowerCase() === "skill.md"
        ? skill.path
        : join(skill.path, "SKILL.md"),
    content: skill.content,
    source: local?.source ?? skill.source,
    commandName: local?.commandName,
    userInvocable: local?.userInvocable,
    disableModelInvocation: local?.disableModelInvocation,
  };
}

export function getEffectiveSkills(
  runtime: RuntimeLike,
  services: AppServices,
): SkillDocument[] {
  const official = getNativeServices(runtime).agentSkills;
  const local = services.skills.list();
  if (!official) {
    return local;
  }
  const localBySlug = new Map(local.map((skill) => [skill.slug, skill]));
  return official
    .getLoadedSkills()
    .map((skill) => projectOfficialSkill(skill, localBySlug.get(skill.slug)));
}

export function getEffectiveSkillsSummary(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const workspaceSkills = getEffectiveSkills(runtime, services);
  const roots = new Map<string, number>();
  const categories = new Map<string, number>();
  const sources = new Map<string, number>();
  let invocable = 0;
  for (const skill of workspaceSkills) {
    const slug = String(skill.slug ?? "");
    const root = slug.split("/")[0] || "unknown";
    const category = slug.startsWith("generated/")
      ? "generated"
      : slug.split("/").slice(0, 2).join("/") || root;
    roots.set(root, (roots.get(root) ?? 0) + 1);
    categories.set(category, (categories.get(category) ?? 0) + 1);
    const source = skill.source ?? "workspace";
    sources.set(source, (sources.get(source) ?? 0) + 1);
    if (
      skill.userInvocable !== false &&
      skill.disableModelInvocation !== true
    ) {
      invocable += 1;
    }
  }
  const sourceCount = (source: string) => sources.get(source) ?? 0;
  const generated = workspaceSkills.filter(
    (skill) =>
      skill.source === "generated" || skill.slug.startsWith("generated/"),
  ).length;
  return {
    total: workspaceSkills.length,
    curated: sourceCount("curated"),
    generated,
    workspace: sourceCount("workspace"),
    bundled: sourceCount("bundled"),
    managed: sourceCount("managed"),
    project: sourceCount("project"),
    plugin: sourceCount("plugin"),
    extra: sourceCount("extra"),
    invocable,
    categories: [...categories.entries()].map(([name, count]) => ({
      name,
      count,
    })),
    roots: [...roots.entries()].map(([name, count]) => ({ name, count })),
    sources: [...sources.entries()].map(([name, count]) => ({ name, count })),
  };
}
