import { isAbsolute, resolve } from "node:path";
import { parse } from "shell-quote";

export interface WorkspaceCommand {
  runner: "bun" | "npm" | "pnpm" | "yarn" | "next" | "git";
  kind: "install" | "build" | "bundle" | "verification" | "script";
  script?: string;
  directory?: string;
  /** Order within a single successful && chain. */
  order: number;
}

/** shell-quote is permissive about unmatched quotes; receipts must not be. */
function hasBalancedLiteralQuotes(command: string): boolean {
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\" && quote !== "'") {
      index += 1;
      if (index >= command.length) return false;
    } else if (char === quote) {
      quote = undefined;
    } else if (!quote && (char === "'" || char === '"')) {
      quote = char;
    }
  }
  return quote === undefined;
}

function literalSegments(command: string): string[][] | undefined {
  // Deliberately a proof subset, not a shell executor. Complex shell programs,
  // substitutions, masked failures, pipelines, redirects and comments do not
  // attest that a workspace operation actually ran to completion.
  if (/\r|\n|`|\$\(/u.test(command) || !hasBalancedLiteralQuotes(command)) {
    return undefined;
  }
  try {
    const tokens = parse(command, () => {
      throw new Error("Variable expansion is not literal workspace evidence.");
    });
    const segments: string[][] = [[]];
    for (const token of tokens) {
      const current = segments.at(-1) as string[];
      if (typeof token === "string") current.push(token);
      else if ("op" in token && token.op === "&&" && current.length) {
        segments.push([]);
      } else return undefined;
    }
    return segments.every((segment) => segment.length > 0)
      ? segments
      : undefined;
  } catch {
    return undefined;
  }
}

function directoryAt(path: string, base?: string): string | undefined {
  if (!path || path.startsWith("~")) return undefined;
  return isAbsolute(path)
    ? resolve(path)
    : base
      ? resolve(base, path)
      : undefined;
}

const RUN_FLAGS = new Set(["--bun", "-b", "--silent", "--smol"]);
const INSTALL_FLAGS = new Set([
  "--frozen-lockfile",
  "--ignore-scripts",
  "--no-save",
  "--offline",
  "--production",
  "--no-progress",
  "--silent",
  "--verbose",
]);

function bunCommand(
  args: string[],
  base: string | undefined,
  order: number,
): WorkspaceCommand | undefined {
  let directory = base;
  let verb: string | undefined;
  let script: string | undefined;
  let cwdSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    if (arg === "--cwd" || arg.startsWith("--cwd=")) {
      // After the script name Bun forwards flags to the script, rather than
      // changing its own cwd. Repeated cwd overrides are ambiguous evidence.
      if (script || cwdSeen) return undefined;
      const path = arg === "--cwd" ? args[++index] : arg.slice(6);
      if (!path) return undefined;
      directory = directoryAt(path, base);
      cwdSeen = true;
      continue;
    }
    if (arg.startsWith("-")) {
      if (
        script ||
        !(verb === "install" || verb === "i"
          ? INSTALL_FLAGS.has(arg)
          : RUN_FLAGS.has(arg))
      )
        return undefined;
      continue;
    }
    if (!verb) {
      if (!["run", "install", "i", "build"].includes(arg)) return undefined;
      verb = arg;
    } else if (verb === "run" && !script) {
      if (!/^[a-z][a-z0-9:_-]*$/iu.test(arg)) return undefined;
      script = arg;
    } else return undefined;
  }
  if (verb === "install" || verb === "i") {
    return { runner: "bun", kind: "install", directory, order };
  }
  if (verb === "build") {
    return { runner: "bun", kind: "bundle", directory, order };
  }
  if (verb !== "run" || !script) return undefined;
  return {
    runner: "bun",
    directory,
    order,
    script,
    kind:
      script === "build"
        ? "build"
        : /^(?:test|check|lint|typecheck|type-check|validate|verify)$/u.test(
              script,
            )
          ? "verification"
          : "script",
  };
}

/**
 * Inspect literal successful-chain workspace commands without executing them.
 * A Bun --cwd override belongs to that invocation only; cd changes later ones.
 * Unknown syntax fails closed, rather than finding command names inside text.
 */
export function inspectWorkspaceCommands(
  command: string,
  executedIn?: string,
): WorkspaceCommand[] {
  const segments = literalSegments(command);
  if (!segments) return [];
  let directory =
    executedIn && isAbsolute(executedIn) ? resolve(executedIn) : undefined;
  const operations: WorkspaceCommand[] = [];
  for (const [order, segment] of segments.entries()) {
    const [runner, ...args] = segment;
    if (runner === "cd") {
      const path = args[0] === "--" ? args[1] : args[0];
      if (!path || args.length !== (args[0] === "--" ? 2 : 1)) return [];
      directory = directoryAt(path, directory);
      continue;
    }
    if (runner === "bun") {
      const operation = bunCommand(args, directory, order);
      if (!operation) return [];
      operations.push(operation);
    } else if (["npm", "pnpm", "yarn", "next"].includes(runner ?? "")) {
      const script = args[0] === "run" ? args[1] : args[0];
      if (
        args.length !== (args[0] === "run" ? 2 : 1) ||
        !script ||
        !/^(?:build|test|check|lint|typecheck|type-check|validate|verify)$/u.test(
          script,
        )
      )
        return [];
      operations.push({
        runner: runner as WorkspaceCommand["runner"],
        directory,
        order,
        script,
        kind: script === "build" ? "build" : "verification",
      });
    } else if (runner === "git" && args.join(" ") === "diff --check") {
      operations.push({
        runner: "git",
        kind: "verification",
        script: "diff check",
        directory,
        order,
      });
    } else return [];
  }
  return operations;
}
