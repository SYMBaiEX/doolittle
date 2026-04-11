import type { AppContext } from "@/runtime/bootstrap";
import {
  formatRunEvent,
  getRunElapsedMs,
  shouldRenderRunEvent,
} from "@/runtime/run-progress";
import { executeCliInput } from "./dispatch";
import {
  type CliExecutionResult,
  type CliPromptEventHandlers,
  type CliPromptRunOptions,
  type CliState,
  createCliSessionId,
  getCliErrorMessage,
} from "./types";

export async function runCliPrompt(
  context: AppContext,
  line: string,
  options?: CliPromptRunOptions,
): Promise<CliExecutionResult> {
  const state: CliState = {
    activeSessionId: options?.sessionId ?? createCliSessionId("cli"),
    notices: [],
  };
  return executeCliInput(line, context, state);
}

export async function runCliPromptWithEvents(
  context: AppContext,
  line: string,
  handlers?: CliPromptEventHandlers,
  options?: CliPromptRunOptions & { abortSignal?: AbortSignal },
): Promise<{ result: CliExecutionResult; sessionId: string }> {
  const state: CliState = {
    activeSessionId: options?.sessionId ?? createCliSessionId("cli"),
    notices: [],
  };
  let previousResponse = "";
  let latestRunElapsedMs: number | undefined;
  const command = line.trim();

  await handlers?.onEvent?.({
    type: "start",
    timestamp: new Date().toISOString(),
    sessionId: state.activeSessionId,
    command,
  });

  const unsubscribeRunUpdates = context.services.runController.onUpdate(
    async (event) => {
      if (event.sessionId !== state.activeSessionId) {
        return;
      }
      if (!shouldRenderRunEvent(event.run.progressMode, event)) {
        return;
      }
      const detail = formatRunEvent(event, 120);
      if (!detail) {
        return;
      }
      latestRunElapsedMs = getRunElapsedMs(event.run);
      await handlers?.onEvent?.({
        type: "run",
        timestamp: new Date().toISOString(),
        runEventType: event.type,
        detail,
      });
    },
  );

  try {
    const result = await executeCliInput(line, context, state, {
      abortSignal: options?.abortSignal,
      onNotice: async (notice) => {
        await handlers?.onEvent?.({
          type: "notice",
          timestamp: new Date().toISOString(),
          kind: notice.kind,
          message: notice.message,
        });
      },
      onResponseProgress: async ({ response }) => {
        const delta = response.startsWith(previousResponse)
          ? response.slice(previousResponse.length)
          : response;
        previousResponse = response;
        await handlers?.onEvent?.({
          type: "progress",
          timestamp: new Date().toISOString(),
          phase: "model",
          chunk: delta,
          response,
          delta,
        });
      },
    });
    await handlers?.onEvent?.({
      type: "result",
      timestamp: new Date().toISOString(),
      text: result.text,
      tone: result.tone ?? "info",
      shouldExit: result.shouldExit ?? false,
    });
    await handlers?.onEvent?.({
      type: "completed",
      timestamp: new Date().toISOString(),
      status: result.shouldExit ? "cancelled" : "completed",
      elapsedMs: latestRunElapsedMs,
    });
    return {
      result,
      sessionId: state.activeSessionId,
    };
  } catch (error) {
    const message = getCliErrorMessage(error);
    await handlers?.onEvent?.({
      type: "error",
      timestamp: new Date().toISOString(),
      message,
    });
    await handlers?.onEvent?.({
      type: "completed",
      timestamp: new Date().toISOString(),
      status: options?.abortSignal?.aborted === true ? "cancelled" : "failed",
      elapsedMs: latestRunElapsedMs,
    });
    throw error;
  } finally {
    unsubscribeRunUpdates();
  }
}
