import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContextDocument } from "@/types";
import { injectionScanner, type ScanResult } from "./prompt-injection-scanner";

const contextFileNames = ["AGENTS.md", "SOUL.md", "MISSION.md", "ROADMAP.md"];

export interface SafeContextDocument extends ContextDocument {
  /** True when the injection scanner flagged this document. */
  flagged: boolean;
  /** True when the document was blocked outright by the scanner. */
  blocked: boolean;
  /** The scanner result (undefined when scanning is disabled). */
  scanResult?: ScanResult;
  /** Sanitized content (injection markers redacted). */
  sanitizedContent: string;
}

export interface ContextLoadOptions {
  /**
   * When true (default), run the injection scanner on each file before
   * returning it. Blocked files are omitted from the result.
   */
  scanForInjection?: boolean;
  /**
   * When true, log scan findings to stderr. Default: false.
   */
  logFindings?: boolean;
}

export class ContextFilesService {
  constructor(private readonly workspaceDir: string) {}

  // ---------------------------------------------------------------------------
  // Core list (with injection scanning)
  // ---------------------------------------------------------------------------

  list(options: ContextLoadOptions = {}): SafeContextDocument[] {
    const { scanForInjection = true, logFindings = false } = options;

    const results: SafeContextDocument[] = [];

    for (const name of contextFileNames) {
      const path = join(this.workspaceDir, name);
      if (!existsSync(path)) continue;

      const rawContent = readFileSync(path, "utf8");

      if (!scanForInjection) {
        results.push({
          name,
          path,
          content: rawContent,
          sanitizedContent: rawContent,
          flagged: false,
          blocked: false,
        });
        continue;
      }

      const scanResult = injectionScanner.scan(rawContent, {
        source: name,
        sanitize: true,
      });

      if (logFindings && scanResult.findings.length > 0) {
        process.stderr.write(
          `${injectionScanner.formatReport(scanResult, name)}\n`,
        );
      }

      if (scanResult.shouldBlock) {
        // Return a placeholder rather than omitting entirely so callers can
        // see which files were blocked (useful for diagnostics).
        results.push({
          name,
          path,
          content: `[BLOCKED: ${name} was blocked by the prompt injection scanner. See logs for details.]`,
          sanitizedContent: `[BLOCKED: ${name}]`,
          flagged: true,
          blocked: true,
          scanResult,
        });
      } else {
        results.push({
          name,
          path,
          content: rawContent,
          sanitizedContent: scanResult.sanitized,
          flagged: scanResult.hasWarnings,
          blocked: false,
          scanResult,
        });
      }
    }

    return results;
  }

  /**
   * Legacy `list()` without safety metadata — returns only non-blocked docs.
   */
  listRaw(options: ContextLoadOptions = {}): ContextDocument[] {
    return this.list(options)
      .filter((doc) => !doc.blocked)
      .map((doc) => ({
        name: doc.name,
        path: doc.path,
        content: doc.sanitizedContent,
      }));
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  /**
   * Renders safe (non-blocked) context documents into a single string for
   * injection into the system prompt. Uses sanitized content.
   */
  render(options: ContextLoadOptions = {}): string {
    const docs = this.list(options).filter((d) => !d.blocked);
    if (!docs.length) {
      return "(no workspace context files found)";
    }

    return docs
      .map((doc) => {
        const header = doc.flagged
          ? `# ${doc.name} ⚠️ (injection warnings detected — content sanitized)`
          : `# ${doc.name}`;
        return `${header}\n${doc.sanitizedContent.trim()}`;
      })
      .join("\n\n");
  }

  /**
   * Returns a diagnostics summary of the context file scan results.
   */
  renderScanReport(options: ContextLoadOptions = {}): string {
    const docs = this.list({ ...options, logFindings: false });
    if (!docs.length) {
      return "No workspace context files found.";
    }

    const lines = ["Context File Security Scan:"];
    for (const doc of docs) {
      if (!doc.scanResult) {
        lines.push(`  ${doc.name}: scanning disabled`);
        continue;
      }
      const { findings, shouldBlock } = doc.scanResult;
      if (!findings.length) {
        lines.push(`  ${doc.name}: ✅ clean`);
      } else if (shouldBlock) {
        lines.push(`  ${doc.name}: 🚫 BLOCKED (${findings.length} finding(s))`);
      } else {
        lines.push(
          `  ${doc.name}: ⚠️  ${findings.length} warning(s) — content sanitized`,
        );
      }
    }
    return lines.join("\n");
  }
}
