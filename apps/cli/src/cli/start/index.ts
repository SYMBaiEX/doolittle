import { stdin as input, stdout as output } from "node:process";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { resolveCliStartMode } from "./mode";
import { startPlainCli } from "./plain";
import type { StartCliOptions } from "./types";

type TuiModule = Pick<typeof import("../tui-start/index"), "startTui">;

interface StartCliDeps {
  argv?: string[];
  stdinIsTTY?: boolean | undefined;
  stdoutIsTTY?: boolean | undefined;
  startPlainCli?: typeof startPlainCli;
  importTui?: () => Promise<TuiModule>;
  warn?: (message?: unknown, ...optionalParams: unknown[]) => void;
}

const TOO_SMALL_FALLBACK_NOTICE =
  "Terminal too small for the cockpit (minimum 80x24).\n" +
  "Using the plain CLI; resize and restart for the fullscreen cockpit.";

function withTooSmallFallbackNotice(
  options?: StartCliOptions,
): StartCliOptions {
  return {
    ...options,
    onReady: () => {
      output.write(`${TOO_SMALL_FALLBACK_NOTICE}\n`);
      options?.onReady?.();
    },
  };
}

export async function startCli(
  context: AppContext,
  options?: StartCliOptions,
  deps: StartCliDeps = {},
): Promise<number> {
  const cliLogger = context.services.logger.child("cli");
  const mode = resolveCliStartMode({
    argv: deps.argv ?? process.argv,
    requestedMode: options?.mode,
    stdinIsTTY: deps.stdinIsTTY ?? input.isTTY,
    stdoutIsTTY: deps.stdoutIsTTY ?? output.isTTY,
  });
  const startPlain = deps.startPlainCli ?? startPlainCli;

  if (mode === "plain") {
    return await startPlain(context, options);
  }

  const importTui =
    deps.importTui ?? (async () => await import("../tui-start/index"));
  const warn = deps.warn ?? console.warn;

  let tuiResult: Awaited<ReturnType<TuiModule["startTui"]>>;
  try {
    const { startTui } = await importTui();
    tuiResult = await startTui(context, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    cliLogger.warn("tui startup failed; falling back to plain cli", {
      detail,
    });
    warn(
      `${context.config.agentName} TUI failed to start (${detail}). Falling back to plain CLI.`,
    );
    return startPlain(context, options);
  }

  if (typeof tuiResult === "number") return tuiResult;
  if (tuiResult === "too-small") {
    return startPlain(context, withTooSmallFallbackNotice(options));
  }
  if (tuiResult === "unexpected") {
    cliLogger.warn("tui closed unexpectedly; falling back to plain cli");
    warn(
      `${context.config.agentName} TUI closed unexpectedly. Falling back to plain CLI.`,
    );
  }
  return startPlain(context, options);
}
