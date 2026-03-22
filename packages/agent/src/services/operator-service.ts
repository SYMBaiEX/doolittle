import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { getTransportRequirementRecords } from "@/gateway/transport-contract";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import {
  getNativeOwnershipControlPlane,
  type getNativeTransportControlPlane,
  type RuntimeLike,
} from "@/runtime/native/service-bridge";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";
import type { AutocoderPipelineService } from "./autocoder-pipeline-service";
import type { DiagnosticsService } from "./diagnostics-service";
import type { EcosystemService } from "./ecosystem-service";
import {
  createNativeServiceRegistry,
  describeNativeServiceRegistry,
} from "./native-service-registry";
import { buildOperatorCondensedSummary } from "./operator-summary";
import type { RepositoryService } from "./repository-service";

interface PackageMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
}

function findInventoryEntry(
  inventory: NonNullable<SetupSummary["transportInventory"]>,
  id: string,
): (typeof inventory)[number] | undefined {
  return inventory.find((entry) => entry.platform === id);
}

function describeTransportSummary(
  id: string,
  label: string,
  inventory?: SetupSummary["transportInventory"],
  fallbackReady?: boolean,
  fallbackDetail?: string,
): { id: string; ready: boolean; detail: string } {
  const entry = inventory ? findInventoryEntry(inventory, id) : undefined;
  if (entry) {
    return {
      id,
      ready: entry.operational,
      detail: `${label}: source=${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gateway=${entry.gatewayEnabled ? "on" : "off"} operational=${entry.operational ? "yes" : "no"} reason=${entry.reason}`,
    };
  }
  return {
    id,
    ready: fallbackReady ?? false,
    detail: fallbackDetail ?? `${label} transport is not available.`,
  };
}

