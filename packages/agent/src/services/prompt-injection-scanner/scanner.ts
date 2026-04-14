/**
 * Prompt Injection Scanner
 *
 * Scans text loaded from external sources before it is injected into the
 * system prompt or message history.
 */

import { redactFindings } from "./redact";
import { formatScanReport } from "./report";
import { INJECTION_RULES } from "./rules";
import { maxSeverity, meetsSeverityThreshold } from "./severity";
import type {
  ScanFinding,
  ScanOptions,
  ScanResult,
  ScanSeverity,
} from "./types";

function createGlobalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function collectFindings(text: string): {
  findings: ScanFinding[];
  maxSeverity?: ScanSeverity;
} {
  const findings: ScanFinding[] = [];
  let currentMax: ScanSeverity | undefined;

  for (const rule of INJECTION_RULES) {
    const matches = [...text.matchAll(createGlobalPattern(rule.pattern))];
    for (const match of matches) {
      const offset = match.index ?? 0;
      findings.push({
        severity: rule.severity,
        rule: rule.id,
        description: rule.description,
        offset,
        snippet: text.slice(offset, offset + 120).replace(/\n/g, " "),
      });
      currentMax = maxSeverity(currentMax, rule.severity);
    }
  }

  return { findings, maxSeverity: currentMax };
}

export class PromptInjectionScanner {
  scan(text: string, options: ScanOptions = {}): ScanResult {
    const sanitize = options.sanitize !== false;
    const blockThreshold = options.blockThreshold ?? "block";
    const { findings, maxSeverity: currentMax } = collectFindings(text);

    return {
      text,
      sanitized:
        sanitize && findings.length > 0 ? redactFindings(text, findings) : text,
      findings,
      maxSeverity: currentMax,
      shouldBlock: meetsSeverityThreshold(currentMax, blockThreshold),
      hasWarnings: meetsSeverityThreshold(currentMax, "warn"),
    };
  }

  scanAll(
    docs: Array<{ name: string; content: string }>,
    options: ScanOptions = {},
  ): {
    results: Array<{ name: string; result: ScanResult }>;
    anyBlocked: boolean;
    anyWarnings: boolean;
  } {
    const results = docs.map(({ name, content }) => ({
      name,
      result: this.scan(content, { ...options, source: name }),
    }));

    return {
      results,
      anyBlocked: results.some((entry) => entry.result.shouldBlock),
      anyWarnings: results.some((entry) => entry.result.hasWarnings),
    };
  }

  formatReport(result: ScanResult, source = "unknown"): string {
    return formatScanReport(result, source);
  }
}

export const injectionScanner = new PromptInjectionScanner();
