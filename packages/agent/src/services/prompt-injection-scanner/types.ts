export type ScanSeverity = "info" | "warn" | "block";

export interface ScanFinding {
  severity: ScanSeverity;
  rule: string;
  description: string;
  offset?: number;
  snippet?: string;
}

export interface ScanResult {
  text: string;
  sanitized: string;
  findings: ScanFinding[];
  maxSeverity?: ScanSeverity;
  shouldBlock: boolean;
  hasWarnings: boolean;
}

export interface ScanOptions {
  source?: string;
  sanitize?: boolean;
  blockThreshold?: ScanSeverity;
}

export interface InjectionRule {
  id: string;
  severity: ScanSeverity;
  description: string;
  pattern: RegExp;
}
