import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimePromptCommand } from "./prompt-command";
import type { EntrypointRuntimePlan } from "./runtime-control";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";

type BootLogEntry = { source: "stdout" | "stderr"; text: string };

type StartCli = (
  context: AppContext,
  options?: {
    onReady?: () => void;
    bootLogs?: BootLogEntry[];
  },
) => Promise<number> | number;

type RunCliPrompt = Parameters<
  typeof handleRuntimePromptCommand
>[0]["runCliPrompt"];
type RunCliPromptWithEvents = Parameters<
  typeof handleRuntimePromptCommand
>[0]["runCliPromptWithEvents"];

export interface EntrypointRuntimeSurfaceResult {
  handled: boolean;
  exitCode?: number;
}

export async function handleEntrypointRuntimeSurface(input: {
  command: EntrypointSubcommand;
  shellIsInteractive: boolean;
  immediatePrompt?: string;
  oneShot?: OneShotOptions;
  jobControlDir?: string;
  context: AppContext;
  runtimePlan: EntrypointRuntimePlan;
  runtimeLogger: AppLogger;
  startCli?: StartCli;
  startServerWhenShellReady: () => void;
  runCliPrompt?: RunCliPrompt;
  runCliPromptWithEvents?: RunCliPromptWithEvents;
  bootLogs: BootLogEntry[];
  printLine?: (message: string) => void;
  pushArg?: (arg: string) => void;
}): Promise<EntrypointRuntimeSurfaceResult> {
  const printLine = input.printLine ?? console.log;
  const pushArg = input.pushArg ?? ((arg: string) => Bun.argv.push(arg));

  if (input.command === "gateway") {
    await input.context.gateway.start();
    input.runtimeLogger.info("gateway-started", {
      agentName: input.context.config.agentName,
    });
    printLine(`${input.context.config.agentName} gateway started.`);
  }

  if (
    await handleRuntimePromptCommand({
      command: input.command,
      shellIsInteractive: input.shellIsInteractive,
      immediatePrompt: input.immediatePrompt,
      oneShot: input.oneShot,
      jobControlDir: input.jobControlDir,
      context: input.context,
      runCliPrompt: input.runCliPrompt,
      runCliPromptWithEvents: input.runCliPromptWithEvents,
    })
  ) {
    return { handled: true };
  }

  if (input.runtimePlan.shouldStartCli) {
    if (input.command === "plain") {
      pushArg("--plain-cli");
    } else if (input.command === "cockpit") {
      pushArg("--cockpit");
    }
    const exitCode =
      (await input.startCli?.(input.context, {
        onReady: input.startServerWhenShellReady,
        bootLogs: input.bootLogs,
      })) ?? 0;
    return { handled: true, exitCode };
  }

  if (!input.runtimePlan.wantsApi && input.command !== "api") {
    input.runtimeLogger.info("runtime-initialized-no-surface", {
      mode: input.context.config.mode,
    });
    printLine(
      `${input.context.config.agentName} initialized with no active shell or API surface. Start with "doolittle", "doolittle cockpit", or "doolittle status", or set DOOLITTLE_MODE=cli|api|both for a persistent default.`,
    );
    return { handled: true };
  }

  return { handled: false };
}
