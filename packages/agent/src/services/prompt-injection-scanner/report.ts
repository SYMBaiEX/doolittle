import type { ScanResult } from "./types";

export function formatScanReport(
  result: ScanResult,
  source = "unknown",
): string {
  if (!result.findings.length) {
    return `[injection-scanner] ${source}: clean`;
  }

  const lines = [
    `[injection-scanner] ${source}: ${result.findings.length} finding(s)`,
  ];
  for (const finding of result.findings) {
    lines.push(
      `  [${finding.severity.toUpperCase()}] ${finding.rule}: ${finding.description}` +
        (finding.snippet ? ` — "${finding.snippet.slice(0, 80)}..."` : ""),
    );
  }
  return lines.join("\n");
}
