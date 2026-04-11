import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import {
  buildSkillCommandSpecs,
  loadSkillEntries,
  type SkillCommandSpec,
  type SkillEntry,
} from "@elizaos/skills";
import type { SkillDocument } from "@/types";
import { isUnderPath, stripSkillSuffix, titleFromPath } from "./paths";
import type { NativeSkillRoots, SkillSource } from "./types";

export interface LoadedNativeSkills {
  native: SkillDocument[];
  commandSpecs: SkillCommandSpec[];
}

export function loadNativeSkills(params: {
  skillsDir: string;
  workspaceDir: string;
  roots: NativeSkillRoots;
}): LoadedNativeSkills {
  const entries = loadSkillEntries({
    cwd: params.workspaceDir,
    skillPaths: [params.skillsDir],
  });
  const commandSpecs = buildSkillCommandSpecs(entries);
  const commandSpecBySkillName = new Map(
    commandSpecs.map((spec) => [spec.skillName, spec]),
  );
  const native = entries
    .map((entry) => mapNativeEntry(entry, commandSpecBySkillName, params.roots))
    .filter((skill): skill is SkillDocument => Boolean(skill))
    .sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    native,
    commandSpecs,
  };
}

function mapNativeEntry(
  entry: SkillEntry,
  commandSpecBySkillName: Map<string, SkillCommandSpec>,
  roots: NativeSkillRoots,
): SkillDocument | undefined {
  const filePath = entry.skill.filePath;
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }

  const source = resolveNativeSource(entry.skill.source);
  const slug = resolveNativeSlug(filePath, source, entry.skill.name, roots);
  const content = readFileSync(filePath, "utf8");
  const commandSpec = commandSpecBySkillName.get(entry.skill.name);

  return {
    slug,
    title: extractTitle(content, filePath),
    description: entry.skill.description,
    path: filePath,
    content,
    source,
    commandName: commandSpec?.name,
    userInvocable: entry.invocation.userInvocable !== false,
    disableModelInvocation: entry.invocation.disableModelInvocation === true,
  };
}

function resolveNativeSource(source?: string): SkillSource {
  if (
    source === "bundled" ||
    source === "managed" ||
    source === "project" ||
    source === "workspace" ||
    source === "generated"
  ) {
    return source;
  }
  return "bundled";
}

function resolveNativeSlug(
  filePath: string,
  source: SkillSource,
  fallbackName: string,
  roots: NativeSkillRoots,
): string {
  if (source === "bundled" && isUnderPath(filePath, roots.bundledSkillsDir)) {
    return stripSkillSuffix(relative(roots.bundledSkillsDir, filePath));
  }
  if (source === "managed" && isUnderPath(filePath, roots.managedSkillsDir)) {
    return stripSkillSuffix(relative(roots.managedSkillsDir, filePath));
  }
  if (source === "project" && isUnderPath(filePath, roots.projectSkillsDir)) {
    return stripSkillSuffix(relative(roots.projectSkillsDir, filePath));
  }
  if (isUnderPath(filePath, roots.workspaceSkillsDir)) {
    return stripSkillSuffix(relative(roots.workspaceSkillsDir, filePath));
  }
  return fallbackName.trim().toLowerCase();
}

function extractTitle(content: string, fallbackPath: string): string {
  const heading = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));

  return heading ? heading.replace(/^#+\s*/u, "") : titleFromPath(fallbackPath);
}
