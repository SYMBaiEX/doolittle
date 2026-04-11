import type { AppServices } from "@/services";
import { getNativeServices, type RuntimeLike } from "./runtime";

export function getEffectiveSkills(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).agentSkills?.list() ?? services.skills.list()
  );
}

export function getEffectiveSkillsSummary(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const nativeSummary = getNativeServices(runtime).agentSkills?.summary?.();
  if (nativeSummary) {
    return nativeSummary;
  }
  const skillsService = services.skills as Partial<{
    summary: () => unknown;
    list: () => unknown[];
  }>;
  if (typeof skillsService.summary === "function") {
    return skillsService.summary();
  }
  const workspaceSkills = skillsService.list?.() ?? [];
  const roots = new Map<string, number>();
  const categories = new Map<string, number>();
  let generated = 0;
  for (const skill of workspaceSkills as Array<{ slug?: string }>) {
    const slug = String(skill.slug ?? "");
    const root = slug.split("/")[0] || "unknown";
    const category = slug.startsWith("generated/")
      ? "generated"
      : slug.split("/").slice(0, 2).join("/") || root;
    roots.set(root, (roots.get(root) ?? 0) + 1);
    categories.set(category, (categories.get(category) ?? 0) + 1);
    if (root === "generated") {
      generated += 1;
    }
  }
  return {
    total: workspaceSkills.length,
    curated: workspaceSkills.length - generated,
    generated,
    categories: [...categories.entries()].map(([name, count]) => ({
      name,
      count,
    })),
    roots: [...roots.entries()].map(([name, count]) => ({ name, count })),
  };
}
