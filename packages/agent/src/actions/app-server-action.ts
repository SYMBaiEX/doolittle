import { hasOwnerAccess } from "@elizaos/agent/security/access";
import { resolveShellExecutionMode } from "@elizaos/agent/services/shell-execution-router";
import { type Action, isLocalCodeExecutionAllowed } from "@elizaos/core";
import { resolveRemoteExecutionPlatform } from "@/runtime/commands/command-execution";
import { getScopedTurnAbortSignal } from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";

export const DOOLITTLE_APP_SERVER_ACTION = "DOOLITTLE_APP_SERVER";

export function createAppServerAction(services: AppServices): Action {
  return {
    name: DOOLITTLE_APP_SERVER_ACTION,
    description:
      "Start, inspect, or stop a long-running local application in a managed terminal. After coding and building, start the user's dev command (for example bun run dev) here, not in one-shot SHELL or a detached background shell. Supply the resolved existing absolute cwd. Returns actual HTTP-ready URL, terminal session and process identity. Status and stop require the returned sessionId and are scoped to this conversation. A starting result requires another status check; only ready proves the URL works. Include the URL and terminal stop instructions in the final reply.",
    descriptionCompressed:
      "Start/status/stop a managed local app; actual URL and terminal Stop control.",
    contexts: ["code", "terminal"],
    roleGate: { minRole: "OWNER" },
    parameters: [
      {
        name: "operation",
        required: true,
        description: "Application operation",
        schema: { type: "string", enum: ["start", "status", "stop"] },
      },
      {
        name: "command",
        required: false,
        description:
          "Explicit dev-server command for start, such as bun run dev. Never use background shell operators.",
        schema: { type: "string" },
      },
      {
        name: "cwd",
        required: false,
        description:
          "Existing absolute application directory for start. Do not guess or substitute directories.",
        schema: { type: "string" },
      },
      {
        name: "sessionId",
        required: false,
        description: "Returned terminal session id for status or stop",
        schema: { type: "string" },
      },
    ],
    validate: async () => isLocalCodeExecutionAllowed(),
    handler: async (runtime, message, _state, options) => {
      try {
        if (
          !isLocalCodeExecutionAllowed() ||
          !(await hasOwnerAccess(runtime, message))
        ) {
          throw new Error(
            "Only the owner may manage local applications in a build that permits code execution.",
          );
        }
        const source =
          typeof message.content === "object"
            ? String(message.content.source ?? "")
            : "";
        if (resolveRemoteExecutionPlatform(source)) {
          throw new Error(
            "Manage long-running local applications from Doolittle desktop or CLI. Remote-channel shell approval does not authorize a persistent local server.",
          );
        }
        const raw = options?.parameters;
        const params =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        const owner = String(message.roomId);
        const operation = params.operation;
        if (
          operation === "start" &&
          (services.settings.get().execution.backend !== "local" ||
            resolveShellExecutionMode({ runtime }) !== "local-yolo")
        ) {
          throw new Error(
            "Managed applications require the already-enabled local execution backend and local-yolo shell mode. Current sandbox policy was preserved; no server was started.",
          );
        }
        const sessionId =
          typeof params.sessionId === "string" ? params.sessionId : "";
        const result =
          operation === "start"
            ? await services.terminal.appServers.start({
                owner,
                command:
                  typeof params.command === "string" ? params.command : "",
                cwd: typeof params.cwd === "string" ? params.cwd : "",
                abortSignal: getScopedTurnAbortSignal(runtime),
              })
            : operation === "status"
              ? await services.terminal.appServers.status(owner, sessionId)
              : operation === "stop"
                ? services.terminal.appServers.stop(owner, sessionId)
                : undefined;
        if (!result)
          throw new Error("operation must be start, status, or stop.");
        const success =
          operation === "stop" ||
          result.status === "ready" ||
          result.status === "starting";
        return {
          success,
          ...(result.status === "starting" ? { continueChain: true } : {}),
          ...(!success ? { error: "APP_SERVER_UNHEALTHY" } : {}),
          text: [
            `Application ${result.status}.`,
            `Directory: ${result.session.cwd}`,
            `Command: ${result.session.command}`,
            `Terminal session: ${result.session.id}; process: ${result.session.processId}.`,
            result.url
              ? result.status === "unhealthy"
                ? `Last verified local URL is no longer healthy: [Open application](${result.url})`
                : `Verified local URL: [Open application](${result.url})`
              : "No HTTP-ready URL has been verified yet.",
            result.status === "unhealthy"
              ? "The managed process is still running, but its last verified URL failed the HTTP health check. Inspect terminal output. Stop it before a production build in this workspace, then restart it after the build."
              : undefined,
            `Inspect output or stop it in the workspace Terminal tab, or call DOOLITTLE_APP_SERVER with operation=stop and sessionId=${result.session.id} in this conversation.`,
            result.output,
          ]
            .filter(Boolean)
            .join("\n"),
          data: {
            actionName: DOOLITTLE_APP_SERVER_ACTION,
            ...result,
            suppressVisibleCallback: true,
          },
        };
      } catch (error) {
        if (getScopedTurnAbortSignal(runtime)?.aborted) throw error;
        return {
          success: false,
          text: error instanceof Error ? error.message : String(error),
          error: "APP_SERVER_FAILED",
          data: { actionName: DOOLITTLE_APP_SERVER_ACTION },
        };
      }
    },
  };
}
