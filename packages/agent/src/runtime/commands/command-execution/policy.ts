import type { RemoteExecutionApprovalRule } from "./types";

const SAFE_REMOTE_EXECUTION_PREFIXES = [
  "pwd",
  "ls",
  "find",
  "cat",
  "head",
  "tail",
  "echo",
  "printf",
  "rg",
  "grep",
  "git status",
  "git diff",
  "git log",
  "git show",
  "uname",
  "whoami",
  "date",
  "ps ",
  "which ",
  "whereis ",
  "env",
  "printenv",
  "bun test",
  "bun run test",
  "bun run typecheck",
  "bun run lint",
  "bun run build",
  "npm test",
  "npm run test",
  "npm run typecheck",
  "npm run lint",
  "npm run build",
];

const REMOTE_EXECUTION_APPROVAL_RULES: RemoteExecutionApprovalRule[] = [
  {
    pattern: /(^|\s)(sudo|doas)\b/u,
    reason: "uses elevated privileges",
  },
  {
    pattern: /(^|\s)rm\b/u,
    reason: "can delete files",
  },
  {
    pattern: /(^|\s)(mv|cp)\b/u,
    reason: "can overwrite project files",
  },
  {
    pattern: /(^|\s)(chmod|chown|chgrp)\b/u,
    reason: "can change file permissions or ownership",
  },
  {
    pattern: /(^|\s)(kill|pkill|killall)\b/u,
    reason: "can terminate running processes",
  },
  {
    pattern:
      /(^|\s)(reboot|shutdown|halt|launchctl|systemctl|scutil|diskutil|dd|mkfs|mount|umount)\b/u,
    reason: "can change host-level system state",
  },
  {
    pattern:
      /\bgit\s+(reset|clean|checkout|switch|restore|rebase|push|cherry-pick|am|apply|commit)\b/u,
    reason: "can rewrite git state or publish changes",
  },
  {
    pattern:
      /\b(bun|npm|pnpm|yarn|uv|pip|pip3|poetry|cargo|go|brew)\s+(add|install|remove|uninstall|update|upgrade|publish)\b/u,
    reason: "can mutate dependencies, environments, or publish artifacts",
  },
  {
    pattern: /(^|\s)(>|>>|1>|2>|&>)/u,
    reason: "writes command output to files",
  },
  {
    pattern: /\|\s*(bash|sh|zsh|fish)\b/u,
    reason: "pipes output directly into a shell",
  },
  {
    pattern: /\b(sed|perl)\s+-i\b/u,
    reason: "edits files in place",
  },
  {
    pattern: /\btee\b/u,
    reason: "can write command output into files",
  },
];

export function getExecutionApprovalReason(
  command: string,
): string | undefined {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    SAFE_REMOTE_EXECUTION_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix} `),
    )
  ) {
    return undefined;
  }
  for (const rule of REMOTE_EXECUTION_APPROVAL_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.reason;
    }
  }
  return undefined;
}
