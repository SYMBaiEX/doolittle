import type { CliExecutionHooks, CliExecutionResult } from "@/cli/execution";
import { currentSessionElapsed } from "@/cli/shell-chrome";
import { compactPreview } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";
import {
  resolveCompletedResponseLabel,
  resolveQueuedResponseDescriptor,
} from "./entries";
import type { TuiCommandQueueOptions } from "./types";

interface CreateQueueHooksOptions
  extends Pick<
    TuiCommandQueueOptions,
    | "appendActivity"
    | "getLiveResponse"
    | "setLiveResponse"
    | "pushNotice"
    | "scheduleRefreshPanels"
  > {
  label: string;
  kind: "assistant" | "command" | "shell";
  isShellCommand: boolean;
}

interface HandleQueueResultOptions
  extends Pick<
    TuiCommandQueueOptions,
    | "appendActivity"
    | "pushResponseEntry"
    | "syncThemeFromSettings"
    | "destroyScreen"
  > {
  context: AppContext;
  state: { activeSessionId: string };
  line: string;
  result: CliExecutionResult;
}

interface HandleQueueErrorOptions
  extends Pick<
    TuiCommandQueueOptions,
    "appendActivity" | "pushResponseEntry" | "logger"
  > {
  context: AppContext;
  state: { activeSessionId: string };
  line: string;
  error: unknown;
}

export function wireQueuedResponse(
  line: string,
  context: AppContext,
  options: Pick<
    TuiCommandQueueOptions,
    "appendActivity" | "setLiveResponse" | "isConversationalInput"
  >,
): {
  label: string;
  kind: "assistant" | "command" | "shell";
  isShellCommand: boolean;
} {
  const { kind, label } = resolveQueuedResponseDescriptor(
    line,
    context.config.agentName,
    options.isConversationalInput,
  );
  options.appendActivity("cmd", line, "info");
  options.setLiveResponse(label, "", {
    kind,
    pending: true,
  });
  return {
    label,
    kind,
    isShellCommand: kind === "shell",
  };
}

export function createQueueExecutionHooks(
  options: CreateQueueHooksOptions,
): CliExecutionHooks {
  return {
    onStream: ({ source, chunk, command }) => {
      const lines = chunk
        .split(/\r?\n/gu)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!lines.length) {
        return;
      }
      for (const lineChunk of lines) {
        if (!options.isShellCommand) {
          options.appendActivity(
            source === "stdout" ? "out+" : "err+",
            `${command}: ${lineChunk}`,
            source === "stdout" ? "agent" : "warning",
          );
        }
      }
      const streamed = lines.join("\n");
      const current = options.getLiveResponse()?.body ?? "";
      options.setLiveResponse(
        `Running ${command}`,
        current.trim()
          ? `${current}\n${source.toUpperCase()}: ${streamed}`
          : `${source.toUpperCase()}: ${streamed}`,
        { kind: "shell", pending: true },
      );
    },
    onResponseProgress: ({ response }) => {
      options.setLiveResponse(options.label, response, {
        kind: options.kind,
        pending: true,
      });
    },
    onNotice: ({ kind, message }) => {
      options.pushNotice(kind, message);
      options.scheduleRefreshPanels(0);
    },
  };
}

export async function handleQueuedResult(
  options: HandleQueueResultOptions,
): Promise<{ shouldExit: boolean }> {
  await options.syncThemeFromSettings();
  if (options.result.text) {
    options.pushResponseEntry(
      resolveCompletedResponseLabel({
        line: options.line,
        tone: options.result.tone,
        agentName: options.context.config.agentName,
      }),
      options.result.text,
      {
        elapsed: currentSessionElapsed(
          options.context,
          options.state.activeSessionId,
        ),
      },
    );
    if (options.result.tone !== "agent") {
      options.appendActivity(
        "out",
        compactPreview(options.result.text),
        options.result.tone,
      );
    }
  }
  if (options.result.shouldExit) {
    options.destroyScreen();
    return { shouldExit: true };
  }
  return { shouldExit: false };
}

export function handleQueuedError(options: HandleQueueErrorOptions): void {
  const detail =
    options.error instanceof Error
      ? options.error.message
      : String(options.error);
  options.logger.captureError("command-error", options.error, {
    command: options.line,
  });
  options.pushResponseEntry(options.line, `Error: ${detail}`, {
    elapsed: currentSessionElapsed(
      options.context,
      options.state.activeSessionId,
    ),
  });
  options.appendActivity("err", detail, "error");
}
