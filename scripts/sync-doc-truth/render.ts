import type { NativeCapabilityTruthRecord } from "@doolittle/agent/runtime/native/capability-truth";
import type { PluginInventoryRow } from "./types";

function escapeCell(value: string): string {
  return value.replaceAll("\n", " ").replaceAll("|", "\\|");
}

export function renderPluginInventory(rows: PluginInventoryRow[]): string {
  const header = [
    "# Plugin Inventory",
    "",
    "This file is generated from the native runtime plugin catalog plus workspace package inspection.",
    "Do not edit it by hand; run `nub scripts/sync-doc-truth.ts --write`.",
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

  const table = [header.at(-2) ?? "", ...lines].map((line) =>
    line
      .slice(1, -1)
      .split(/(?<!\\)\|/u)
      .map((cell) => cell.trim()),
  );
  const widths = table[0].map((_, index) =>
    Math.max(3, ...table.map((row) => row[index].length)),
  );
  const aligned = table.map(
    (row) =>
      `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`,
  );
  aligned.splice(
    1,
    0,
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
  );
  return [...header.slice(0, -2), ...aligned, ""].join("\n");
}

export function renderCapabilityTruth(
  records: NativeCapabilityTruthRecord[],
): string {
  const lines = [
    "# Capability Truth",
    "",
    "This file is generated from capability truth records registered by the Doolittle runtime.",
    "Do not edit it by hand; run `nub scripts/sync-doc-truth.ts --write`.",
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

export function renderPluginReadme(
  row: PluginInventoryRow,
  truth: NativeCapabilityTruthRecord,
): string {
  return [
    `# ${row.packageName}`,
    "",
    "This workspace package is documented from the stabilized Doolittle runtime contract.",
    "Do not edit it by hand; run `nub scripts/sync-doc-truth.ts --write`.",
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
