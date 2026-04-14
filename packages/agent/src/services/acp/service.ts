import type {
  AcpEditorSummary,
  AcpPackageMetadata,
  AcpRegistryEntry,
  AcpSessionSummary,
  AcpToolDefinition,
  EnvConfig,
  SessionSummary,
  ToolDefinition,
} from "@/types";
import { AcpCatalog } from "./catalog";
import { AcpCommandRunner } from "./command-runner";
import { createAcpServicePaths } from "./paths";
import { AcpPersistence } from "./persistence";
import { createAcpServiceStatus } from "./status";
import { AcpTelemetry } from "./telemetry";
import type { AcpSessionSummarySource } from "./types";

export class AcpService {
  private readonly paths: ReturnType<typeof createAcpServicePaths>;
  private readonly catalog: AcpCatalog;
  private readonly persistence: AcpPersistence;
  private readonly runner: AcpCommandRunner;
  private readonly telemetry = new AcpTelemetry();

  constructor(
    private readonly config: EnvConfig,
    private readonly getTools: () => ToolDefinition[],
    private readonly getSessionSummary: () => AcpSessionSummarySource,
    private readonly listSessions: (limit: number) => SessionSummary[],
  ) {
    this.paths = createAcpServicePaths(this.config.dataDir);
    this.catalog = new AcpCatalog(
      this.config,
      this.paths,
      this.getTools,
      this.getSessionSummary,
      this.listSessions,
    );
    this.persistence = new AcpPersistence(this.paths);
    this.runner = new AcpCommandRunner(this.config);
  }

  status() {
    const telemetry = this.telemetry.snapshot();
    return createAcpServiceStatus({
      command: this.config.acpServerCommand?.trim(),
      timeoutMs: this.config.acpTimeoutMs,
      registryPath: this.paths.registryPath,
      exportDir: this.paths.exportDir,
      importDir: this.paths.importDir,
      toolCount: this.tools().length,
      lastProbeAt: telemetry.lastProbeAt,
      lastInvocationAt: telemetry.lastInvocationAt,
      lastPublishAt: telemetry.lastPublishAt,
      lastExportAt: telemetry.lastExportAt,
      lastImportAt: telemetry.lastImportAt,
      lastError: telemetry.lastError,
    });
  }

  packageMetadata(): AcpPackageMetadata {
    return this.catalog.packageMetadata();
  }

  editorSummary(): AcpEditorSummary {
    return this.catalog.editorSummary(this.telemetry.snapshot());
  }

  sessionSummary(limit = 5): AcpSessionSummary {
    return this.catalog.sessionSummary(limit);
  }

  registry(): AcpRegistryEntry {
    return this.catalog.registry();
  }

  publishRegistry(): { path: string; entry: AcpRegistryEntry } {
    const published = this.persistence.publishRegistry(this.registry());
    this.telemetry.recordPublish(published.publishedAt);
    return {
      path: published.path,
      entry: published.entry,
    };
  }

  tools(): AcpToolDefinition[] {
    return this.catalog.tools();
  }

  searchTools(query: string): AcpToolDefinition[] {
    return this.catalog.searchTools(query);
  }

  describeTool(name: string): string {
    return this.catalog.describeTool(name);
  }

  exportBundle(label = "latest"): {
    path: string;
    label: string;
    package: AcpPackageMetadata;
    registry: AcpRegistryEntry;
    toolCount: number;
  } {
    const exported = this.persistence.exportBundle({
      label,
      packageMetadata: this.packageMetadata(),
      status: this.status(),
      editorSummary: this.editorSummary(),
      registry: this.registry(),
      sessions: this.sessionSummary(),
      tools: this.tools(),
    });
    this.telemetry.recordExport(exported.exportedAt);
    return {
      path: exported.path,
      label: exported.label,
      package: exported.package,
      registry: exported.registry,
      toolCount: exported.toolCount,
    };
  }

  importBundle(input: string): {
    path: string;
    importedAt: string;
    label?: string;
    packageName?: string;
    toolCount?: number;
  } {
    const imported = this.persistence.importBundle(input);
    this.telemetry.recordImport(imported.importedAt);
    return {
      path: imported.path,
      importedAt: imported.importedAt,
      label: imported.label,
      packageName: imported.packageName,
      toolCount: imported.toolCount,
    };
  }

  async probe(): Promise<{ ok: boolean; detail: string }> {
    const result = await this.runner.probe();
    this.telemetry.recordProbe(result.ok, result.rawOutput);
    return {
      ok: result.ok,
      detail: result.detail,
    };
  }

  async invoke(input: string): Promise<{ ok: boolean; output: string }> {
    const result = await this.runner.invoke(input);
    this.telemetry.recordInvocation(result.ok, result.rawOutput);
    return {
      ok: result.ok,
      output: result.output,
    };
  }

  async invokeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; tool: string; output: string }> {
    const result = await this.runner.invokeTool(name, input);
    this.telemetry.recordInvocation(result.ok, result.rawOutput);
    return {
      ok: result.ok,
      tool: name,
      output: result.output,
    };
  }
}
