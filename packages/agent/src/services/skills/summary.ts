import type { SkillCommandSpec } from "@elizaos/skills";
import type { SkillDocument } from "@/types";
import type { SkillsWorkspaceSummary } from "./types";

export function buildSkillsSummary(
  skills: SkillDocument[],
  commandSpecs: SkillCommandSpec[],
): SkillsWorkspaceSummary {
  const categoryCounts = new Map<string, number>();
  const rootCounts = new Map<string, number>();
  const sourceCounts = new Map<NonNullable<SkillDocument["source"]>, number>();

  for (const skill of skills) {
    const slug = skill.slug.replaceAll("\\", "/");
    const root = slug.split("/")[0] ?? "unknown";
    const category =
      skill.source === "generated"
        ? "generated"
        : slug.split("/").slice(0, 2).join("/") || root;
    const source = skill.source ?? "workspace";

    rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  const generated = sourceCounts.get("generated") ?? 0;
  const workspace = (sourceCounts.get("workspace") ?? 0) + generated;
  const bundled = sourceCounts.get("bundled") ?? 0;
  const managed = sourceCounts.get("managed") ?? 0;
  const project = sourceCounts.get("project") ?? 0;

  return {
    total: skills.length,
    curated: skills.length - generated,
    generated,
    workspace,
    bundled,
    managed,
    project,
    invocable: commandSpecs.length,
    categories: [...categoryCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.name.localeCompare(right.name),
      ),
    roots: [...rootCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.name.localeCompare(right.name),
      ),
    sources: [...sourceCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.name.localeCompare(right.name),
      ),
  };
}
