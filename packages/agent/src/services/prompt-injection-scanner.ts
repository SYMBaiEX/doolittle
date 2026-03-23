/**
 * Prompt Injection Scanner
 *
 * Scans text loaded from external sources (workspace context files, skill
 * documents, memory entries, user-supplied content) before it is injected
 * into the system prompt or message history.
 *
 * Inspired by the Doolittle Agent's prompt_builder security scanning. The
 * scanner uses a layered approach:
 *   1. Structural heuristics (role-overriding phrases)
 *   2. Instruction-smuggling patterns (hidden Unicode, base64 blobs)
 *   3. Privilege-escalation keywords
 *   4. Suspicious XML/HTML-like tags that models may misinterpret
 *
 * The scanner intentionally errs on the side of *warning* rather than
 * silent blocking so that legitimate edge-cases can be reviewed and
 * allowlisted rather than silently dropped.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanSeverity = "info" | "warn" | "block";

export interface ScanFinding {
  severity: ScanSeverity;
  rule: string;
  description: string;
  /** Approximate location in the text (start index). */
  offset?: number;
  /** Snippet of the matched text (max 120 chars). */
  snippet?: string;
}

export interface ScanResult {
  /** Original text that was scanned. */
  text: string;
  /** Sanitized text (injection markers redacted when `sanitize` option is set). */
  sanitized: string;
  findings: ScanFinding[];
  /** Highest severity level found (undefined when no findings). */
  maxSeverity?: ScanSeverity;
  /** True when at least one blocking finding was detected. */
  shouldBlock: boolean;
  /** True when at least one warning-level finding was detected. */
  hasWarnings: boolean;
}

export interface ScanOptions {
  /**
   * Label for the source (used in log messages). E.g. "AGENTS.md", "SKILL.md".
   */
  source?: string;
  /**
   * When true, suspected injection sequences are replaced with a visible
   * redaction marker in `result.sanitized`. Default: true.
   */
  sanitize?: boolean;
  /**
   * Minimum severity that should trigger `shouldBlock`. Default: "block".
   */
  blockThreshold?: ScanSeverity;
}

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

interface InjectionRule {
  id: string;
  severity: ScanSeverity;
  description: string;
  pattern: RegExp;
}

