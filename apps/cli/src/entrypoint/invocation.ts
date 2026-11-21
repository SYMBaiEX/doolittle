import type { CliExecutionResult } from "../cli/execution/types";
import { readEntrypointStdinText } from "./stdin";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";
import {
  parseOneShotOptions,
  resolveEntrypointAliasPrompt,
  type resolveSubcommand,
} from "./subcommand";

export interface EntrypointInvocation {
  command: EntrypointSubcommand;
  rest: string[];
  shellIsInteractive: boolean;
  oneShot?: OneShotOptions;
  immediatePrompt?: string;
  staticPromptResult?: CliExecutionResult;
  jobControlDir?: string;
}

export async function resolveEntrypointInvocation(
  { command, rest }: ReturnType<typeof resolveSubcommand>,
  options: {
    env?: Record<string, string | undefined>;
    repoRoot: string;
    stdin?: AsyncIterable<string | Uint8Array> & { isTTY?: boolean };
    stdoutIsTTY?: boolean;
  },
): Promise<EntrypointInvocation> {
  const stdin = options.stdin ?? process.stdin;
  const env = options.env ?? process.env;
  const stdoutIsTTY = options.stdoutIsTTY ?? process.stdout.isTTY;
  const stdinIsTTY = Boolean(stdin.isTTY);
  const shellIsInteractive = stdinIsTTY && stdoutIsTTY;
  const oneShot = command === "exec" ? parseOneShotOptions(rest) : undefined;
  if (oneShot?.promptStdin) {
    if (stdinIsTTY)
      throw new Error("--prompt-stdin requires non-interactive stdin.");
    oneShot.prompt = await readEntrypointStdinText(stdin);
  }
  const pipedPrompt =
    !shellIsInteractive && (command === "start" || command === "plain")
      ? await readEntrypointStdinText(stdin)
      : undefined;
  const aliasPrompt = resolveEntrypointAliasPrompt(command, rest);
  const immediatePrompt =
    command === "exec" ? oneShot?.prompt : (aliasPrompt ?? pipedPrompt);
  let staticPromptResult: CliExecutionResult | undefined;
  if (immediatePrompt) {
    const [{ normalizeSlashCommandSyntax }, { resolveStaticCliInput }] =
      await Promise.all([
        import("@doolittle/agent/runtime/command-catalog"),
        import("../cli/execution/static"),
      ]);
    const builtin = normalizeSlashCommandSyntax(immediatePrompt);
    if (!options.env && builtin === "/help") {
      const { loadApplicationEnv } = await import(
        "@doolittle/agent/config/env"
      );
      loadApplicationEnv();
    }
    staticPromptResult = resolveStaticCliInput(builtin, {
      agentName: env.DOOLITTLE_NAME?.trim() || "Eliza",
      workspaceDir: options.repoRoot,
    });
  }

  return {
    command,
    rest,
    shellIsInteractive,
    oneShot,
    immediatePrompt,
    staticPromptResult,
    jobControlDir: env.DOOLITTLE_JOB_CONTROL_DIR?.trim() || undefined,
  };
}
