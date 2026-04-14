import { readFileSync } from "node:fs";
import {
  buildAcpEditorSummary,
  buildAcpPackageMetadata,
  buildAcpRegistryEntry,
  guessAcpToolKind,
} from "@doolittle/acp";
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
import type { AcpTelemetrySnapshot } from "./telemetry";
import type { AcpServicePaths, AcpSessionSummarySource } from "./types";

export class AcpCatalog {
  constructor(
    private readonly config: EnvConfig,
    private readonly paths: AcpServicePaths,
    private readonly getTools: () => ToolDefinition[],
    private readonly getSessionSummary: () => AcpSessionSummarySource,
    private readonly listSessions: (limit: number) => SessionSummary[],
  ) {}

  packageMetadata(): AcpPackageMetadata {
    const packageJson = this.readRootPackageJson();
    const workspaces = Array.isArray(packageJson.workspaces)
      ? packageJson.workspaces.length
      : 0;
    const pluginPackageCount = Array.from(
      new Set(this.getTools().map((tool) => tool.category)),
    ).length;
    return buildAcpPackageMetadata({
      ...packageJson,
      workspaceCount: workspaces,
      pluginPackageCount,
      rootPath: this.paths.rootPackagePath,
    });
  }

  editorSummary(timestamps: AcpTelemetrySnapshot): AcpEditorSummary {
    return buildAcpEditorSummary({
      package: this.packageMetadata(),
      registryPath: this.paths.registryPath,
      exportDir: this.paths.exportDir,
      importDir: this.paths.importDir,
      commandConfigured: Boolean(this.config.acpServerCommand),
      command: this.config.acpServerCommand,
      lastPublishAt: timestamps.lastPublishAt,
      lastExportAt: timestamps.lastExportAt,
      lastImportAt: timestamps.lastImportAt,
    });
  }

  sessionSummary(limit = 5): AcpSessionSummary {
    const summary = this.getSessionSummary();
    const sessions = this.listSessions(limit);
    const titled = sessions.filter((session) => Boolean(session.title?.trim()));
    return {
      totalSessions: summary.totalSessions,
      recentSessionIds: summary.recentSessionIds.slice(0, limit),
      titledSessions: titled.length,
      recentTitles: titled
        .map((session) => session.title?.trim())
        .filter((title): title is string => Boolean(title))
        .slice(0, limit),
    };
  }

  registry(): AcpRegistryEntry {
    const command = this.config.acpServerCommand?.trim();
    return buildAcpRegistryEntry({
      agentName: this.config.agentName,
      description:
        "Doolittle on ElizaOS with persistent memory, gateway transports, execution backends, and research tooling.",
      package: this.packageMetadata(),
      command,
      toolCount: this.tools().length,
    });
  }

  tools(): AcpToolDefinition[] {
    return this.getTools().map((tool) => ({
      name: tool.id,
      description: tool.description,
      kind: guessAcpToolKind(tool),
      source: tool.transport === "native" ? "mcp" : "doolittle",
    }));
  }

  searchTools(query: string): AcpToolDefinition[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.tools();
    }
    return this.tools().filter((tool) =>
      [tool.name, tool.description, tool.kind, tool.source]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }

  describeTool(name: string): string {
    const tool = this.tools().find((entry) => entry.name === name);
    if (!tool) {
      return `ACP tool not found: ${name}`;
    }
    return [
      `ACP TOOL: ${tool.name}`,
      `Kind: ${tool.kind}`,
      `Source: ${tool.source}`,
      `Description: ${tool.description}`,
    ].join("\n");
  }

  private readRootPackageJson(): Record<string, unknown> {
    try {
      return JSON.parse(
        readFileSync(this.paths.rootPackagePath, "utf8"),
      ) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
