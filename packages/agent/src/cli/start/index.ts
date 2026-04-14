import { stdin as input, stdout as output } from "node:process";
import type { AppContext } from "@/runtime/bootstrap";
import { ensureCliRuntimeInitialized } from "./init";
import { resolveCliStartMode } from "./mode";
import { startPlainCli } from "./plain";

export type { StartCliOptions } from "@/cli/tui-start";

type StartCliOptions = import("@/cli/tui-start").StartCliOptions;
type TuiModule = Pick<typeof import("@/cli/tui-start"), "startTui">;

interface StartCliDeps {
  argv?: string[];
  stdinIsTTY?: boolean | undefined;
  stdoutIsTTY?: boolean | undefined;
  ensureCliRuntimeInitialized?: typeof ensureCliRuntimeInitialized;
  startPlainCli?: typeof startPlainCli;
  importTui?: () => Promise<TuiModule>;
  warn?: (message?: unknown, ...optionalParams: unknown[]) => void;
}

export async function startCli(
  context: AppContext,
  options?: StartCliOptions,
  deps: StartCliDeps = {},
): Promise<number> {
  const cliLogger = context.services.logger.child("cli");
  const mode = resolveCliStartMode({
    argv: deps.argv ?? Bun.argv,
    stdinIsTTY: deps.stdinIsTTY ?? input.isTTY,
    stdoutIsTTY: deps.stdoutIsTTY ?? output.isTTY,
  });
  const startPlain = deps.startPlainCli ?? startPlainCli;

  if (mode === "plain") {
    return await startPlain(context, options);
  }

  const initializeRuntime =
    deps.ensureCliRuntimeInitialized ?? ensureCliRuntimeInitialized;
  const importTui =
    deps.importTui ?? (async () => await import("@/cli/tui-start"));
  const warn = deps.warn ?? console.warn;

  await initializeRuntime();

  try {
    const { startTui } = await importTui();
    const tuiResult = await startTui(context, options);
    if (typeof tuiResult === "number") {
      return tuiResult;
    }
    if (tuiResult === "too-small") {
      return await startPlain(context, options);
    }
    if (tuiResult === "unexpected") {
      cliLogger.warn("tui closed unexpectedly; falling back to plain cli");
      warn(
        `${context.config.agentName} TUI closed unexpectedly. Falling back to plain CLI.`,
      );
      return await startPlain(context, options);
    }
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    cliLogger.warn("tui startup failed; falling back to plain cli", {
      detail,
    });
    warn(
      `${context.config.agentName} TUI failed to start (${detail}). Falling back to plain CLI.`,
    );
    return await startPlain(context, options);
  }
}
