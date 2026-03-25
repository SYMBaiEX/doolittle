const COMMAND_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/iu;

export function canonicalizeSlashCommandSyntax(command: string): string {
  const trimmed = command.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }

  const tokens = trimmed.split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) {
    return trimmed;
  }

  const [head, next, ...rest] = tokens;
  if (
    !COMMAND_SEGMENT_PATTERN.test(head.slice(1)) ||
    !COMMAND_SEGMENT_PATTERN.test(next)
  ) {
    return trimmed;
  }

  return [`${head}-${next}`, ...rest].join(" ");
}

export function normalizeSlashCommandSyntax(command: string): string {
  const trimmed = command.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }

  const tokens = trimmed.split(/\s+/u).filter(Boolean);
  if (!tokens.length) {
    return trimmed;
  }

  const [head, ...rest] = tokens;
  const hyphenIndex = head.indexOf("-");
  if (hyphenIndex <= 1) {
    return trimmed;
  }

  const prefix = head.slice(0, hyphenIndex);
  const suffix = head.slice(hyphenIndex + 1);
  if (
    !prefix.startsWith("/") ||
    !COMMAND_SEGMENT_PATTERN.test(prefix.slice(1)) ||
    !COMMAND_SEGMENT_PATTERN.test(suffix)
  ) {
    return trimmed;
  }

  return [prefix, suffix, ...rest].join(" ");
}
