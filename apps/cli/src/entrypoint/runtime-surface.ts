import type { AppLogger } from "@doolittle/agent/logging/logger";
import { shutdownApplicationRuntime } from "@doolittle/agent/runtime/application";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import type { AgentRuntime } from "@elizaos/core";
import type { startCli } from "../cli/start/index";
import type { captureBootLogs } from "./boot-logs";
import { acquireCliTerminalEndpoint } from "./cli-terminal-endpoint";
import type { EntrypointRuntimePlan } from "./runtime-control";
import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";

export async function handleEntrypointRuntimeSurface(input: {
  command: EntrypointSubcommand;
  oneShot?: OneShotOptions;
  jobControlDir?: string;
  context: AppContext;
  runtimePlan: EntrypointRuntimePlan;
  runtimeLogger: AppLogger;
  startCli?: typeof startCli;
  startServerWhenShellReady: () => void;
  apiOwnsRuntimeAfterCli: () => Promise<boolean>;
  bootLogs: Awaited<ReturnType<typeof captureBootLogs>>["logs"];
  printLine?: (message: string) => void;
  shutdownRuntime?: typeof shutdownApplicationRuntime;
  exit?: (code: number) => void;
}): Promise<{ exitCode: number; apiOwnsRuntime?: boolean }> {
  const { command, context, runtimeLogger, runtimePlan } = input;
  const { agentName, mode } = context.config;
  const runtime = context.runtime as AgentRuntime;
  const printLine = input.printLine ?? console.log;
  const exit = input.exit ?? process.exit;
  const shutdown = (reason: string) =>
    (input.shutdownRuntime ?? shutdownApplicationRuntime)(runtime, reason, {
      fast: true,
    });

  if (command === "gateway") {
    await context.gateway.start();
    runtimeLogger.info("gateway-started", { agentName });
    printLine(`${agentName} gateway started.`);
  }

  if (runtimePlan.oneShotPrompt) {
    const controller = new AbortController();
    let exitCode: number;
    try {
      const endpoint = await acquireCliTerminalEndpoint(context);
      const lifecycle = installRuntimeProcessLifecycle({
        label: "Doolittle one-shot",
        async close(reason) {
          controller.abort();
          try {
            await endpoint.close();
          } finally {
            await shutdown(reason);
          }
        },
        onExit: input.exit,
      });
      try {
        const { runRuntimePromptCommand } = await import("./prompt-command");
        exitCode = await runRuntimePromptCommand({
          prompt: runtimePlan.oneShotPrompt,
          oneShot: input.oneShot,
          jobControlDir: input.jobControlDir,
          context,
          controller,
        });
      } finally {
        try {
          await endpoint.close();
        } finally {
          lifecycle.dispose();
        }
      }
    } catch (error) {
      await shutdown("Doolittle one-shot failure");
      throw error;
    }
    await shutdown("Doolittle one-shot completion");
    exit(exitCode);
    return { exitCode };
  }

  if (runtimePlan.shouldStartCli) {
    const startShell =
      input.startCli ?? (await import("../cli/start/index")).startCli;
    const exitCode = await startShell(context, {
      mode:
        command === "plain"
          ? "plain"
          : command === "cockpit"
            ? "tui"
            : undefined,
      onReady: runtimePlan.shouldStartApi
        ? input.startServerWhenShellReady
        : undefined,
      bootLogs: input.bootLogs,
    });
    const apiOwnsRuntime = await input.apiOwnsRuntimeAfterCli();
    if (!apiOwnsRuntime) {
      await shutdown("Doolittle CLI completion");
      exit(exitCode);
    }
    return { exitCode, apiOwnsRuntime };
  }

  if (!runtimePlan.shouldStartApi) {
    runtimeLogger.info("runtime-initialized-no-surface", { mode });
    printLine(
      `${agentName} initialized with no active shell or API surface. Start with "doolittle", "doolittle cockpit", or "doolittle status", or set DOOLITTLE_MODE=cli|api|both for a persistent default.`,
    );
    await shutdown("Doolittle CLI completion");
  }

  return { exitCode: 0 };
}
