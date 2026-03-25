import type { TuiThemeProfile } from "@/runtime/theme-catalog";

export type CliTone = "info" | "success" | "warning" | "error" | "agent";

export function asciiActivityBadge(kind: string): string {
  const normalized = kind.trim().toLowerCase();
  if (
    normalized === "exec" ||
    normalized === "shell" ||
    normalized === "cmd" ||
    normalized === "out"
  ) {
    return "$>";
  }
  if (
    normalized === "task" ||
    normalized === "delegate" ||
    normalized === "agent"
  ) {
    return "<>";
  }
  if (
    normalized === "gw" ||
    normalized === "gateway" ||
    normalized.startsWith("srv")
  ) {
    return "::";
  }
  if (normalized === "copy" || normalized === "theme") {
    return "[*]";
  }
  if (normalized === "warn") {
    return "[!]";
  }
  if (normalized === "err" || normalized === "runtime") {
    return "[x]";
  }
  if (normalized === "mem") {
    return "[#]";
  }
  return "[.]";
}

export function asciiRunBadge(detail: string): string {
  const normalized = detail.toLowerCase();
  if (normalized.startsWith("run started")) {
    return "[boot]";
  }
  if (normalized.startsWith("thinking")) {
    return "(..)";
  }
  if (normalized.startsWith("tool ") || normalized.startsWith("acting")) {
    if (normalized.includes("workspace:search")) {
      return "[rg]";
    }
    if (normalized.includes("shell") || normalized.includes("terminal")) {
      return "$>";
    }
    if (normalized.includes("delegate")) {
      return "<>";
    }
    if (normalized.includes("repo") || normalized.includes("git")) {
      return "{g}";
    }
    return "[tool]";
  }
  if (
    normalized.startsWith("tool done") ||
    normalized.startsWith("action completed")
  ) {
    return "[ok]";
  }
  if (normalized.startsWith("waiting")) {
    return "(. )";
  }
  if (normalized.startsWith("pending approvals")) {
    return "[?]";
  }
  if (normalized.startsWith("run complete")) {
    return "[fin]";
  }
  if (normalized.startsWith("run error")) {
    return "[!!]";
  }
  if (normalized.startsWith("heartbeat")) {
    return "[hb]";
  }
  return "[..]";
}

export function runStatusFace(theme: TuiThemeProfile, status?: string): string {
  switch (status) {
    case "thinking":
      return "(..)";
    case "acting":
      return "<>";
    case "waiting":
      return "(. )";
    case "complete":
      return "[ok]";
    case "error":
      return "[!!]";
    default:
      return theme.idleFace;
  }
}

export function decorateLiveActivity(detail: string): string {
  return `${asciiRunBadge(detail)} ${detail}`;
}

export function toneTag(tone: CliTone | undefined): string {
  switch (tone) {
    case "success":
      return "{green-fg}[ok]{/}";
    case "warning":
      return "{yellow-fg}[!]{/}";
    case "error":
      return "{red-fg}[x]{/}";
    case "agent":
      return "{cyan-fg}<> {/}";
    default:
      return "{blue-fg}:: {/}";
  }
}
