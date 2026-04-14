import type { ScanFinding } from "./types";

export function redactFindings(text: string, findings: ScanFinding[]): string {
  const sorted = findings
    .filter((finding) => finding.offset !== undefined)
    .sort((a, b) => (b.offset ?? 0) - (a.offset ?? 0));

  let result = text;
  for (const finding of sorted) {
    if (finding.offset === undefined) {
      continue;
    }
    const end = Math.min(finding.offset + 120, result.length);
    const redacted = `[REDACTED:${finding.rule}]`;
    result = result.slice(0, finding.offset) + redacted + result.slice(end);
  }

  return result;
}
