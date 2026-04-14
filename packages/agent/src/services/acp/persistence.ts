import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAcpBundlePayload } from "@doolittle/acp";
import type {
  AcpEditorSummary,
  AcpPackageMetadata,
  AcpRegistryEntry,
  AcpSessionSummary,
  AcpToolDefinition,
} from "@/types";
import type { AcpServiceStatus } from "./status";
import type { AcpImportBundlePayload, AcpServicePaths } from "./types";

export class AcpPersistence {
  constructor(private readonly paths: AcpServicePaths) {}

  publishRegistry(entry: AcpRegistryEntry): {
    path: string;
    entry: AcpRegistryEntry;
    publishedAt: string;
  } {
    writeFileSync(
      this.paths.registryPath,
      JSON.stringify(entry, null, 2),
      "utf8",
    );
    return {
      path: this.paths.registryPath,
      entry,
      publishedAt: new Date().toISOString(),
    };
  }

  exportBundle(input: {
    label?: string;
    packageMetadata: AcpPackageMetadata;
    status: AcpServiceStatus;
    editorSummary: AcpEditorSummary;
    registry: AcpRegistryEntry;
    sessions: AcpSessionSummary;
    tools: AcpToolDefinition[];
  }): {
    path: string;
    label: string;
    package: AcpPackageMetadata;
    registry: AcpRegistryEntry;
    toolCount: number;
    exportedAt: string;
  } {
    const safeLabel = sanitizeBundleLabel(input.label);
    const fileName = `acp-export-${safeLabel}-${Date.now()}.json`;
    const path = join(this.paths.exportDir, fileName);
    const exportedAt = new Date().toISOString();
    const payload = buildAcpBundlePayload({
      exportedAt,
      label: safeLabel,
      package: input.packageMetadata,
      status: input.status,
      editor: input.editorSummary,
      registry: input.registry,
      sessions: input.sessions,
      tools: input.tools,
    });
    writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
    return {
      path,
      label: safeLabel,
      package: payload.package,
      registry: payload.registry,
      toolCount: payload.tools.length,
      exportedAt,
    };
  }

  importBundle(input: string): {
    path: string;
    importedAt: string;
    label?: string;
    packageName?: string;
    toolCount?: number;
  } {
    const parsed = parseImportBundlePayload(input);
    const importedAt = new Date().toISOString();
    const fileName = `acp-import-${importedAt.replaceAll(":", "-")}.json`;
    const path = join(this.paths.importDir, fileName);
    writeFileSync(path, JSON.stringify(parsed, null, 2), "utf8");
    return {
      path,
      importedAt,
      label: parsed.label,
      packageName: parsed.package?.name,
      toolCount: Array.isArray(parsed.tools) ? parsed.tools.length : undefined,
    };
  }
}

function sanitizeBundleLabel(label?: string): string {
  return label?.trim().replace(/[^a-z0-9._-]+/giu, "-") || "latest";
}

function parseImportBundlePayload(input: string): AcpImportBundlePayload {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("ACP import requires a file path or JSON payload.");
  }

  const raw = existsSync(trimmed) ? readFileSync(trimmed, "utf8") : trimmed;
  return JSON.parse(raw) as AcpImportBundlePayload;
}
