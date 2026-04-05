import type { AppContext } from "@/runtime/bootstrap";
import type { AgentTurnHooks } from "@/runtime/chat";
import { handleAgentTurn } from "@/runtime/chat";
import {
  createResponseTextAccumulator,
  formatRunEvent,
  nextResponseTextFrame,
  shouldRenderRunEvent,
} from "@/runtime/run-progress";
import type { RunUpdateEvent } from "@/services/run-controller-service";
import type { ChatTurnRequest } from "@/types/runtime";

export interface StreamedTurnHandlers {
  onProgress?: (event: {
    chunk: string;
    response: string;
    delta: string;
    phase: "command" | "readiness" | "model";
  }) => void | Promise<void>;
  onNotice?: NonNullable<AgentTurnHooks["onNotice"]>;
  onRunEvent?: (event: RunUpdateEvent, detail: string) => void | Promise<void>;
}

function resolveSessionId(input: ChatTurnRequest): string {
  return input.roomId ?? `room:${input.userId}`;
}

function resolveDelta(previous: string, next: string, chunk: string): string {
  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }
  return chunk || next;
}

export async function executeAgentTurnWithProgress(
  input: ChatTurnRequest,
  context: Pick<AppContext, "services" | "runtime" | "config">,
  handlers?: StreamedTurnHandlers,
): Promise<{ response: string; sessionId: string }> {
  const sessionId = resolveSessionId(input);
  const responseAccumulator = createResponseTextAccumulator();
  const unsubscribeRunUpdates = context.services.runController.onUpdate(
    async (event) => {
      if (event.sessionId !== sessionId) {
        return;
      }
      if (!shouldRenderRunEvent(event.run.progressMode, event)) {
        return;
      }
      const detail = formatRunEvent(event, 120);
      if (!detail) {
        return;
      }
      await handlers?.onRunEvent?.(event, detail);
    },
  );

  try {
    const response = await handleAgentTurn(input, context, {
      onResponseProgress: async ({ chunk, response, phase }) => {
        const frame = nextResponseTextFrame(responseAccumulator, response) ?? {
          delta: resolveDelta(responseAccumulator.text, response, chunk),
          full: response,
        };
        await handlers?.onProgress?.({
          chunk,
          response,
          delta: frame.delta,
          phase,
        });
      },
      onNotice: handlers?.onNotice,
    });

    return { response, sessionId };
  } finally {
    unsubscribeRunUpdates();
  }
}