export interface OperatorVersionSummary {
  name: string;
  version: string;
  description?: string;
  bun: string;
  dependencies: Record<string, string>;
  nativePlugins: {
    total: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  nativePackages: {
    runtimeLatest: string;
    runtimeAlpha: string;
    aligned: number;
    vendored: number;
    alphaOnly: number;
    workspaceOnly: number;
  };
}

export interface SetupSummary {
  version: OperatorVersionSummary;
  directories: Array<{ label: string; path: string; exists: boolean }>;
  providers: Array<{ id: string; ready: boolean; detail: string }>;
  transports: Array<{ id: string; ready: boolean; detail: string }>;
  transportControl?: ReturnType<typeof getNativeTransportControlPlane>;
  transportInventory?: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"];
  nativeServices: Array<{ group: string; services: string[]; count: number }>;
  ownership?: {
    serviceResolution: number;
    pluginManager: {
      available: boolean;
      total: number;
      enabled: number;
      official: number;
      vendored: number;
      categories: number;
    };
    identity?: {
      personality: number;
      rolodex: number;
      experience: number;
    };
  };
  ecosystem?: {
    registryAvailable: boolean;
    registryPlugins: number;
    skillCatalogAvailable: boolean;
    skillCatalogSkills: number;
    compatibilityFailures: number;
    benchmarkPacks?: number;
    distributionChannels?: number;
    modelingProfiles?: number;
  };
  pluginManager?: {
    available: boolean;
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
  pipeline?: {
    total: number;
    workflows: number;
    failed: number;
    failedWorkflows: number;
    latestKind?: string;
    latestTarget?: string;
  };
  checklist: string[];
}

export interface UpdatePreview {
  version: OperatorVersionSummary;
  repositoryAvailable: boolean;
  status: string;
  recentCommits: string;
  recommendedSteps: string[];
  ownership?: {
    serviceResolution: number;
    pluginManager: {
      available: boolean;
      total: number;
      enabled: number;
      official: number;
      vendored: number;
      categories: number;
    };
    identity?: {
      personality: number;
      rolodex: number;
      experience: number;
    };
  };
  ecosystem?: {
    registryAvailable: boolean;
    registryPlugins: number;
    skillCatalogAvailable: boolean;
    skillCatalogSkills: number;
    compatibilityFailures: number;
    benchmarkPacks?: number;
    distributionChannels?: number;
    modelingProfiles?: number;
  };
  transportControl?: ReturnType<
    typeof getNativeTransportControlPlane
  >["totals"];
  transportInventory?: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"];
  pluginManager?: {
    available: boolean;
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
  pipeline?: {
    total: number;
    workflows: number;
    failed: number;
    failedWorkflows: number;
    latestKind?: string;
    latestTarget?: string;
  };
}

export interface MigrationSourceSummary {
  id: string;
  label: string;
  path: string;
  exists: boolean;
}

export interface MigrationInspection {
  rootPath: string;
  exists: boolean;
  files: Array<{
    path: string;
    kind: "context" | "memory" | "persona" | "skill" | "other";
  }>;
  skillCount: number;
  contextCount: number;
}

export interface MigrationResult {
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export interface MigrationHistoryEntry {
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export class OperatorService {
  private readonly packageMetadata: PackageMetadata;
  private readonly migrationsDir: string;
  private runtime?: RuntimeLike;

  constructor(
    private readonly config: EnvConfig,
    private readonly diagnostics: DiagnosticsService,
    private readonly repository: RepositoryService,
    private readonly autocoderPipeline?: AutocoderPipelineService,
    private readonly agentSdk?: AgentSdkService,
    private readonly nativeOwnership?: NativeOwnershipCache,
    private readonly ecosystemService?: EcosystemService,
  ) {
    this.packageMetadata = this.loadPackageMetadata();
    this.migrationsDir = join(this.config.dataDir, "migrations");
    mkdirSync(this.migrationsDir, { recursive: true });
  }

  attachRuntime(runtime: RuntimeLike): void {
    this.runtime = runtime;
  }

  async setupSummary(): Promise<SetupSummary> {
    const ecosystem = this.agentSdk
      ? await this.agentSdk.overview()
      : undefined;
    const ownership =
      this.nativeOwnership?.controlPlane() ??
      (this.runtime
        ? getNativeOwnershipControlPlane(
            this.runtime,
            undefined,
            this.config,
            this.diagnostics.currentGatewayConfig(),
          )
        : undefined);
    const transportControl = ownership?.transportControl;
    const pipeline = this.autocoderPipeline?.summary();
    const workspaceEcosystem = this.ecosystemService?.summary();
    const condensed = buildOperatorCondensedSummary({
      ownership,
      ecosystem,
      workspaceEcosystem,
      pipeline,
    });
    return {
      version: this.version(),
      directories: [
        {
          label: "workspace",
          path: this.config.workspaceDir,
          exists: existsSync(this.config.workspaceDir),
        },
        {
          label: "data",
          path: this.config.dataDir,
          exists: existsSync(this.config.dataDir),
        },
        {
          label: "skills",
          path: this.config.skillsDir,
          exists: existsSync(this.config.skillsDir),
        },
        {
          label: "gateway",
          path: this.config.gatewayDataDir,
          exists: existsSync(this.config.gatewayDataDir),
        },
      ],
      providers: [
        {
          id: "openai",
          ready: Boolean(this.config.openAiApiKey),
          detail: this.config.openAiApiKey
            ? `Configured for ${this.config.openAiModel}.`
            : "Missing OPENAI_API_KEY.",
        },
        {
          id: "anthropic",
          ready: Boolean(this.config.anthropicApiKey),
          detail: this.config.anthropicApiKey
            ? `Configured for ${this.config.anthropicLargeModel}.`
            : "Missing ANTHROPIC_API_KEY.",
        },
      ],
      transports: getTransportRequirementRecords(
        this.config,
        this.diagnostics.currentGatewayConfig(),
      ).map((requirement) =>
        describeTransportSummary(
          requirement.platform,
          requirement.label,
          transportControl?.transportInventory,
          requirement.configured,
          requirement.summary,
        ),
      ),
      transportControl,
      transportInventory: transportControl?.transportInventory,
      nativeServices: describeNativeServiceRegistry(
        createNativeServiceRegistry(),
      ),
      ownership: condensed.ownership,
      ecosystem: condensed.ecosystem,
      pluginManager: condensed.pluginManager,
      pipeline: condensed.pipeline,
      checklist: await this.diagnostics.setupChecklist(),
    };
  }

  async updatePreview(): Promise<UpdatePreview> {
    const ecosystem = this.agentSdk
      ? await this.agentSdk.overview()
      : undefined;
    const repositoryAvailable = this.repository.isRepository();
    const status = repositoryAvailable
      ? await this.repository.status()
      : "(workspace is not inside a git repository)";
    const recentCommits = repositoryAvailable
      ? await this.repository.recentCommits(8)
      : "(no git history available)";
    const ownership =
      this.nativeOwnership?.controlPlane() ??
      (this.runtime
        ? getNativeOwnershipControlPlane(
            this.runtime,
            undefined,
            this.config,
            this.diagnostics.currentGatewayConfig(),
          )
        : undefined);
    const transportControl = ownership?.transportControl;
    const pipeline = this.autocoderPipeline?.summary();
    const workspaceEcosystem = this.ecosystemService?.summary();
    const condensed = buildOperatorCondensedSummary({
      ownership,
      ecosystem,
      workspaceEcosystem,
      pipeline,
    });

    return {
      version: this.version(),
      repositoryAvailable,
      status,
      recentCommits,
      transportControl: transportControl?.totals,
      transportInventory: transportControl?.transportInventory,
      ownership: condensed.ownership,
      recommendedSteps: repositoryAvailable
        ? [
            "Review git status before updating runtime dependencies.",
            "Run bun install after dependency changes.",
            "Re-run bun run typecheck, bun test, and bun run build after updating.",
          ]
        : [
            "Initialize a git repository if you want update previews tied to commit history.",
            "Keep bun install, bun run typecheck, bun test, and bun run build as the standard update validation flow.",
          ],
      ecosystem: condensed.ecosystem,
      pluginManager: condensed.pluginManager,
      pipeline: condensed.pipeline,
    };
  }

  migrationSources(): MigrationSourceSummary[] {
    const openClawPath = join(homedir(), ".openclaw");
    return [
      {
        id: "openclaw",
        label: "OpenClaw home",
        path: openClawPath,
        exists: existsSync(openClawPath),
      },
      {
        id: "workspace",
        label: "Current workspace",
        path: this.config.workspaceDir,
        exists: existsSync(this.config.workspaceDir),
      },
    ];
  }

  inspectMigrationSource(sourcePath: string): MigrationInspection {
    const rootPath = resolve(sourcePath);
    if (!existsSync(rootPath)) {
      return {
        rootPath,
        exists: false,
        files: [],
        skillCount: 0,
        contextCount: 0,
      };
    }

    const files: MigrationInspection["files"] = [];
    const knownFiles = [
      ["AGENTS.md", "context"],
      ["SOUL.md", "persona"],
      ["MEMORY.md", "memory"],
      ["USER.md", "memory"],
    ] as const;

    for (const [name, kind] of knownFiles) {
      const pathname = join(rootPath, name);
      if (existsSync(pathname)) {
        files.push({ path: pathname, kind });
      }
    }

    const skillsPath = join(rootPath, "skills");
    if (existsSync(skillsPath)) {
      for (const entry of this.walkSkills(skillsPath)) {
        files.push({ path: entry, kind: "skill" });
      }
    }

    return {
      rootPath,
      exists: true,
      files,
      skillCount: files.filter((entry) => entry.kind === "skill").length,
      contextCount: files.filter(
        (entry) => entry.kind === "context" || entry.kind === "persona",
      ).length,
    };
  }

  applyMigration(
    sourcePath: string,
    options?: { overwrite?: boolean },
  ): MigrationResult {
    const overwrite = options?.overwrite ?? false;
    const inspection = this.inspectMigrationSource(sourcePath);
    if (!inspection.exists) {
      throw new Error(`Migration source not found: ${inspection.rootPath}`);
    }

    const importedFiles: string[] = [];
    const importedSkills: string[] = [];
    const skippedFiles: string[] = [];

    for (const entry of inspection.files) {
      if (entry.kind === "skill") {
        const skillRoot = this.findSkillRoot(entry.path);
        if (!skillRoot) {
          skippedFiles.push(entry.path);
          continue;
        }
        const slug = basename(skillRoot);
        const destination = join(this.config.skillsDir, "imports", slug);
        if (existsSync(destination) && !overwrite) {
          skippedFiles.push(destination);
          continue;
        }
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(skillRoot, destination, { recursive: true, force: overwrite });
        importedSkills.push(destination);
        continue;
      }

      const destination =
        entry.kind === "memory"
          ? join(this.migrationsDir, basename(entry.path))
          : join(this.config.workspaceDir, basename(entry.path));
      if (existsSync(destination) && !overwrite) {
        skippedFiles.push(destination);
        continue;
      }
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(entry.path, destination);
      importedFiles.push(destination);
    }

    const reportPath = join(this.migrationsDir, `migration-${Date.now()}.json`);
    const report = {
      createdAt: new Date().toISOString(),
      sourcePath: inspection.rootPath,
      destinationPath: this.config.workspaceDir,
      importedFiles,
      importedSkills,
      skippedFiles,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    return {
      sourcePath: inspection.rootPath,
      destinationPath: this.config.workspaceDir,
      importedFiles,
      importedSkills,
      skippedFiles,
      reportPath,
    };
  }

  migrationHistory(limit = 20): MigrationHistoryEntry[] {
    return readdirSync(this.migrationsDir)
      .filter(
        (entry) => entry.startsWith("migration-") && entry.endsWith(".json"),
      )
      .map((entry) => join(this.migrationsDir, entry))
      .map((pathname) => {
        const parsed = JSON.parse(readFileSync(pathname, "utf8")) as Omit<
          MigrationHistoryEntry,
          "reportPath"
        >;
        return {
          ...parsed,
          reportPath: pathname,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  version(): OperatorVersionSummary {
    const nativePlugins = getNativePluginCatalog(this.config);
    const nativePackages = getNativePackageAudit(this.config);
    return {
      name: this.packageMetadata.name,
      version: this.packageMetadata.version,
      description: this.packageMetadata.description,
      bun: Bun.version,
      dependencies: {
        "@elizaos/core":
          this.packageMetadata.dependencies?.["@elizaos/core"] ?? "unknown",
        "@elizaos/agent":
          this.packageMetadata.dependencies?.["@elizaos/agent"] ?? "unknown",
        elizaos: this.packageMetadata.dependencies?.elizaos ?? "unknown",
        "@elizaos/plugin-openai":
          this.packageMetadata.dependencies?.["@elizaos/plugin-openai"] ??
          "unknown",
        "@elizaos/plugin-anthropic":
          this.packageMetadata.dependencies?.["@elizaos/plugin-anthropic"] ??
          "unknown",
        "@elizaos/plugin-browser":
          this.packageMetadata.dependencies?.["@elizaos/plugin-browser"] ??
          "unknown",
        "@elizaos/plugin-tts":
          this.packageMetadata.dependencies?.["@elizaos/plugin-tts"] ??
          "unknown",
        "@elizaos/plugin-e2b":
          this.packageMetadata.dependencies?.["@elizaos/plugin-e2b"] ??
          "unknown",
        "@elizaos/plugin-forms":
          this.packageMetadata.dependencies?.["@elizaos/plugin-forms"] ??
          "unknown",
        "@elizaos/plugin-mcp":
          this.packageMetadata.dependencies?.["@elizaos/plugin-mcp"] ??
          "unknown",
        "@elizaos/plugin-action-bench":
          this.packageMetadata.dependencies?.["@elizaos/plugin-action-bench"] ??
          "unknown",
        "@elizaos/plugin-autocoder":
          this.packageMetadata.dependencies?.["@elizaos/plugin-autocoder"] ??
          "unknown",
      },
      nativePlugins: {
        total: nativePlugins.length,
        enabled: nativePlugins.filter((entry) => entry.enabled).length,
        official: nativePlugins.filter((entry) => entry.source === "official")
          .length,
        vendored: nativePlugins.filter((entry) => entry.source === "vendored")
          .length,
      },
      nativePackages: {
        runtimeLatest: nativePackages.runtime.latest,
        runtimeAlpha: nativePackages.runtime.alpha,
        aligned: nativePackages.summary.aligned,
        vendored: nativePackages.summary.vendored,
        alphaOnly: nativePackages.summary.alphaOnly,
        workspaceOnly: nativePackages.summary.workspaceOnly,
      },
    };
  }

  private walkSkills(rootPath: string): string[] {
    const collected: string[] = [];
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const pathname = join(rootPath, entry.name);
      if (entry.isDirectory()) {
        collected.push(...this.walkSkills(pathname));
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        collected.push(pathname);
      }
    }
    return collected;
  }

  private findSkillRoot(skillFile: string): string | null {
    const root = dirname(skillFile);
    return statSync(root).isDirectory() ? root : null;
  }

  private loadPackageMetadata(): PackageMetadata {
    const packagePath = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../../../package.json",
    );
    return JSON.parse(readFileSync(packagePath, "utf8")) as PackageMetadata;
  }
}
