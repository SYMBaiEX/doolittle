import type { AutomationJobRecord } from "@doolittle/contracts";
import { isUuid } from "@doolittle/contracts/identifiers";
import type { BackendManagerOptions } from "../backend";
import type { BotConsultationDispatchInput } from "../bot-consultation-broker";
import type { BotProcessRegistry } from "../bot-process-registry";
import type { DesktopExecutionAdmission } from "../execution-admission";
import {
  type ForegroundParentWitness,
  matchesAutomaticAcpParent,
  sameExecutionWorkspace,
} from "../execution-parent-witness";
import { releaseAbandonedExecutionClaim } from "../execution-receipt";
import type { WorkerHostRequest } from "../worker-host-rpc";

type WorkspaceScope = Awaited<
  ReturnType<BotProcessRegistry["resolveVerifiedConversationWorkspace"]>
>;

export interface NamedWorkerAccess {
  allowMutation: boolean;
  assertCurrent(): void;
  handleProvider(
    request: WorkerHostRequest,
    signal: AbortSignal,
    resolveWorkspace: (sessionId: string) => Promise<WorkspaceScope>,
  ): Promise<unknown>;
}

/** Each backend owns its witnesses and authorizes all requests with the same scope checks. */
export function createWorkerHostBridge({
  getRegistry,
  admission,
  botId,
  worker,
}: {
  getRegistry(): BotProcessRegistry | null;
  admission?: DesktopExecutionAdmission;
  botId: string;
  worker?: NamedWorkerAccess;
}): Pick<
  BackendManagerOptions,
  "workerHostHandler" | "onHostDisconnect" | "workerHostOnAbandonedResult"
