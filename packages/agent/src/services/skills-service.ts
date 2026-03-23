import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  buildSkillCommandSpecs,
  getSkillsDir,
  loadSkillEntries,
  type SkillCommandSpec,
  type SkillEntry,
} from "@elizaos/skills";
import type { SkillDocument } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";

type SkillSource = NonNullable<SkillDocument["source"]>;

interface SkillsSnapshot {
  capturedAt: number;
  workspace: SkillDocument[];
  native: SkillDocument[];
  all: SkillDocument[];
  summary: SkillsWorkspaceSummary;
  commandSpecs: SkillCommandSpec[];
}

export interface SkillsWorkspaceSummary {
  total: number;
  curated: number;
  generated: number;
  workspace: number;
  bundled: number;
  managed: number;
  project: number;
  invocable: number;
  categories: Array<{
    name: string;
    count: number;
  }>;
  roots: Array<{
    name: string;
    count: number;
  }>;
  sources: Array<{
    name: SkillSource;
    count: number;
  }>;
}

const CACHE_TTL_MS = 2_000;

function normalizePath(path: string): string {
  return resolve(path);
}

function isUnderPath(target: string, root: string): boolean {
  const normalizedTarget = normalizePath(target);
  const normalizedRoot = normalizePath(root);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}/`)
  );
}

function stripSkillSuffix(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/\/SKILL\.md$/u, "")
    .replace(/\.md$/u, "");
}

function titleFromPath(path: string): string {
  return path.split("/").at(-2) ?? "Untitled Skill";
}

export class SkillsService {
  private readonly bundledSkillsDir = getSkillsDir();
  private readonly managedSkillsDir = join(homedir(), ".elizaos", "skills");
  private readonly projectSkillsDir: string;
  private snapshot?: SkillsSnapshot;

  constructor(
    private readonly skillsDir: string,
    private readonly agentSdk: AgentSdkService,
    private readonly workspaceDir: string = process.cwd(),
  ) {
    this.projectSkillsDir = join(this.workspaceDir, ".elizaos", "skills");
  }

  rootDir(): string {
    return this.skillsDir;
  }

  workspace(): SkillDocument[] {
    return this.ensureSnapshot().workspace;
  }

  native(): SkillDocument[] {
    return this.ensureSnapshot().native;
  }

  bundled(): SkillDocument[] {
    return this.native().filter((skill) => skill.source === "bundled");
  }

  list(): SkillDocument[] {
    return this.ensureSnapshot().all;
  }

  get(slug: string): SkillDocument | undefined {
    return this.list().find((skill) => skill.slug === slug);
  }

  summary(): SkillsWorkspaceSummary {
    return this.ensureSnapshot().summary;
  }

  commandSpecs(): SkillCommandSpec[] {
    return this.ensureSnapshot().commandSpecs;
  }

  async catalog(limit = 20) {
    return this.agentSdk.skillCatalog(false, limit);
  }

  async searchCatalog(query: string, limit = 15) {
    return this.agentSdk.searchSkillCatalog(query, limit);
  }

  private ensureSnapshot(force = false): SkillsSnapshot {
    const now = Date.now();
    if (
      !force &&
      this.snapshot &&
      now - this.snapshot.capturedAt < CACHE_TTL_MS
    ) {
      return this.snapshot;
    }

    const workspace = this.loadWorkspaceSkills();
    const { native, commandSpecs } = this.loadNativeSkills();
    const allBySlug = new Map<string, SkillDocument>();

    for (const skill of native) {
      allBySlug.set(skill.slug, skill);
    }
    for (const skill of workspace) {
      allBySlug.set(skill.slug, skill);
    }

    const all = [...allBySlug.values()].sort((left, right) =>
      left.slug.localeCompare(right.slug),
    );
    const summary = this.buildSummary(all, commandSpecs);

    this.snapshot = {
      capturedAt: now,
      workspace,
      native,
      all,
      summary,
      commandSpecs,
    };

    return this.snapshot;
  }

  private loadWorkspaceSkills(): SkillDocument[] {
    return this.walk(this.skillsDir)
      .filter((path) => path.endsWith("SKILL.md"))
      .map((path) => {
        const content = readFileSync(path, "utf8");
        const title = this.extractTitle(content, path);
        const description = this.extractDescription(content);
        const slug = stripSkillSuffix(relative(this.skillsDir, path));
        const source: SkillSource = slug.startsWith("generated/")
          ? "generated"
          : "workspace";

        return {
          slug,
          title,
          description,
          path,
          content,
          source,
        };
      })
      .sort((left, right) => left.slug.localeCompare(right.slug));
  }

  private loadNativeSkills(): {
    native: SkillDocument[];
    commandSpecs: SkillCommandSpec[];
  } {
    const entries = loadSkillEntries({
      cwd: this.workspaceDir,
      skillPaths: [this.skillsDir],
    });
    const commandSpecs = buildSkillCommandSpecs(entries);
    const commandSpecBySkillName = new Map(
      commandSpecs.map((spec) => [spec.skillName, spec]),
    );
    const native = entries
      .map((entry) => this.mapNativeEntry(entry, commandSpecBySkillName))
      .filter((skill): skill is SkillDocument => Boolean(skill));

    return {
      native: native.sort((left, right) => left.slug.localeCompare(right.slug)),
      commandSpecs,
    };
  }

  private mapNativeEntry(
    entry: SkillEntry,
    commandSpecBySkillName: Map<string, SkillCommandSpec>,
  ): SkillDocument | undefined {
    const filePath = entry.skill.filePath;
    if (!filePath || !existsSync(filePath)) {
      return undefined;
    }

    const source = this.resolveNativeSource(entry.skill.source);
    const slug = this.resolveNativeSlug(filePath, source, entry.skill.name);
    const content = readFileSync(filePath, "utf8");
    const title = this.extractTitle(content, filePath);
    const commandSpec = commandSpecBySkillName.get(entry.skill.name);

    return {
      slug,
      title,
      description: entry.skill.description,
      path: filePath,
      content,
      source,
      commandName: commandSpec?.name,
      userInvocable: entry.invocation.userInvocable !== false,
      disableModelInvocation: entry.invocation.disableModelInvocation === true,
    };
  }

  private resolveNativeSource(source?: string): SkillSource {
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

  private resolveNativeSlug(
    filePath: string,
    source: SkillSource,
    fallbackName: string,
  ): string {
    if (source === "bundled" && isUnderPath(filePath, this.bundledSkillsDir)) {
      return stripSkillSuffix(relative(this.bundledSkillsDir, filePath));
    }
    if (source === "managed" && isUnderPath(filePath, this.managedSkillsDir)) {
      return stripSkillSuffix(relative(this.managedSkillsDir, filePath));
    }
    if (source === "project" && isUnderPath(filePath, this.projectSkillsDir)) {
      return stripSkillSuffix(relative(this.projectSkillsDir, filePath));
    }
    if (isUnderPath(filePath, this.skillsDir)) {
      return stripSkillSuffix(relative(this.skillsDir, filePath));
    }
    return fallbackName.trim().toLowerCase();
  }

  private buildSummary(
    skills: SkillDocument[],
    commandSpecs: SkillCommandSpec[],
  ): SkillsWorkspaceSummary {
    const categoryCounts = new Map<string, number>();
    const rootCounts = new Map<string, number>();
    const sourceCounts = new Map<SkillSource, number>();

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

  private walk(root: string): string[] {
    if (!existsSync(root)) {
      return [];
    }

    const entries = readdirSync(root);
    const files: string[] = [];

    for (const entry of entries) {
      const path = join(root, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        files.push(...this.walk(path));
      } else {
        files.push(path);
      }
    }

    return files;
  }

  private extractTitle(content: string, fallbackPath: string): string {
    const heading = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("#"));

    return heading
      ? heading.replace(/^#+\s*/u, "")
      : titleFromPath(fallbackPath);
  }

  private extractDescription(content: string): string {
    const bodyLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => Boolean(line) && !line.startsWith("#"));

    return bodyLine ?? "No description available.";
  }
}
