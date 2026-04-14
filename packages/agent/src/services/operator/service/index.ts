import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { AutocoderPipelineService } from "../../autocoder-pipeline/service";
import type { DiagnosticsService } from "../../diagnostics/service";
import type { EcosystemService } from "../../ecosystem-service";
import type { RepositoryService } from "../../repository-service";
import type {
  MigrationHistoryEntry,
  MigrationInspection,
  MigrationResult,
  MigrationSourceSummary,
} from "../migrations";
import type { OperatorVersionSummary } from "../version";
import {
  createOperatorMigrationOperations,
  type OperatorMigrationOperations,
} from "./migrations";
import {
  attachOperatorRuntime,
  createOperatorRuntimeAttachment,
  type OperatorRuntimeAttachment,
} from "./runtime";
import {
  buildOperatorServiceSetupSummary,
  buildOperatorServiceUpdatePreview,
} from "./summary";
import type {
  OperatorServiceSummaryBindings,
  SetupSummary,
  UpdatePreview,
} from "./types";
import {
  createOperatorVersionAccess,
  type OperatorVersionAccess,
} from "./version";

export type {
  MigrationHistoryEntry,
  MigrationInspection,
  MigrationResult,
  MigrationSourceSummary,
} from "../migrations";
export type { OperatorVersionSummary } from "../version";
export type { SetupSummary, UpdatePreview } from "./types";

export class OperatorService {
  private readonly migrations: OperatorMigrationOperations;
  private readonly runtimeAttachment: OperatorRuntimeAttachment;
  private readonly versionAccess: OperatorVersionAccess;

  constructor(
    private readonly config: EnvConfig,
    private readonly diagnostics: DiagnosticsService,
    private readonly repository: RepositoryService,
    private readonly autocoderPipeline?: AutocoderPipelineService,
    private readonly agentSdk?: AgentSdkService,
    private readonly nativeOwnership?: NativeOwnershipCache,
    private readonly ecosystemService?: EcosystemService,
  ) {
    this.migrations = createOperatorMigrationOperations(this.config);
    this.runtimeAttachment = createOperatorRuntimeAttachment();
    this.versionAccess = createOperatorVersionAccess();
  }

  attachRuntime(runtime: RuntimeLike): void {
    attachOperatorRuntime(this.runtimeAttachment, runtime);
  }

  async setupSummary(): Promise<SetupSummary> {
    return buildOperatorServiceSetupSummary(this.summaryBindings());
  }

  async updatePreview(): Promise<UpdatePreview> {
    return buildOperatorServiceUpdatePreview(this.summaryBindings());
  }

  migrationSources(): MigrationSourceSummary[] {
    return this.migrations.listSources();
  }

  inspectMigrationSource(sourcePath: string): MigrationInspection {
    return this.migrations.inspectSource(sourcePath);
  }

  applyMigration(
    sourcePath: string,
    options?: { overwrite?: boolean },
  ): MigrationResult {
    return this.migrations.apply(sourcePath, options);
  }

  migrationHistory(limit = 20): MigrationHistoryEntry[] {
    return this.migrations.history(limit);
  }

  version(): OperatorVersionSummary {
    return this.versionAccess.read(this.config);
  }

  private summaryBindings(): OperatorServiceSummaryBindings {
    return {
      config: this.config,
      diagnostics: this.diagnostics,
      repository: this.repository,
      versionAccess: this.versionAccess,
      runtimeAttachment: this.runtimeAttachment,
      autocoderPipeline: this.autocoderPipeline,
      agentSdk: this.agentSdk,
      nativeOwnership: this.nativeOwnership,
      ecosystemService: this.ecosystemService,
    };
  }
}