> {
  const parents = new Map<string, ForegroundParentWitness>();

  return {
    async workerHostHandler(request, signal) {
      const registry = getRegistry();
      if (!registry) throw new Error("The runtime host is unavailable.");
      worker?.assertCurrent();

      const resolveWorkspace = async (sessionId: unknown, prepare = false) => {
        if (typeof sessionId !== "string")
          throw new Error("Conversation workspace scope is unavailable.");
        if (prepare && !worker && sessionId.startsWith("automation:"))
          await registry.ensureDefaultAutomationConversation(sessionId);
        const scope = await registry.resolveVerifiedConversationWorkspace(
          botId,
          sessionId,
        );
        if (signal.aborted) throw new Error("Host request was cancelled.");
        return scope;
      };

      switch (request.operation) {
        case "workspace.resolve": {
          const payload = request.payload as {
            sessionId?: unknown;
            acpSessionId?: unknown;
          } | null;
          if (
            !payload ||
            Object.keys(payload).some(
              (key) => key !== "sessionId" && key !== "acpSessionId",
            ) ||
            (payload.acpSessionId !== undefined &&
              typeof payload.acpSessionId !== "string")
          )
            throw new Error("Conversation scope request is invalid.");
          const scope = await resolveWorkspace(payload.sessionId, true);
          if (payload.acpSessionId !== undefined) {
            const owner = registry.assertAcpSessionOwner(
              botId,
              payload.acpSessionId,
            );
            if (
              owner.originConversationId !== scope.sessionId ||
              owner.workspacePath !== scope.workspacePath
            )
              throw new Error(
                "ACP session does not belong to this conversation workspace.",
              );
          }
          return scope;
        }
        case "execution.release": {
          if (!admission)
            throw new Error("Global execution admission is unavailable.");
          const released = admission.handle(
            botId,
            request.operation,
            request.payload,
          );
          const { runId, leaseId, yielding } = request.payload as {
            runId: string;
            leaseId: string;
            yielding?: boolean;
          };
          if (yielding !== true && parents.get(runId)?.leaseId === leaseId)
            parents.delete(runId);
          return released;
        }
        case "execution.claim": {
          if (!admission)
            throw new Error("Global execution admission is unavailable.");
          const payload = request.payload as {
            sessionId?: unknown;
            runId?: unknown;
            parentRunId?: unknown;
            kind?: unknown;
          } | null;
          const scope = await resolveWorkspace(payload?.sessionId, true);
          const { kind, runId, parentRunId } = payload ?? {};
          const parentMatches = (candidate: WorkspaceScope) =>
            matchesAutomaticAcpParent(
              parentRunId,
              candidate,
              worker ? botId : registry.catalog.stableDefaultBotId(),
              parents,
              (id) => registry.conversations.getRun(id),
            );
          if (kind === "automatic-acp") {
            if (typeof parentRunId !== "string" || !parentMatches(scope))
              throw new Error(
                "An active, matching foreground run is required for ACP execution.",
              );
            if (!worker) await registry.assertRunOwner(botId, parentRunId);
          }
          if (typeof runId !== "string")
            throw new Error("Execution run identity is invalid.");
          const existing =
            kind === "foreground" ? parents.get(runId) : undefined;
          if (existing && !sameExecutionWorkspace(existing, scope))
            throw new Error(
              "Foreground run changed its approved conversation.",
            );
          const effectivePayload = worker
            ? registry.automations.admission(
                botId,
                registry.consultations.admission(botId, request.payload),
              )
            : request.payload;
          const result = await admission.handle(
            botId,
            request.operation,
            effectivePayload,
            {
              mutationRoot:
                !worker || worker.allowMutation
                  ? scope.workspacePath
                  : undefined,
            },
            signal,
          );
          if (!result.accepted) return result;

          try {
            const fresh = await resolveWorkspace(scope.sessionId);
            worker?.assertCurrent();
            if (!sameExecutionWorkspace(scope, fresh))
              throw new Error(
                "Conversation workspace changed while awaiting execution admission.",
              );
            if (kind === "automatic-acp" && !parentMatches(fresh))
              throw new Error(
                "The ACP parent run expired while awaiting execution admission.",
              );
            if (kind === "foreground") {
              registry.bindRun(botId, fresh.sessionId, runId);
              parents.set(runId, {
                sessionId: fresh.sessionId,
                workspacePath: fresh.workspacePath,
                projectId: fresh.projectId,
                leaseId: result.leaseId,
              });
            }
          } catch (error) {
            admission.release({ botId, runId, leaseId: result.leaseId });
            throw error;
          }
          return result;
        }
        case "consult.dispatch":
          return registry.consultations.dispatch(
            botId,
            request.payload as BotConsultationDispatchInput,
            signal,
          );
        case "consult.wait":
        case "consult.cancel": {
          const payload = request.payload as { dispatchId?: unknown } | null;
          if (
            typeof payload?.dispatchId !== "string" ||
            !isUuid(payload.dispatchId)
          )
            throw new Error("Consultation ID is invalid.");
          return request.operation === "consult.wait"
            ? registry.consultations.wait(botId, payload.dispatchId, signal)
            : registry.consultations.cancel(botId, payload.dispatchId);
        }
        case "codex.auth":
        case "claude.invoke":
          if (worker)
            return worker.handleProvider(request, signal, resolveWorkspace);
          break;
        case "automation.validate":
        case "automation.dispatch":
        case "automation.status":
        case "automation.wait":
        case "automation.cancel": {
          if (worker) break;
          const { automations } = registry;
          if (request.operation === "automation.validate")
            return automations.validate(
              botId,
              (request.payload as { job: AutomationJobRecord }).job,
              signal,
            );
          if (request.operation === "automation.dispatch")
            return automations.dispatch(
              botId,
              request.payload as Parameters<typeof automations.dispatch>[1],
              signal,
            );
          if (request.operation === "automation.status")
            return automations.status(
              botId,
              request.payload as Parameters<typeof automations.status>[1],
            );
          const payload = request.payload as { fireId?: unknown } | null;
          if (typeof payload?.fireId !== "string")
            throw new Error("Automation fire identity is invalid.");
          return request.operation === "automation.wait"
            ? automations.wait(botId, payload.fireId, signal)
            : automations.cancel(botId, payload.fireId);
        }
      }
      throw new Error("This host operation is not approved for this runtime.");
    },
    onHostDisconnect() {
      parents.clear();
      admission?.releaseBot(botId);
    },
    workerHostOnAbandonedResult(request, result) {
      const abandoned = releaseAbandonedExecutionClaim(
        admission,
        botId,
        request,
        result,
      );
      if (
        abandoned &&
        parents.get(abandoned.runId)?.leaseId === abandoned.leaseId
      )
        parents.delete(abandoned.runId);
    },
  };
}
