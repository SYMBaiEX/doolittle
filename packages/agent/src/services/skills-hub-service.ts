import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillDocument } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";
import type { SkillSynthesisService } from "./skill-synthesis-service";
import type { SkillsService } from "./skills-service";

export interface SkillHubWorkspaceRecord {
  slug: string;
  title: string;
  description: string;
  path: string;
  root: string;
  category: string;
  source: "workspace" | "generated";
  installable: boolean;
  contentLength: number;
  lineCount: number;
  hash: string;
  manifestPath: string;
  taskId?: string;
  objective?: string;
  updatedAt?: string;
}

export interface SkillHubCatalogRecord {
  slug: string;
  displayName: string;
  summary: string | null;
  tags: Record<string, string>;
  installsCurrent: number;
  installsAllTime: number;
  stars: number;
  versions: number;
  installed: boolean;
  workspacePath?: string;
  manifestPath: string;
  source: "catalog" | "workspace";
}

export interface SkillHubManifest {
  kind: "skill-manifest";
  slug: string;
  title: string;
  description: string;
  source: "workspace" | "generated" | "catalog" | "installed";
  path: string;
  root: string;
  category: string;
  installable: boolean;
  content: string;
  contentLength: number;
  lineCount: number;
  hash: string;
  tags: string[];
  generatedAt: string;
  workspacePath?: string;
  taskId?: string;
  objective?: string;
  catalog?: {
    displayName: string;
    summary: string | null;
    installsCurrent: number;
    installsAllTime: number;
    stars: number;
    versions: number;
  };
}

export interface SkillHubSyncReport {
  refreshedAt: string;
  workspaceTotal: number;
  generatedTotal: number;
  catalogTotal: number;
  installedTotal: number;
  shared: string[];
  localOnly: string[];
  catalogOnly: string[];
  installable: number;
  exportedManifests: number;
  manifestsDir: string;
  summary: string;
}

export interface SkillHubImportResult {
  sourcePath: string;
  manifestPath: string;
  skillPath: string;
  slug: string;
  title: string;
  source: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/.-]+/gu, "-")
    .replace(/\/+/gu, "/")
    .replace(/^-+|-+$/gu, "");
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function countLines(content: string): number {
  if (!content.trim()) {
    return 0;
  }
  return content.split(/\r?\n/u).length;
}

function categoryFromSlug(slug: string): string {
  const normalized = slug.replaceAll("\\", "/");
  return normalized.includes("/")
    ? normalized.split("/").slice(0, 2).join("/")
    : normalized;
}

function rootFromSlug(slug: string): string {
  const normalized = slug.replaceAll("\\", "/");
  return normalized.split("/")[0] ?? "unknown";
}

