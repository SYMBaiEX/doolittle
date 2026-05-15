import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import { loadConfig } from "../../packages/agent/src/config/env";
import type { PluginInventoryRow } from "./types";

const CONSOLIDATED_DOOLITTLE_PLUGIN_PACKAGES = new Set([
  "@doolittle/plugin-action-bench",
  "@doolittle/plugin-agent-orchestrator",
  "@doolittle/plugin-autocoder",
  "@doolittle/plugin-coding-agent",
  "@doolittle/plugin-forms",
  "@doolittle/plugin-local-sandbox",
  "@doolittle/plugin-planning",
]);

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "dist" || entry === "node_modules") {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function resolveWorkspacePath(root: string, packageName: string): string {
  if (
    packageName === "doolittle-runtime" ||
    CONSOLIDATED_DOOLITTLE_PLUGIN_PACKAGES.has(packageName)
  ) {
    return "packages/plugins/doolittle-plugin";
  }

  if (!packageName.startsWith("@elizaos/plugin-")) {
    return "(external)";
  }

  const packageDir = packageName.replace("@elizaos/", "");
  const workspaceDir = join(root, "packages", "plugins", packageDir);
  return existsSync(workspaceDir) ? relative(root, workspaceDir) : "(external)";
}

function detectTestStatus(root: string, workspacePath: string): string {
  if (workspacePath === "(external)" || workspacePath.endsWith(".ts")) {
    return workspacePath === "(external)" ? "external" : "covered in agent";
  }

  const absolute = join(root, workspacePath);
  const hasTest = walk(absolute).some((filePath) =>
    /\.test\.(ts|tsx|mts|cts)$/u.test(filePath),
  );
  return hasTest ? "covered" : "unverified";
}

function describeOwner(source: string, workspacePath: string): string {
  if (workspacePath === "(external)") {
    return source === "official" ? "upstream" : "third-party";
  }
  return "doolittle-runtime";
}

function describePublishIntent(
  id: string,
  kind: string,
  workspacePath: string,
): string {
  if (id === "product.doolittle-runtime") {
    return "internal-product-layer";
  }
  if (workspacePath === "(external)") {
    return "upstream-dependency";
  }
  if (kind === "provider") {
    return "public-provider-bridge";
  }
  if (kind === "vendored") {
    return "vendored-workspace-package";
  }
  return "internal-adapter";
}

export function buildInventoryRows(root: string): PluginInventoryRow[] {
  const catalog = getNativePluginCatalog(loadConfig());
  return catalog.map((entry) => {
    const workspacePath = resolveWorkspacePath(root, entry.packageName);
    return {
      id: entry.id,
      packageName: entry.packageName,
      category: entry.category,
      kind: entry.kind,
      maturity: entry.maturity,
      persistence: entry.persistence,
      source: entry.source,
      workspacePath,
      owner: describeOwner(entry.source, workspacePath),
      publishIntent: describePublishIntent(entry.id, entry.kind, workspacePath),
      tests: detectTestStatus(root, workspacePath),
      notes: entry.notes,
    };
  });
}
