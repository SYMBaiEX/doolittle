import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentSdkService } from "../agent-sdk-service";
import type { SkillSynthesisService } from "../skill-synthesis/service";
import type { SkillsService } from "../skills/service";
import {
  buildSkillHubSyncArtifacts,
  installSkillHubCatalogManifest,
  loadSkillHubCatalogEntry,
  loadSkillHubCatalogRecords,
  writeSkillHubBundle,
  writeSkillHubSyncSnapshot,
} from "./catalog-sync";
import { buildSkillHubFamilies, buildSkillHubSummary } from "./family-summary";
import {
  buildSkillHubCatalogManifest,
  buildSkillHubManifestFromWorkspace,
  findInstalledSkillHubManifest,
  importSkillHubManifest,
  listInstalledSkillHubManifests,
  type SkillsHubManifestHost,
  writeSkillHubManifest,
} from "./manifests";
import {
  buildSkillHubWorkspaceRecords,
  categoryFromSkillHubSlug,
  countSkillHubLines,
  findSkillHubWorkspaceRecord,
  hashSkillHubContent,
  normalizeSkillHubSlug,
  nowIso,
  rootFromSkillHubSlug,
  tagsFromSkillHubCatalog,
  tagsFromSkillHubText,
} from "./records";
import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubImportResult,
  SkillHubManifest,
  SkillHubSummary,
  SkillHubSyncReport,
  SkillHubWorkspaceRecord,
} from "./types";

export type { SkillHubDistributionRecord } from "./types";

