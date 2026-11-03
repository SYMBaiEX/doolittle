import { platform } from "node:os";
import { basename, relative } from "node:path";

const IS_MACOS = platform() === "darwin";

export function shortModelId(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    return "unconfigured";
  }
  const segments = normalized.split("/");
  return segments.at(-1) ?? normalized;
}

export function macAwareKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("PageUp/PageDown", "Fn-↑/Fn-↓ or PageUp/PageDown")
    .replaceAll("PgUp/PgDn", "Fn-↑/Fn-↓ or PgUp/PgDn");
}

export function currentWorkspaceLabel(): string {
  const cwd = process.cwd();
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    const rel = relative(home, cwd);
    return rel ? `~/${rel}` : "~";
  }
  return cwd;
}

export function currentProjectLabel(): string {
  return basename(process.cwd()) || currentWorkspaceLabel();
}

export function shortSessionLabel(sessionId: string): string {
  return sessionId.startsWith("cli:")
    ? sessionId.slice(4, 12)
    : sessionId.slice(0, 12);
}
