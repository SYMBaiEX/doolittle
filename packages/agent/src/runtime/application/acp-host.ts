import { createAcpProtocolHost } from "../../services/acp/host";
import { executeAgentTurnWithProgress } from "../turn-stream";
import type { ApplicationSession } from "./session";

/** Bind ACP once; its protocol sessions and turn execution share one graph. */
export function createApplicationAcpHost(application: ApplicationSession) {
  const { services } = application;
  return createAcpProtocolHost({
    workspace: services.workspace,
    terminal: services.terminal,
    runController: services.runController,
    executionApprovals: services.executionApprovals,
    actorId: async () => {
      const context = await application.ensureRuntime({
        startupMode: "api",
        eagerDeferredHydration: false,
      });
      return application.workerBotId ?? String(context.runtime.agentId);
    },
    executeTurn: async (input) => {
      const signal = AbortSignal.any([input.signal, application.shutdownSignal]);
      signal.throwIfAborted();
      const context = await application.ensureRuntime({
        startupMode: "api",
        eagerDeferredHydration: true,
      });
      signal.throwIfAborted();
      const result = await executeAgentTurnWithProgress(
        {
          message: input.message,
          userId: "acp-user",
          roomId: input.sessionId,
          source: "api",
        },
        context,
        {
          admissionKind: "automatic-acp",
          originConversationId: services.acp.originForProtocolSession(
            input.sessionId,
          ),
          abortSignal: signal,
          onProgress: ({ delta }) => input.onText(delta),
          onRunUpdate: input.onRunUpdate,
        },
      );
      return result.response;
    },
  });
}