export class SkillsHubService {
  private readonly hubDir: string;
  private readonly manifestsDir: string;
  private readonly installsDir: string;
  private readonly exportsDir: string;
  private readonly importsDir: string;
  private readonly familyIndexPath: string;
  private readonly familyReadmePath: string;
  private readonly installedIndexPath: string;
  private readonly catalogIndexPath: string;
  private lastSyncReport?: SkillHubSyncReport;
  private catalogCache?: SkillHubCatalogRecord[];
  private familyCache?: SkillHubFamilyRecord[];

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
    this.familyIndexPath = join(this.skills.rootDir(), "index.md");
    this.familyReadmePath = join(this.skills.rootDir(), "README.md");
    this.installedIndexPath = join(this.installsDir, "index.json");
    this.catalogIndexPath = join(this.hubDir, "catalog.json");
    mkdirSync(this.manifestsDir, { recursive: true });
    mkdirSync(this.installsDir, { recursive: true });
    mkdirSync(this.exportsDir, { recursive: true });
    mkdirSync(this.importsDir, { recursive: true });
  }

  workspace(): SkillHubWorkspaceRecord[] {
    return buildSkillHubWorkspaceRecords(
      this.skills,
      this.skillSynthesis,
      this.manifestsDir,
    );
  }

  generated(): SkillHubWorkspaceRecord[] {
    const workspace = this.workspace();
    return workspace.filter((entry) => entry.source === "generated");
  }

  private manifestHost(): SkillsHubManifestHost {
    return {
      manifestsDir: this.manifestsDir,
      importsDir: this.importsDir,
      installedIndexPath: this.installedIndexPath,
      nowIso,
      normalizeSlug: normalizeSkillHubSlug,
      rootFromSlug: rootFromSkillHubSlug,
      categoryFromSlug: categoryFromSkillHubSlug,
      countLines: countSkillHubLines,
      hashContent: hashSkillHubContent,
      tagsFromText: tagsFromSkillHubText,
      tagsFromCatalog: tagsFromSkillHubCatalog,
    };
  }

  families(force = false, limit = 50): SkillHubFamilyRecord[] {
    if (force) {
      this.familyCache = undefined;
    }

    this.familyCache = buildSkillHubFamilies({
      familyIndexPath: this.familyIndexPath,
      familyReadmePath: this.familyReadmePath,
      skillsRootDir: this.skills.rootDir(),
      workspace: this.workspace(),
      catalog: this.catalogCache ?? [],
      installed: this.installedManifests(),
    });

    return this.familyCache.slice(0, limit);
  }

  family(slug: string): SkillHubFamilyRecord | undefined {
    const normalized = normalizeSkillHubSlug(slug);
    return this.families(false, 500).find(
      (entry) => normalizeSkillHubSlug(entry.slug) === normalized,
    );
  }

  async catalog(force = false, limit = 50): Promise<SkillHubCatalogRecord[]> {
    if (!force && this.catalogCache) {
      return this.catalogCache.slice(0, limit);
    }
    this.catalogCache = await loadSkillHubCatalogRecords({
      agentSdk: this.agentSdk,
      workspace: this.workspace(),
      manifestsDir: this.manifestsDir,
      catalogIndexPath: this.catalogIndexPath,
      force,
      limit,
    });
    this.familyCache = undefined;
    return (this.catalogCache ?? []).slice(0, limit);
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
    const installed = this.installedManifests();
    const { report, exportedManifests } = buildSkillHubSyncArtifacts({
      workspace,
      catalog,
      installed,
      manifestsDir: this.manifestsDir,
      exportManifest: (slug) => this.exportManifest(slug),
    });
    writeSkillHubSyncSnapshot(this.hubDir, report, exportedManifests);
    this.lastSyncReport = report;
    this.familyCache = undefined;
    return report;
  }

  manifest(slug: string): SkillHubManifest | undefined {
    const workspaceSkill = this.findWorkspaceSkill(slug);
    if (workspaceSkill) {
      return buildSkillHubManifestFromWorkspace(
        this.manifestHost(),
        workspaceSkill,
      );
    }
    return this.installedManifest(slug);
  }

  catalogEntry(slug: string): Promise<SkillHubCatalogRecord | undefined> {
    return loadSkillHubCatalogEntry({
      agentSdk: this.agentSdk,
      slug,
      workspace: this.workspace(),
      manifestsDir: this.manifestsDir,
    });
  }

  exportManifest(slug: string, destinationPath?: string): SkillHubManifest {
    const workspaceSkill = this.findWorkspaceSkill(slug);
    if (workspaceSkill) {
      const manifest = buildSkillHubManifestFromWorkspace(
        this.manifestHost(),
        workspaceSkill,
      );
      return writeSkillHubManifest(destinationPath ?? manifest.path, manifest);
    }

    const manifest = buildSkillHubCatalogManifest(this.manifestHost(), slug);
    return writeSkillHubManifest(destinationPath ?? manifest.path, manifest);
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
    const workspace = this.workspace();
    const installed = this.installedManifests();
    return writeSkillHubBundle({
      exportsDir: this.exportsDir,
      label,
      workspace,
      installed,
      sync,
      exportManifest: (slug) => this.exportManifest(slug),
    });
  }

  importManifest(sourcePath: string): SkillHubImportResult {
    const imported = importSkillHubManifest(this.manifestHost(), sourcePath);
    this.familyCache = undefined;
    return imported;
  }

  async installFromCatalog(slug: string): Promise<SkillHubImportResult> {
    return installSkillHubCatalogManifest({
      agentSdk: this.agentSdk,
      manifestHost: this.manifestHost(),
      manifestsDir: this.manifestsDir,
      slug,
      importManifest: (sourcePath) => this.importManifest(sourcePath),
    });
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
    return listInstalledSkillHubManifests(this.installedIndexPath);
  }

  installedManifest(slug: string): SkillHubManifest | undefined {
    return findInstalledSkillHubManifest(
      this.installedIndexPath,
      slug,
      normalizeSkillHubSlug,
    );
  }

  summary(force = false): SkillHubSummary {
    const workspace = this.workspace();
    const installed = this.installedManifests();
    const families = this.families(force, 500);
    return buildSkillHubSummary({
      workspace,
      catalog: this.catalogCache ?? [],
      installed,
      families,
      manifestsDir: this.manifestsDir,
      lastSyncReport: this.lastSyncReport,
      installedTagsBySlug: (slug) => this.installedManifest(slug)?.tags ?? [],
    });
  }

  private findWorkspaceSkill(
    slug: string,
  ): SkillHubWorkspaceRecord | undefined {
    return findSkillHubWorkspaceRecord(this.workspace(), slug);
  }
}