function tagsFromText(content: string): string[] {
  const tags = new Set<string>();
  for (const match of content.matchAll(
    /^(?:-|\*|#|##|###)\s*([A-Za-z0-9][A-Za-z0-9-_/ ]{1,48})$/gmu,
  )) {
    const value = match[1]?.trim().toLowerCase();
    if (value) {
      tags.add(value.replace(/\s+/gu, "-"));
    }
  }
  return [...tags].slice(0, 8);
}

export class SkillsHubService {
  private readonly hubDir: string;
  private readonly manifestsDir: string;
  private readonly installsDir: string;
  private readonly exportsDir: string;
  private readonly importsDir: string;
  private readonly installedIndexPath: string;
  private readonly catalogIndexPath: string;
  private lastSyncReport?: SkillHubSyncReport;
  private catalogCache?: SkillHubCatalogRecord[];

  constructor(
    private readonly skills: SkillsService,
    private readonly skillSynthesis: SkillSynthesisService,
    private readonly agentSdk: AgentSdkService,
    baseDir: string,
  ) {
    this.hubDir = join(baseDir, "skills-hub");
    this.manifestsDir = join(this.hubDir, "manifests");
    this.installsDir = join(this.hubDir, "installs");
    this.exportsDir = join(this.hubDir, "exports");
    this.importsDir = join(this.hubDir, "imports");
    this.installedIndexPath = join(this.installsDir, "index.json");
    this.catalogIndexPath = join(this.hubDir, "catalog.json");
    mkdirSync(this.manifestsDir, { recursive: true });
    mkdirSync(this.installsDir, { recursive: true });
    mkdirSync(this.exportsDir, { recursive: true });
    mkdirSync(this.importsDir, { recursive: true });
  }

  workspace(): SkillHubWorkspaceRecord[] {
    const generated = new Map(
      this.skillSynthesis
        .listGeneratedSkills()
        .map((record) => [record.slug, record]),
    );
    return this.skills.list().map((skill) => {
      const normalized = normalizeSlug(skill.slug);
      const generatedRecord = generated.get(normalized);
      const content = skill.content;
      const manifestPath = join(this.manifestsDir, `${normalized}.json`);
      return {
        slug: skill.slug,
        title: skill.title,
        description: skill.description,
        path: skill.path,
        root: rootFromSlug(skill.slug),
        category: categoryFromSlug(skill.slug),
        source: normalized.startsWith("generated/") ? "generated" : "workspace",
        installable: true,
        contentLength: content.length,
        lineCount: countLines(content),
        hash: hashContent(content),
        manifestPath,
        taskId: generatedRecord?.taskId,
        objective: generatedRecord?.objective,
        updatedAt: generatedRecord?.updatedAt,
      };
    });
  }

  generated(): SkillHubWorkspaceRecord[] {
    const workspace = this.workspace();
    return workspace.filter((entry) => entry.source === "generated");
  }

  async catalog(force = false, limit = 50): Promise<SkillHubCatalogRecord[]> {
    if (!force && this.catalogCache) {
      return this.catalogCache.slice(0, limit);
    }
    const catalog = await this.agentSdk.catalog(force, limit);
    this.catalogCache = catalog.map((entry) => ({
      slug: entry.slug,
      displayName: entry.displayName,
      summary: entry.summary,
      tags: entry.tags,
      installsCurrent: entry.stats.installsCurrent,
      installsAllTime: entry.stats.installsAllTime,
      stars: entry.stats.stars,
      versions: entry.stats.versions,
      installed: Boolean(this.findWorkspaceSkill(entry.slug)),
      workspacePath: this.findWorkspaceSkill(entry.slug)?.path,
      manifestPath: join(
        this.manifestsDir,
        `${normalizeSlug(entry.slug)}.json`,
      ),
      source: "catalog",
    }));
    const workspaceSlugs = new Set(this.workspace().map((entry) => entry.slug));
    this.catalogCache = this.catalogCache.map((entry) => ({
      ...entry,
      installed: workspaceSlugs.has(entry.slug),
      workspacePath: workspaceSlugs.has(entry.slug)
        ? this.findWorkspaceSkill(entry.slug)?.path
        : undefined,
    }));
    writeFileSync(
      this.catalogIndexPath,
      JSON.stringify(
        {
          generatedAt: nowIso(),
          catalog: this.catalogCache,
        },
        null,
        2,
      ),
      "utf8",
    );
    return this.catalogCache.slice(0, limit);
  }

  async searchCatalog(query: string, limit = 15) {
    return this.agentSdk.searchSkillCatalog(query, limit);
  }

  sync(force = false): Promise<SkillHubSyncReport> {
    return this.syncCatalog(force);
  }

  async syncCatalog(force = false): Promise<SkillHubSyncReport> {
    const workspace = this.workspace();
    const catalog = await this.catalog(force, 500);
    const workspaceSlugs = new Set(workspace.map((entry) => entry.slug));
    const catalogSlugs = new Set(catalog.map((entry) => entry.slug));
    const shared = [...workspaceSlugs].filter((slug) => catalogSlugs.has(slug));
    const localOnly = [...workspaceSlugs].filter(
      (slug) => !catalogSlugs.has(slug),
    );
    const catalogOnly = [...catalogSlugs].filter(
      (slug) => !workspaceSlugs.has(slug),
    );
    const exportedManifests = workspace.map((entry) =>
      this.exportManifest(entry.slug),
    );
    const report: SkillHubSyncReport = {
      refreshedAt: nowIso(),
      workspaceTotal: workspace.length,
      generatedTotal: workspace.filter((entry) => entry.source === "generated")
        .length,
      catalogTotal: catalog.length,
      installedTotal: this.installedManifests().length,
      shared,
      localOnly,
      catalogOnly,
      installable: workspace.filter((entry) => entry.installable).length,
      exportedManifests: exportedManifests.length,
      manifestsDir: this.manifestsDir,
      summary: `workspace=${workspace.length} catalog=${catalog.length} shared=${shared.length} localOnly=${localOnly.length} catalogOnly=${catalogOnly.length}`,
    };
    writeFileSync(
      join(this.hubDir, "sync-latest.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    writeFileSync(
      join(this.hubDir, "index.json"),
      JSON.stringify(
        {
          generatedAt: report.refreshedAt,
          report,
          manifests: exportedManifests,
        },
        null,
        2,
      ),
      "utf8",
    );
    this.lastSyncReport = report;
    return report;
  }

  manifest(slug: string): SkillHubManifest | undefined {
    const workspaceSkill = this.findWorkspaceSkill(slug);
    if (workspaceSkill) {
      return this.buildManifestFromWorkspace(workspaceSkill);
    }
    return this.installedManifest(slug);
  }

  catalogEntry(slug: string): Promise<SkillHubCatalogRecord | undefined> {
    return this.agentSdk.catalogSkill(slug).then((entry) => {
      if (!entry) {
        return undefined;
      }
      return {
        slug: entry.slug,
        displayName: entry.displayName,
        summary: entry.summary,
        tags: entry.tags,
        installsCurrent: entry.stats.installsCurrent,
        installsAllTime: entry.stats.installsAllTime,
        stars: entry.stats.stars,
        versions: entry.stats.versions,
        installed: Boolean(this.findWorkspaceSkill(entry.slug)),
        workspacePath: this.findWorkspaceSkill(entry.slug)?.path,
        manifestPath: join(
          this.manifestsDir,
          `${normalizeSlug(entry.slug)}.json`,
        ),
        source: "catalog",
      };
    });
  }

  exportManifest(slug: string, destinationPath?: string): SkillHubManifest {
    const workspaceSkill = this.findWorkspaceSkill(slug);
    if (workspaceSkill) {
      const manifest = this.buildManifestFromWorkspace(workspaceSkill);
      const manifestPath = destinationPath ?? manifest.path;
      mkdirSync(dirname(manifestPath), { recursive: true });
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      return {
        ...manifest,
        path: manifestPath,
      };
    }

    const installable = this.buildCatalogManifest(slug);
    const manifestPath = destinationPath ?? installable.path;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(installable, null, 2), "utf8");
    return {
      ...installable,
      path: manifestPath,
    };
  }

  async exportBundle(label = "skills-hub"): Promise<{
    bundlePath: string;
    manifestCount: number;
    workspaceCount: number;
    catalogCount: number;
    installedCount: number;
    sync: SkillHubSyncReport;
  }> {
    const sync = await this.syncCatalog();
    const bundlePath = join(this.exportsDir, `${this.slug(label)}-bundle.json`);
    const bundle = {
      label,
      createdAt: nowIso(),
      manifests: this.workspace().map((entry) =>
        this.exportManifest(entry.slug),
      ),
      installed: this.installedManifests(),
      sync,
    };
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
    return {
      bundlePath,
      manifestCount: bundle.manifests.length + bundle.installed.length,
      workspaceCount: this.workspace().length,
      catalogCount: sync.catalogTotal,
      installedCount: bundle.installed.length,
      sync,
    };
  }

  importManifest(sourcePath: string): SkillHubImportResult {
    const manifest = JSON.parse(readFileSync(sourcePath, "utf8")) as
      | SkillHubManifest
      | {
          slug?: string;
          title?: string;
          description?: string;
          content?: string;
          source?: string;
        };
    const slug = normalizeSlug(manifest.slug ?? "imported-skill");
    const title = manifest.title ?? slug;
    const description = manifest.description ?? "Imported skill manifest.";
    const installDir = join(this.importsDir, slug);
    mkdirSync(installDir, { recursive: true });
    const skillPath = join(installDir, "SKILL.md");
    const content =
      "content" in manifest && typeof manifest.content === "string"
        ? manifest.content
        : [
            `# ${title}`,
            "",
            description,
            "",
            "## Install Notes",
            `Imported from ${sourcePath}.`,
          ].join("\n");
    writeFileSync(skillPath, content, "utf8");
    const manifestPath = join(installDir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          kind: "skill-manifest",
          ...manifest,
          slug,
          title,
          description,
          source: "installed",
          installedAt: nowIso(),
          skillPath,
        },
        null,
        2,
      ),
      "utf8",
    );
    const installedManifest = this.normalizeInstalledManifest({
      ...manifest,
      slug,
      title,
      description,
      source: "installed",
      path: manifestPath,
      root: rootFromSlug(slug),
      category: categoryFromSlug(slug),
      installable: true,
      content,
      contentLength: content.length,
      lineCount: countLines(content),
      hash: hashContent(content),
      tags: tagsFromText(content),
      generatedAt: nowIso(),
      workspacePath: skillPath,
      kind: "skill-manifest",
    });
    this.writeInstalledIndex([
      ...this.readInstalledIndex().filter(
        (entry) => normalizeSlug(entry.slug) !== slug,
      ),
      installedManifest,
    ]);
    return {
      sourcePath,
      manifestPath,
      skillPath,
      slug,
      title,
      source: "installed",
    };
  }

  async installFromCatalog(slug: string): Promise<SkillHubImportResult> {
    const entry = await this.findCatalogSkill(slug);
    if (!entry) {
      throw new Error(`Skill catalog entry not found: ${slug}`);
    }
    const manifest = this.buildCatalogManifest(slug, entry);
    const sourcePath = join(this.manifestsDir, `${manifest.slug}.json`);
    mkdirSync(dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, JSON.stringify(manifest, null, 2), "utf8");
    return this.importManifest(sourcePath);
  }

  installedManifests(): Array<{
    slug: string;
    title: string;
    path: string;
    installedAt: string;
    source: string;
    root: string;
    category: string;
  }> {
    return this.readInstalledIndex().map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      path: entry.path,
      installedAt: entry.generatedAt,
      source: entry.source,
      root: entry.root,
      category: entry.category,
    }));
  }

  installedManifest(slug: string): SkillHubManifest | undefined {
    const normalized = normalizeSlug(slug);
    return this.readInstalledIndex().find(
      (entry) => normalizeSlug(entry.slug) === normalized,
    );
  }

  summary(force = false) {
    const workspace = this.workspace();
    const generated = workspace.filter((entry) => entry.source === "generated");
    const installed = this.installedManifests();
    return {
      workspaceTotal: workspace.length,
      installable: workspace.filter((entry) => entry.installable).length,
      generatedTotal: generated.length,
      catalogTotal:
        this.lastSyncReport?.catalogTotal ?? this.catalogCache?.length ?? 0,
      syncedTotal: this.lastSyncReport?.workspaceTotal ?? 0,
      manifestTotal: installed.length,
      installedTotal: installed.length,
      sourceDir: this.manifestsDir,
      exportDir: this.exportsDir,
      importDir: this.importsDir,
      catalogDir: this.catalogIndexPath,
      installedDir: this.installedIndexPath,
      force,
    };
  }

  private findWorkspaceSkill(
    slug: string,
  ): SkillHubWorkspaceRecord | undefined {
    const normalized = normalizeSlug(slug);
    return this.workspace().find(
      (entry) => normalizeSlug(entry.slug) === normalized,
    );
  }

  private findCatalogSkill(slug: string) {
    return this.agentSdk.catalogSkill(slug);
  }

  private buildManifestFromWorkspace(
    skill: SkillHubWorkspaceRecord | SkillDocument,
  ): SkillHubManifest {
    const content = readFileSync(skill.path, "utf8");
    const slug = normalizeSlug(skill.slug);
    return {
      kind: "skill-manifest",
      slug,
      title: skill.title,
      description: skill.description,
      source: slug.startsWith("generated/") ? "generated" : "workspace",
      path: join(this.manifestsDir, `${slug}.json`),
      root: rootFromSlug(slug),
      category: categoryFromSlug(slug),
      installable: true,
      content,
      contentLength: content.length,
      lineCount: countLines(content),
      hash: hashContent(content),
      tags: tagsFromText(content),
      generatedAt: nowIso(),
      workspacePath: skill.path,
    };
  }

  private buildCatalogManifest(
    slug: string,
    entry?: NonNullable<Awaited<ReturnType<AgentSdkService["catalogSkill"]>>>,
  ): SkillHubManifest {
    const catalog = entry;
    const normalized = normalizeSlug(slug);
    const title = catalog?.displayName ?? slug;
    const summary =
      catalog?.summary ?? "Imported from the ElizaOS skill catalog.";
    const content = [
      `# ${title}`,
      "",
      summary ?? "No summary available.",
      "",
      "## Source",
      `- Catalog slug: ${catalog?.slug ?? slug}`,
      `- Installs current: ${catalog?.stats.installsCurrent ?? 0}`,
      `- Installs all-time: ${catalog?.stats.installsAllTime ?? 0}`,
      `- Stars: ${catalog?.stats.stars ?? 0}`,
      "",
      "## Tags",
      ...(catalog?.tags
        ? Object.entries(catalog.tags).map(
            ([key, value]) => `- ${key}: ${value}`,
          )
        : ["- none"]),
    ].join("\n");
    return {
      kind: "skill-manifest",
      slug: normalized,
      title,
      description: summary ?? "",
      source: "catalog",
      path: join(this.manifestsDir, `${normalized}.json`),
      root: rootFromSlug(normalized),
      category: categoryFromSlug(normalized),
      installable: true,
      content,
      contentLength: content.length,
      lineCount: countLines(content),
      hash: hashContent(content),
      tags: tagsFromText(content),
      generatedAt: nowIso(),
      catalog: catalog
        ? {
            displayName: catalog.displayName,
            summary: catalog.summary,
            installsCurrent: catalog.stats.installsCurrent,
            installsAllTime: catalog.stats.installsAllTime,
            stars: catalog.stats.stars,
            versions: catalog.stats.versions,
          }
        : undefined,
    };
  }

  private readInstalledIndex(): Array<SkillHubManifest> {
    if (!existsSync(this.installedIndexPath)) {
      return [];
    }
    try {
      const parsed = JSON.parse(
        readFileSync(this.installedIndexPath, "utf8"),
      ) as {
        manifests?: Array<SkillHubManifest>;
      };
      return parsed.manifests ?? [];
    } catch {
      return [];
    }
  }

  private writeInstalledIndex(manifests: Array<SkillHubManifest>): void {
    writeFileSync(
      this.installedIndexPath,
      JSON.stringify(
        {
          generatedAt: nowIso(),
          manifests: manifests.map((entry) =>
            this.normalizeInstalledManifest(entry),
          ),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  private normalizeInstalledManifest(
    manifest: Partial<SkillHubManifest> & {
      slug: string;
      title: string;
      description: string;
      path: string;
      root: string;
      category: string;
      installable: boolean;
      content: string;
      contentLength: number;
      lineCount: number;
      hash: string;
      tags: string[];
      generatedAt: string;
    },
  ): SkillHubManifest {
    return {
      ...manifest,
      kind: "skill-manifest",
      source: "installed",
    };
  }

  private slug(value: string): string {
    return normalizeSlug(value).replaceAll("/", "-");
  }
}
