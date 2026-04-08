import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type {
  getNativeTransportControlPlane,
  RuntimeLike,
} from "@/runtime/native/service-bridge/index";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "../agent-sdk-service";
import type { AutocoderPipelineService } from "../autocoder-pipeline/service";
import type { DiagnosticsService } from "../diagnostics/service";
import type { EcosystemService } from "../ecosystem-service";
import type { RepositoryService } from "../repository-service";
import {
  applyMigration,
  getMigrationHistory,
  getMigrationSources,
  inspectMigrationSource,
  type MigrationHistoryEntry,
  type MigrationInspection,
  type MigrationResult,
  type MigrationSourceSummary,
} from "./migrations";
import {
  buildOperatorSetupSummary,
  buildOperatorUpdatePreview,
} from "./runtime-summary";
import {
  buildOperatorVersionSummary,
  loadOperatorPackageMetadata,
  type OperatorVersionSummary,
} from "./version";

export type {
  MigrationHistoryEntry,
  MigrationInspection,
  MigrationResult,
  MigrationSourceSummary,
} from "./migrations";
export type { OperatorVersionSummary } from "./version";

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

export class OperatorService {
  private readonly packageMetadata = loadOperatorPackageMetadata();
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
    this.migrationsDir = join(this.config.dataDir, "migrations");
    mkdirSync(this.migrationsDir, { recursive: true });
  }

  attachRuntime(runtime: RuntimeLike): void {
    this.runtime = runtime;
  }

  async setupSummary(): Promise<SetupSummary> {
    return buildOperatorSetupSummary({
      config: this.config,
      diagnostics: this.diagnostics,
      repository: this.repository,
      version: () => this.version(),
      autocoderPipeline: this.autocoderPipeline,
      agentSdk: this.agentSdk,
      nativeOwnership: this.nativeOwnership,
      ecosystemService: this.ecosystemService,
      runtime: this.runtime,
    });
  }

  async updatePreview(): Promise<UpdatePreview> {
    return buildOperatorUpdatePreview({
      config: this.config,
      diagnostics: this.diagnostics,
      repository: this.repository,
      version: () => this.version(),
      autocoderPipeline: this.autocoderPipeline,
      agentSdk: this.agentSdk,
      nativeOwnership: this.nativeOwnership,
      ecosystemService: this.ecosystemService,
      runtime: this.runtime,
    });
  }

  migrationSources(): MigrationSourceSummary[] {
    return getMigrationSources(this.config);
  }

  inspectMigrationSource(sourcePath: string): MigrationInspection {
    return inspectMigrationSource(sourcePath);
  }

  applyMigration(
    sourcePath: string,
    options?: { overwrite?: boolean },
  ): MigrationResult {
    return applyMigration({
      sourcePath,
      config: this.config,
      migrationsDir: this.migrationsDir,
      overwrite: options?.overwrite,
    });
  }

  migrationHistory(limit = 20): MigrationHistoryEntry[] {
    return getMigrationHistory(this.migrationsDir, limit);
  }

  version(): OperatorVersionSummary {
    return buildOperatorVersionSummary(this.config, this.packageMetadata);
  }
}
