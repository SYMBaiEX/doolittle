const ENTRYPOINT_COMMANDS = [
  "help",
  "version",
  "commands",
  "status",
  "progress",
  "tools",
  "skills",
  "runtime",
  "start",
  "cockpit",
  "desktop",
  "setup",
  "install",
  "doctor",
  "native",
  "dev",
  "api",
  "acp",
  "gateway",
  "plain",
  "exec",
  "jobs",
] as const;

export type EntrypointSubcommand = (typeof ENTRYPOINT_COMMANDS)[number];

const COMMAND_ALIASES = new Map<string, EntrypointSubcommand>([
  ...ENTRYPOINT_COMMANDS.map((command) => [command, command] as const),
  ["tui", "cockpit"],
  ["gui", "desktop"],
  ["onboard", "setup"],
  ["bootstrap", "setup"],
  ["check", "doctor"],
  ["plain-cli", "plain"],
  ["run", "exec"],
]);

// Order preserves the global flag precedence. Desktop consumes its own flags.
const FLAG_COMMANDS: ReadonlyArray<{
  command: EntrypointSubcommand;
  flags: readonly string[];
}> = [
  { command: "cockpit", flags: ["--cli"] },
  { command: "help", flags: ["--help", "-h"] },
  { command: "version", flags: ["--version", "-v"] },
  { command: "cockpit", flags: ["--cockpit"] },
  { command: "plain", flags: ["--plain-cli"] },
  { command: "api", flags: ["--api-only"] },
  { command: "gateway", flags: ["--gateway"] },
];

const HELP_TOPICS = ["exec", "jobs"] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number];

export function resolveHelpTopic(
  argument: string | undefined,
): HelpTopic | undefined {
  const command = COMMAND_ALIASES.get(argument ?? "");
  return HELP_TOPICS.find((topic) => topic === command);
}

const ALIAS_DEFAULT_PROMPTS = new Map<EntrypointSubcommand, string>([
  ["status", "/status"],
  ["progress", "/progress"],
  ["tools", "/tools summary"],
  ["skills", "/skills"],
  ["runtime", "/runtime status"],
]);

export interface OneShotOptions {
  prompt?: string;
  promptStdin?: boolean;
  json: boolean;
  jsonStream: boolean;
  background: boolean;
  jobId?: string;
  sessionId?: string;
}

export class CliUsageError extends Error {}

const EXEC_VALUE_OPTIONS = new Set([
  "--prompt",
  "-p",
  "--session-id",
  "--job-id",
]);

function acceptsExecOptionValue(
  option: string,
  value: string | undefined,
): value is string {
  return (
    Boolean(value) &&
    (option === "--prompt" || option === "-p" || !value?.startsWith("-"))
  );
}

export function resolveSubcommand(userArgs: string[] = process.argv.slice(2)): {
  command: EntrypointSubcommand;
  rest: string[];
} {
  if (userArgs[0] === "desktop" || userArgs[0] === "gui") {
    return {
      command: "desktop",
      rest: userArgs.slice(1),
    };
  }
  const globalArguments = new Set<number>();
  const isExec = COMMAND_ALIASES.get(userArgs[0] ?? "") === "exec";
  for (let index = 0; index < userArgs.length; index += 1) {
    const argument = userArgs[index];
    if (argument === "--") break;
    if (isExec && EXEC_VALUE_OPTIONS.has(argument)) {
      if (acceptsExecOptionValue(argument, userArgs[index + 1])) index += 1;
      continue;
    }
    globalArguments.add(index);
  }
  for (const { command, flags } of FLAG_COMMANDS) {
    if (
      userArgs.some(
        (argument, index) =>
          globalArguments.has(index) && flags.includes(argument),
      )
    ) {
      const helpTopic =
        command === "help" ? resolveHelpTopic(userArgs[0]) : undefined;
      if (helpTopic) return { command, rest: [helpTopic] };
      return {
        command,
        rest: userArgs.filter(
          (argument, index) =>
            !globalArguments.has(index) || !flags.includes(argument),
        ),
      };
    }
  }

  const command = COMMAND_ALIASES.get(userArgs[0] ?? "start");
  return {
    command: command ?? "start",
    rest: command ? userArgs.slice(1) : userArgs,
  };
}

export function resolveEntrypointAliasPrompt(
  command: EntrypointSubcommand,
  rest: string[],
): string | undefined {
  const defaultPrompt = ALIAS_DEFAULT_PROMPTS.get(command);
  if (!defaultPrompt) return undefined;
  const suffix = rest.join(" ").trim();
  return suffix ? `/${command} ${suffix}` : defaultPrompt;
}

export function isEntrypointAliasCommand(
  command: EntrypointSubcommand,
): boolean {
  return ALIAS_DEFAULT_PROMPTS.has(command);
}

export function parseOneShotOptions(args: string[]): OneShotOptions {
  let prompt: string | undefined;
  let promptStdin = false;
  let json = false;
  let jsonStream = false;
  let background = false;
  let jobId: string | undefined;
  let sessionId: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    const equalsIndex = value.indexOf("=");
    const option = equalsIndex < 0 ? value : value.slice(0, equalsIndex);
    if (EXEC_VALUE_OPTIONS.has(option)) {
      const argument =
        equalsIndex < 0 ? args[++index] : value.slice(equalsIndex + 1);
      const isPrompt = option === "--prompt" || option === "-p";
      if (!acceptsExecOptionValue(option, argument)) {
        throw new CliUsageError(`${option} requires a value.`);
      }
      if (isPrompt) prompt = argument;
      else if (option === "--job-id") jobId = argument;
      else sessionId = argument;
      continue;
    }
    if (value === "--json") {
      json = true;
      continue;
    }
    if (value === "--json-stream") {
      jsonStream = true;
      continue;
    }
    if (value === "--background") {
      background = true;
      continue;
    }
    if (value === "--prompt-stdin") {
      promptStdin = true;
      continue;
    }
    if (value.startsWith("-"))
      throw new CliUsageError(`Unknown exec option: ${option}.`);
    positional.push(value);
  }

  if (!prompt && positional.length > 0) {
    prompt = positional.join(" ");
  }

  if (promptStdin && (prompt !== undefined || positional.length > 0))
    throw new CliUsageError(
      "Cannot combine --prompt-stdin with --prompt or positional prompt.",
    );

  return {
    prompt,
    ...(promptStdin ? { promptStdin: true } : {}),
    json,
    jsonStream,
    background,
    jobId,
    sessionId,
  };
}
