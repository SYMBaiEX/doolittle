#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { loadConfig } from "../packages/agent/src/config/env";
import {
  listNativeCapabilityTruth,
  type NativeCapabilityTruthRecord,
} from "../packages/agent/src/runtime/native/capability-truth";
import { getNativePluginCatalog } from "../packages/agent/src/runtime/native/plugin-catalog/index";

const ROOT = process.cwd();
const mode = process.argv.includes("--write") ? "write" : "check";

interface PluginInventoryRow {
  id: string;
  packageName: string;
  category: string;
  kind: string;
  maturity: string;
  persistence: string;
  source: string;
  workspacePath: string;
  owner: string;
  publishIntent: string;
  tests: string;
  notes: string;
}

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

function resolveWorkspacePath(packageName: string): string {
  if (packageName === "doolittle-runtime") {
    return "packages/plugins/doolittle-plugin";
  }

  if (!packageName.startsWith("@elizaos/plugin-")) {
    return "(external)";
  }

  const packageDir = packageName.replace("@elizaos/", "");
  const workspaceDir = join(ROOT, "packages", "plugins", packageDir);
  return existsSync(workspaceDir) ? relative(ROOT, workspaceDir) : "(external)";
}

function detectTestStatus(workspacePath: string): string {
  if (workspacePath === "(external)" || workspacePath.endsWith(".ts")) {
    return workspacePath === "(external)" ? "external" : "covered in agent";
  }

  const absolute = join(ROOT, workspacePath);
  const hasTest = walk(absolute).some((filePath) =>
    /\.test\.(ts|tsx|mts|cts)$/u.test(filePath),
  );
  return hasTest ? "covered" : "unverified";
}

function describeOwner(source: string, workspacePath: string): string {
  if (workspacePath === "(external)") {
    return source === "official" ? "upstream" : "third-party";
  }
  return source === "official" ? "doolittle-runtime" : "doolittle-runtime";
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

function escapeCell(value: string): string {
  return value.replaceAll("\n", " ").replaceAll("|", "\\|");
}

function buildInventoryRows(): PluginInventoryRow[] {
  const catalog = getNativePluginCatalog(loadConfig());
  return catalog.map((entry) => {
    const workspacePath = resolveWorkspacePath(entry.packageName);
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
      tests: detectTestStatus(workspacePath),
      notes: entry.notes,
    };
  });
}

function renderPluginInventory(rows: PluginInventoryRow[]): string {
  const header = [
    "# Plugin Inventory",
    "",
    "This file is generated from the native runtime plugin catalog plus workspace package inspection.",
    "Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.",
    "",
    "Canonical runtime source: `packages/agent/src/runtime/native/plugin-catalog/index.ts`.",
    "",
    "| Runtime ID | Package | Category | Kind | Maturity | Persistence | Source | Workspace Path | Owner | Publish Intent | Tests | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  const lines = rows.map(
    (row) =>
      `| ${escapeCell(row.id)} | ${escapeCell(row.packageName)} | ${escapeCell(row.category)} | ${escapeCell(row.kind)} | ${escapeCell(row.maturity)} | ${escapeCell(row.persistence)} | ${escapeCell(row.source)} | ${escapeCell(row.workspacePath)} | ${escapeCell(row.owner)} | ${escapeCell(row.publishIntent)} | ${escapeCell(row.tests)} | ${escapeCell(row.notes)} |`,
  );

  return [...header, ...lines, ""].join("\n");
}