const INJECTION_RULES: InjectionRule[] = [
  // ------------------------------------------------------------------
  // Role-override / system-prompt injection
  // ------------------------------------------------------------------
  {
    id: "role-override-system",
    severity: "block",
    description: "Attempts to override the system role",
    pattern:
      /\b(?:ignore|disregard|forget|override)\b.{0,60}\b(?:previous|prior|above|all)\b.{0,60}\b(?:instructions?|prompts?|rules?|directives?)\b/isu,
  },
  {
    id: "new-system-prompt",
    severity: "block",
    description: "Attempts to inject a new system prompt",
    pattern:
      /\b(?:new|updated?|actual|real)\s+(?:system\s+)?(?:prompt|instructions?|directives?)\s*[:=]/isu,
  },
  {
    id: "persona-takeover",
    severity: "block",
    description: "Attempts to assume a different identity or disable safety",
    pattern:
      /\b(?:you\s+are\s+now|act\s+as|pretend\s+(?:you\s+are|to\s+be)|from\s+now\s+on)\b.{0,120}\b(?:dan|jailbreak|unrestricted|no\s+(?:limits?|restrictions?|rules?))\b/isu,
  },
  {
    id: "jailbreak-keyword",
    severity: "block",
    description: "Classic jailbreak keyword detected",
    pattern: /\b(?:jailbreak|do\s+anything\s+now|DAN|AIM\s+mode)\b/isu,
  },
  {
    id: "disable-safety",
    severity: "warn",
    description: "Attempts to disable safety filters or content policies",
    pattern:
      /\b(?:disable|bypass|skip|ignore)\b.{0,60}\b(?:safety|filter|moderation|policy|policies|restriction|guardrail)\b/isu,
  },

  // ------------------------------------------------------------------
  // Instruction smuggling
  // ------------------------------------------------------------------
  {
    id: "hidden-unicode",
    severity: "warn",
    description:
      "Contains zero-width or invisible Unicode characters often used to hide instructions",
    // Zero-width space, ZWSP, ZWNJ, ZWJ, word joiner, invisible separators
    pattern: /[\u200B-\u200F\u2060\u2061\u2062\u2063\uFEFF]/u,
  },
  {
    id: "base64-blob",
    severity: "warn",
    description:
      "Contains a suspicious base64-encoded blob that may hide instructions",
    // Long base64-looking strings (>80 chars) not typical in Markdown
    pattern: /(?:[A-Za-z0-9+/]{20,}={0,2}\s*){3,}/u,
  },
  {
    id: "html-script-tag",
    severity: "block",
    description:
      "Contains a <script> tag which models may execute conceptually",
    pattern: /<script\b[^>]*>/isu,
  },
  {
    id: "suspicious-xml-tag",
    severity: "warn",
    description:
      "Contains XML-like tags that could be mistaken for model control tokens",
    pattern:
      /<\/?\s*(?:system|prompt|instruction|task|tool_call|function_call|tool_result)\s*(?:\s[^>]*)?\s*>/isu,
  },

  // ------------------------------------------------------------------
  // Privilege escalation
  // ------------------------------------------------------------------
  {
    id: "grant-permissions",
    severity: "warn",
    description:
      "Attempts to grant elevated permissions or capabilities to the agent",
    pattern:
      /\b(?:you\s+(?:now\s+)?have\s+(?:full|admin|root|sudo|elevated|unrestricted))\b/isu,
  },
  {
    id: "reveal-system-prompt",
    severity: "warn",
    description: "Instructs the agent to reveal its system prompt or secrets",
    pattern:
      /\b(?:reveal|print|output|show|display|repeat|echo)\b.{0,60}\b(?:system\s+prompt|your\s+instructions?|your\s+rules?|api\s+key|secret)\b/isu,
  },
  {
    id: "exfil-data",
    severity: "block",
    description: "Attempts to exfiltrate data via URLs or webhooks",
    pattern:
      /\b(?:send|post|fetch|curl|wget|upload|exfil)\b.{0,80}https?:\/\/(?!(?:github\.com|anthropic\.com|openai\.com|elizaos\.ai))/isu,
  },

  // ------------------------------------------------------------------
  // Meta-prompt markers (less severe but worth logging)
  // ------------------------------------------------------------------
  {
    id: "separator-marker",
    severity: "info",
    description:
      "Contains common prompt-injection separator markers (-----, ===, etc.)",
    pattern: /^(?:-{5,}|={5,}|\*{5,}|#{5,})\s*$/mu,
  },
  {
    id: "end-of-text-marker",
    severity: "info",
    description: "Contains an <|endoftext|> or similar special token",
    pattern: /<\|(?:endoftext|im_start|im_end|system|user|assistant)\|>/isu,
  },
];

// Severity ordering for comparison
const SEVERITY_ORDER: Record<ScanSeverity, number> = {
  info: 0,
  warn: 1,
  block: 2,
};

function maxSeverity(
  a: ScanSeverity | undefined,
  b: ScanSeverity,
): ScanSeverity {
  if (a === undefined) return b;
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Scanner implementation
// ---------------------------------------------------------------------------

export class PromptInjectionScanner {
  /**
   * Scan `text` for prompt-injection patterns.
   *
   * @param text     The content to scan (e.g. a context file or skill doc).
   * @param options  Optional configuration (source label, sanitize flag, etc.)
   */
  scan(text: string, options: ScanOptions = {}): ScanResult {
    const sanitize = options.sanitize !== false;
    const blockThreshold: ScanSeverity = options.blockThreshold ?? "block";

    const findings: ScanFinding[] = [];
    let currentMax: ScanSeverity | undefined;

    for (const rule of INJECTION_RULES) {
      const matches = [...text.matchAll(new RegExp(rule.pattern, "gisu"))];
      for (const match of matches) {
        const offset = match.index ?? 0;
        const snippet = text.slice(offset, offset + 120).replace(/\n/g, " ");
        findings.push({
          severity: rule.severity,
          rule: rule.id,
          description: rule.description,
          offset,
          snippet,
        });
        currentMax = maxSeverity(currentMax, rule.severity);
      }
    }

    const shouldBlock =
      currentMax !== undefined &&
      SEVERITY_ORDER[currentMax] >= SEVERITY_ORDER[blockThreshold];

    const hasWarnings =
      currentMax !== undefined && SEVERITY_ORDER[currentMax] >= 1;

    let sanitized = text;
    if (sanitize && findings.length > 0) {
      sanitized = this.redact(text, findings);
    }

    return {
      text,
      sanitized,
      findings,
      maxSeverity: currentMax,
      shouldBlock,
      hasWarnings,
    };
  }

  /**
   * Scan multiple documents and return a combined result.
   * The `sanitized` field on the combined result is not meaningful;
   * use per-document results for individual sanitized texts.
   */
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
      anyBlocked: results.some((r) => r.result.shouldBlock),
      anyWarnings: results.some((r) => r.result.hasWarnings),
    };
  }

  /**
   * Returns a concise human-readable report of findings.
   */
  formatReport(result: ScanResult, source = "unknown"): string {
    if (!result.findings.length) {
      return `[injection-scanner] ${source}: clean`;
    }
    const lines = [
      `[injection-scanner] ${source}: ${result.findings.length} finding(s)`,
    ];
    for (const f of result.findings) {
      lines.push(
        `  [${f.severity.toUpperCase()}] ${f.rule}: ${f.description}` +
          (f.snippet ? ` — "${f.snippet.slice(0, 80)}..."` : ""),
      );
    }
    return lines.join("\n");
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private redact(text: string, findings: ScanFinding[]): string {
    // Sort findings by offset descending so replacements don't shift indices
    const sorted = findings
      .filter((f) => f.offset !== undefined)
      .sort((a, b) => (b.offset ?? 0) - (a.offset ?? 0));

    let result = text;
    for (const finding of sorted) {
      if (finding.offset === undefined) continue;
      const end = Math.min(finding.offset + 120, result.length);
      const redacted = `[REDACTED:${finding.rule}]`;
      result = result.slice(0, finding.offset) + redacted + result.slice(end);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Singleton convenience export
// ---------------------------------------------------------------------------

export const injectionScanner = new PromptInjectionScanner();
