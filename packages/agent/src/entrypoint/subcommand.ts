export type EntrypointSubcommand =
  | "help"
  | "commands"
  | "status"
  | "progress"
  | "tools"
  | "skills"
  | "runtime"
  | "start"
  | "cockpit"
  | "setup"
  | "install"
  | "doctor"
  | "dev"
  | "api"
  | "gateway"
  | "plain"
  | "exec"
  | "jobs";

export interface OneShotOptions {
  prompt?: string;
  json: boolean;
  jsonStream: boolean;
  background: boolean;
  jobId?: string;
  sessionId?: string;
}

export function resolveSubcommand(userArgs: string[] = Bun.argv.slice(2)): {
  command: EntrypointSubcommand;
  rest: string[];
} {
  if (userArgs.includes("--cli")) {
    return {
      command: "cockpit",
      rest: userArgs.filter((value) => value !== "--cli"),
    };
  }
  if (userArgs.includes("--help") || userArgs.includes("-h")) {
    return {
      command: "help",
      rest: userArgs.filter((value) => value !== "--help" && value !== "-h"),
    };
  }
  if (userArgs.includes("--cockpit")) {
    return {
      command: "cockpit",
      rest: userArgs.filter((value) => value !== "--cockpit"),
    };
  }
  if (userArgs.includes("--plain-cli")) {
    return {
      command: "plain",
      rest: userArgs.filter((value) => value !== "--plain-cli"),
    };
  }
  if (userArgs.includes("--api-only")) {
    return {
      command: "api",
      rest: userArgs.filter((value) => value !== "--api-only"),
    };
  }
  if (userArgs.includes("--gateway")) {
    return {
      command: "gateway",
      rest: userArgs.filter((value) => value !== "--gateway"),
    };
  }

  const first = userArgs[0] ?? "start";
  const rest = userArgs.slice(1);

  const aliases: Record<string, EntrypointSubcommand> = {
    start: "start",
    help: "help",
    commands: "commands",
    status: "status",
    progress: "progress",
    tools: "tools",
    skills: "skills",
    runtime: "runtime",
    cockpit: "cockpit",
    tui: "cockpit",
    setup: "setup",
    onboard: "setup",
    bootstrap: "setup",
    install: "install",
    doctor: "doctor",
    check: "doctor",
    dev: "dev",
    api: "api",
    gateway: "gateway",
    plain: "plain",
    "plain-cli": "plain",
    exec: "exec",
    run: "exec",
    jobs: "jobs",
  };

  return {
    command: aliases[first] ?? "start",
    rest: aliases[first] ? rest : userArgs,
  };
}

export function resolveEntrypointAliasPrompt(
  command: EntrypointSubcommand,
  rest: string[],
): string | undefined {
  const suffix = rest.join(" ").trim();
  if (command === "status") {
    return suffix ? `/status ${suffix}` : "/status";
  }
  if (command === "progress") {
    return suffix ? `/progress ${suffix}` : "/progress";
  }
  if (command === "tools") {
    return suffix ? `/tools ${suffix}` : "/tools summary";
  }
  if (command === "skills") {
    return suffix ? `/skills ${suffix}` : "/skills";
  }
  if (command === "runtime") {
    return suffix ? `/runtime ${suffix}` : "/runtime status";
  }
  return undefined;
}

export function isEntrypointAliasCommand(
  command: EntrypointSubcommand,
): boolean {
  return (
    command === "status" ||
    command === "progress" ||
    command === "tools" ||
    command === "skills" ||
    command === "runtime"
  );
}

export function parseOneShotOptions(args: string[]): OneShotOptions {
  let prompt: string | undefined;
  let json = false;
  let jsonStream = false;
  let background = false;
  let jobId: string | undefined;
  let sessionId: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
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
    if (value === "--prompt" || value === "-p") {
      prompt = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--job-id") {
      jobId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--session-id") {
      sessionId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (!prompt && positional.length > 0) {
    prompt = positional.join(" ");
  }

  return { prompt, json, jsonStream, background, jobId, sessionId };
}

export function shouldLoadLocalRuntimeEnvForEntrypoint(
  command: EntrypointSubcommand,
  oneShot?: OneShotOptions,
): boolean {
  return Boolean(
    command === "jobs" ||
      (command === "exec" && (oneShot?.background || oneShot?.jsonStream)),
  );
}
