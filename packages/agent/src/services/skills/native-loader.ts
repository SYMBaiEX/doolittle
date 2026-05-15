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
  workspace: SkillDocument[];
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
  const workspace = native.filter(
    (skill) => skill.source === "workspace" || skill.source === "generated",
  );
  const externalNative = native.filter(
    (skill) => skill.source !== "workspace" && skill.source !== "generated",
  );

  return {
    workspace,
    native: externalNative,
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

  const source = resolveNativeSource(filePath, entry.skill.source, roots);
  const slug = resolveNativeSlug(filePath, entry.skill.name, roots);
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

function resolveNativeSource(
  filePath: string,
  source: string | undefined,
  roots: NativeSkillRoots,
): SkillSource {
  if (isUnderPath(filePath, roots.workspaceSkillsDir)) {
    const slug = stripSkillSuffix(relative(roots.workspaceSkillsDir, filePath));
    return slug.startsWith("generated/") ? "generated" : "workspace";
  }
  if (isUnderPath(filePath, roots.bundledSkillsDir)) {
    return "bundled";
  }
  if (isUnderPath(filePath, roots.managedSkillsDir) || source === "user") {
    return "managed";
  }
  if (isUnderPath(filePath, roots.curatedSkillsDir) || source === "curated") {
    return "curated";
  }
  if (isUnderPath(filePath, roots.projectSkillsDir) || source === "project") {
    return "project";
  }
  return "workspace";
}

function resolveNativeSlug(
  filePath: string,
  fallbackName: string,
  roots: NativeSkillRoots,
): string {
  if (isUnderPath(filePath, roots.workspaceSkillsDir)) {
    return stripSkillSuffix(relative(roots.workspaceSkillsDir, filePath));
  }
  if (isUnderPath(filePath, roots.bundledSkillsDir)) {
    return stripSkillSuffix(relative(roots.bundledSkillsDir, filePath));
  }
  if (isUnderPath(filePath, roots.managedSkillsDir)) {
    return stripSkillSuffix(relative(roots.managedSkillsDir, filePath));
  }
  if (isUnderPath(filePath, roots.curatedSkillsDir)) {
    return stripSkillSuffix(relative(roots.curatedSkillsDir, filePath));
  }
  if (isUnderPath(filePath, roots.projectSkillsDir)) {
    return stripSkillSuffix(relative(roots.projectSkillsDir, filePath));
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
