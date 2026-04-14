import type { EntrypointCommandPlan } from "./runtime-control";
import { resolveEntrypointCommandPlan } from "./runtime-control";
import type { StaticResult } from "./static-prompts";
import { resolveStaticPrompt } from "./static-prompts";
import { readEntrypointStdinText } from "./stdin";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";
import {
  parseOneShotOptions,
  resolveEntrypointAliasPrompt,
  resolveSubcommand,
} from "./subcommand";

export interface EntrypointInvocation {
  command: EntrypointSubcommand;
  rest: string[];
  repoRoot: string;
  stdinIsTTY: boolean;
  shellIsInteractive: boolean;
  commandPlan: EntrypointCommandPlan;
  oneShot?: OneShotOptions;
  immediatePrompt?: string;
  staticPromptResult?: StaticResult;
  jobControlDir?: string;
}

export async function resolveEntrypointInvocation(options: {
  argv?: string[];
  env?: Record<string, string | undefined>;
  repoRoot: string;
  stdin?: AsyncIterable<string | Uint8Array> & { isTTY?: boolean };
  stdoutIsTTY?: boolean;
}): Promise<EntrypointInvocation> {
  const stdin = options.stdin ?? process.stdin;
  const env = options.env ?? process.env;
  const stdoutIsTTY = options.stdoutIsTTY ?? process.stdout.isTTY;
  const { command, rest } = resolveSubcommand(options.argv);
  const stdinIsTTY = Boolean(stdin.isTTY);
  const shellIsInteractive = stdinIsTTY && stdoutIsTTY;
  const oneShot = command === "exec" ? parseOneShotOptions(rest) : undefined;
  const pipedPrompt =
    !shellIsInteractive && (command === "start" || command === "plain")
      ? await readEntrypointStdinText(stdin)
      : undefined;
  const aliasPrompt = resolveEntrypointAliasPrompt(command, rest);
  const immediatePrompt =
    command === "exec" ? oneShot?.prompt : aliasPrompt ?? pipedPrompt;

  return {
    command,
    rest,
    repoRoot: options.repoRoot,
    stdinIsTTY,
    shellIsInteractive,
    commandPlan: resolveEntrypointCommandPlan(command),
    oneShot,
    immediatePrompt,
    staticPromptResult: resolveStaticPrompt(
      immediatePrompt,
      env.DOOLITTLE_NAME?.trim() || "Eliza",
      options.repoRoot,
    ),
    jobControlDir: env.DOOLITTLE_JOB_CONTROL_DIR?.trim() || undefined,
  };
}
