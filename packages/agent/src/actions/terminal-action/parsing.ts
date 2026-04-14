type ActionParams = Record<string, unknown>;

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCommandFromObject(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as ActionParams;

  const direct =
    nonEmptyString(record.command) ??
    nonEmptyString(record.cmd) ??
    nonEmptyString(record.commandLine) ??
    nonEmptyString(record.shellCommand);
  if (direct) {
    return direct;
  }

  const args = record.args;
  if (Array.isArray(args) && args.every((entry) => typeof entry === "string")) {
    const joined = args.join(" ").trim();
    if (joined) {
      return joined;
    }
  }

  return (
    resolveCommandFromObject(record.arguments) ??
    resolveCommandFromObject(record.input) ??
    resolveCommandFromObject(record.parameters)
  );
}

export function resolveCommandFromArguments(
  value: unknown,
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return resolveCommandFromObject(parsed) ?? trimmed;
    } catch {
      return trimmed;
    }
  }
  return resolveCommandFromObject(value);
}

export function resolveCommandFromParams(params: unknown): string | undefined {
  const record = params as ActionParams | undefined;
  if (!record || typeof record !== "object") {
    return undefined;
  }

  return (
    nonEmptyString(record.command) ??
    nonEmptyString(record.cmd) ??
    nonEmptyString(record.commandLine) ??
    nonEmptyString(record.shellCommand) ??
    resolveCommandFromArguments(record.arguments) ??
    resolveCommandFromArguments(record.input) ??
    resolveCommandFromObject(record.parameters)
  );
}

export function resolveCommandFromText(text: unknown): string | undefined {
  const source = nonEmptyString(text);
  if (!source) {
    return undefined;
  }

  const directShell = source.match(/^!(.+)$/u)?.[1]?.trim();
  if (directShell) {
    return directShell;
  }

  const fenced = source.match(/```(?:bash|sh|zsh|shell)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const inline = source.match(/`([^`\n]+)`/u)?.[1]?.trim();
  if (inline) {
    return inline;
  }

  const slashTerminal = source.match(/^\/terminal(?:\s+run)?\s+(.+)$/iu)?.[1];
  if (slashTerminal?.trim()) {
    return slashTerminal.trim();
  }

  const explicitRun = source.match(
    /\b(?:run|execute|exec|search|check|inspect|list|show)\b\s+(?:(?:the|this)\s+)?(?:(?:command|shell command|terminal command)\s+)?["'`]?([^"'`\n]+?)["'`]?(?:\s+(?:in|on)\s+(?:the\s+)?(?:terminal|shell))?$/iu,
  )?.[1];
  if (explicitRun?.trim()) {
    return explicitRun.trim().replace(/[.?!,:;]+$/u, "");
  }

  return undefined;
}