function renderCapabilityTruth(records: NativeCapabilityTruthRecord[]): string {
  const lines = [
    "# Capability Truth",
    "",
    "This file is generated from the code-backed capability truth records used during the stabilization pass.",
    "Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.",
    "",
  ];

  for (const record of records) {
    lines.push(`## ${record.packageName}`);
    lines.push("");
    lines.push(`- Runtime ID: \`${record.id}\``);
    lines.push(`- Headline: ${record.headline}`);
    lines.push(`- Summary: ${record.summary}`);
    lines.push(
      `- Runtime surfaces: ${record.runtimeSurfaces.map((value) => `\`${value}\``).join(", ")}`,
    );
    lines.push(
      `- Required status fields: ${record.requiredStatusFields.map((value) => `\`${value}\``).join(", ")}`,
    );
    lines.push("");
    lines.push("### Real Behavior");
    lines.push("");
    for (const entry of record.realBehavior) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
    lines.push("### Degraded Behavior");
    lines.push("");
    for (const entry of record.degradedBehavior) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
    lines.push("### Caveats");
    lines.push("");
    for (const entry of record.caveats) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderPluginReadme(
  row: PluginInventoryRow,
  truth: NativeCapabilityTruthRecord,
): string {
  return [
    `# ${row.packageName}`,
    "",
    "This workspace package is documented from the stabilized Doolittle runtime contract.",
    "Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.",
    "",
    "## Status",
    "",
    `- Runtime ID: \`${row.id}\``,
    `- Category: \`${row.category}\``,
    `- Kind: \`${row.kind}\``,
    `- Maturity: \`${row.maturity}\``,
    `- Persistence: \`${row.persistence}\``,
    `- Publish intent: \`${row.publishIntent}\``,
    `- Tests: \`${row.tests}\``,
    "",
    "## Runtime Contract",
    "",
    `- ${truth.headline}`,
    `- ${truth.summary}`,
    `- Runtime surfaces: ${truth.runtimeSurfaces.map((value) => `\`${value}\``).join(", ")}`,
    `- Required status fields: ${truth.requiredStatusFields.map((value) => `\`${value}\``).join(", ")}`,
    "",
    "## Real Behavior",
    "",
    ...truth.realBehavior.map((entry) => `- ${entry}`),
    "",
    "## Degraded Behavior",
    "",
    ...truth.degradedBehavior.map((entry) => `- ${entry}`),
    "",
    "## Caveats",
    "",
    ...truth.caveats.map((entry) => `- ${entry}`),
    "",
    "## Cross References",
    "",
    "- Canonical plugin inventory: `docs/plugin-inventory.md`",
    "- Canonical capability truth: `docs/capability-truth.md`",
    "",
  ].join("\n");
}

function syncFile(path: string, expected: string): string | null {
  const absolute = join(ROOT, path);
  const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  if (current === expected) {
    return null;
  }

  if (mode === "write") {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, expected, "utf8");
    return null;
  }

  return path;
}

function main(): void {
  const inventoryRows = buildInventoryRows();
  const capabilityTruth = listNativeCapabilityTruth();
  const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
  const failures = [
    syncFile("docs/plugin-inventory.md", renderPluginInventory(inventoryRows)),
    syncFile(
      "docs/capability-truth.md",
      renderCapabilityTruth(capabilityTruth),
    ),
  ].filter(Boolean) as string[];

  const readmeTargets = [
    {
      path: "packages/plugins/plugin-browser/README.md",
      id: "browser.browser",
    },
    {
      path: "packages/plugins/plugin-tts/README.md",
      id: "media.tts",
    },
    {
      path: "packages/plugins/plugin-autocoder/README.md",
      id: "research.autocoder",
    },
  ];

  for (const target of readmeTargets) {
    const row = inventoryById.get(target.id);
    const truth = capabilityTruth.find((entry) => entry.id === target.id);
    if (!row || !truth) {
      failures.push(target.path);
      continue;
    }
    const failure = syncFile(target.path, renderPluginReadme(row, truth));
    if (failure) {
      failures.push(failure);
    }
  }

  if (failures.length > 0) {
    console.error(
      mode === "write"
        ? "Doc truth sync wrote files but some targets are still unresolved."
        : "Doc truth check failed. Run `bun run scripts/sync-doc-truth.ts --write`.",
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    mode === "write" ? "Doc truth files updated." : "Doc truth check passed.",
  );
}

main();
